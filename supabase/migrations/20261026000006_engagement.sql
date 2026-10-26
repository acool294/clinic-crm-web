-- Phase 4: message templates, a queue processed by a scheduled job, recalls, feedback.
-- The job runs on the server with the service key; staff only read the log and edit templates.

create type public.message_channel as enum ('whatsapp', 'sms', 'email');
create type public.message_status as enum ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'cancelled', 'skipped');

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  key text not null check (key in (
    'appointment_reminder', 'appointment_booked', 'follow_up', 'birthday', 'receipt',
    'feedback', 'vaccination_due', 'recall'
  )),
  channel public.message_channel not null,
  -- {{patient_name}} {{clinic_name}} {{doctor_name}} {{date}} {{time}} {{link}} {{vaccine}} {{amount}}
  body text not null,
  -- the approved WhatsApp template name, when channel = whatsapp
  provider_template text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, key, channel)
);
create trigger message_templates_touch before update on public.message_templates
  for each row execute function app.touch_updated_at();

create table public.message_queue (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid references public.patients(id),
  template_key text not null,
  channel public.message_channel not null,
  to_address text not null,
  context jsonb not null default '{}'::jsonb,
  body text,
  scheduled_for timestamptz not null default now(),
  status public.message_status not null default 'queued',
  attempts int not null default 0,
  last_error text,
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  related_entity text,
  related_id uuid,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_queue_due on public.message_queue (status, scheduled_for) where status = 'queued';
create index message_queue_patient on public.message_queue (patient_id, created_at desc);
create index message_queue_provider_id on public.message_queue (provider_message_id) where provider_message_id is not null;
create trigger message_queue_touch before update on public.message_queue
  for each row execute function app.touch_updated_at();

create table public.recall_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  name text not null,
  specialty_id uuid references public.specialties(id),
  days_after_last_visit int not null check (days_after_last_visit between 1 and 1095),
  template_key text not null default 'recall',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger recall_rules_touch before update on public.recall_rules
  for each row execute function app.touch_updated_at();

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  patient_id uuid not null references public.patients(id),
  encounter_id uuid unique references public.encounters(id),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  score int check (score is null or score between 0 and 10),
  comment text,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Default templates for a new clinic.
create function app.seed_message_templates() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.message_templates (clinic_id, key, channel, body) values
    (new.id, 'appointment_booked', 'whatsapp', 'Hello {{patient_name}}, your appointment with {{doctor_name}} at {{clinic_name}} is booked for {{date}} at {{time}}.'),
    (new.id, 'appointment_reminder', 'whatsapp', 'Reminder: {{patient_name}}, you have an appointment with {{doctor_name}} at {{clinic_name}} on {{date}} at {{time}}. Reply STOP to opt out.'),
    (new.id, 'appointment_reminder', 'sms', 'Reminder: appointment with {{doctor_name}} at {{clinic_name}} on {{date}} {{time}}.'),
    (new.id, 'follow_up', 'whatsapp', 'Hello {{patient_name}}, {{doctor_name}} asked to see you again on {{date}}. Call {{clinic_name}} to book a time.'),
    (new.id, 'vaccination_due', 'whatsapp', 'Hello, {{patient_name}}''s {{vaccine}} vaccination is due on {{date}}. Please book a visit at {{clinic_name}}.'),
    (new.id, 'birthday', 'whatsapp', 'Happy birthday, {{patient_name}}! Best wishes from everyone at {{clinic_name}}.'),
    (new.id, 'receipt', 'whatsapp', 'Thank you, {{patient_name}}. We received {{amount}} at {{clinic_name}}.'),
    (new.id, 'feedback', 'whatsapp', 'Hello {{patient_name}}, how was your visit to {{clinic_name}}? Tell us in one tap: {{link}}'),
    (new.id, 'recall', 'whatsapp', 'Hello {{patient_name}}, it has been a while since your last visit to {{clinic_name}}. Reply or call us to book a check-up.');
  return new;
end;
$$;
create trigger clinics_seed_templates after insert on public.clinics
  for each row execute function app.seed_message_templates();

insert into public.message_templates (clinic_id, key, channel, body)
select c.id, t.key, t.channel::public.message_channel, t.body
from public.clinics c
cross join (values
  ('appointment_reminder', 'whatsapp', 'Reminder: {{patient_name}}, you have an appointment with {{doctor_name}} at {{clinic_name}} on {{date}} at {{time}}. Reply STOP to opt out.'),
  ('feedback', 'whatsapp', 'Hello {{patient_name}}, how was your visit to {{clinic_name}}? Tell us in one tap: {{link}}')
) as t(key, channel, body)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Enqueue what is due. Called by the scheduled job (service key). Idempotent:
-- dedupe_key makes a second run in the same window a no-op.
-- ---------------------------------------------------------------------------

create function public.enqueue_due_messages(p_now timestamptz default now())
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int := 0;
  n int;
begin
  -- Appointment reminders, about 24 hours ahead.
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
    and a.starts_at between p_now + interval '20 hours' and p_now + interval '28 hours'
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

  -- Birthdays, sent at 9:00 clinic time.
  insert into public.message_queue (clinic_id, patient_id, template_key, channel, to_address, context, scheduled_for, dedupe_key)
  select p.clinic_id, p.id, 'birthday', t.channel, p.phone,
         jsonb_build_object('patient_name', p.first_name, 'clinic_name', c.name),
         (((p_now at time zone c.timezone)::date + time '09:00') at time zone c.timezone),
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
revoke all on function public.enqueue_due_messages(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_due_messages(timestamptz) to service_role;

-- Claim a batch for sending; skip locked rows so two workers never send the same message.
create function public.claim_messages(p_limit int default 50)
returns setof public.message_queue
language sql security definer set search_path = '' as $$
  update public.message_queue q set status = 'sending', attempts = q.attempts + 1
  where q.id in (
    select id from public.message_queue
    where status = 'queued' and scheduled_for <= now() and attempts < 5
    order by scheduled_for
    limit p_limit
    for update skip locked
  )
  returning q.*
$$;
revoke all on function public.claim_messages(int) from public, anon, authenticated;
grant execute on function public.claim_messages(int) to service_role;

-- Public feedback page: look up and submit by token only (service key on the server).
create function public.submit_feedback(p_token text, p_score int, p_comment text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.feedback set score = p_score, comment = left(p_comment, 2000), submitted_at = now()
  where token = p_token and submitted_at is null and created_at > now() - interval '14 days';
  return found;
end;
$$;
revoke all on function public.submit_feedback(text, int, text) from public, anon, authenticated;
grant execute on function public.submit_feedback(text, int, text) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.message_templates enable row level security;
alter table public.message_queue enable row level security;
alter table public.recall_rules enable row level security;
alter table public.feedback enable row level security;

create policy message_templates_select on public.message_templates for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.read')));
create policy message_templates_insert on public.message_templates for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.manage')));
create policy message_templates_update on public.message_templates for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.message_templates to authenticated;

create policy message_queue_select on public.message_queue for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.read')));
-- staff can queue a one-off message (e.g. a receipt); the job does the sending
create policy message_queue_insert on public.message_queue for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.read')) and status = 'queued');
create policy message_queue_cancel on public.message_queue for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.manage')) and status = 'queued')
  with check (status = 'cancelled');
grant select, insert, update on public.message_queue to authenticated;

create policy recall_rules_select on public.recall_rules for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.read')));
create policy recall_rules_insert on public.recall_rules for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.manage')));
create policy recall_rules_update on public.recall_rules for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('messages.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.recall_rules to authenticated;

create policy feedback_select on public.feedback for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('analytics.read')));
grant select on public.feedback to authenticated;
