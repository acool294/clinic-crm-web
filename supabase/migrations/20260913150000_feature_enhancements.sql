-- Add discount fields to invoices
ALTER TABLE public.invoices ADD COLUMN discount_percent decimal(5,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN discount_amount decimal(10,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN subtotal decimal(10,2);
ALTER TABLE public.invoices ADD COLUMN notes text;

-- Add reminder and follow-up fields to appointments
ALTER TABLE public.appointments ADD COLUMN reminder_sent boolean DEFAULT false;
ALTER TABLE public.appointments ADD COLUMN follow_up_date date;
ALTER TABLE public.appointments ADD COLUMN follow_up_reminder_sent boolean DEFAULT false;

-- Add fields to staff_users
ALTER TABLE public.staff_users ADD COLUMN email text;
ALTER TABLE public.staff_users ADD COLUMN specialization text;
