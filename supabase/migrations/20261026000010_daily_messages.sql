-- Messages now go out on one daily run (Vercel Hobby allows one cron a day),
-- plus on demand from the Messages page and right after bookings and payments.
-- So reminders cover every appointment tomorrow instead of a 20-28 hour window,
-- and birthdays are sent with the run instead of being held until 9:00.

create or replace function public.enqueue_due_messages(p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int := 0;
  n int;
begin
  -- Appointment reminders for every appointment tomorrow (clinic time).
  insert into public.message_queue (clinic_id, patient_id, template_key, channel, to_address, context, scheduled_for, related_entity, related_id, dedupe_key)
  select a.clinic_id, a.patient_id, 'appointment_reminder', t.channel, p.phone,
         jsonb_build_object('patient_name', p.full_name, 'doctor_name', s.full_name, 'clinic_name', c.name,
                            'starts_at', a.starts_at, 'timezone', c.timezone),
         p_now, 'appointment', a.id, 'reminder:' || a.id || ':' || t.channel
  from public.appointments a
  join public.patients p on p.id = a.patient_id
  join public.staff s on s.id = a.doctor_id
  join public.clinics c on c.id = a.clinic_id
  join public.message_templates t on t.clinic_id = a.clinic_id and t.key = 'appointment_reminder' and t.is_active
  where a.status in ('scheduled', 'confirmed') and a.deleted_at is null
    and (a.starts_at at time zone c.timezone)::date = (p_now at time zone c.timezone)::date + 1
    and p.phone is not null and p.consent_messaging and p.messaging_opt_out_at is null and p.deleted_at is null
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; v_count := v_count + n;

  -- Follow-ups due tomorrow without a booking.
  insert into public.message_queue (clinic_id, patient_id, template_key, channel, to_address, context, scheduled_for, related_entity, related_id, dedupe_key)
  select e.clinic_id, e.patient_id, 'follow_up', t.channel, p.phone,
         jsonb_build_object('patient_name', p.full_name, 'doctor_name', s.full_name, 'clinic_name', c.name,
                            'date', e.follow_up_on, 'timezone', c.timezone),
         p_now, 'encounter', e.id, 'follow_up:' || e.id
  from public.encounters e
  join public.patients p on p.id = e.patient_id
  join public.staff s on s.id = e.doctor_id
  join public.clinics c on c.id = e.clinic_id
  join public.message_templates t on t.clinic_id = e.clinic_id and t.key = 'follow_up' and t.is_active and t.channel = 'whatsapp'
  where e.follow_up_on = ((p_now at time zone c.timezone)::date + 1)
    and not exists (select 1 from public.appointments a where a.patient_id = e.patient_id
                    and a.starts_at >= p_now and a.status in ('scheduled', 'confirmed'))
    and p.phone is not null and p.consent_messaging and p.messaging_opt_out_at is null and p.deleted_at is null
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; v_count := v_count + n;

  -- Vaccinations due in 3 days and not yet given.
  insert into public.message_queue (clinic_id, patient_id, template_key, channel, to_address, context, scheduled_for, related_entity, dedupe_key)
  select p.clinic_id, p.id, 'vaccination_due', t.channel, p.phone,
         jsonb_build_object('patient_name', p.full_name, 'clinic_name', c.name, 'vaccine', v.name || ' ' || v.dose_label,
                            'date', p.dob + v.due_age_days, 'timezone', c.timezone),
         p_now, 'vaccination', 'vaccine:' || p.id || ':' || v.code
  from public.patients p
  join public.clinics c on c.id = p.clinic_id
  cross join public.vaccine_schedule v
  join public.message_templates t on t.clinic_id = p.clinic_id and t.key = 'vaccination_due' and t.is_active and t.channel = 'whatsapp'
  where p.dob is not null and p.dob > (p_now - interval '13 years')::date
    and p.dob + v.due_age_days = (p_now at time zone c.timezone)::date + 3
    and not exists (select 1 from public.patient_vaccinations pv where pv.patient_id = p.id and pv.vaccine_code = v.code and pv.deleted_at is null)
    and p.phone is not null and p.consent_messaging and p.messaging_opt_out_at is null and p.deleted_at is null
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; v_count := v_count + n;

  -- Birthdays, sent with the morning run.
  insert into public.message_queue (clinic_id, patient_id, template_key, channel, to_address, context, scheduled_for, dedupe_key)
  select p.clinic_id, p.id, 'birthday', t.channel, p.phone,
         jsonb_build_object('patient_name', p.first_name, 'clinic_name', c.name),
         p_now,
         'birthday:' || p.id || ':' || extract(year from (p_now at time zone c.timezone))
  from public.patients p
  join public.clinics c on c.id = p.clinic_id
  join public.message_templates t on t.clinic_id = p.clinic_id and t.key = 'birthday' and t.is_active and t.channel = 'whatsapp'
  where p.dob is not null
    and to_char(p.dob, 'MM-DD') = to_char((p_now at time zone c.timezone)::date, 'MM-DD')
    and p.phone is not null and p.consent_messaging and p.messaging_opt_out_at is null and p.deleted_at is null
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; v_count := v_count + n;

  -- Recalls: last visit exactly N days ago and nothing booked.
  insert into public.message_queue (clinic_id, patient_id, template_key, channel, to_address, context, scheduled_for, related_entity, related_id, dedupe_key)
  select r.clinic_id, lv.patient_id, r.template_key, t.channel, p.phone,
         jsonb_build_object('patient_name', p.full_name, 'clinic_name', c.name),
         p_now, 'recall_rule', r.id, 'recall:' || r.id || ':' || lv.patient_id || ':' || lv.last_visit
  from public.recall_rules r
  join public.clinics c on c.id = r.clinic_id
  join lateral (
    select e.patient_id, max((e.started_at at time zone c.timezone)::date) as last_visit
    from public.encounters e
    where e.clinic_id = r.clinic_id and (r.specialty_id is null or e.specialty_id = r.specialty_id)
    group by e.patient_id
  ) lv on lv.last_visit + r.days_after_last_visit = (p_now at time zone c.timezone)::date
  join public.patients p on p.id = lv.patient_id
  join public.message_templates t on t.clinic_id = r.clinic_id and t.key = r.template_key and t.is_active and t.channel = 'whatsapp'
  where r.is_active
    and not exists (select 1 from public.appointments a where a.patient_id = lv.patient_id and a.starts_at >= p_now
                    and a.status in ('scheduled', 'confirmed'))
    and p.phone is not null and p.consent_messaging and p.messaging_opt_out_at is null and p.deleted_at is null
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; v_count := v_count + n;

  -- Feedback the evening after a completed visit (one per visit).
  insert into public.feedback (clinic_id, patient_id, encounter_id)
  select e.clinic_id, e.patient_id, e.id
  from public.encounters e
  join public.appointments a on a.id = e.appointment_id and a.status = 'completed'
  where a.completed_at between p_now - interval '26 hours' and p_now - interval '2 hours'
  on conflict (encounter_id) do nothing;

  insert into public.message_queue (clinic_id, patient_id, template_key, channel, to_address, context, scheduled_for, related_entity, related_id, dedupe_key)
  select f.clinic_id, f.patient_id, 'feedback', t.channel, p.phone,
         jsonb_build_object('patient_name', p.first_name, 'clinic_name', c.name, 'feedback_token', f.token),
         p_now, 'feedback', f.id, 'feedback:' || f.id
  from public.feedback f
  join public.patients p on p.id = f.patient_id
  join public.clinics c on c.id = f.clinic_id
  join public.message_templates t on t.clinic_id = f.clinic_id and t.key = 'feedback' and t.is_active and t.channel = 'whatsapp'
  where f.submitted_at is null and f.created_at > p_now - interval '1 day'
    and p.phone is not null and p.consent_messaging and p.messaging_opt_out_at is null and p.deleted_at is null
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count; v_count := v_count + n;

  return v_count;
end;
$$;
