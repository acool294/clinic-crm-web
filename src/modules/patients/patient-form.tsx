"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/layout";
import type { Tables } from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { createPatient, updatePatient, type PatientFormState } from "./actions";
import { BLOOD_GROUPS } from "./schemas";

export function PatientForm({ patient, next }: { patient?: Tables<"patients">; next?: string }) {
  const action = patient ? updatePatient.bind(null, patient.id) : createPatient;
  const [state, formAction] = useActionState<PatientFormState, FormData>(action, { ok: false });
  const p = patient;
  const f = (name: string) => ({ name, state });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Card title="Patient">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" {...f("first_name")}><Input name="first_name" defaultValue={p?.first_name} required autoFocus /></Field>
          <Field label="Last name" {...f("last_name")}><Input name="last_name" defaultValue={p?.last_name ?? ""} /></Field>
          <Field label="Mobile" {...f("phone")}><Input name="phone" type="tel" inputMode="tel" defaultValue={p?.phone ?? ""} /></Field>
          <Field label="Date of birth" {...f("dob")}><Input name="dob" type="date" defaultValue={p?.dob ?? ""} /></Field>
          <Field label="Sex" {...f("sex")}>
            <Select name="sex" defaultValue={p?.sex ?? "unknown"}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
              <option value="unknown">Not recorded</option>
            </Select>
          </Field>
          <Field label="Blood group" {...f("blood_group")}>
            <Select name="blood_group" defaultValue={p?.blood_group ?? ""}>
              <option value="">Unknown</option>
              {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
            </Select>
          </Field>
          <Field label="Email" {...f("email")}><Input name="email" type="email" defaultValue={p?.email ?? ""} /></Field>
          <Field label="Other phone" {...f("alt_phone")}><Input name="alt_phone" type="tel" defaultValue={p?.alt_phone ?? ""} /></Field>
          <Field label="ABHA number" {...f("abha_number")}><Input name="abha_number" defaultValue={p?.abha_number ?? ""} /></Field>
        </div>
      </Card>

      <Card title="Address and emergency contact">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Address" className="sm:col-span-3"><Input name="address" defaultValue={p?.address ?? ""} /></Field>
          <Field label="City"><Input name="city" defaultValue={p?.city ?? ""} /></Field>
          <Field label="State"><Input name="state" defaultValue={p?.state ?? ""} /></Field>
          <Field label="PIN code"><Input name="pincode" defaultValue={p?.pincode ?? ""} inputMode="numeric" /></Field>
          <Field label="Emergency contact"><Input name="emergency_contact_name" defaultValue={p?.emergency_contact_name ?? ""} /></Field>
          <Field label="Their phone" {...f("emergency_contact_phone")}><Input name="emergency_contact_phone" defaultValue={p?.emergency_contact_phone ?? ""} /></Field>
          <Field label="Relation"><Input name="emergency_contact_relation" defaultValue={p?.emergency_contact_relation ?? ""} /></Field>
          <Field label="Insurance provider"><Input name="insurance_provider" defaultValue={p?.insurance_provider ?? ""} /></Field>
          <Field label="Policy number"><Input name="insurance_policy_number" defaultValue={p?.insurance_policy_number ?? ""} /></Field>
          <Field label="Tags" hint="Comma separated, e.g. diabetic, senior"><Input name="tags" defaultValue={p?.tags.join(", ") ?? ""} /></Field>
          <Field label="Front desk notes" className="sm:col-span-3"><Textarea name="notes" defaultValue={p?.notes ?? ""} rows={2} /></Field>
        </div>
      </Card>

      <Card title="Consent">
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="consent_treatment" defaultChecked={!!p?.consent_treatment_at || !p} />
            Patient (or guardian) consents to examination and treatment, and to the clinic keeping their health records
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="consent_messaging" defaultChecked={p?.consent_messaging ?? false} />
            Patient agrees to appointment reminders and health messages on WhatsApp or SMS
          </label>
          {p?.messaging_opt_out_at && <p className="text-xs text-warn">Opted out of messages on {formatDate(p.messaging_opt_out_at)}.</p>}
        </div>
      </Card>

      {state.duplicates && state.duplicates.length > 0 && (
        <Card title="Possible duplicates" className="border-warn">
          <ul className="mb-3 flex flex-col gap-1 text-sm">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/patients/${d.id}`} className="font-medium text-brand hover:underline">{d.full_name}</Link>{" "}
                <span className="text-muted">{d.mrn} · {d.phone ?? "no phone"} · {d.dob ? formatDate(d.dob) : "no DOB"} · {d.reason}</span>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="confirm_new" /> This is a different person, register anyway
          </label>
        </Card>
      )}
      <FormMessage state={state} />
      <div><SubmitButton>{p ? "Save changes" : "Register patient"}</SubmitButton></div>
    </form>
  );
}
