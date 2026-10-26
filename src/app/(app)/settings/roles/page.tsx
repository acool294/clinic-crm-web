import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/layout";
import { requirePermission } from "@/lib/auth/session";
import { ROLE_LABELS, ROLES } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { saveRolePermissions } from "@/modules/settings/actions";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  await requirePermission("settings.manage");
  const supabase = await createClient();
  const [{ data: permissions }, { data: matrix }] = await Promise.all([
    supabase.from("permissions").select("*").order("key"),
    supabase.from("role_permissions").select("role, permission"),
  ]);
  return (
    <>
      <PageHeader
        title="Roles"
        description="What each role can do. The database enforces the same list, so unticking a box removes access everywhere."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {ROLES.map((role) => {
          const granted = new Set((matrix ?? []).filter((m) => m.role === role).map((m) => m.permission));
          return (
            <Card key={role} title={ROLE_LABELS[role]}>
              <ActionForm action={saveRolePermissions.bind(null, role)}>
                <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                  {(permissions ?? []).map((p) => {
                    const locked = role === "owner" && (p.key === "settings.manage" || p.key === "staff.manage");
                    return (
                      <label key={p.key} className="flex items-start gap-2" title={p.key}>
                        <input type="checkbox" name="permissions" value={p.key} defaultChecked={granted.has(p.key)} disabled={locked} className="mt-0.5" />
                        {locked && <input type="hidden" name="permissions" value={p.key} />}
                        <span>{p.description}</span>
                      </label>
                    );
                  })}
                </div>
                <div><SubmitButton size="sm">Save {ROLE_LABELS[role]}</SubmitButton></div>
              </ActionForm>
            </Card>
          );
        })}
      </div>
    </>
  );
}
