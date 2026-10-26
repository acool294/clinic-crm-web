-- Phase 3: service catalogue, itemised GST invoices, manual payments, refunds, cash closing.
-- Totals and balances are always computed from items and payments, never typed in.

create type public.invoice_status as enum ('draft', 'issued', 'void');
create type public.payment_method as enum ('cash', 'upi', 'card', 'bank_transfer', 'other');

create table public.services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  name text not null,
  code text,
  category text not null default 'consultation' check (category in ('consultation', 'procedure', 'lab', 'package', 'product', 'other')),
  specialty_id uuid references public.specialties(id),
  doctor_id uuid references public.staff(id),
  visit_type public.visit_type,
  price_paise int not null check (price_paise >= 0),
  gst_rate numeric(4, 2) not null default 0 check (gst_rate in (0, 5, 12, 18, 28)),
  sac_code text,
  sessions int check (sessions is null or sessions > 0),   -- for packages
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create index services_lookup on public.services (clinic_id, is_active, specialty_id, doctor_id);
create trigger services_touch before update on public.services
  for each row execute function app.touch_updated_at();
create trigger services_audit after insert or update on public.services
  for each row execute function app.audit_row();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  invoice_number text,
  patient_id uuid not null references public.patients(id),
  encounter_id uuid references public.encounters(id),
  appointment_id uuid references public.appointments(id),
  doctor_id uuid references public.staff(id),
  specialty_id uuid references public.specialties(id),
  status public.invoice_status not null default 'draft',
  issued_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, invoice_number)
);
create index invoices_patient on public.invoices (patient_id, created_at desc);
create index invoices_clinic_issued on public.invoices (clinic_id, issued_at desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_id uuid references public.services(id),
  description text not null,
  quantity int not null default 1 check (quantity > 0),
  unit_price_paise int not null check (unit_price_paise >= 0),
  discount_paise int not null default 0 check (discount_paise >= 0),
  gst_rate numeric(4, 2) not null default 0 check (gst_rate in (0, 5, 12, 18, 28)),
  sac_code text,
  taxable_paise bigint generated always as (quantity::bigint * unit_price_paise - discount_paise) stored,
  tax_paise bigint generated always as (round((quantity::bigint * unit_price_paise - discount_paise) * gst_rate / 100)) stored,
  sort_order int not null default 0,
  check (discount_paise <= quantity::bigint * unit_price_paise)
);
create index invoice_items_invoice on public.invoice_items (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  invoice_id uuid not null references public.invoices(id),
  amount_paise bigint not null check (amount_paise > 0),
  method public.payment_method not null,
  reference text,
  received_at timestamptz not null default now(),
  received_by uuid default app.current_staff_id() references public.staff(id),
  notes text,
  created_at timestamptz not null default now(),
  check (method = 'cash' or method = 'other' or coalesce(trim(reference), '') <> '')
);
create index payments_invoice on public.payments (invoice_id);
create index payments_clinic_time on public.payments (clinic_id, received_at);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  invoice_id uuid not null references public.invoices(id),
  payment_id uuid references public.payments(id),
  amount_paise bigint not null check (amount_paise > 0),
  method public.payment_method not null,
  reference text,
  reason text not null check (length(trim(reason)) > 0),
  refunded_at timestamptz not null default now(),
  refunded_by uuid default app.current_staff_id() references public.staff(id),
  created_at timestamptz not null default now()
);
create index refunds_invoice on public.refunds (invoice_id);
create index refunds_clinic_time on public.refunds (clinic_id, refunded_at);

create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  closing_date date not null,
  expected jsonb not null,                -- {"cash": 120000, "upi": 50000, ...} net of refunds, in paise
  counted_cash_paise bigint not null check (counted_cash_paise >= 0),
  difference_paise bigint not null,
  notes text,
  closed_by uuid default app.current_staff_id() references public.staff(id),
  closed_at timestamptz not null default now(),
  unique (clinic_id, closing_date)
);

-- ---------------------------------------------------------------------------
-- Totals
-- ---------------------------------------------------------------------------

