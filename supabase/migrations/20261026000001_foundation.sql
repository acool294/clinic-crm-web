-- Phase 0: clinic, staff, roles and permissions, audit log.
--
-- Conventions used by every later migration:
--   * every clinic-owned table has clinic_id, created_at, created_by, updated_at, deleted_at
--   * money is integer paise
--   * RLS is enabled on every table; policies call app.* helpers wrapped in (select ...)
--     so Postgres evaluates them once per statement
--   * helpers in the app schema are security definer with an empty search_path

create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- Supabase grants new public tables to anon by default; nothing here is for anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('owner', 'doctor', 'nurse', 'receptionist', 'billing');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function app.set_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clinic (single clinic; clinic_id stays on every table so a branch is data, not a rewrite)
-- ---------------------------------------------------------------------------

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  legal_name text,
  registration_number text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'),
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  pincode text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  phone text,
  email text,
  website text,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR' check (currency = 'INR'),
  logo_path text,
  letterhead_header text,
  letterhead_footer text,
  -- {"mon": {"open": "09:00", "close": "18:00"}, "sun": null, ...}
  opening_hours jsonb not null default '{}'::jsonb,
  mrn_prefix text not null default 'MRN',
  invoice_prefix text not null default 'INV',
  default_slot_minutes int not null default 15 check (default_slot_minutes between 5 and 240),
  mfa_required_roles public.app_role[] not null default '{owner,doctor}',
  session_timeout_minutes int not null default 30 check (session_timeout_minutes between 5 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clinics_touch before update on public.clinics
  for each row execute function app.touch_updated_at();

-- Per-clinic counters for MRNs, invoice numbers and queue tokens.
create table public.clinic_counters (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  value bigint not null default 0,
  primary key (clinic_id, name)
);

create function app.next_counter(p_clinic uuid, p_name text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v bigint;
begin
  insert into public.clinic_counters as c (clinic_id, name, value)
  values (p_clinic, p_name, 1)
  on conflict (clinic_id, name) do update set value = c.value + 1
  returning value into v;
  return v;
end;
$$;
revoke all on function app.next_counter(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- Staff and roles
-- ---------------------------------------------------------------------------

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  phone text,
  title text,                         -- e.g. "MBBS, MD (Paediatrics)"
  registration_number text,           -- medical council registration, printed on Rx
  signature_path text,
  is_active boolean not null default true,
  -- a doctor limited to patients they have seen or are booked with
  restrict_to_own_patients boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (clinic_id, email)
);

create trigger staff_touch before update on public.staff
  for each row execute function app.touch_updated_at();

create table public.staff_roles (
  staff_id uuid not null references public.staff(id) on delete cascade,
  role public.app_role not null,
  primary key (staff_id, role)
);

create table public.permissions (
  key text primary key,
  description text not null
);

create table public.role_default_permissions (
  role public.app_role not null,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (role, permission)
);

-- The live matrix; the owner can adjust it in Settings.
create table public.role_permissions (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  role public.app_role not null,
  permission text not null references public.permissions(key) on delete cascade,
  primary key (clinic_id, role, permission)
);

-- Keep this list identical to src/lib/auth/permissions.ts (a test checks it).
insert into public.permissions (key, description) values
  ('settings.manage', 'Edit clinic settings, departments, rooms and the role matrix'),
  ('staff.read', 'See the staff list'),
  ('staff.manage', 'Invite, edit and deactivate staff'),
  ('audit.read', 'Review the audit log'),
  ('patients.read', 'See patient demographics'),
  ('patients.write', 'Register and edit patients'),
  ('patients.delete', 'Archive patients'),
  ('patients.merge', 'Merge duplicate patients'),
  ('appointments.read', 'See the calendar'),
  ('appointments.write', 'Book, reschedule and cancel appointments'),
  ('queue.manage', 'Check patients in and move the queue'),
  ('vitals.write', 'Record vitals'),
  ('clinical.read', 'Read consultations, notes, diagnoses and prescriptions'),
  ('clinical.write', 'Write consultations, notes and diagnoses'),
  ('prescriptions.write', 'Write prescriptions'),
  ('documents.read', 'View patient documents and reports'),
  ('documents.write', 'Upload patient documents and reports'),
  ('lab.read', 'See lab orders and results'),
  ('lab.write', 'Order tests and enter results'),
  ('billing.read', 'See invoices and payments'),
  ('billing.write', 'Create invoices and record payments'),
  ('billing.refund', 'Issue refunds and void invoices'),
  ('billing.close', 'Close the day''s cash'),
  ('services.manage', 'Edit the service catalogue and prices'),
  ('messages.read', 'See the message log'),
  ('messages.manage', 'Edit message templates and recall rules'),
  ('analytics.read', 'See analytics and export reports');

insert into public.role_default_permissions (role, permission)
select 'owner', key from public.permissions;

insert into public.role_default_permissions (role, permission) values
  ('doctor', 'staff.read'),
  ('doctor', 'patients.read'), ('doctor', 'patients.write'),
  ('doctor', 'appointments.read'), ('doctor', 'appointments.write'),
  ('doctor', 'queue.manage'), ('doctor', 'vitals.write'),
  ('doctor', 'clinical.read'), ('doctor', 'clinical.write'), ('doctor', 'prescriptions.write'),
  ('doctor', 'documents.read'), ('doctor', 'documents.write'),
  ('doctor', 'lab.read'), ('doctor', 'lab.write'),
  ('doctor', 'billing.read'), ('doctor', 'messages.read'),

  ('nurse', 'staff.read'),
  ('nurse', 'patients.read'), ('nurse', 'patients.write'),
  ('nurse', 'appointments.read'), ('nurse', 'queue.manage'), ('nurse', 'vitals.write'),
  ('nurse', 'clinical.read'),
  ('nurse', 'documents.read'), ('nurse', 'documents.write'),
  ('nurse', 'lab.read'), ('nurse', 'lab.write'),

  ('receptionist', 'staff.read'),
  ('receptionist', 'patients.read'), ('receptionist', 'patients.write'),
  ('receptionist', 'appointments.read'), ('receptionist', 'appointments.write'),
  ('receptionist', 'queue.manage'),
  ('receptionist', 'billing.read'), ('receptionist', 'billing.write'),
  ('receptionist', 'messages.read'),

  ('billing', 'staff.read'),
  ('billing', 'patients.read'), ('billing', 'appointments.read'),
  ('billing', 'billing.read'), ('billing', 'billing.write'),
  ('billing', 'billing.refund'), ('billing', 'billing.close'),
  ('billing', 'analytics.read');

create function app.seed_role_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_permissions (clinic_id, role, permission)
  select new.id, role, permission from public.role_default_permissions;
  return new;
end;
$$;

create trigger clinics_seed_permissions after insert on public.clinics
  for each row execute function app.seed_role_permissions();

-- The owner role must keep settings.manage and staff.manage, or nobody can fix the matrix.
create function app.protect_owner_permissions() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'owner' and old.permission in ('settings.manage', 'staff.manage') then
    raise exception 'The owner role cannot lose %', old.permission using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger role_permissions_protect_owner before delete on public.role_permissions
  for each row execute function app.protect_owner_permissions();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

create function app.current_staff_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.staff s
  where s.user_id = auth.uid() and s.is_active and s.deleted_at is null
$$;

create function app.current_clinic_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.clinic_id from public.staff s
  where s.user_id = auth.uid() and s.is_active and s.deleted_at is null
$$;

-- Owners and doctors (by default) must have completed a second factor (aal2).
create function app.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1
        from public.staff s
        join public.staff_roles sr on sr.staff_id = s.id
        join public.clinics c on c.id = s.clinic_id
        where s.user_id = auth.uid() and sr.role = any (c.mfa_required_roles)
      )
$$;

create function app.has_permission(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.staff s
    join public.staff_roles sr on sr.staff_id = s.id
    join public.role_permissions rp on rp.clinic_id = s.clinic_id and rp.role = sr.role
    where s.user_id = auth.uid()
      and s.is_active and s.deleted_at is null
      and rp.permission = p
  ) and app.mfa_ok()
$$;

create function app.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff s join public.staff_roles sr on sr.staff_id = s.id
    where s.user_id = auth.uid() and s.is_active and s.deleted_at is null and sr.role = r
  )
