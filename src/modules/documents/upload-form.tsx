import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { uploadDocuments } from "./actions";

export const CATEGORY_LABELS = {
  lab_report: "Lab report",
  imaging: "Scan / X-ray",
  prescription: "Outside prescription",
  consent: "Consent form",
  clinical_photo: "Clinical photo",
  id_proof: "ID proof",
  referral_letter: "Referral letter",
  other: "Other",
} as const;

export function UploadForm({ patientId, encounterId, category = "lab_report" }: { patientId: string; encounterId?: string; category?: keyof typeof CATEGORY_LABELS }) {
  return (
    <ActionForm action={uploadDocuments} resetOnSuccess>
      <input type="hidden" name="patient_id" value={patientId} />
      {encounterId && <input type="hidden" name="encounter_id" value={encounterId} />}
      <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <Field label="Files" className="sm:col-span-2">
          <Input name="files" type="file" multiple accept="application/pdf,image/*" capture={category === "clinical_photo" ? "environment" : undefined} />
        </Field>
        <Field label="Type">
          <Select name="category" defaultValue={category}>
            {Object.entries(CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input name="taken_on" type="date" /></Field>
        <Field label="Title (optional)" className="sm:col-span-2"><Input name="title" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_abnormal" /> Abnormal</label>
        <SubmitButton variant="secondary" pendingText="Uploading…">Upload</SubmitButton>
      </div>
    </ActionForm>
  );
}
