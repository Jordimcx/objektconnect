import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getMailConfigurationStatus, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export async function queueOutboundMessage(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    ticketId?: string | null;
    recipient: string;
    channel?: string;
    subject: string;
    body: string;
    calendarContent?: string | null;
    eventKey: string;
  }
) {
  const idempotencyKey = createHash("sha256")
    .update(`${input.organizationId}:${input.ticketId ?? "none"}:${input.recipient}:${input.eventKey}`)
    .digest("hex");

  const desiredStatus = getMailConfigurationStatus().configured ? "PENDING" : "TEST_MODE";
  const message = await tx.outboundMessage.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      organizationId: input.organizationId,
      ticketId: input.ticketId ?? null,
      recipient: input.recipient,
      channel: input.channel ?? "EMAIL",
      subject: input.subject,
      body: input.body,
      calendarContent: input.calendarContent ?? null,
      idempotencyKey,
      status: desiredStatus
    }
  });
  if (desiredStatus === "PENDING" && message.status === "TEST_MODE") {
    return tx.outboundMessage.update({ where: { id: message.id }, data: { status: "PENDING" } });
  }
  return message;
}

export async function deliverOutboundMessage(messageId: string) {
  if (!getMailConfigurationStatus().configured) return { status: "TEST_MODE" as const };
  const claimed = await prisma.outboundMessage.updateMany({
    where: { id: messageId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "SENDING" }
  });
  if (claimed.count !== 1) {
    const existing = await prisma.outboundMessage.findUnique({ where: { id: messageId }, select: { status: true } });
    return { status: existing?.status ?? "MISSING" };
  }

  const message = await prisma.outboundMessage.findUnique({
    where: { id: messageId },
    include: { organization: { include: { settings: true } } }
  });
  if (!message) return { status: "MISSING" as const };

  try {
    const result = await sendMail({
      fromName: message.organization.settings?.senderName || message.organization.name,
      fromAddress: message.organization.settings?.senderEmail,
      to: message.recipient,
      subject: message.subject,
      text: message.body,
      calendarContent: message.calendarContent
    });
    await prisma.$transaction([
      prisma.outboundMessage.update({ where: { id: message.id }, data: { status: "SENT", sentAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          organizationId: message.organizationId,
          ticketId: message.ticketId,
          actorType: "SYSTEM",
          action: "EMAIL_SENT",
          reason: `E-Mail an ${message.recipient} wurde versendet.`,
          metadata: { outboundMessageId: message.id, smtpMessageId: result.messageId, subject: message.subject }
        }
      })
    ]);
    return { status: "SENT" as const, messageId: result.messageId };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unbekannter SMTP-Fehler";
    await prisma.$transaction([
      prisma.outboundMessage.update({ where: { id: message.id }, data: { status: "FAILED" } }),
      prisma.auditLog.create({
        data: {
          organizationId: message.organizationId,
          ticketId: message.ticketId,
          actorType: "SYSTEM",
          action: "EMAIL_FAILED",
          reason: `E-Mail an ${message.recipient} konnte nicht versendet werden.`,
          metadata: { outboundMessageId: message.id, subject: message.subject, detail }
        }
      })
    ]);
    return { status: "FAILED" as const, error: detail };
  }
}

export async function deliverPendingOutboundMessages(organizationId: string, limit = 20) {
  if (!getMailConfigurationStatus().configured) return [];
  const pending = await prisma.outboundMessage.findMany({
    where: { organizationId, status: { in: ["PENDING", "FAILED"] }, scheduledAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: limit
  });
  const results = [];
  for (const message of pending) results.push(await deliverOutboundMessage(message.id));
  return results;
}
