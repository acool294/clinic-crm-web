-- Phase 2: consultation (encounters, vitals, diagnoses, notes, specialty panels),
-- prescriptions with allergy checks, documents, lab orders, referrals.

create type public.note_visibility as enum ('clinical_staff', 'same_specialty', 'author_only');
create type public.document_category as enum (
  'lab_report', 'imaging', 'prescription', 'consent', 'clinical_photo', 'id_proof', 'referral_letter', 'other'
);

-- clinical.read on a patient the caller is allowed to see
create function app.can_read_clinical(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_permission('clinical.read') and app.can_see_patient(p_patient)
$$;
grant execute on function app.can_read_clinical(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Encounters
-- ---------------------------------------------------------------------------

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  appointment_id uuid unique references public.appointments(id),
  doctor_id uuid not null references public.staff(id),
  specialty_id uuid references public.specialties(id),
  visit_type public.visit_type not null default 'new',
  started_at timestamptz not null default now(),
  chief_complaint text,
  history text,
  examination text,
  treatment_plan text,
  advice text,
  follow_up_on date,
  signed_at timestamptz,
  signed_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index encounters_patient on public.encounters (patient_id, started_at desc);
create index encounters_doctor on public.encounters (doctor_id, started_at desc);

-- Notes lock when signed, or 24 hours after the visit; later changes are addenda.
create function app.encounter_locked(p_encounter uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select e.signed_at is not null or e.created_at < now() - interval '24 hours'
    from public.encounters e where e.id = p_encounter
  ), false)
$$;
grant execute on function app.encounter_locked(uuid) to authenticated;

create function app.encounter_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.signed_at is not null or old.created_at < now() - interval '24 hours' then
    raise exception 'This visit is locked. Add an addendum instead.' using errcode = 'check_violation';
  end if;
  if new.signed_at is not null and old.signed_at is null then
    new.signed_by := app.current_staff_id();
  end if;
  if new.patient_id <> old.patient_id or new.clinic_id <> old.clinic_id then
    raise exception 'A visit cannot move to another patient' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger encounters_guard before update on public.encounters
  for each row when (current_user = 'authenticated') execute function app.encounter_guard();
create trigger encounters_touch before update on public.encounters
  for each row execute function app.touch_updated_at();
create trigger encounters_audit after insert or update on public.encounters
  for each row execute function app.audit_row();

-- Child rows of a locked visit cannot be added or changed.
create function app.child_of_unlocked_encounter() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- system work such as merging duplicates runs as the owner and may re-point locked rows
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.encounter_id is not null and app.encounter_locked(new.encounter_id) then
    raise exception 'This visit is locked. Add an addendum instead.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Start (or reopen) the visit for an appointment in one step.
create function public.start_encounter(p_appointment uuid) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_appt public.appointments;
  v_id uuid;
begin
  select * into v_appt from public.appointments where id = p_appointment;
  if not found then
    raise exception 'Appointment not found' using errcode = 'no_data_found';
  end if;
  select id into v_id from public.encounters where appointment_id = p_appointment;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.encounters (clinic_id, patient_id, appointment_id, doctor_id, specialty_id, visit_type)
  values (v_appt.clinic_id, v_appt.patient_id, v_appt.id, coalesce(app.current_staff_id(), v_appt.doctor_id),
          v_appt.specialty_id, v_appt.visit_type)
  returning id into v_id;
  if v_appt.status in ('scheduled', 'confirmed') then
    update public.appointments set status = 'checked_in' where id = p_appointment;
  end if;
  if v_appt.status in ('scheduled', 'confirmed', 'checked_in') then
    update public.appointments set status = 'in_consultation' where id = p_appointment;
  end if;
  return v_id;
end;
$$;
grant execute on function public.start_encounter(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vitals
-- ---------------------------------------------------------------------------

create table public.vitals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  recorded_at timestamptz not null default now(),
  recorded_by uuid default auth.uid(),
  height_cm numeric(5, 1) check (height_cm is null or height_cm between 20 and 250),
  weight_kg numeric(5, 2) check (weight_kg is null or weight_kg between 0.3 and 400),
  head_circumference_cm numeric(4, 1) check (head_circumference_cm is null or head_circumference_cm between 20 and 70),
  temperature_c numeric(4, 1) check (temperature_c is null or temperature_c between 30 and 45),
  pulse_bpm int check (pulse_bpm is null or pulse_bpm between 20 and 250),
  respiratory_rate int check (respiratory_rate is null or respiratory_rate between 4 and 80),
  bp_systolic int check (bp_systolic is null or bp_systolic between 50 and 260),
  bp_diastolic int check (bp_diastolic is null or bp_diastolic between 30 and 160),
  spo2 int check (spo2 is null or spo2 between 50 and 100),
  blood_glucose_mgdl int check (blood_glucose_mgdl is null or blood_glucose_mgdl between 20 and 800),
  bmi numeric(5, 1) generated always as (
    case when height_cm > 0 and weight_kg > 0 then round(weight_kg / ((height_cm / 100) ^ 2), 1) end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index vitals_patient on public.vitals (patient_id, recorded_at desc);
create trigger vitals_locked before insert or update on public.vitals
  for each row execute function app.child_of_unlocked_encounter();
create trigger vitals_touch before update on public.vitals
  for each row execute function app.touch_updated_at();
create trigger vitals_audit after insert or update on public.vitals
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Diagnoses (ICD-10)
-- ---------------------------------------------------------------------------

create table public.icd10_codes (
  code text primary key,
  title text not null
);
create index icd10_title_trgm on public.icd10_codes using gin (title extensions.gin_trgm_ops);

create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid not null references public.encounters(id),
  icd10_code text references public.icd10_codes(code),
  description text not null,
  kind text not null default 'provisional' check (kind in ('provisional', 'final')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index diagnoses_patient on public.diagnoses (patient_id);
create index diagnoses_code on public.diagnoses (clinic_id, icd10_code);
create trigger diagnoses_locked before insert or update on public.diagnoses
  for each row execute function app.child_of_unlocked_encounter();
create trigger diagnoses_touch before update on public.diagnoses
  for each row execute function app.touch_updated_at();
create trigger diagnoses_audit after insert or update on public.diagnoses
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Clinical notes and addenda (append-only)
-- ---------------------------------------------------------------------------

create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  author_id uuid not null default app.current_staff_id() references public.staff(id),
  specialty_id uuid references public.specialties(id),
  kind text not null default 'note' check (kind in ('note', 'addendum')),
  visibility public.note_visibility not null default 'clinical_staff',
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index clinical_notes_patient on public.clinical_notes (patient_id, created_at desc);
create trigger clinical_notes_audit after insert on public.clinical_notes
  for each row execute function app.audit_row();

create function app.can_read_note(p_author uuid, p_specialty uuid, p_visibility public.note_visibility) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_visibility
    when 'clinical_staff' then true
    when 'author_only' then p_author = app.current_staff_id()
    when 'same_specialty' then p_author = app.current_staff_id() or exists (
      select 1 from public.doctor_specialties ds
      where ds.staff_id = app.current_staff_id()
        and ds.specialty_id = coalesce(p_specialty, (
          select ds2.specialty_id from public.doctor_specialties ds2 where ds2.staff_id = p_author and ds2.is_primary limit 1
        ))
    )
  end
$$;
grant execute on function app.can_read_note(uuid, uuid, public.note_visibility) to authenticated;

-- ---------------------------------------------------------------------------
-- Specialty panels and the form engine
-- ---------------------------------------------------------------------------

-- Custom forms built in Settings. fields: [{key, label, type, options?, unit?, required?}]
create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  specialty_id uuid references public.specialties(id),
  name text not null,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create trigger form_templates_touch before update on public.form_templates
  for each row execute function app.touch_updated_at();

-- Which panels a department's consultation page shows. panel_key is a built-in
-- widget (growth_chart, vaccinations, obstetric_history, antenatal_visit,
-- skin_photos, body_map, procedure_sessions) or 'form:<template id>'.
create table public.specialty_panels (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  specialty_id uuid not null references public.specialties(id),
  panel_key text not null,
  enabled boolean not null default true,
  sort_order int not null default 0,
  unique (specialty_id, panel_key)
);

create function app.seed_specialty_panels() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.specialty_panels (clinic_id, specialty_id, panel_key, sort_order)
  select new.clinic_id, new.id, k, o
  from (values
    ('pediatrics', 'growth_chart', 1), ('pediatrics', 'vaccinations', 2),
    ('obgyn', 'obstetric_history', 1), ('obgyn', 'antenatal_visit', 2),
    ('dermatology', 'skin_photos', 1), ('dermatology', 'body_map', 2), ('dermatology', 'procedure_sessions', 3)
  ) as d(code, k, o)
  where d.code = new.code;
  return new;
end;
$$;
create trigger specialties_seed_panels after insert on public.specialties
  for each row execute function app.seed_specialty_panels();

-- Every panel on a visit saves here, so the timeline shows all of them.
create table public.encounter_forms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid not null references public.encounters(id),
  panel_key text not null,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  unique (encounter_id, panel_key)
);
create index encounter_forms_patient_panel on public.encounter_forms (patient_id, panel_key, created_at);
create trigger encounter_forms_locked before insert or update on public.encounter_forms
  for each row execute function app.child_of_unlocked_encounter();
create trigger encounter_forms_touch before update on public.encounter_forms
  for each row execute function app.touch_updated_at();
create trigger encounter_forms_audit after insert or update on public.encounter_forms
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Vaccinations (pediatrics)
-- ---------------------------------------------------------------------------

-- Default schedule based on the IAP immunisation timetable. Doctors confirm each dose.
create table public.vaccine_schedule (
  code text primary key,
  name text not null,
  dose_label text not null,
  due_age_days int not null,
  sort_order int not null
);

create table public.patient_vaccinations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  vaccine_code text not null references public.vaccine_schedule(code),
  given_on date not null,
  batch_number text,
  notes text,
  given_by uuid default app.current_staff_id() references public.staff(id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  unique (patient_id, vaccine_code)
);
create trigger patient_vaccinations_audit after insert or update on public.patient_vaccinations
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Prescriptions
-- ---------------------------------------------------------------------------

-- clinic_id null rows are the shared starter list; clinics add their own.
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id),
  brand_name text,
  generic_name text not null,
  form text not null default 'tablet',
  strength text,
  -- allergy groups this drug belongs to, e.g. {penicillin, beta-lactam}
  allergy_groups text[] not null default '{}',
  default_dose text,
  default_frequency text,
  default_duration_days int,
  default_instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index medications_generic_trgm on public.medications using gin (generic_name extensions.gin_trgm_ops);
create index medications_brand_trgm on public.medications using gin (brand_name extensions.gin_trgm_ops);

create table public.medication_favourites (
  staff_id uuid not null references public.staff(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  primary key (staff_id, medication_id)
);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid not null unique references public.encounters(id),
  doctor_id uuid not null default app.current_staff_id() references public.staff(id),
  notes text,
  allergy_override_reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create index prescriptions_patient on public.prescriptions (patient_id, created_at desc);
create trigger prescriptions_locked before insert or update on public.prescriptions
  for each row execute function app.child_of_unlocked_encounter();
create trigger prescriptions_touch before update on public.prescriptions
  for each row execute function app.touch_updated_at();
create trigger prescriptions_audit after insert or update on public.prescriptions
  for each row execute function app.audit_row();

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medication_id uuid references public.medications(id),
  drug_name text not null,
  generic_name text,
  dose text,                 -- "500 mg", "5 ml"
  frequency text,            -- "1-0-1", "SOS"
  timing text,               -- "after food"
  duration_days int check (duration_days is null or duration_days between 1 and 365),
  route text default 'oral',
  instructions text,
  sort_order int not null default 0
);
create index prescription_items_rx on public.prescription_items (prescription_id);

-- Allergy and duplicate warnings for a list of drugs.
create function public.prescription_warnings(p_patient uuid, p_drugs jsonb)
returns table (drug text, warning text, severity text)
language sql stable set search_path = '' as $$
  with drugs as (
    select d ->> 'drug_name' as drug_name,
           coalesce(d ->> 'generic_name', m.generic_name, d ->> 'drug_name') as generic,
           coalesce(m.allergy_groups, (
             -- free-text entries still get group checks when the generic is in the list
             select m2.allergy_groups from public.medications m2
             where lower(m2.generic_name) = lower(coalesce(d ->> 'generic_name', d ->> 'drug_name'))
             limit 1
           ), '{}') as groups
    from jsonb_array_elements(p_drugs) d
    left join public.medications m on m.id = nullif(d ->> 'medication_id', '')::uuid
  )
  select d.drug_name,
         'Patient is allergic to ' || a.allergen || coalesce(' (' || a.reaction || ')', ''),
         a.severity
  from drugs d
  join public.patient_allergies a on a.patient_id = p_patient and a.deleted_at is null
  where d.generic ilike '%' || a.allergen || '%'
     or d.drug_name ilike '%' || a.allergen || '%'
     or a.allergen ilike '%' || d.generic || '%'
     or exists (select 1 from unnest(d.groups) g where g ilike a.allergen or a.allergen ilike '%' || g || '%')
  union all
  select min(d.drug_name), 'Same medicine listed more than once', 'mild'
  from drugs d
  group by lower(d.generic)
  having count(*) > 1
$$;
grant execute on function public.prescription_warnings(uuid, jsonb) to authenticated;

-- Replace the visit's prescription in one transaction. Refuses an allergy
-- conflict unless the doctor gives an override reason.
create function public.save_prescription(
  p_encounter uuid, p_items jsonb, p_notes text default null, p_override_reason text default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_enc public.encounters;
  v_rx uuid;
  v_conflicts int;
begin
  if not app.has_permission('prescriptions.write') then
    raise exception 'You do not have permission to write prescriptions' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be a list';
  end if;
  select * into v_enc from public.encounters where id = p_encounter;
  if not found then
    raise exception 'Visit not found' using errcode = 'no_data_found';
  end if;

  select count(*) into v_conflicts
  from public.prescription_warnings(v_enc.patient_id, p_items) w where w.warning like 'Patient is allergic%';
  if v_conflicts > 0 and coalesce(trim(p_override_reason), '') = '' then
    raise exception 'Allergy conflict: give a reason to prescribe anyway' using errcode = 'check_violation';
  end if;

  insert into public.prescriptions (clinic_id, patient_id, encounter_id, notes, allergy_override_reason)
  values (v_enc.clinic_id, v_enc.patient_id, v_enc.id, p_notes, case when v_conflicts > 0 then p_override_reason end)
  on conflict (encounter_id) do update
    set notes = excluded.notes, allergy_override_reason = excluded.allergy_override_reason
  returning id into v_rx;

  delete from public.prescription_items where prescription_id = v_rx;
  insert into public.prescription_items
    (clinic_id, prescription_id, medication_id, drug_name, generic_name, dose, frequency, timing, duration_days, route, instructions, sort_order)
  select v_enc.clinic_id, v_rx, nullif(i ->> 'medication_id', '')::uuid, i ->> 'drug_name', nullif(i ->> 'generic_name', ''),
         nullif(i ->> 'dose', ''), nullif(i ->> 'frequency', ''), nullif(i ->> 'timing', ''),
         nullif(i ->> 'duration_days', '')::int, coalesce(nullif(i ->> 'route', ''), 'oral'), nullif(i ->> 'instructions', ''), ord::int
  from jsonb_array_elements(p_items) with ordinality as x(i, ord);

  return v_rx;
end;
$$;
grant execute on function public.save_prescription(uuid, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Documents (files live in the private patient-documents bucket)
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  category public.document_category not null default 'other',
  title text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 15 * 1024 * 1024),
  is_abnormal boolean not null default false,
  taken_on date,
  notes text,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (storage_path like clinic_id::text || '/' || patient_id::text || '/%')
);
create index documents_patient on public.documents (patient_id, created_at desc);
create trigger documents_touch before update on public.documents
  for each row execute function app.touch_updated_at();
create trigger documents_soft_delete before update on public.documents
  for each row execute function app.guard_soft_delete('documents.write');
create trigger documents_audit after insert or update on public.documents
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Labs
-- ---------------------------------------------------------------------------

create table public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id),   -- null = shared starter list
  code text not null,
  name text not null,
  unit text,
  ref_low numeric,
  ref_high numeric,
  ref_text text,
  price_paise int check (price_paise is null or price_paise >= 0),
  is_active boolean not null default true
);
create unique index lab_tests_code on public.lab_tests (coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

create table public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  ordered_by uuid not null default app.current_staff_id() references public.staff(id),
  status text not null default 'ordered' check (status in ('ordered', 'sample_collected', 'resulted', 'cancelled')),
  notes text,
  ordered_at timestamptz not null default now(),
  sample_collected_at timestamptz,
  resulted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lab_orders_patient on public.lab_orders (patient_id, ordered_at desc);
create index lab_orders_status on public.lab_orders (clinic_id, status);
create trigger lab_orders_touch before update on public.lab_orders
  for each row execute function app.touch_updated_at();
create trigger lab_orders_audit after insert or update on public.lab_orders
  for each row execute function app.audit_row();

create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  lab_order_id uuid not null references public.lab_orders(id) on delete cascade,
  patient_id uuid not null references public.patients(id),
  lab_test_id uuid not null references public.lab_tests(id),
  value_numeric numeric,
  value_text text,
  unit text,
  ref_low numeric,
  ref_high numeric,
  is_abnormal boolean generated always as (
    value_numeric is not null and ((ref_low is not null and value_numeric < ref_low) or (ref_high is not null and value_numeric > ref_high))
  ) stored,
  resulted_by uuid default app.current_staff_id() references public.staff(id),
  resulted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lab_order_id, lab_test_id)
);
create trigger lab_results_touch before update on public.lab_results
  for each row execute function app.touch_updated_at();