$$;

grant execute on all functions in schema app to authenticated;
revoke execute on function app.next_counter(uuid, text) from authenticated;

-- What the app needs to render the session: who I am, my roles and permissions.
create function public.my_access()
returns table (staff_id uuid, clinic_id uuid, full_name text, roles text[], permissions text[], mfa_required boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.clinic_id, s.full_name,
         array(select sr.role::text from public.staff_roles sr where sr.staff_id = s.id order by sr.role),
         array(
           select distinct rp.permission
           from public.staff_roles sr
           join public.role_permissions rp on rp.clinic_id = s.clinic_id and rp.role = sr.role
           where sr.staff_id = s.id
           order by rp.permission
         ),
         exists (
           select 1 from public.staff_roles sr join public.clinics c on c.id = s.clinic_id
           where sr.staff_id = s.id and sr.role = any (c.mfa_required_roles)
         )
  from public.staff s
  where s.user_id = auth.uid() and s.is_active and s.deleted_at is null
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Departments and rooms
-- ---------------------------------------------------------------------------

create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (clinic_id, code)
);
create trigger specialties_touch before update on public.specialties
  for each row execute function app.touch_updated_at();

create table public.doctor_specialties (
  staff_id uuid not null references public.staff(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (staff_id, specialty_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  name text not null,
  specialty_id uuid references public.specialties(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (clinic_id, name)
);
create trigger rooms_touch before update on public.rooms
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  clinic_id uuid references public.clinics(id),
  actor_user_id uuid,
  actor_staff_id uuid,
  action text not null check (action in ('view', 'create', 'update', 'delete', 'export', 'login', 'logout', 'login_failed', 'print')),
  entity text not null,
  entity_id uuid,
  patient_id uuid,
  details jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index audit_log_clinic_time on public.audit_log (clinic_id, created_at desc);
create index audit_log_patient on public.audit_log (patient_id, created_at desc) where patient_id is not null;

create function app.request_header(h text) returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('request.headers', true), '')::json ->> h
$$;

create function app.write_audit(
  p_clinic uuid, p_action text, p_entity text, p_entity_id uuid, p_patient uuid, p_details jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (clinic_id, actor_user_id, actor_staff_id, action, entity, entity_id, patient_id, details, ip, user_agent)
  values (
    p_clinic, auth.uid(), app.current_staff_id(), p_action, p_entity, p_entity_id, p_patient,
    coalesce(p_details, '{}'::jsonb),
    app.request_header('x-client-ip'),
    left(app.request_header('x-client-user-agent'), 300)
  );
end;
$$;
revoke all on function app.write_audit(uuid, text, text, uuid, uuid, jsonb) from public, authenticated;

-- Row trigger for writes. Records which columns changed, not their values, so the
-- log itself holds as little health data as possible.
create function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_old jsonb;
  v_changed text[];
  v_action text;
  v_patient uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_action := 'delete';
  else
    v_row := to_jsonb(new);
    v_action := case tg_op when 'INSERT' then 'create' else 'update' end;
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    select array_agg(k order by k) into v_changed
    from jsonb_object_keys(v_row) k
    where k not in ('updated_at') and v_row -> k is distinct from v_old -> k;
    if v_changed is null then
      return new;
    end if;
    if 'deleted_at' = any (v_changed) and v_row ->> 'deleted_at' is not null then
      v_action := 'delete';
    end if;
  end if;

  v_patient := case
    when tg_table_name = 'patients' then (v_row ->> 'id')::uuid
    else (v_row ->> 'patient_id')::uuid
  end;

  perform app.write_audit(
    case when tg_table_name = 'clinics' then (v_row ->> 'id')::uuid else (v_row ->> 'clinic_id')::uuid end,
    v_action, tg_table_name, (v_row ->> 'id')::uuid, v_patient,
    case when v_changed is null then '{}'::jsonb else jsonb_build_object('changed', to_jsonb(v_changed)) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Explicit events from the app: chart views, prints, exports, logins.
create function public.log_event(
  p_action text, p_entity text, p_entity_id uuid default null, p_patient_id uuid default null, p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('view', 'export', 'login', 'logout', 'print') then
    raise exception 'log_event cannot record %', p_action;
  end if;
  if app.current_clinic_id() is null then
    raise exception 'not a staff member' using errcode = 'insufficient_privilege';
  end if;
  perform app.write_audit(app.current_clinic_id(), p_action, p_entity, p_entity_id, p_patient_id, p_details);
end;
$$;
revoke all on function public.log_event(text, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.log_event(text, text, uuid, uuid, jsonb) to authenticated;

-- Failed logins have no session, so the server records them with the service key.
create function public.log_login_failure(p_email text, p_ip text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (clinic_id, action, entity, details, ip)
  values ((select id from public.clinics order by created_at limit 1), 'login_failed', 'auth', jsonb_build_object('email', lower(p_email)), p_ip);
end;
$$;
revoke all on function public.log_login_failure(text, text) from public, anon, authenticated;
grant execute on function public.log_login_failure(text, text) to service_role;

-- Login rate limit: 5 failures per email or 20 per IP in 15 minutes.
create function public.login_allowed(p_email text, p_ip text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (
    select count(*) from public.audit_log
    where action = 'login_failed' and details ->> 'email' = lower(p_email)
      and created_at > now() - interval '15 minutes'
  ) < 5
  and (
    select count(*) from public.audit_log
    where action = 'login_failed' and ip = p_ip and created_at > now() - interval '15 minutes'
  ) < 20
$$;
revoke all on function public.login_allowed(text, text) from public, anon, authenticated;
grant execute on function public.login_allowed(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- First-run setup: creates the one clinic and its owner. Service key only, once.
-- ---------------------------------------------------------------------------

create function public.bootstrap_clinic(
  p_clinic_name text, p_owner_user_id uuid, p_owner_name text, p_owner_email text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_clinic uuid;
  v_staff uuid;
begin
  if exists (select 1 from public.clinics) then
    raise exception 'The clinic is already set up' using errcode = 'unique_violation';
  end if;

  insert into public.clinics (name) values (p_clinic_name) returning id into v_clinic;
  insert into public.staff (clinic_id, user_id, full_name, email)
    values (v_clinic, p_owner_user_id, p_owner_name, lower(p_owner_email)) returning id into v_staff;
  insert into public.staff_roles (staff_id, role) values (v_staff, 'owner');

  insert into public.specialties (clinic_id, code, name, sort_order) values
    (v_clinic, 'general_medicine', 'General Medicine', 1),
    (v_clinic, 'pediatrics', 'Pediatrics', 2),
    (v_clinic, 'obgyn', 'Gynecology & Obstetrics', 3),
    (v_clinic, 'dermatology', 'Dermatology', 4);

  return v_clinic;
end;
$$;
revoke all on function public.bootstrap_clinic(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_clinic(text, uuid, text, text) to service_role;

create function public.clinic_is_set_up() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clinics)
$$;
grant execute on function public.clinic_is_set_up() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.clinics enable row level security;
alter table public.clinic_counters enable row level security;
alter table public.staff enable row level security;
alter table public.staff_roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_default_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.specialties enable row level security;
alter table public.doctor_specialties enable row level security;
alter table public.rooms enable row level security;
alter table public.audit_log enable row level security;

-- clinics: every staff member reads their clinic (name, letterhead, timezone); owner edits.
create policy clinics_select on public.clinics for select to authenticated
  using (id = (select app.current_clinic_id()));
create policy clinics_update on public.clinics for update to authenticated
  using (id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')))
  with check (id = (select app.current_clinic_id()));
grant select, update on public.clinics to authenticated;

-- staff
create policy staff_select on public.staff for select to authenticated
  using (
    clinic_id = (select app.current_clinic_id())
    and (user_id = auth.uid() or (select app.has_permission('staff.read')))
  );
create policy staff_insert on public.staff for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('staff.manage')));
create policy staff_update on public.staff for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('staff.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.staff to authenticated;

create policy staff_roles_select on public.staff_roles for select to authenticated
  using (exists (select 1 from public.staff s where s.id = staff_id and s.clinic_id = (select app.current_clinic_id())));
create policy staff_roles_write on public.staff_roles for insert to authenticated
  with check (
    (select app.has_permission('staff.manage'))
    and exists (select 1 from public.staff s where s.id = staff_id and s.clinic_id = (select app.current_clinic_id()))
  );
create policy staff_roles_delete on public.staff_roles for delete to authenticated
  using (
    (select app.has_permission('staff.manage'))
    and exists (select 1 from public.staff s where s.id = staff_id and s.clinic_id = (select app.current_clinic_id()))
  );
grant select, insert, delete on public.staff_roles to authenticated;

-- You cannot take the owner role away from the last active owner.
create function app.keep_one_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_clinic uuid;
begin
  if old.role <> 'owner' then
    return old;
  end if;
  select clinic_id into v_clinic from public.staff where id = old.staff_id;
  if not exists (
    select 1 from public.staff_roles sr join public.staff s on s.id = sr.staff_id
    where sr.role = 'owner' and s.clinic_id = v_clinic and s.is_active and s.deleted_at is null
      and sr.staff_id <> old.staff_id
  ) then
    raise exception 'The clinic needs at least one active owner' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;
create trigger staff_roles_keep_owner before delete on public.staff_roles
  for each row execute function app.keep_one_owner();

create function app.keep_one_owner_active() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.is_active and not new.is_active) or (old.deleted_at is null and new.deleted_at is not null) then
    if exists (select 1 from public.staff_roles where staff_id = old.id and role = 'owner')
       and not exists (
         select 1 from public.staff_roles sr join public.staff s on s.id = sr.staff_id
         where sr.role = 'owner' and s.clinic_id = old.clinic_id and s.is_active and s.deleted_at is null
           and s.id <> old.id
       ) then
      raise exception 'The clinic needs at least one active owner' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger staff_keep_owner before update on public.staff
  for each row execute function app.keep_one_owner_active();

create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_default_permissions_select on public.role_default_permissions for select to authenticated using (true);
grant select on public.permissions, public.role_default_permissions to authenticated;

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (clinic_id = (select app.current_clinic_id()));
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')));
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')));
grant select, insert, delete on public.role_permissions to authenticated;

create policy specialties_select on public.specialties for select to authenticated
  using (clinic_id = (select app.current_clinic_id()));
create policy specialties_insert on public.specialties for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')));
create policy specialties_update on public.specialties for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.specialties to authenticated;

create policy doctor_specialties_select on public.doctor_specialties for select to authenticated
  using (exists (select 1 from public.staff s where s.id = staff_id and s.clinic_id = (select app.current_clinic_id())));
create policy doctor_specialties_insert on public.doctor_specialties for insert to authenticated
  with check (
    (select app.has_permission('staff.manage'))
    and exists (select 1 from public.staff s where s.id = staff_id and s.clinic_id = (select app.current_clinic_id()))
  );
create policy doctor_specialties_delete on public.doctor_specialties for delete to authenticated
  using (
    (select app.has_permission('staff.manage'))
    and exists (select 1 from public.staff s where s.id = staff_id and s.clinic_id = (select app.current_clinic_id()))
  );
grant select, insert, delete on public.doctor_specialties to authenticated;

create policy rooms_select on public.rooms for select to authenticated
  using (clinic_id = (select app.current_clinic_id()));
create policy rooms_insert on public.rooms for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')));
create policy rooms_update on public.rooms for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('settings.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.rooms to authenticated;

-- audit_log: read only, owners by default. No insert/update/delete grant at all.
create policy audit_log_select on public.audit_log for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('audit.read')));
grant select on public.audit_log to authenticated;

create trigger clinics_audit after update on public.clinics
  for each row execute function app.audit_row();
create trigger staff_audit after insert or update on public.staff
  for each row execute function app.audit_row();
