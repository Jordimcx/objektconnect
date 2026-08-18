"use server";

import { redirect } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import { createTenantActivationLink } from "@/lib/tenant-access";
import { requireSessionUser } from "@/lib/session";

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

function isRedirectError(error: unknown): error is Error & { digest: string } {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}
