-- Phase 1: patient registry, doctor schedules, appointments, check-in queue.

create type public.sex as enum ('male', 'female', 'other', 'unknown');
create type public.visit_type as enum ('new', 'follow_up', 'procedure');
create type public.appointment_source as enum ('front_desk', 'phone', 'walk_in', 'online', 'patient_app');
create type public.appointment_status as enum (
  'scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show'
);

-- Soft delete needs its own permission even though it is technically an update.
create function app.guard_soft_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
     and current_user = 'authenticated'
     and not app.has_permission(tg_argv[0]) then
    raise exception 'You do not have permission to archive this record' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  mrn text not null,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text,
  full_name text generated always as (trim(first_name || ' ' || coalesce(last_name, ''))) stored,
  dob date check (dob is null or dob <= current_date),
  sex public.sex not null default 'unknown',
  phone text check (phone is null or phone ~ '^\+?[0-9]{10,13}$'),
  alt_phone text,
  email text,
  address text,
  city text,
  state text,
  pincode text,
  blood_group text check (blood_group is null or blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  abha_number text,
  photo_path text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  insurance_provider text,
  insurance_policy_number text,
  tags text[] not null default '{}',
  notes text,
  consent_treatment_at timestamptz,
  consent_messaging boolean not null default false,
  messaging_opt_out_at timestamptz,
  -- the patient app login, linked once the front desk confirms the phone number
  auth_user_id uuid unique references auth.users(id) on delete set null,
  merged_into uuid references public.patients(id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (clinic_id, mrn)
);

create index patients_phone on public.patients (clinic_id, phone) where deleted_at is null;
create index patients_name_trgm on public.patients using gin (full_name extensions.gin_trgm_ops);
create index patients_mrn_trgm on public.patients using gin (mrn extensions.gin_trgm_ops);

create function app.assign_mrn() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
begin
  if new.mrn is null or new.mrn = '' then
    select mrn_prefix into v_prefix from public.clinics where id = new.clinic_id;
    new.mrn := v_prefix || '-' || lpad(app.next_counter(new.clinic_id, 'mrn')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- MRNs are assigned by the database and never change.
create function app.freeze_mrn() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.mrn is distinct from old.mrn then
    raise exception 'The MRN cannot be changed' using errcode = 'check_violation';
  end if;
  if new.clinic_id is distinct from old.clinic_id then
    raise exception 'A patient cannot move between clinics' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter table public.patients alter column mrn set default '';
create trigger patients_mrn before insert on public.patients
  for each row execute function app.assign_mrn();
create trigger patients_freeze before update on public.patients
  for each row execute function app.freeze_mrn();
create trigger patients_touch before update on public.patients
  for each row execute function app.touch_updated_at();
create trigger patients_soft_delete before update on public.patients
  for each row execute function app.guard_soft_delete('patients.delete');
create trigger patients_audit after insert or update on public.patients
  for each row execute function app.audit_row();

create table public.patient_allergies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  allergen text not null check (length(trim(allergen)) > 0),
  reaction text,
  severity text not null default 'moderate' check (severity in ('mild', 'moderate', 'severe')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index patient_allergies_patient on public.patient_allergies (patient_id) where deleted_at is null;
create trigger patient_allergies_touch before update on public.patient_allergies
  for each row execute function app.touch_updated_at();
create trigger patient_allergies_audit after insert or update on public.patient_allergies
  for each row execute function app.audit_row();

create table public.patient_conditions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  name text not null,
  icd10_code text,
  since date,
  status text not null default 'active' check (status in ('active', 'resolved')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index patient_conditions_patient on public.patient_conditions (patient_id) where deleted_at is null;
create trigger patient_conditions_touch before update on public.patient_conditions
  for each row execute function app.touch_updated_at();
create trigger patient_conditions_audit after insert or update on public.patient_conditions
  for each row execute function app.audit_row();

create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  related_patient_id uuid not null references public.patients(id),
  relation text not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (patient_id <> related_patient_id),
  unique (patient_id, related_patient_id)
);

-- ---------------------------------------------------------------------------
-- Schedules
-- ---------------------------------------------------------------------------

create table public.doctor_schedules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  doctor_id uuid not null references public.staff(id),
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  slot_minutes int not null default 15 check (slot_minutes between 5 and 240),
  room_id uuid references public.rooms(id),
  specialty_id uuid references public.specialties(id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);
create trigger doctor_schedules_touch before update on public.doctor_schedules
  for each row execute function app.touch_updated_at();

create table public.doctor_leaves (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  doctor_id uuid not null references public.staff(id),
  starts_on date not null,
  ends_on date not null,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (ends_on >= starts_on)
);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  doctor_id uuid not null references public.staff(id),
  specialty_id uuid references public.specialties(id),
  room_id uuid references public.rooms(id),
  visit_type public.visit_type not null default 'new',
  source public.appointment_source not null default 'front_desk',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  reason text,
  notes text,
  cancel_reason text,
  checked_in_at timestamptz,
  consultation_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '8 hours'),
  -- no double booking of a doctor or a room; cancelled and no-show slots free up
  constraint appointments_doctor_overlap exclude using gist (
    doctor_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('cancelled', 'no_show') and deleted_at is null),
  constraint appointments_room_overlap exclude using gist (
    room_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (room_id is not null and status not in ('cancelled', 'no_show') and deleted_at is null)
);
create index appointments_clinic_time on public.appointments (clinic_id, starts_at);
create index appointments_patient on public.appointments (patient_id, starts_at desc);
create index appointments_doctor_time on public.appointments (doctor_id, starts_at);

create table public.appointment_status_history (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id),
  appointment_id uuid not null references public.appointments(id),
  from_status public.appointment_status,
  to_status public.appointment_status not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index appointment_status_history_appt on public.appointment_status_history (appointment_id);

-- The front desk state machine.
create function app.appointment_transition_ok(f public.appointment_status, t public.appointment_status) returns boolean
language sql immutable set search_path = '' as $$
  select f = t or (f, t) in (
    ('scheduled', 'confirmed'), ('scheduled', 'checked_in'), ('scheduled', 'cancelled'), ('scheduled', 'no_show'),
    ('confirmed', 'checked_in'), ('confirmed', 'cancelled'), ('confirmed', 'no_show'),
    ('checked_in', 'in_consultation'), ('checked_in', 'completed'), ('checked_in', 'cancelled'),
    ('in_consultation', 'completed'), ('in_consultation', 'checked_in'),
    ('no_show', 'scheduled'), ('cancelled', 'scheduled')
  )
$$;

-- Insert logging has to run after the row exists (the history row references it).
create function app.appointment_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.appointment_status_history (clinic_id, appointment_id, from_status, to_status)
  values (new.clinic_id, new.id, null, new.status);
  return new;
end;
$$;

create function app.appointment_status_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not app.appointment_transition_ok(old.status, new.status) then
    raise exception 'An appointment cannot go from % to %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.status <> old.status then
    if new.status = 'checked_in' and new.checked_in_at is null then new.checked_in_at := now(); end if;
    if new.status = 'in_consultation' then new.consultation_started_at := coalesce(new.consultation_started_at, now()); end if;
    if new.status = 'completed' then new.completed_at := now(); end if;
  end if;
  return new;
end;
$$;

create function app.appointment_status_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.appointment_status_history (clinic_id, appointment_id, from_status, to_status)
    values (new.clinic_id, new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger appointments_touch before update on public.appointments
  for each row execute function app.touch_updated_at();
create trigger appointments_status_guard before update on public.appointments
  for each row execute function app.appointment_status_guard();
create trigger appointments_created after insert on public.appointments
  for each row execute function app.appointment_created();
create trigger appointments_status_log after update on public.appointments
  for each row execute function app.appointment_status_log();
create trigger appointments_audit after insert or update on public.appointments
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Queue tokens: one per check-in, numbered per department per day
-- ---------------------------------------------------------------------------

create table public.queue_tokens (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  appointment_id uuid not null unique references public.appointments(id),
  patient_id uuid not null references public.patients(id),
  specialty_id uuid references public.specialties(id),
  token_date date not null,
  token_number int not null,
  created_at timestamptz not null default now(),
  unique (clinic_id, specialty_id, token_date, token_number)
);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  doctor_id uuid references public.staff(id),
  specialty_id uuid references public.specialties(id),
  preferred_date date,
  notes text,
  status text not null default 'waiting' check (status in ('waiting', 'booked', 'removed')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create trigger waitlist_touch before update on public.waitlist
  for each row execute function app.touch_updated_at();

-- Check a patient in and hand out the next token for their department today.
create function public.check_in(p_appointment uuid)
returns table (token_number int, token_date date)
language plpgsql security definer set search_path = '' as $$
declare
  v_appt public.appointments;
  v_tz text;
  v_date date;
  v_num int;
begin
  if not app.has_permission('queue.manage') then
    raise exception 'You do not have permission to check patients in' using errcode = 'insufficient_privilege';
  end if;
  select * into v_appt from public.appointments
  where id = p_appointment and clinic_id = app.current_clinic_id() and deleted_at is null
  for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'no_data_found';
  end if;

  select q.token_number, q.token_date into v_num, v_date from public.queue_tokens q where q.appointment_id = p_appointment;
  if found then
    return query select v_num, v_date;
    return;
  end if;

  select timezone into v_tz from public.clinics where id = v_appt.clinic_id;
  v_date := (now() at time zone v_tz)::date;
  v_num := app.next_counter(v_appt.clinic_id, 'token:' || v_date || ':' || coalesce(v_appt.specialty_id::text, 'general'))::int;

  update public.appointments set status = 'checked_in' where id = p_appointment;
  insert into public.queue_tokens (clinic_id, appointment_id, patient_id, specialty_id, token_date, token_number)
  values (v_appt.clinic_id, v_appt.id, v_appt.patient_id, v_appt.specialty_id, v_date, v_num);

  return query select v_num, v_date;
end;
$$;
revoke all on function public.check_in(uuid) from public, anon;
grant execute on function public.check_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Doctors limited to their own patients
-- ---------------------------------------------------------------------------

create function app.can_see_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not coalesce((select s.restrict_to_own_patients from public.staff s
                       where s.user_id = auth.uid() and s.is_active), false)
      or exists (select 1 from public.appointments a
                 where a.patient_id = p_patient and a.doctor_id = app.current_staff_id() and a.deleted_at is null)
$$;
grant execute on function app.can_see_patient(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Search and duplicates (run with the caller's rights, so RLS applies)
-- ---------------------------------------------------------------------------

create function public.search_patients(p_query text, p_limit int default 20, p_offset int default 0)
returns setof public.patients
language sql stable set search_path = '' as $$
  select p.* from public.patients p
  where p.deleted_at is null and p.merged_into is null
    and (
      coalesce(trim(p_query), '') = ''
      or p.mrn ilike '%' || trim(p_query) || '%'
      or p.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%' and length(regexp_replace(p_query, '\D', '', 'g')) >= 4
      or p.full_name ilike '%' || trim(p_query) || '%'
      or extensions.similarity(p.full_name, trim(p_query)) > 0.35
    )
  order by
    case when coalesce(trim(p_query), '') = '' then 0 else extensions.similarity(p.full_name, trim(p_query)) end desc,
    p.created_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;
grant execute on function public.search_patients(text, int, int) to authenticated;

create function public.find_duplicate_patients(
  p_first_name text, p_last_name text, p_phone text, p_dob date, p_exclude uuid default null
)
returns table (id uuid, mrn text, full_name text, phone text, dob date, reason text)
language sql stable set search_path = '' as $$
  select p.id, p.mrn, p.full_name, p.phone, p.dob,
         case when p.phone is not null and p.phone = p_phone then 'Same phone number'
              else 'Similar name and same date of birth' end
  from public.patients p
  where p.deleted_at is null and p.merged_into is null
    and (p_exclude is null or p.id <> p_exclude)
    and (
      (p_phone is not null and p_phone <> '' and p.phone = p_phone)
      or (p_dob is not null and p.dob = p_dob
          and extensions.similarity(p.full_name, trim(p_first_name || ' ' || coalesce(p_last_name, ''))) > 0.5)
    )
  limit 10
$$;
grant execute on function public.find_duplicate_patients(text, text, text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.patients enable row level security;
alter table public.patient_allergies enable row level security;
alter table public.patient_conditions enable row level security;
alter table public.family_links enable row level security;
alter table public.doctor_schedules enable row level security;
alter table public.doctor_leaves enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_status_history enable row level security;
alter table public.queue_tokens enable row level security;
alter table public.waitlist enable row level security;

create policy patients_select on public.patients for select to authenticated
  using (
    clinic_id = (select app.current_clinic_id())
    and (select app.has_permission('patients.read'))
    and app.can_see_patient(id)
  );
create policy patients_insert on public.patients for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('patients.write')));
create policy patients_update on public.patients for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('patients.write')) and app.can_see_patient(id))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.patients to authenticated;

-- Allergies and conditions are safety information: anyone who can see the patient sees them.
do $$
declare
  t text;
begin
  foreach t in array array['patient_allergies', 'patient_conditions', 'family_links'] loop
    execute format($f$
      create policy %1$s_select on public.%1$s for select to authenticated
        using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('patients.read')) and app.can_see_patient(patient_id));
      create policy %1$s_insert on public.%1$s for insert to authenticated
        with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('patients.write'))
          and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = (select app.current_clinic_id())));
      create policy %1$s_update on public.%1$s for update to authenticated
        using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('patients.write')))
        with check (clinic_id = (select app.current_clinic_id()));
    $f$, t);
  end loop;