create trigger lab_results_audit after insert or update on public.lab_results
  for each row execute function app.audit_row();

-- Copy reference ranges from the test so later edits to the master do not rewrite history.
create function app.lab_result_defaults() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.lab_tests;
begin
  select * into t from public.lab_tests where id = new.lab_test_id;
  new.unit := coalesce(new.unit, t.unit);
  new.ref_low := coalesce(new.ref_low, t.ref_low);
  new.ref_high := coalesce(new.ref_high, t.ref_high);
  if (new.value_numeric is not null or new.value_text is not null) and new.resulted_at is null then
    new.resulted_at := now();
  end if;
  return new;
end;
$$;
create trigger lab_results_defaults before insert or update on public.lab_results
  for each row execute function app.lab_result_defaults();

-- Order several tests at once.
create function public.create_lab_order(p_patient uuid, p_encounter uuid, p_test_ids uuid[], p_notes text default null)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  v_clinic uuid := app.current_clinic_id();
begin
  if coalesce(array_length(p_test_ids, 1), 0) = 0 then
    raise exception 'Pick at least one test';
  end if;
  insert into public.lab_orders (clinic_id, patient_id, encounter_id, notes)
  values (v_clinic, p_patient, p_encounter, p_notes) returning id into v_id;
  insert into public.lab_results (clinic_id, lab_order_id, patient_id, lab_test_id)
  select v_clinic, v_id, p_patient, t from unnest(p_test_ids) t;
  return v_id;
