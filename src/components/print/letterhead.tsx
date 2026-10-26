import type { Tables } from "@/lib/database.types";

export function Letterhead({ clinic, right }: { clinic: Tables<"clinics">; right?: React.ReactNode }) {
  const address = [clinic.address_line1, clinic.address_line2, clinic.city, clinic.state, clinic.pincode].filter(Boolean).join(", ");
  return (
    <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-3">
      <div>
        <h1 className="text-xl font-bold">{clinic.name}</h1>
        {clinic.letterhead_header && <p className="text-sm">{clinic.letterhead_header}</p>}
        <p className="text-xs">{address}</p>
        <p className="text-xs">{[clinic.phone, clinic.email, clinic.website].filter(Boolean).join(" · ")}</p>
        {clinic.registration_number && <p className="text-xs">Reg. no. {clinic.registration_number}</p>}
      </div>
      {right}
    </header>
  );
}

export function LetterheadFooter({ clinic }: { clinic: Tables<"clinics"> }) {
  return clinic.letterhead_footer ? (
    <footer className="mt-8 border-t border-line pt-2 text-center text-xs whitespace-pre-wrap">{clinic.letterhead_footer}</footer>
  ) : null;
}