create view public.invoice_totals with (security_invoker = true) as
select
  i.id as invoice_id,
  i.clinic_id,
  i.patient_id,
  i.status,
  coalesce(it.subtotal, 0)::bigint as subtotal_paise,
  coalesce(it.discount, 0)::bigint as discount_paise,
  coalesce(it.taxable, 0)::bigint as taxable_paise,
  coalesce(it.tax, 0)::bigint as tax_paise,
  (coalesce(it.taxable, 0) + coalesce(it.tax, 0))::bigint as total_paise,
  coalesce(p.paid, 0)::bigint as paid_paise,
  coalesce(r.refunded, 0)::bigint as refunded_paise,
  case when i.status = 'void' then 0
       else (coalesce(it.taxable, 0) + coalesce(it.tax, 0) - coalesce(p.paid, 0) + coalesce(r.refunded, 0))
  end::bigint as balance_paise,
  case
    when i.status = 'draft' then 'draft'
    when i.status = 'void' then 'void'
    when coalesce(p.paid, 0) - coalesce(r.refunded, 0) <= 0 and coalesce(it.taxable, 0) + coalesce(it.tax, 0) > 0 then 'unpaid'
    when coalesce(p.paid, 0) - coalesce(r.refunded, 0) < coalesce(it.taxable, 0) + coalesce(it.tax, 0) then 'partial'
    else 'paid'
  end as payment_status
from public.invoices i
left join lateral (
  select sum(quantity::bigint * unit_price_paise) as subtotal, sum(discount_paise) as discount,
         sum(taxable_paise) as taxable, sum(tax_paise) as tax
  from public.invoice_items where invoice_id = i.id
) it on true
left join lateral (select sum(amount_paise) as paid from public.payments where invoice_id = i.id) p on true
left join lateral (select sum(amount_paise) as refunded from public.refunds where invoice_id = i.id) r on true;
grant select on public.invoice_totals to authenticated;