end;
$$;
grant execute on function public.create_lab_order(uuid, uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Referrals between departments
-- ---------------------------------------------------------------------------

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  from_encounter_id uuid references public.encounters(id),
  from_doctor_id uuid not null default app.current_staff_id() references public.staff(id),
  to_specialty_id uuid not null references public.specialties(id),
  to_doctor_id uuid references public.staff(id),
  reason text not null,
  urgency text not null default 'routine' check (urgency in ('routine', 'soon', 'urgent')),
  status text not null default 'open' check (status in ('open', 'booked', 'completed', 'declined')),
  appointment_id uuid references public.appointments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index referrals_open on public.referrals (clinic_id, status, to_specialty_id);
create trigger referrals_touch before update on public.referrals
  for each row execute function app.touch_updated_at();
create trigger referrals_audit after insert or update on public.referrals
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.encounters enable row level security;
alter table public.vitals enable row level security;
alter table public.icd10_codes enable row level security;
alter table public.diagnoses enable row level security;
alter table public.clinical_notes enable row level security;
alter table public.form_templates enable row level security;
alter table public.specialty_panels enable row level security;
alter table public.encounter_forms enable row level security;
alter table public.vaccine_schedule enable row level security;
alter table public.patient_vaccinations enable row level security;
alter table public.medications enable row level security;
alter table public.medication_favourites enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.documents enable row level security;
alter table public.lab_tests enable row level security;
alter table public.lab_orders enable row level security;
alter table public.lab_results enable row level security;
alter table public.referrals enable row level security;

-- encounters
create policy encounters_select on public.encounters for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and app.can_read_clinical(patient_id));
create policy encounters_insert on public.encounters for insert to authenticated
  with check (
    clinic_id = (select app.current_clinic_id()) and (select app.has_permission('clinical.write'))
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = (select app.current_clinic_id()))
  );