end;
$$;
grant select, insert, update on public.patient_allergies, public.patient_conditions to authenticated;
grant select, insert, update, delete on public.family_links to authenticated;
create policy family_links_delete on public.family_links for delete to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('patients.write')));

create policy doctor_schedules_select on public.doctor_schedules for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('appointments.read')));
create policy doctor_schedules_write on public.doctor_schedules for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('staff.manage')));
create policy doctor_schedules_update on public.doctor_schedules for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('staff.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
create policy doctor_schedules_delete on public.doctor_schedules for delete to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('staff.manage')));
grant select, insert, update, delete on public.doctor_schedules to authenticated;

create policy doctor_leaves_select on public.doctor_leaves for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('appointments.read')));
create policy doctor_leaves_insert on public.doctor_leaves for insert to authenticated
  with check (
    clinic_id = (select app.current_clinic_id())
    and ((select app.has_permission('staff.manage')) or doctor_id = (select app.current_staff_id()))
  );
create policy doctor_leaves_delete on public.doctor_leaves for delete to authenticated
  using (
    clinic_id = (select app.current_clinic_id())
    and ((select app.has_permission('staff.manage')) or doctor_id = (select app.current_staff_id()))
  );
grant select, insert, delete on public.doctor_leaves to authenticated;

create policy appointments_select on public.appointments for select to authenticated
  using (
    clinic_id = (select app.current_clinic_id())
    and (select app.has_permission('appointments.read'))
    and app.can_see_patient(patient_id)
  );
create policy appointments_insert on public.appointments for insert to authenticated
  with check (
    clinic_id = (select app.current_clinic_id())
    and (select app.has_permission('appointments.write'))
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = (select app.current_clinic_id()))
    and exists (select 1 from public.staff s where s.id = doctor_id and s.clinic_id = (select app.current_clinic_id()))
  );
-- queue.manage may move status (check-in, start, done) without appointments.write
create policy appointments_update on public.appointments for update to authenticated
  using (
    clinic_id = (select app.current_clinic_id())
    and ((select app.has_permission('appointments.write')) or (select app.has_permission('queue.manage')))
    and app.can_see_patient(patient_id)
  )
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.appointments to authenticated;

create policy appointment_status_history_select on public.appointment_status_history for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('appointments.read')));
grant select on public.appointment_status_history to authenticated;

create policy queue_tokens_select on public.queue_tokens for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('appointments.read')));
grant select on public.queue_tokens to authenticated;

create policy waitlist_select on public.waitlist for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('appointments.read')));
create policy waitlist_insert on public.waitlist for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('appointments.write')));
create policy waitlist_update on public.waitlist for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('appointments.write')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.waitlist to authenticated;