create function app.invoice_balance(p_invoice uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select (
    coalesce((select sum(taxable_paise + tax_paise) from public.invoice_items where invoice_id = p_invoice), 0)
    - coalesce((select sum(amount_paise) from public.payments where invoice_id = p_invoice), 0)
    + coalesce((select sum(amount_paise) from public.refunds where invoice_id = p_invoice), 0)
  )::bigint
$$;

-- Indian financial year label, e.g. 2026-27 for dates from 1 April 2026.
create function app.financial_year(d date) returns text
language sql immutable set search_path = '' as $$
  select case when extract(month from d) >= 4
    then extract(year from d)::int || '-' || lpad(((extract(year from d)::int + 1) % 100)::text, 2, '0')
    else (extract(year from d)::int - 1) || '-' || lpad((extract(year from d)::int % 100)::text, 2, '0')
  end
$$;

-- ---------------------------------------------------------------------------
-- Rules
-- ---------------------------------------------------------------------------

create function app.invoice_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tz text;
  v_prefix text;
  v_fy text;
begin
  if old.status = 'void' then
    raise exception 'A void invoice cannot change' using errcode = 'check_violation';
  end if;
  if old.status = 'issued' and new.status = 'draft' then
    raise exception 'An issued invoice cannot go back to draft' using errcode = 'check_violation';
  end if;
  -- (this function is security definer, so current_user is the owner here; use auth.uid()
  -- to tell a signed-in caller apart, and the merge flag for merge_patients)
  if old.status = 'issued' and new.invoice_number is distinct from old.invoice_number then
    raise exception 'An issued invoice cannot change number' using errcode = 'check_violation';
  end if;
  if old.status = 'issued' and new.patient_id <> old.patient_id
     and coalesce(current_setting('app.merge_in_progress', true), '') <> 'on' then
    raise exception 'An issued invoice cannot change patient or number' using errcode = 'check_violation';
  end if;

  if old.status = 'draft' and new.status = 'issued' then
    if not exists (select 1 from public.invoice_items where invoice_id = new.id) then
      raise exception 'Add at least one item before issuing' using errcode = 'check_violation';
    end if;
    select timezone, invoice_prefix into v_tz, v_prefix from public.clinics where id = new.clinic_id;
    new.issued_at := now();
    v_fy := app.financial_year((now() at time zone v_tz)::date);
    new.invoice_number := v_prefix || '/' || v_fy || '/' || lpad(app.next_counter(new.clinic_id, 'invoice:' || v_fy)::text, 5, '0');
  end if;

  if new.status = 'void' and old.status <> 'void' then
    if auth.uid() is not null and not app.has_permission('billing.refund') then
      raise exception 'You do not have permission to void invoices' using errcode = 'insufficient_privilege';
    end if;
    if coalesce((select sum(amount_paise) from public.payments where invoice_id = new.id), 0)
       > coalesce((select sum(amount_paise) from public.refunds where invoice_id = new.id), 0) then
      raise exception 'Refund the payments before voiding' using errcode = 'check_violation';
    end if;
    if coalesce(trim(new.void_reason), '') = '' then
      raise exception 'Give a reason for voiding' using errcode = 'check_violation';
    end if;
    new.voided_at := now();
  end if;
  return new;
end;
$$;
create trigger invoices_guard before update on public.invoices
  for each row execute function app.invoice_guard();
create trigger invoices_touch before update on public.invoices
  for each row execute function app.touch_updated_at();
create trigger invoices_audit after insert or update on public.invoices
  for each row execute function app.audit_row();

create function app.invoice_items_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if v_status <> 'draft' then
    raise exception 'Items of an issued invoice cannot change' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function app.invoice_items_guard();

create function app.payment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_balance bigint;
begin
  -- lock the invoice so two desks cannot overpay it at the same moment
  select * into v_inv from public.invoices where id = new.invoice_id for update;
  if v_inv.status <> 'issued' then
    raise exception 'Payments can only be recorded on an issued invoice' using errcode = 'check_violation';
  end if;
  if new.clinic_id <> v_inv.clinic_id then
    raise exception 'Invoice belongs to another clinic' using errcode = 'check_violation';
  end if;
  v_balance := app.invoice_balance(new.invoice_id);
  if new.amount_paise > v_balance then
    raise exception 'Payment of % paise is more than the balance of % paise', new.amount_paise, v_balance
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger payments_guard before insert on public.payments
  for each row execute function app.payment_guard();
create trigger payments_audit after insert on public.payments
  for each row execute function app.audit_row();

create function app.refund_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invoices;
  v_net bigint;
begin
  select * into v_inv from public.invoices where id = new.invoice_id for update;
  if new.clinic_id <> v_inv.clinic_id then
    raise exception 'Invoice belongs to another clinic' using errcode = 'check_violation';
  end if;
  v_net := coalesce((select sum(amount_paise) from public.payments where invoice_id = new.invoice_id), 0)
         - coalesce((select sum(amount_paise) from public.refunds where invoice_id = new.invoice_id), 0);
  if new.amount_paise > v_net then
    raise exception 'Refund of % paise is more than the % paise paid', new.amount_paise, v_net
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger refunds_guard before insert on public.refunds
  for each row execute function app.refund_guard();
create trigger refunds_audit after insert on public.refunds
  for each row execute function app.audit_row();

-- Create an invoice with its items in one transaction, optionally issuing it.
create function public.create_invoice(
  p_patient uuid, p_items jsonb, p_issue boolean default true,
  p_encounter uuid default null, p_appointment uuid default null, p_notes text default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  v_clinic uuid := app.current_clinic_id();
  v_doctor uuid;
  v_specialty uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item' using errcode = 'check_violation';
  end if;
  if p_appointment is not null then
    select doctor_id, specialty_id into v_doctor, v_specialty from public.appointments where id = p_appointment;
  elsif p_encounter is not null then
    select doctor_id, specialty_id into v_doctor, v_specialty from public.encounters where id = p_encounter;
  end if;

  insert into public.invoices (clinic_id, patient_id, encounter_id, appointment_id, doctor_id, specialty_id, notes)
  values (v_clinic, p_patient, p_encounter, p_appointment, v_doctor, v_specialty, p_notes)
  returning id into v_id;

  insert into public.invoice_items (clinic_id, invoice_id, service_id, description, quantity, unit_price_paise, discount_paise, gst_rate, sac_code, sort_order)
  select v_clinic, v_id, s.id,
         coalesce(nullif(i ->> 'description', ''), s.name),
         coalesce((i ->> 'quantity')::int, 1),
         coalesce((i ->> 'unit_price_paise')::int, s.price_paise),
         coalesce((i ->> 'discount_paise')::int, 0),
         coalesce((i ->> 'gst_rate')::numeric, s.gst_rate, 0),
         coalesce(nullif(i ->> 'sac_code', ''), s.sac_code),
         ord::int
  from jsonb_array_elements(p_items) with ordinality as x(i, ord)
  left join public.services s on s.id = nullif(i ->> 'service_id', '')::uuid and s.clinic_id = v_clinic;

  if p_issue then
    update public.invoices set status = 'issued' where id = v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function public.create_invoice(uuid, jsonb, boolean, uuid, uuid, text) to authenticated;

-- Money in and out for one day, in the clinic's timezone, by method.
create function public.cash_summary(p_date date)
returns table (method public.payment_method, received_paise bigint, refunded_paise bigint, net_paise bigint, payments int)
language sql stable set search_path = '' as $$
  with tz as (select timezone from public.clinics where id = app.current_clinic_id()),
  pin as (
    select p.method, sum(p.amount_paise) as amt, count(*) as n from public.payments p, tz
    where p.clinic_id = app.current_clinic_id() and (p.received_at at time zone tz.timezone)::date = p_date
    group by p.method
  ),
  rout as (
    select r.method, sum(r.amount_paise) as amt from public.refunds r, tz
    where r.clinic_id = app.current_clinic_id() and (r.refunded_at at time zone tz.timezone)::date = p_date
    group by r.method
  )
  select m.method,
         coalesce(pin.amt, 0)::bigint, coalesce(rout.amt, 0)::bigint,
         (coalesce(pin.amt, 0) - coalesce(rout.amt, 0))::bigint, coalesce(pin.n, 0)::int
  from unnest(enum_range(null::public.payment_method)) as m(method)
  left join pin on pin.method = m.method
  left join rout on rout.method = m.method
$$;
grant execute on function public.cash_summary(date) to authenticated;

create function public.close_cash_day(p_date date, p_counted_cash_paise bigint, p_notes text default null)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_expected jsonb;
  v_cash bigint;
  v_id uuid;
begin
  if not app.has_permission('billing.close') then
    raise exception 'You do not have permission to close the day' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_object_agg(method, net_paise), coalesce(sum(net_paise) filter (where method = 'cash'), 0)
    into v_expected, v_cash
  from public.cash_summary(p_date);
  insert into public.cash_closings (clinic_id, closing_date, expected, counted_cash_paise, difference_paise, notes)
  values (app.current_clinic_id(), p_date, v_expected, p_counted_cash_paise, p_counted_cash_paise - v_cash, p_notes)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.close_cash_day(date, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.cash_closings enable row level security;

create policy services_select on public.services for select to authenticated
  using (clinic_id = (select app.current_clinic_id()));
create policy services_insert on public.services for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('services.manage')));
create policy services_update on public.services for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('services.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.services to authenticated;

create policy invoices_select on public.invoices for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.read')) and app.can_see_patient(patient_id));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (
    clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.write'))
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = (select app.current_clinic_id()))
  );
create policy invoices_update on public.invoices for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.write')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, insert, update on public.invoices to authenticated;

create policy invoice_items_select on public.invoice_items for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.read')));
create policy invoice_items_insert on public.invoice_items for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.write'))
    and exists (select 1 from public.invoices i where i.id = invoice_id and i.clinic_id = (select app.current_clinic_id())));
create policy invoice_items_update on public.invoice_items for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.write')))
  with check (clinic_id = (select app.current_clinic_id()));
create policy invoice_items_delete on public.invoice_items for delete to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.write')));
grant select, insert, update, delete on public.invoice_items to authenticated;

-- payments and refunds are immutable: no update or delete grant
create policy payments_select on public.payments for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.read')));
create policy payments_insert on public.payments for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.write')));
grant select, insert on public.payments to authenticated;

create policy refunds_select on public.refunds for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.read')));
create policy refunds_insert on public.refunds for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.refund')));
grant select, insert on public.refunds to authenticated;

create policy cash_closings_select on public.cash_closings for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.read')));
create policy cash_closings_insert on public.cash_closings for insert to authenticated
  with check (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('billing.close')));
grant select, insert on public.cash_closings to authenticated;