create policy encounters_update on public.encounters for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('clinical.write')) and app.can_see_patient(patient_id))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.encounters to authenticated;

-- vitals: nurses record them, everyone with clinical.read sees them
create policy vitals_select on public.vitals for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and app.can_read_clinical(patient_id));
create policy vitals_insert on public.vitals for insert to authenticated
  with check (
    clinic_id = (select app.current_clinic_id()) and (select app.has_permission('vitals.write'))
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = (select app.current_clinic_id()))
  );
create policy vitals_update on public.vitals for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('vitals.write')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.vitals to authenticated;

create policy icd10_select on public.icd10_codes for select to authenticated using (true);
grant select on public.icd10_codes to authenticated;

-- diagnoses, encounter_forms, patient_vaccinations: clinical.write to change
do $$
declare
  t text;
begin
  foreach t in array array['diagnoses', 'encounter_forms', 'patient_vaccinations', 'referrals'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s for select to authenticated
        using (clinic_id = (select app.current_clinic_id()) and app.can_read_clinical(patient_id));
      create policy %1$s_insert on public.%1$s for insert to authenticated
        with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('clinical.write'))
          and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = (select app.current_clinic_id())));
      create policy %1$s_update on public.%1$s for update to authenticated
        using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('clinical.write')))
        with check (clinic_id = (select app.current_clinic_id()));
    $f$, t);
  end loop;
