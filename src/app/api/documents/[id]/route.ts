import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Opens a document through a 60-second signed URL. RLS decides whether the
// row (and the file) is visible; the view is written to the audit log.
export async function GET(request: NextRequest, { params }: RouteContext<"/api/documents/[id]">) {
  const session = await getSession();
  if (!session || !session.permissions.has("documents.read")) return new NextResponse("Not allowed", { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("id, patient_id, storage_path, title").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await supabase.storage
    .from("patient-documents")
    .createSignedUrl(doc.storage_path, 60, download ? { download: doc.title } : undefined);
  if (error || !data) return new NextResponse("Could not open the file", { status: 500 });
  await supabase.rpc("log_event", { p_action: download ? "export" : "view", p_entity: "documents", p_entity_id: doc.id, p_patient_id: doc.patient_id });
  return NextResponse.redirect(data.signedUrl);
}
