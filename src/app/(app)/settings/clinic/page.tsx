import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { saveClinic, uploadClinicLogo } from "@/modules/settings/actions";
import { WEEKDAY_LABELS, WEEKDAYS } from "@/modules/settings/schemas";

export const metadata = { title: "Clinic settings" };

export default async function ClinicSettingsPage() {
  await requirePermission("settings.manage");
  const supabase = await createClient();
  const { data: c } = await supabase.from("clinics").select("*").single();
  if (!c) return null;
  const hours = (c.opening_hours ?? {}) as Record<string, { open: string; close: string } | null>;

  return (
    <>
      <PageHeader title="Clinic" description="Printed on prescriptions, invoices and receipts. Time zone: India (IST), currency: INR." />
      <ActionForm action={saveClinic}>
        <Card title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Clinic name"><Input name="name" defaultValue={c.name} required /></Field>
            <Field label="Legal name"><Input name="legal_name" defaultValue={c.legal_name ?? ""} /></Field>
            <Field label="Registration number"><Input name="registration_number" defaultValue={c.registration_number ?? ""} /></Field>
            <Field label="GSTIN" hint="Leave empty if not registered"><Input name="gstin" defaultValue={c.gstin ?? ""} maxLength={15} /></Field>
            <Field label="Address line 1"><Input name="address_line1" defaultValue={c.address_line1 ?? ""} /></Field>
            <Field label="Address line 2"><Input name="address_line2" defaultValue={c.address_line2 ?? ""} /></Field>
            <Field label="City"><Input name="city" defaultValue={c.city ?? ""} /></Field>
            <Field label="State"><Input name="state" defaultValue={c.state ?? ""} /></Field>
            <Field label="PIN code"><Input name="pincode" defaultValue={c.pincode ?? ""} inputMode="numeric" maxLength={6} /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={c.phone ?? ""} /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={c.email ?? ""} /></Field>
            <Field label="Website"><Input name="website" defaultValue={c.website ?? ""} /></Field>
          </div>
        </Card>
        <Card title="Letterhead">
          <div className="grid gap-4">
            <Field label="Header line" hint="e.g. Multispeciality clinic · Mon–Sat 9 am–8 pm">
              <Input name="letterhead_header" defaultValue={c.letterhead_header ?? ""} />
            </Field>
            <Field label="Footer">
              <Textarea name="letterhead_footer" defaultValue={c.letterhead_footer ?? ""} />
            </Field>
          </div>
        </Card>
        <Card title="Opening hours">
          <div className="grid gap-2">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className="grid grid-cols-[7rem_1fr_1fr_auto] items-center gap-2 text-sm">
                <span>{WEEKDAY_LABELS[i]}</span>
                <Input name={`${d}_open`} type="time" defaultValue={hours[d]?.open ?? "09:00"} />
                <Input name={`${d}_close`} type="time" defaultValue={hours[d]?.close ?? "18:00"} />
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name={`${d}_closed`} defaultChecked={hours[d] === null || (d === "sun" && !hours[d])} /> Closed
                </label>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Numbering and security">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="MRN prefix" hint="MRN-000123"><Input name="mrn_prefix" defaultValue={c.mrn_prefix} /></Field>
            <Field label="Invoice prefix" hint="INV/2026-27/00001"><Input name="invoice_prefix" defaultValue={c.invoice_prefix} /></Field>
            <Field label="Default slot (minutes)"><Input name="default_slot_minutes" type="number" min={5} max={240} defaultValue={c.default_slot_minutes} /></Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" name="mfa_required" defaultChecked={c.mfa_required_roles.length > 0} />
            Owners and doctors must also enter a code from an authenticator app when signing in (optional, recommended later)
          </label>
        </Card>
        <div><SubmitButton>Save clinic details</SubmitButton></div>
      </ActionForm>

      <Card title="Logo" className="mt-6">
        <ActionForm action={uploadClinicLogo} className="sm:flex-row sm:items-end">
          <Field label="Image (PNG, JPEG or WebP, under 2 MB)" className="flex-1">
            <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
          </Field>
          <SubmitButton variant="secondary">Upload</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