end;
$$;
grant select, insert, update on public.diagnoses, public.encounter_forms, public.patient_vaccinations, public.referrals to authenticated;
create policy diagnoses_delete on public.diagnoses for delete to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('clinical.write'))
         and not app.encounter_locked(encounter_id));
grant delete on public.diagnoses to authenticated;

-- clinical notes: append-only, visibility enforced here
create policy clinical_notes_select on public.clinical_notes for select to authenticated
  using (
    clinic_id = (select app.current_clinic_id())
    and app.can_read_clinical(patient_id)
    and app.can_read_note(author_id, specialty_id, visibility)
  );
create policy clinical_notes_insert on public.clinical_notes for insert to authenticated
  with check (
    clinic_id = (select app.current_clinic_id())
    and (select app.has_permission('clinical.write'))
    and author_id = (select app.current_staff_id())
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = (select app.current_clinic_id()))
  );
grant select, insert on public.clinical_notes to authenticated;

-- templates and panels: everyone reads; settings.manage edits
create policy form_templates_select on public.form_templates for select to authenticated
  using (clinic_id = (select app.current_clinic_id()));
create policy form_templates_insert on public.form_templates for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')));
create policy form_templates_update on public.form_templates for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.form_templates to authenticated;

create policy specialty_panels_select on public.specialty_panels for select to authenticated
  using (clinic_id = (select app.current_clinic_id()));
