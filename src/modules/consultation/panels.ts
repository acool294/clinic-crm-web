// The specialty widgets a department can switch on for its consultation page.
// Custom forms built in Settings use the key "form:<template id>".

export const BUILT_IN_PANELS = {
  growth_chart: { label: "Growth chart", specialty: "Pediatrics" },
  vaccinations: { label: "Vaccinations", specialty: "Pediatrics" },
  obstetric_history: { label: "Obstetric history and EDD", specialty: "Gynecology & Obstetrics" },
  antenatal_visit: { label: "Antenatal visit tracker", specialty: "Gynecology & Obstetrics" },
  skin_photos: { label: "Clinical photos", specialty: "Dermatology" },
  body_map: { label: "Body map", specialty: "Dermatology" },
  procedure_sessions: { label: "Procedure sessions", specialty: "Dermatology" },
} as const;

export type BuiltInPanel = keyof typeof BUILT_IN_PANELS;

export function isBuiltInPanel(key: string): key is BuiltInPanel {
  return key in BUILT_IN_PANELS;
}

export function panelLabel(key: string, templates: { id: string; name: string }[] = []): string {
  if (isBuiltInPanel(key)) return BUILT_IN_PANELS[key].label;
  if (key.startsWith("form:")) return templates.find((t) => `form:${t.id}` === key)?.name ?? "Custom form";
  return key;
}
