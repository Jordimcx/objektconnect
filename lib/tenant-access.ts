import { appUrl } from "@/lib/app-url";
import { deliverOutboundMessage, queueOutboundMessage } from "@/lib/outbound";
import { prisma } from "@/lib/prisma";
import { createOpaqueToken, expiresInHours, hashToken } from "@/lib/security-tokens";
import type { SessionUser } from "@/lib/permissions";

export async function createTenantActivationLink(manager: SessionUser, tenantId: string) {
  if (manager.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Zugänge ausstellen.");
  const tenant = await prisma.user.findFirst({
    where: { id: tenantId, organizationId: manager.organizationId, role: "MIETER" }
  });
  if (!tenant) throw new Error("Mieter wurde nicht gefunden.");

  const generated = createOpaqueToken();
  const outbound = await prisma.$transaction(async (tx) => {
    await tx.tenantActivationToken.updateMany({
      where: { userId: tenant.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await tx.tenantActivationToken.create({
      data: {
        organizationId: manager.organizationId,
        userId: tenant.id,
        tokenHash: generated.tokenHash,
        tokenHint: generated.tokenHint,
        expiresAt: expiresInHours(48)
      }
    });
    await tx.auditLog.create({
      data: {
        organizationId: manager.organizationId,
        actorUserId: manager.id,
        actorType: "USER",
        action: "TENANT_ACTIVATION_CREATED",
        reason: `Passwortloser Zugang für ${tenant.name} ausgestellt.`,
        metadata: { tenantId: tenant.id, expiresInHours: 48 }
      }
    });
    return queueOutboundMessage(tx, {
      organizationId: manager.organizationId,
      recipient: tenant.email,
      subject: `Ihr Zugang zu ObjektConnect`,
      body: [
        `Hallo ${tenant.name},`,
        "Ihre Hausverwaltung hat Ihren persönlichen Mieterzugang zu ObjektConnect eingerichtet.",
        "Über den folgenden sicheren Link können Sie Ihren Zugang aktivieren:",
        appUrl(`/aktivieren/${generated.token}`),
        "Der Link ist einmalig und 48 Stunden gültig.",
        "Viele Grüße\nIhre Hausverwaltung"
      ].join("\n\n"),
      eventKey: `tenant-activation:${generated.tokenHash}`
    });
  });
  const delivery = await deliverOutboundMessage(outbound.id);
  return { token: generated.token, tenant, mailStatus: delivery.status };
}

export async function getTenantActivationPreview(token: string) {
  if (token.length < 20) return null;
  const activation = await prisma.tenantActivationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true, organization: true }
  });
  if (!activation || activation.usedAt || activation.revokedAt || activation.expiresAt <= new Date()) return null;
  return activation;
}

export async function consumeTenantActivationToken(token: string) {
  const activation = await getTenantActivationPreview(token);
  if (!activation) return null;
  const consumed = await prisma.tenantActivationToken.updateMany({
    where: {
      id: activation.id,
      usedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    data: { usedAt: new Date() }
  });
  if (consumed.count !== 1) return null;
  await prisma.auditLog.create({
    data: {
      organizationId: activation.organizationId,
      actorUserId: activation.userId,
      actorType: "USER",
      action: "TENANT_ACTIVATION_USED",
      reason: "Mieterzugang wurde passwortlos aktiviert.",
      metadata: { activationId: activation.id }
    }
  });
  return activation.user;
}