create policy specialty_panels_insert on public.specialty_panels for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')));
create policy specialty_panels_update on public.specialty_panels for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
create policy specialty_panels_delete on public.specialty_panels for delete to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')));
grant select, insert, update, delete on public.specialty_panels to authenticated;

create policy vaccine_schedule_select on public.vaccine_schedule for select to authenticated using (true);
grant select on public.vaccine_schedule to authenticated;

-- medications: shared list plus the clinic's own
create policy medications_select on public.medications for select to authenticated
  using (clinic_id is null or clinic_id = (select app.current_clinic_id()));
create policy medications_insert on public.medications for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('prescriptions.write')));
create policy medications_update on public.medications for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.medications to authenticated;

create policy medication_favourites_all on public.medication_favourites for all to authenticated
  using (staff_id = (select app.current_staff_id()))
  with check (staff_id = (select app.current_staff_id()));
grant select, insert, delete on public.medication_favourites to authenticated;

create policy prescriptions_select on public.prescriptions for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and app.can_read_clinical(patient_id));
create policy prescriptions_insert on public.prescriptions for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('prescriptions.write')));
create policy prescriptions_update on public.prescriptions for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('prescriptions.write')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.prescriptions to authenticated;

create policy prescription_items_select on public.prescription_items for select to authenticated
  using (exists (select 1 from public.prescriptions p where p.id = prescription_id));
