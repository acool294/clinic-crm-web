-- "Request access" from the sign-in page. Staff accounts stay invite-only:
-- a request is just a note to the owner, who approves it by sending an invite.

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  requested_role public.app_role,
  message text check (message is null or length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  ip text,
  decided_by uuid references public.staff(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index access_requests_pending on public.access_requests (clinic_id, created_at desc) where status = 'pending';
create unique index access_requests_one_pending on public.access_requests (clinic_id, lower(email)) where status = 'pending';

alter table public.access_requests enable row level security;

create policy access_requests_select on public.access_requests for select to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('staff.manage')));
create policy access_requests_update on public.access_requests for update to authenticated
  using (clinic_id = (select app.current_clinic_id()) and (select app.has_permission('staff.manage')))
  with check (clinic_id = (select app.current_clinic_id()));
grant select, update on public.access_requests to authenticated;

-- Called by the server with the service key; at most 5 requests per IP per day.
create function public.submit_access_request(
  p_full_name text, p_email text, p_phone text, p_role public.app_role, p_message text, p_ip text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_clinic uuid := (select id from public.clinics order by created_at limit 1);
begin
  if v_clinic is null then
    return false;
  end if;
  if (select count(*) from public.access_requests where ip = p_ip and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many requests from this network today' using errcode = 'check_violation';
  end if;
  -- already staff, or already asked: say nothing different, so the form cannot be used to probe emails
  if exists (select 1 from public.staff where lower(email) = lower(p_email))
     or exists (select 1 from public.access_requests where lower(email) = lower(p_email) and status = 'pending') then
    return true;
  end if;
  insert into public.access_requests (clinic_id, full_name, email, phone, requested_role, message, ip)
  values (v_clinic, trim(p_full_name), lower(trim(p_email)), nullif(trim(p_phone), ''), p_role, nullif(trim(p_message), ''), p_ip);
  return true;
end;
$$;
revoke all on function public.submit_access_request(text, text, text, public.app_role, text, text) from public, anon, authenticated;
grant execute on function public.submit_access_request(text, text, text, public.app_role, text, text) to service_role;
