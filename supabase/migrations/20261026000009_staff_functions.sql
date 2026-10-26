-- Staff writes that touch several tables, done in one transaction with the caller's rights.

create function public.save_staff(
  p_staff_id uuid,              -- null to create
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_title text,
  p_registration_number text,
  p_roles public.app_role[],
  p_specialties uuid[],
  p_restrict_to_own_patients boolean default false
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid := p_staff_id;
  v_clinic uuid := app.current_clinic_id();
begin
  if coalesce(array_length(p_roles, 1), 0) = 0 then
    raise exception 'Pick at least one role' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.staff (clinic_id, user_id, full_name, email, phone, title, registration_number, restrict_to_own_patients)
    values (v_clinic, p_user_id, p_full_name, lower(p_email), p_phone, p_title, p_registration_number, p_restrict_to_own_patients)
    returning id into v_id;
  else
    update public.staff set full_name = p_full_name, phone = p_phone, title = p_title,
      registration_number = p_registration_number, restrict_to_own_patients = p_restrict_to_own_patients
    where id = v_id and clinic_id = v_clinic;
    if not found then
      raise exception 'Staff member not found or not editable' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- add new roles first so the last-owner guard never sees zero owners
  insert into public.staff_roles (staff_id, role) select v_id, r from unnest(p_roles) r on conflict do nothing;
  delete from public.staff_roles where staff_id = v_id and role <> all (p_roles);

  delete from public.doctor_specialties where staff_id = v_id;
  insert into public.doctor_specialties (staff_id, specialty_id, is_primary)
  select v_id, s, ord = 1 from unnest(coalesce(p_specialties, '{}')) with ordinality as x(s, ord);

  return v_id;
end;
$$;
grant execute on function public.save_staff(uuid, uuid, text, text, text, text, text, public.app_role[], uuid[], boolean) to authenticated;

-- Replace the role matrix for one role.
create function public.set_role_permissions(p_role public.app_role, p_permissions text[]) returns void
language plpgsql set search_path = '' as $$
declare
  v_clinic uuid := app.current_clinic_id();
begin
  if not app.has_permission('settings.manage') then
    raise exception 'You do not have permission to change roles' using errcode = 'insufficient_privilege';
  end if;
  insert into public.role_permissions (clinic_id, role, permission)
  select v_clinic, p_role, p from unnest(p_permissions) p on conflict do nothing;
  delete from public.role_permissions
  where clinic_id = v_clinic and role = p_role and permission <> all (p_permissions);
end;
$$;
grant execute on function public.set_role_permissions(public.app_role, text[]) to authenticated;