create policy prescription_items_insert on public.prescription_items for insert to authenticated
  with check (
    (select app.has_permission('prescriptions.write'))
    and exists (select 1 from public.prescriptions p where p.id = prescription_id and not app.encounter_locked(p.encounter_id))
  );
create policy prescription_items_delete on public.prescription_items for delete to authenticated
  using (
    (select app.has_permission('prescriptions.write'))
    and exists (select 1 from public.prescriptions p where p.id = prescription_id and not app.encounter_locked(p.encounter_id))
  );
grant select, insert, delete on public.prescription_items to authenticated;

create policy documents_select on public.documents for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('documents.read')) and app.can_see_patient(patient_id));
create policy documents_insert on public.documents for insert to authenticated
  with check (
    clinic_id = (select app.current_clinic_id()) and (select app.has_permission('documents.write'))
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = (select app.current_clinic_id()))
  );
create policy documents_update on public.documents for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('documents.write')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.documents to authenticated;

create policy lab_tests_select on public.lab_tests for select to authenticated
  using (clinic_id is null or clinic_id = (select app.current_clinic_id()));
create policy lab_tests_insert on public.lab_tests for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')));
create policy lab_tests_update on public.lab_tests for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.lab_tests to authenticated;

create policy lab_orders_select on public.lab_orders for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('lab.read')) and app.can_see_patient(patient_id));
create policy lab_orders_insert on public.lab_orders for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('lab.write')));
create policy lab_orders_update on public.lab_orders for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('lab.write')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.lab_orders to authenticated;

create policy lab_results_select on public.lab_results for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('lab.read')) and app.can_see_patient(patient_id));
create policy lab_results_insert on public.lab_results for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('lab.write')));
create policy lab_results_update on public.lab_results for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('lab.write')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.lab_results to authenticated;

-- Specialty panels for departments created before this migration.
insert into public.specialty_panels (clinic_id, specialty_id, panel_key, sort_order)
select s.clinic_id, s.id, d.k, d.o
from public.specialties s
join (values
  ('pediatrics', 'growth_chart', 1), ('pediatrics', 'vaccinations', 2),
  ('obgyn', 'obstetric_history', 1), ('obgyn', 'antenatal_visit', 2),
  ('dermatology', 'skin_photos', 1), ('dermatology', 'body_map', 2), ('dermatology', 'procedure_sessions', 3)
) as d(code, k, o) on d.code = s.code
on conflict do nothing;

-- Restricted doctors also see patients they have treated.
create or replace function app.can_see_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce((select s.restrict_to_own_patients from public.staff s
                       where s.user_id = auth.uid() and s.is_active), false)
      or exists (select 1 from public.appointments a
                 where a.patient_id = p_patient and a.doctor_id = app.current_staff_id() and a.deleted_at is null)
      or exists (select 1 from public.encounters e
                 where e.patient_id = p_patient and e.doctor_id = app.current_staff_id())
      or exists (select 1 from public.referrals r
                 where r.patient_id = p_patient and r.to_doctor_id = app.current_staff_id())
$$;
