-- Phase 5: patient timeline, merge duplicates, analytics views, global search.
-- Every view is security_invoker, so it shows only what the caller's RLS allows.

-- ---------------------------------------------------------------------------
-- Patient 360 timeline
-- ---------------------------------------------------------------------------

create view public.patient_timeline with (security_invoker = true) as
select a.patient_id, a.clinic_id, a.starts_at as at, 'appointment'::text as kind, a.id as ref_id,
       a.status::text as title, a.reason as detail, a.doctor_id as staff_id
from public.appointments a where a.deleted_at is null
union all
select e.patient_id, e.clinic_id, e.started_at, 'encounter', e.id,
       coalesce(e.chief_complaint, 'Consultation'), e.treatment_plan, e.doctor_id
from public.encounters e where e.deleted_at is null
union all
select v.patient_id, v.clinic_id, v.recorded_at, 'vitals', v.id,
       concat_ws(', ',
         case when v.bp_systolic is not null then 'BP ' || v.bp_systolic || '/' || v.bp_diastolic end,
         case when v.pulse_bpm is not null then 'Pulse ' || v.pulse_bpm end,
         case when v.weight_kg is not null then v.weight_kg || ' kg' end,
         case when v.temperature_c is not null then v.temperature_c || ' °C' end,
         case when v.spo2 is not null then 'SpO2 ' || v.spo2 || '%' end),
       null, null
from public.vitals v where v.deleted_at is null
union all
select p.patient_id, p.clinic_id, p.created_at, 'prescription', p.id,
       (select count(*) || ' medicines' from public.prescription_items i where i.prescription_id = p.id), p.notes, p.doctor_id
from public.prescriptions p
union all
select d.patient_id, d.clinic_id, d.created_at, 'document', d.id, d.title, d.category::text, null
from public.documents d where d.deleted_at is null
union all
select o.patient_id, o.clinic_id, o.ordered_at, 'lab_order', o.id, o.status, o.notes, o.ordered_by
from public.lab_orders o
union all
select i.patient_id, i.clinic_id, coalesce(i.issued_at, i.created_at), 'invoice', i.id,
       coalesce(i.invoice_number, 'Draft invoice'), i.status::text, null
from public.invoices i
union all
select n.patient_id, n.clinic_id, n.created_at, 'note', n.id, n.kind, left(n.body, 200), n.author_id
from public.clinical_notes n
union all
select m.patient_id, m.clinic_id, m.created_at, 'message', m.id, m.template_key, m.status::text, null
from public.message_queue m where m.patient_id is not null;
grant select on public.patient_timeline to authenticated;

-- ---------------------------------------------------------------------------
-- Merge duplicates: move every child row to the kept record, in one transaction
-- ---------------------------------------------------------------------------

