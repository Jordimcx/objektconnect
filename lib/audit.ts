import type { AuditActorType, Prisma } from "@prisma/client";

export async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    ticketId?: string | null;
    actorUserId?: string | null;
    actorType: AuditActorType;
    action: string;
    reason: string;
    metadata?: Prisma.InputJsonValue;
  }
) {
  return tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      ticketId: input.ticketId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      action: input.action,
      reason: input.reason,
      metadata: input.metadata ?? {}
    }
  });
}
