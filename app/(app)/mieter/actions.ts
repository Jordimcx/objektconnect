"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import { createTenantActivationLink } from "@/lib/tenant-access";
import { requireSessionUser } from "@/lib/session";
import { importTenants, type TenantImportResult, type TenantImportRow } from "@/lib/tenant-import";

export async function createTenantActivationAction(formData: FormData) {
  try {
    const user = await requireSessionUser();
    const tenantId = String(formData.get("tenantId") ?? "");
    const result = await createTenantActivationLink(user, tenantId);
    const link = appUrl(`/aktivieren/${result.token}`);
    redirect(`/mieter?activationLink=${encodeURIComponent(link)}&tenant=${encodeURIComponent(result.tenant.name)}&mailStatus=${encodeURIComponent(result.mailStatus)}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    redirect(`/mieter?error=${encodeURIComponent(error instanceof Error ? error.message : "Zugang konnte nicht erstellt werden.")}`);
  }
}

export async function importTenantsAction(rows: TenantImportRow[]): Promise<TenantImportResult> {
  const user = await requireSessionUser();
  if (user.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Mieter importieren.");
  const result = await importTenants(user.organizationId, rows);
  if (result.created > 0) revalidatePath("/mieter");
  return result;
}

function isRedirectError(error: unknown): error is Error & { digest: string } {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}
