-- Two-step sign-in is off by default: plain email and password for everyone.
-- The owner can switch it on for owners and doctors in Settings → Clinic.
alter table public.clinics alter column mfa_required_roles set default '{}';
update public.clinics set mfa_required_roles = '{}';
