-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- Table: clinics
create table public.clinics (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    address text,
    phone text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.clinics enable row level security;

-- Table: patients (Global identity)
create table public.patients (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null,
    phone text,
    email text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.patients enable row level security;

-- Table: staff_users
create table public.staff_users (
    id uuid primary key references auth.users(id) on delete cascade,
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    name text not null,
    role text not null check (role in ('admin', 'doctor', 'receptionist', 'nurse')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.staff_users enable row level security;

-- Table: clinic_patient_links
create table public.clinic_patient_links (
    id uuid primary key default uuid_generate_v4(),
    patient_id uuid not null references public.patients(id) on delete cascade,
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    linked_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(patient_id, clinic_id)
);
alter table public.clinic_patient_links enable row level security;

-- Table: appointments
create table public.appointments (
    id uuid primary key default uuid_generate_v4(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    clinic_patient_link_id uuid not null references public.clinic_patient_links(id) on delete cascade,
    doctor_id uuid not null references public.staff_users(id),
    scheduled_at timestamp with time zone not null,
    duration_minutes integer not null,
    status text not null check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.appointments enable row level security;

-- Table: visit_records
create table public.visit_records (
    id uuid primary key default uuid_generate_v4(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    appointment_id uuid not null references public.appointments(id) on delete cascade,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.visit_records enable row level security;

-- Table: prescriptions
create table public.prescriptions (
    id uuid primary key default uuid_generate_v4(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    visit_record_id uuid not null references public.visit_records(id) on delete cascade,
    medication text not null,
    dosage text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.prescriptions enable row level security;

-- Table: medication_feedback
create table public.medication_feedback (
    id uuid primary key default uuid_generate_v4(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    prescription_id uuid not null references public.prescriptions(id) on delete cascade,
    severity text not null check (severity in ('mild', 'moderate', 'severe')),
    symptoms jsonb,
    reported_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.medication_feedback enable row level security;

-- Table: invoices
create table public.invoices (
    id uuid primary key default uuid_generate_v4(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    clinic_patient_link_id uuid not null references public.clinic_patient_links(id) on delete cascade,
    amount decimal(10,2) not null,
    status text not null check (status in ('pending', 'partial', 'paid')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.invoices enable row level security;

-- Table: payments
create table public.payments (
    id uuid primary key default uuid_generate_v4(),
    clinic_id uuid not null references public.clinics(id) on delete cascade,
    invoice_id uuid not null references public.invoices(id) on delete cascade,
    amount decimal(10,2) not null,
    method text not null,
    recorded_by_staff_id uuid not null references public.staff_users(id),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.payments enable row level security;

-- RLS POLICIES

-- Helper functions for RLS
create or replace function public.get_staff_clinic_id()
returns uuid
language sql
security definer
as $$
    select clinic_id from public.staff_users where id = auth.uid() limit 1;
$$;

-- clinics
create policy "Staff can view their own clinic"
on public.clinics for select
using (id = public.get_staff_clinic_id());

create policy "Patients can view clinics they are linked to"
on public.clinics for select
using (
    exists (
        select 1 from public.clinic_patient_links
        where clinic_patient_links.clinic_id = clinics.id
        and clinic_patient_links.patient_id = auth.uid()
    )
);

-- staff_users
create policy "Staff can view staff in their clinic"
on public.staff_users for select
using (clinic_id = public.get_staff_clinic_id());

-- patients
create policy "Patients can view their own profile"
on public.patients for select
using (id = auth.uid());
create policy "Patients can update their own profile"
on public.patients for update
using (id = auth.uid());

create policy "Staff can view patients linked to their clinic"
on public.patients for select
using (
    exists (
        select 1 from public.clinic_patient_links
        where clinic_patient_links.patient_id = patients.id
        and clinic_patient_links.clinic_id = public.get_staff_clinic_id()
    )
);

-- clinic_patient_links
create policy "Patients can view their own links"
on public.clinic_patient_links for select
using (patient_id = auth.uid());

create policy "Staff can view links for their clinic"
on public.clinic_patient_links for select
using (clinic_id = public.get_staff_clinic_id());

create policy "Staff can create links for their clinic"
on public.clinic_patient_links for insert
with check (clinic_id = public.get_staff_clinic_id());

-- Appointments
create policy "Staff full access to clinic appointments"
on public.appointments for all
using (clinic_id = public.get_staff_clinic_id());

create policy "Patients can view own appointments"
on public.appointments for select
using (
    exists (
        select 1 from public.clinic_patient_links
        where clinic_patient_links.id = appointments.clinic_patient_link_id
        and clinic_patient_links.patient_id = auth.uid()
    )
);

-- Visit Records
create policy "Staff full access to clinic visit records"
on public.visit_records for all
using (clinic_id = public.get_staff_clinic_id());

create policy "Patients can view own visit records"
on public.visit_records for select
using (
    exists (
        select 1 from public.appointments
        join public.clinic_patient_links on clinic_patient_links.id = appointments.clinic_patient_link_id
        where appointments.id = visit_records.appointment_id
        and clinic_patient_links.patient_id = auth.uid()
    )
);

-- Prescriptions
create policy "Staff full access to clinic prescriptions"
on public.prescriptions for all
using (clinic_id = public.get_staff_clinic_id());

create policy "Patients can view own prescriptions"
on public.prescriptions for select
using (
    exists (
        select 1 from public.visit_records
        join public.appointments on appointments.id = visit_records.appointment_id
        join public.clinic_patient_links on clinic_patient_links.id = appointments.clinic_patient_link_id
        where visit_records.id = prescriptions.visit_record_id
        and clinic_patient_links.patient_id = auth.uid()
    )
);

-- Medication Feedback
create policy "Staff full access to clinic medication feedback"
on public.medication_feedback for all
using (clinic_id = public.get_staff_clinic_id());

create policy "Patients can view and insert own medication feedback"
on public.medication_feedback for all
using (
    exists (
        select 1 from public.prescriptions
        join public.visit_records on visit_records.id = prescriptions.visit_record_id
        join public.appointments on appointments.id = visit_records.appointment_id
        join public.clinic_patient_links on clinic_patient_links.id = appointments.clinic_patient_link_id
        where prescriptions.id = medication_feedback.prescription_id
        and clinic_patient_links.patient_id = auth.uid()
    )
);

-- Invoices
create policy "Staff full access to clinic invoices"
on public.invoices for all
using (clinic_id = public.get_staff_clinic_id());

create policy "Patients can view own invoices"
on public.invoices for select
using (
    exists (
        select 1 from public.clinic_patient_links
        where clinic_patient_links.id = invoices.clinic_patient_link_id
        and clinic_patient_links.patient_id = auth.uid()
    )
);

-- Payments
create policy "Staff full access to clinic payments"
on public.payments for all
using (clinic_id = public.get_staff_clinic_id());

create policy "Patients can view own payments"
on public.payments for select
using (
    exists (
        select 1 from public.invoices
        join public.clinic_patient_links on clinic_patient_links.id = invoices.clinic_patient_link_id
        where invoices.id = payments.invoice_id
        and clinic_patient_links.patient_id = auth.uid()
    )
);