create function public.merge_patients(p_keep uuid, p_merge uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_clinic uuid := app.current_clinic_id();
  t text;
begin
  if not app.has_permission('patients.merge') then
    raise exception 'You do not have permission to merge patients' using errcode = 'insufficient_privilege';
  end if;
  if p_keep = p_merge then
    raise exception 'Pick two different patients';
  end if;
  if (select count(*) from public.patients where id in (p_keep, p_merge) and clinic_id = v_clinic
      and deleted_at is null and merged_into is null) <> 2 then
    raise exception 'Both patients must be active in this clinic' using errcode = 'no_data_found';
  end if;

  perform set_config('app.merge_in_progress', 'on', true);
  foreach t in array array[
    'appointments', 'queue_tokens', 'waitlist', 'encounters', 'vitals', 'diagnoses', 'clinical_notes',
    'encounter_forms', 'prescriptions', 'documents', 'lab_orders', 'lab_results', 'referrals',
    'invoices', 'message_queue', 'feedback', 'patient_allergies', 'patient_conditions'
  ] loop
    execute format('update public.%I set patient_id = $1 where patient_id = $2', t) using p_keep, p_merge;
  end loop;

  -- vaccinations are unique per patient and vaccine: keep the kept record's entry
  update public.patient_vaccinations pv set patient_id = p_keep
  where pv.patient_id = p_merge
    and not exists (select 1 from public.patient_vaccinations k where k.patient_id = p_keep and k.vaccine_code = pv.vaccine_code);
  delete from public.patient_vaccinations where patient_id = p_merge;

  delete from public.family_links where patient_id = p_merge or related_patient_id = p_merge;

  -- fill gaps on the kept record from the merged one
  update public.patients k set
    phone = coalesce(k.phone, m.phone),
    email = coalesce(k.email, m.email),
    dob = coalesce(k.dob, m.dob),
    blood_group = coalesce(k.blood_group, m.blood_group),
    address = coalesce(k.address, m.address),
    abha_number = coalesce(k.abha_number, m.abha_number),
    tags = (select array(select distinct unnest(k.tags || m.tags)))
  from public.patients m
  where k.id = p_keep and m.id = p_merge;

  update public.patients set merged_into = p_keep, deleted_at = now() where id = p_merge;
  perform app.write_audit(v_clinic, 'update', 'patients', p_keep, p_keep, jsonb_build_object('merged', p_merge));
  perform set_config('app.merge_in_progress', 'off', true);
end;
$$;
revoke all on function public.merge_patients(uuid, uuid) from public, anon;
grant execute on function public.merge_patients(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Analytics (analytics.read). Dates are in the clinic's timezone.
-- ---------------------------------------------------------------------------

create function app.can_read_analytics() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_permission('analytics.read')
$$;
grant execute on function app.can_read_analytics() to authenticated;

create function public.revenue_by_day(p_from date, p_to date)
returns table (day date, specialty_id uuid, doctor_id uuid, invoiced_paise bigint, collected_paise bigint, refunded_paise bigint)
language sql stable security definer set search_path = '' as $$
  with c as (select id, timezone from public.clinics where id = app.current_clinic_id() and app.can_read_analytics()),
  inv as (
    select (i.issued_at at time zone c.timezone)::date as day, i.specialty_id, i.doctor_id,
           sum(it.taxable_paise + it.tax_paise) as amt
    from public.invoices i join c on c.id = i.clinic_id
    join public.invoice_items it on it.invoice_id = i.id
    where i.status = 'issued' and (i.issued_at at time zone c.timezone)::date between p_from and p_to
    group by 1, 2, 3
  ),
  pay as (
    select (p.received_at at time zone c.timezone)::date as day, i.specialty_id, i.doctor_id, sum(p.amount_paise) as amt
    from public.payments p join public.invoices i on i.id = p.invoice_id join c on c.id = p.clinic_id
    where (p.received_at at time zone c.timezone)::date between p_from and p_to
    group by 1, 2, 3
  ),
  ref as (
    select (r.refunded_at at time zone c.timezone)::date as day, i.specialty_id, i.doctor_id, sum(r.amount_paise) as amt
    from public.refunds r join public.invoices i on i.id = r.invoice_id join c on c.id = r.clinic_id
    where (r.refunded_at at time zone c.timezone)::date between p_from and p_to
    group by 1, 2, 3
  ),
  keys as (select day, specialty_id, doctor_id from inv union select day, specialty_id, doctor_id from pay
           union select day, specialty_id, doctor_id from ref)
  select k.day, k.specialty_id, k.doctor_id,
         coalesce(inv.amt, 0)::bigint, coalesce(pay.amt, 0)::bigint, coalesce(ref.amt, 0)::bigint
  from keys k
  left join inv on inv.day = k.day and inv.specialty_id is not distinct from k.specialty_id and inv.doctor_id is not distinct from k.doctor_id
  left join pay on pay.day = k.day and pay.specialty_id is not distinct from k.specialty_id and pay.doctor_id is not distinct from k.doctor_id
  left join ref on ref.day = k.day and ref.specialty_id is not distinct from k.specialty_id and ref.doctor_id is not distinct from k.doctor_id
  order by k.day
$$;
grant execute on function public.revenue_by_day(date, date) to authenticated;

create function public.revenue_by_service(p_from date, p_to date)
returns table (service_name text, quantity bigint, amount_paise bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(s.name, it.description), sum(it.quantity)::bigint, sum(it.taxable_paise + it.tax_paise)::bigint
  from public.invoices i
  join public.clinics c on c.id = i.clinic_id
  join public.invoice_items it on it.invoice_id = i.id
  left join public.services s on s.id = it.service_id
  where i.clinic_id = app.current_clinic_id() and app.can_read_analytics() and i.status = 'issued'
    and (i.issued_at at time zone c.timezone)::date between p_from and p_to
  group by 1 order by 3 desc
$$;
grant execute on function public.revenue_by_service(date, date) to authenticated;

create function public.visit_stats(p_from date, p_to date)
returns table (specialty_id uuid, doctor_id uuid, booked int, completed int, no_shows int, cancelled int, new_patients int, returning_patients int)
language sql stable security definer set search_path = '' as $$
  with c as (select id, timezone from public.clinics where id = app.current_clinic_id() and app.can_read_analytics()),
  appts as (
    select a.*, (a.starts_at at time zone c.timezone)::date as day,
           not exists (select 1 from public.appointments b where b.patient_id = a.patient_id
                       and b.status = 'completed' and b.starts_at < a.starts_at) as is_first
    from public.appointments a join c on c.id = a.clinic_id
    where a.deleted_at is null and (a.starts_at at time zone c.timezone)::date between p_from and p_to
  )
  select specialty_id, doctor_id,
         count(*)::int,
         count(*) filter (where status = 'completed')::int,
         count(*) filter (where status = 'no_show')::int,
         count(*) filter (where status = 'cancelled')::int,
         count(distinct patient_id) filter (where status = 'completed' and is_first)::int,
         count(distinct patient_id) filter (where status = 'completed' and not is_first)::int
  from appts group by 1, 2
$$;
grant execute on function public.visit_stats(date, date) to authenticated;

create function public.top_diagnoses(p_from date, p_to date, p_limit int default 10)
returns table (icd10_code text, description text, cases bigint)
language sql stable security definer set search_path = '' as $$
  select d.icd10_code, coalesce(i.title, min(d.description)), count(distinct d.encounter_id)
  from public.diagnoses d
  join public.encounters e on e.id = d.encounter_id
  join public.clinics c on c.id = d.clinic_id
  left join public.icd10_codes i on i.code = d.icd10_code
  where d.clinic_id = app.current_clinic_id() and app.can_read_analytics() and d.deleted_at is null
    and (e.started_at at time zone c.timezone)::date between p_from and p_to
  group by d.icd10_code, i.title
  order by 3 desc limit p_limit
$$;
grant execute on function public.top_diagnoses(date, date, int) to authenticated;

-- Outstanding dues: issued invoices with a balance, oldest first.
create view public.outstanding_dues with (security_invoker = true) as
select t.invoice_id, i.invoice_number, i.patient_id, p.full_name, p.mrn, p.phone, i.issued_at,
       t.total_paise, t.paid_paise - t.refunded_paise as net_paid_paise, t.balance_paise
from public.invoice_totals t
join public.invoices i on i.id = t.invoice_id
join public.patients p on p.id = i.patient_id
where t.status = 'issued' and t.balance_paise > 0;
grant select on public.outstanding_dues to authenticated;

create function public.dormant_patients(p_months int default 12, p_limit int default 200)
returns table (patient_id uuid, full_name text, mrn text, phone text, last_visit date)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.mrn, p.phone, max(e.started_at)::date
  from public.patients p
  join public.encounters e on e.patient_id = p.id
  where p.clinic_id = app.current_clinic_id() and app.can_read_analytics() and p.deleted_at is null
  group by p.id
  having max(e.started_at) < now() - make_interval(months => p_months)
  order by max(e.started_at) desc
  limit p_limit
$$;
grant execute on function public.dormant_patients(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Global search (Ctrl+K). Each branch obeys the caller's RLS.
-- ---------------------------------------------------------------------------

create function public.global_search(p_query text)
returns table (kind text, id uuid, title text, subtitle text)
language sql stable set search_path = '' as $$
  (select 'patient', p.id, p.full_name, concat_ws(' · ', p.mrn, p.phone)
   from public.search_patients(p_query, 8) p)
  union all
  (select 'invoice', i.id, i.invoice_number, p.full_name
   from public.invoices i join public.patients p on p.id = i.patient_id
   where length(trim(p_query)) >= 3 and i.invoice_number ilike '%' || trim(p_query) || '%'
   order by i.issued_at desc limit 5)
  union all
  (select 'appointment', a.id, p.full_name, to_char(a.starts_at at time zone c.timezone, 'DD Mon HH24:MI')
   from public.appointments a
   join public.patients p on p.id = a.patient_id
   join public.clinics c on c.id = a.clinic_id
   where length(trim(p_query)) >= 2 and a.deleted_at is null
     and a.starts_at > now() - interval '1 day'
     and (p.full_name ilike '%' || trim(p_query) || '%' or p.mrn ilike '%' || trim(p_query) || '%')
   order by a.starts_at limit 5)
$$;
grant execute on function public.global_search(text) to authenticated;
