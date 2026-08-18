import type { AccessAction, Prisma, TicketStatus } from "@prisma/client";
import { appUrl } from "@/lib/app-url";
import { createIcsEvent } from "@/lib/calendar";
import { submitAndCheckInvoice } from "@/lib/invoice-processing";
import { deliverPendingOutboundMessages, queueOutboundMessage } from "@/lib/outbound";
import type { SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createOneTimeCode, createOpaqueToken, expiresInHours, hashToken } from "@/lib/security-tokens";
import type { StoredUpload } from "@/lib/uploads";

const providerActions: AccessAction[] = [
  "ACCEPT",
  "REJECT",
  "SUBMIT_OFFER",
  "MESSAGE",
  "PROPOSE_APPOINTMENT",
  "STATUS_UPDATE",
  "COMPLETE_WORK",
  "UPLOAD_INVOICE",
  "REQUEST_OTP"
];

export async function createProviderAccessLink(manager: SessionUser, ticketId: string) {
  if (manager.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Auftragslinks ausstellen.");
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId: manager.organizationId },
    include: { assignedProvider: true, property: true, unit: true, tenant: true }
  });
  if (!ticket?.assignedProvider) throw new Error("Bitte zuerst einen Dienstleister zuweisen.");

  const generated = createOpaqueToken();
  await prisma.$transaction(async (tx) => {
    await tx.providerAccess.updateMany({
      where: { ticketId: ticket.id, providerId: ticket.assignedProvider!.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    const access = await tx.providerAccess.create({
      data: {
        organizationId: manager.organizationId,
        ticketId: ticket.id,
        providerId: ticket.assignedProvider!.id,
        createdById: manager.id,
        tokenHash: generated.tokenHash,
        tokenHint: generated.tokenHint,
        allowedActions: providerActions,
        expiresAt: expiresInHours(24 * 14)
      }
    });
    await tx.auditLog.create({
      data: {
        organizationId: manager.organizationId,
        ticketId: ticket.id,
        actorUserId: manager.id,
        actorType: "USER",
        action: "PROVIDER_ACCESS_CREATED",
        reason: `Registrierungsfreier Auftragslink für ${ticket.assignedProvider!.companyName} erstellt.`,
        metadata: { providerId: ticket.assignedProvider!.id, expiresInDays: 14 }
      }
    });
    await queueOutboundMessage(tx, {
      organizationId: manager.organizationId,
      ticketId: ticket.id,
      recipient: ticket.assignedProvider!.email,
      subject: `${ticket.providerRequestType === "QUOTE_REQUEST" ? "Angebotsanfrage" : "Auftrag"} ${ticket.number}: ${ticket.title}`,
      body: [
        `${ticket.providerRequestType === "QUOTE_REQUEST" ? "Neue Angebotsanfrage" : "Neuer Auftrag"} von ${ticket.property.name}`,
        `Einsatzort: ${ticket.property.address}, Einheit ${ticket.unit.label}, ${ticket.room}`,
        `Mieter: ${ticket.tenant.name} (${ticket.tenant.phone ?? ticket.tenant.email})`,
        `Beschreibung: ${ticket.description}`,
        `${ticket.providerRequestType === "QUOTE_REQUEST" ? "Orientierungsrahmen" : "Freigegebener Kostenrahmen"}: ${ticket.approvedCostLimit ? `${Number(ticket.approvedCostLimit).toFixed(2)} EUR` : "noch offen"}`,
        ticket.providerRequestType === "QUOTE_REQUEST"
          ? "Bitte senden Sie Ihr Angebot über den sicheren Link."
          : "Passt der Kostenrahmen, können Sie direkt annehmen und Termine vorschlagen. Andernfalls senden Sie ein Gegenangebot.",
        `Sicherer Auftragslink: ${appUrl(`/auftrag/${generated.token}`)}`
      ].join("\n\n"),
      eventKey: `provider-access:${access.id}`
    });
    const providerAccount = await tx.user.findFirst({
      where: { email: { equals: ticket.assignedProvider!.email, mode: "insensitive" }, role: "DIENSTLEISTER" },
      select: { id: true }
    });
    if (providerAccount) {
      await tx.notification.create({
        data: {
          userId: providerAccount.id,
          ticketId: ticket.id,
          type: "WORK_ORDER_REQUEST",
          title: ticket.providerRequestType === "QUOTE_REQUEST" ? "Neue Angebotsanfrage" : "Neuer Auftrag",
          body: `${ticket.number}: ${ticket.title} · ${ticket.property.name}`,
          href: `/tickets/${ticket.id}`
        }
      });
    }
  });
  await deliverPendingOutboundMessages(manager.organizationId);
  return { token: generated.token, provider: ticket.assignedProvider };
}

export async function revokeProviderAccess(manager: SessionUser, ticketId: string) {
  if (manager.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Auftragslinks widerrufen.");
  await prisma.providerAccess.updateMany({
    where: { ticketId, organizationId: manager.organizationId, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function getProviderOrder(token: string) {
  const access = await findValidAccess(token, false);
  if (!access) return null;
  return access;
}

export async function providerPortalDecision(input: { token: string; accepted: boolean; reason?: string }) {
  return withProviderAccess(input.token, input.accepted ? "ACCEPT" : "REJECT", async (tx, access) => {
    const ticket = access.ticket;
    if (ticket.status !== "DIENSTLEISTER_ANGEFRAGT") throw new Error("Die Auftragsanfrage wurde bereits bearbeitet.");
    if (input.accepted && ticket.providerRequestType === "QUOTE_REQUEST") {
      throw new Error("Hier wurde zunächst ein Angebot angefordert.");
    }
    const nextStatus: TicketStatus = input.accepted ? "TERMINABSTIMMUNG" : "PRUEFUNG_ERFORDERLICH";
    const reason = input.accepted
      ? "Auftrag über sicheren Dienstleisterlink angenommen."
      : `Auftrag abgelehnt: ${input.reason?.trim() || "Kein Grund angegeben"}.`;
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        providerAcceptedAt: input.accepted ? new Date() : null,
        reviewRequired: !input.accepted,
        reviewReason: input.accepted ? null : reason
      }
    });
    await tx.statusHistory.create({ data: { ticketId: ticket.id, fromStatus: ticket.status, toStatus: nextStatus, note: reason } });
    await tx.message.create({ data: { ticketId: ticket.id, kind: "SYSTEM", body: reason } });
    await tx.notification.createMany({
      data: [ticket.managerId, ticket.tenantId].map((userId) => ({
        userId,
        ticketId: ticket.id,
        type: "STATUS_CHANGED" as const,
        title: input.accepted ? "Auftrag angenommen" : "Auftrag abgelehnt",
        body: `${ticket.number}: ${access.provider.companyName}`,
        href: `/tickets/${ticket.id}`
      }))
    });
    return nextStatus;
  });
}

export async function providerPortalSubmitOffer(input: {
  token: string;
  amount: number;
  description: string;
  validUntil?: Date | null;
  upload?: StoredUpload;
}) {
  if (input.amount <= 0 || input.amount > 999999) throw new Error("Bitte einen gültigen Angebotsbetrag angeben.");
  if (input.description.trim().length < 10) throw new Error("Bitte Leistung und Umfang kurz beschreiben.");

  return withProviderAccess(input.token, "SUBMIT_OFFER", async (tx, access) => {
    if (access.ticket.status !== "DIENSTLEISTER_ANGEFRAGT") {
      throw new Error("Für diesen Vorgang kann derzeit kein Angebot eingereicht werden.");
    }
    await tx.offer.updateMany({
      where: { ticketId: access.ticketId, providerId: access.providerId, status: "SUBMITTED" },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewNote: "Durch ein neueres Angebot ersetzt." }
    });
    const document = input.upload
      ? await tx.document.create({
          data: {
            organizationId: access.organizationId,
            ticketId: access.ticketId,
            fileName: input.upload.fileName,
            originalName: input.upload.originalName,
            url: input.upload.url,
            contentType: input.upload.contentType,
            sizeBytes: input.upload.sizeBytes,
            checksum: input.upload.checksum,
            kind: "OFFER",
            visibility: "PROVIDER"
          }
        })
      : null;
    const offer = await tx.offer.create({
      data: {
        ticketId: access.ticketId,
        providerId: access.providerId,
        documentId: document?.id,
        amount: input.amount,
        description: input.description.trim(),
        validUntil: input.validUntil ?? null
      }
    });
    const reason = `${access.provider.companyName} hat ein Angebot über ${input.amount.toFixed(2)} EUR eingereicht.`;
    await tx.ticket.update({
      where: { id: access.ticketId },
      data: {
        status: "WARTEN_AUF_FREIGABE",
        costEstimate: input.amount,
        reviewRequired: true,
        reviewReason: reason
      }
    });
    await tx.statusHistory.create({ data: { ticketId: access.ticketId, fromStatus: access.ticket.status, toStatus: "WARTEN_AUF_FREIGABE", note: reason } });
    await tx.message.create({ data: { ticketId: access.ticketId, kind: "SYSTEM", body: "Ein Angebot liegt zur Prüfung durch die Hausverwaltung vor." } });
    await tx.notification.create({
      data: {
        userId: access.ticket.managerId,
        ticketId: access.ticketId,
        type: "STATUS_CHANGED",
        title: "Angebot prüfen",
        body: `${access.ticket.number}: ${input.amount.toFixed(2)} EUR von ${access.provider.companyName}`,
        href: `/tickets/${access.ticketId}`
      }
    });
    return offer;
  });
}

export async function reviewProviderOffer(manager: SessionUser, offerId: string, approved: boolean, note?: string) {
  if (manager.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Angebote entscheiden.");
  const offer = await prisma.offer.findFirst({
    where: { id: offerId, status: "SUBMITTED", ticket: { organizationId: manager.organizationId } },
    include: { provider: true, ticket: { include: { property: true, unit: true, tenant: true } } }
  });
  if (!offer) throw new Error("Das Angebot wurde nicht gefunden oder bereits entschieden.");
  const generated = approved ? createOpaqueToken() : null;

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: offer.id },
      data: { status: approved ? "APPROVED" : "REJECTED", reviewedAt: new Date(), reviewNote: note?.trim() || null }
    });
    await tx.providerAccess.updateMany({
      where: { ticketId: offer.ticketId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (approved && generated) {
      await tx.providerAccess.create({
        data: {
          organizationId: manager.organizationId,
          ticketId: offer.ticketId,
          providerId: offer.providerId,
          createdById: manager.id,
          tokenHash: generated.tokenHash,
          tokenHint: generated.tokenHint,
          allowedActions: providerActions,
          expiresAt: expiresInHours(24 * 14)
        }
      });
    }
    const nextStatus: TicketStatus = approved ? "DIENSTLEISTER_ANGEFRAGT" : "PRUEFUNG_ERFORDERLICH";
    const reason = approved
      ? `Angebot über ${Number(offer.amount).toFixed(2)} EUR freigegeben. Der Betrieb kann jetzt Terminoptionen senden.`
      : `Angebot über ${Number(offer.amount).toFixed(2)} EUR abgelehnt.${note?.trim() ? ` ${note.trim()}` : ""}`;
    await tx.ticket.update({
      where: { id: offer.ticketId },
      data: {
        status: nextStatus,
        providerRequestType: "WORK_ORDER",
        approvedCostLimit: approved ? offer.amount : offer.ticket.approvedCostLimit,
        costApprovedAt: approved ? new Date() : offer.ticket.costApprovedAt,
        providerRequestedAt: approved ? new Date() : offer.ticket.providerRequestedAt,
        reviewRequired: !approved,
        reviewReason: approved ? null : reason,
        reviewedAt: approved ? new Date() : offer.ticket.reviewedAt
      }
    });
    await tx.statusHistory.create({ data: { ticketId: offer.ticketId, fromStatus: offer.ticket.status, toStatus: nextStatus, changedById: manager.id, note: reason } });
    await tx.message.create({ data: { ticketId: offer.ticketId, kind: "SYSTEM", body: reason } });
    await tx.notification.create({
      data: {
        userId: offer.ticket.tenantId,
        ticketId: offer.ticketId,
        type: "STATUS_CHANGED",
        title: approved ? "Reparatur freigegeben" : "Angebot wird weiter geprüft",
        body: `${offer.ticket.number}: ${offer.ticket.title}`,
        href: `/tickets/${offer.ticketId}`
      }
    });
    await queueOutboundMessage(tx, {
      organizationId: manager.organizationId,
      ticketId: offer.ticketId,
      recipient: offer.provider.email,
      subject: approved ? `Auftrag ${offer.ticket.number} freigegeben` : `Angebot ${offer.ticket.number} nicht freigegeben`,
      body: approved && generated
        ? [
            `Ihr Angebot über ${Number(offer.amount).toFixed(2)} EUR wurde freigegeben.`,
            `Einsatzort: ${offer.ticket.property.address}, Einheit ${offer.ticket.unit.label}`,
            "Sie können den Auftrag jetzt annehmen und direkt Terminoptionen an den Mieter senden:",
            appUrl(`/auftrag/${generated.token}`)
          ].join("\n\n")
        : `Ihr Angebot über ${Number(offer.amount).toFixed(2)} EUR wurde nicht freigegeben.${note?.trim() ? `\n\nHinweis: ${note.trim()}` : ""}`,
      eventKey: `offer-review:${offer.id}:${approved ? "approved" : "rejected"}`
    });
    await tx.auditLog.create({
      data: {
        organizationId: manager.organizationId,
        ticketId: offer.ticketId,
        actorUserId: manager.id,
        actorType: "USER",
        action: approved ? "PROVIDER_OFFER_APPROVED" : "PROVIDER_OFFER_REJECTED",
        reason,
        metadata: { offerId: offer.id, amount: Number(offer.amount), providerId: offer.providerId }
      }
    });
  });
  await deliverPendingOutboundMessages(manager.organizationId);
  return { approved, token: generated?.token ?? null };
}

export async function providerPortalMessage(input: { token: string; body: string }) {
  return withProviderAccess(input.token, "MESSAGE", async (tx, access) => {
    const body = input.body.trim();
    if (body.length < 2 || body.length > 2000) throw new Error("Bitte eine Nachricht mit maximal 2.000 Zeichen eingeben.");
    const message = await tx.message.create({
      data: {
        ticketId: access.ticketId,
        kind: "MESSAGE",
        body: `${access.provider.companyName}: ${body}`
      }
    });
    await tx.notification.createMany({
      data: [access.ticket.managerId, access.ticket.tenantId].map((userId) => ({
        userId,
        ticketId: access.ticketId,
        type: "NEW_MESSAGE" as const,
        title: "Neue Nachricht vom Dienstleister",
        body: `${access.ticket.number}: ${body.slice(0, 100)}`,
        href: `/tickets/${access.ticketId}`
      }))
    });
    return message;
  });
}

export async function providerPortalProposeAppointments(input: {
  token: string;
  slots: Array<{ startsAt: Date; endsAt: Date }>;
  note?: string;
}) {
  if (!input.slots.length || input.slots.length > 3) throw new Error("Bitte ein bis drei Terminfenster angeben.");
  if (input.slots.some((slot) => slot.startsAt <= new Date() || slot.endsAt <= slot.startsAt)) {
    throw new Error("Terminfenster müssen in der Zukunft liegen und ein gültiges Ende haben.");
  }
  const result = await withProviderAccess(input.token, "PROPOSE_APPOINTMENT", async (tx, access) => {
    await tx.appointment.updateMany({
      where: { ticketId: access.ticketId, status: "PROPOSED" },
      data: { status: "DECLINED", cancelledAt: new Date(), cancellationReason: "Durch neue Vorschläge ersetzt" }
    });
    await tx.appointment.createMany({
      data: input.slots.map((slot) => ({
        ticketId: access.ticketId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        note: input.note?.trim() || null
      }))
    });
    const fromStatus = access.ticket.status;
    if (["DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG"].includes(fromStatus)) {
      await tx.ticket.update({ where: { id: access.ticketId }, data: { status: "TERMINABSTIMMUNG" } });
      if (fromStatus !== "TERMINABSTIMMUNG") {
        await tx.statusHistory.create({
          data: { ticketId: access.ticketId, fromStatus, toStatus: "TERMINABSTIMMUNG", note: `${input.slots.length} Termine vorgeschlagen.` }
        });
      }
    }
    await tx.message.create({
      data: { ticketId: access.ticketId, kind: "SYSTEM", body: `${access.provider.companyName} hat ${input.slots.length} Terminoptionen gesendet.` }
    });
    await tx.notification.create({
      data: {
        userId: access.ticket.tenantId,
        ticketId: access.ticketId,
        type: "APPOINTMENT_PROPOSED",
        title: "Termin auswählen",
        body: `${access.ticket.number}: ${input.slots.length} Termine stehen bereit.`,
        href: `/tickets/${access.ticketId}`
      }
    });
    await queueOutboundMessage(tx, {
      organizationId: access.organizationId,
      ticketId: access.ticketId,
      recipient: access.ticket.tenant.email,
      subject: `Termin für ${access.ticket.number} auswählen`,
      body: `${access.provider.companyName} hat ${input.slots.length} Terminoptionen bereitgestellt. Bitte wählen Sie im Mieterportal.`,
      eventKey: `appointment-proposal:${input.slots.map((slot) => slot.startsAt.toISOString()).join(",")}`
    });
    const appointments = await tx.appointment.findMany({ where: { ticketId: access.ticketId, status: "PROPOSED" }, orderBy: { startsAt: "asc" } });
    return { appointments, organizationId: access.organizationId };
  });
  await deliverPendingOutboundMessages(result.organizationId);
  return result.appointments;
}

export async function providerPortalUpdateStatus(input: {
  token: string;
  status: "IN_BEARBEITUNG" | "WARTEN_AUF_MATERIAL";
  note: string;
}) {
  return withProviderAccess(input.token, "STATUS_UPDATE", async (tx, access) => {
    const allowed =
      (input.status === "IN_BEARBEITUNG" && ["TERMIN_BESTAETIGT", "IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL"].includes(access.ticket.status)) ||
      (input.status === "WARTEN_AUF_MATERIAL" && access.ticket.status === "IN_BEARBEITUNG");
    if (!allowed) throw new Error("Dieser Status ist im aktuellen Bearbeitungsschritt nicht möglich.");
    await tx.ticket.update({
      where: { id: access.ticketId },
      data: {
        status: input.status,
        workStartedAt: input.status === "IN_BEARBEITUNG" ? access.ticket.workStartedAt ?? new Date() : access.ticket.workStartedAt,
        reviewRequired: input.status === "WARTEN_AUF_MATERIAL",
        reviewReason: input.status === "WARTEN_AUF_MATERIAL" ? input.note : null
      }
    });
    await tx.statusHistory.create({
      data: { ticketId: access.ticketId, fromStatus: access.ticket.status, toStatus: input.status, note: input.note }
    });
    await tx.message.create({ data: { ticketId: access.ticketId, kind: "SYSTEM", body: input.note } });
    return input.status;
  });
}

export async function providerPortalCompleteWork(input: {
  token: string;
  completionReport: string;
  workHours: number;
  finalCost: number;
  materialDescription?: string;
  materialQuantity?: number;
  materialUnitCost?: number;
  beforeUploads: StoredUpload[];
  afterUploads: StoredUpload[];
  invoiceUpload: StoredUpload;
  invoiceNumber?: string;
  supplierName?: string;
  invoiceAmount?: number;
  otp?: string;
}) {
  if (input.completionReport.trim().length < 10) throw new Error("Bitte einen aussagekräftigen Arbeitsbericht eingeben.");
  if (!input.afterUploads.some((upload) => upload.contentType.startsWith("image/"))) {
    throw new Error("Mindestens ein Nachher-Foto ist erforderlich.");
  }
  if (input.invoiceUpload.contentType !== "application/pdf" && !input.invoiceUpload.contentType.includes("xml")) {
    throw new Error("Die Rechnung muss als PDF, XRechnung oder ZUGFeRD-Datei vorliegen.");
  }

  return withProviderAccess(input.token, "COMPLETE_WORK", async (tx, access) => {
    if (!access.organization.settings) throw new Error("Mandantenkonfiguration fehlt.");
    if (access.organization.settings.requireProviderOtpCompletion) {
      const validOtp = Boolean(
        input.otp &&
          access.otpHash === hashToken(input.otp) &&
          access.otpExpiresAt &&
          access.otpExpiresAt > new Date()
      );
      if (!validOtp) throw new Error("Für den Abschluss ist ein gültiger Einmalcode erforderlich.");
      await tx.providerAccess.update({ where: { id: access.id }, data: { otpVerifiedAt: new Date() } });
    }
    if (!["IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL"].includes(access.ticket.status)) {
      throw new Error("Die Arbeit muss vor dem Abschluss gestartet worden sein.");
    }

    const evidence = [
      ...input.beforeUploads.map((upload) => ({ upload, kind: "BEFORE_PHOTO" as const })),
      ...input.afterUploads.map((upload) => ({ upload, kind: "AFTER_PHOTO" as const }))
    ];
    if (evidence.length) {
      await tx.document.createMany({
        data: evidence.map(({ upload, kind }) => ({
          organizationId: access.organizationId,
          ticketId: access.ticketId,
          fileName: upload.fileName,
          originalName: upload.originalName,
          url: upload.url,
          contentType: upload.contentType,
          sizeBytes: upload.sizeBytes,
          checksum: upload.checksum,
          kind,
          visibility: "ALL"
        }))
      });
    }
    if (input.materialDescription?.trim()) {
      await tx.materialEntry.create({
        data: {
          ticketId: access.ticketId,
          description: input.materialDescription.trim(),
          quantity: input.materialQuantity ?? 1,
          unitCost: input.materialUnitCost ?? null
        }
      });
    }
    await tx.ticket.update({
      where: { id: access.ticketId },
      data: {
        status: "WARTEN_AUF_FREIGABE",
        completionReport: input.completionReport.trim(),
        workHours: input.workHours,
        finalCost: input.finalCost,
        completedAt: new Date(),
        reviewRequired: true,
        reviewReason: "Ausführung und Rechnung müssen von der Hausverwaltung freigegeben werden."
      }
    });
    const invoice = await submitAndCheckInvoice(tx, {
      organizationId: access.organizationId,
      ticketId: access.ticketId,
      providerId: access.providerId,
      upload: input.invoiceUpload,
      source: "MANUAL",
      invoiceNumber: input.invoiceNumber,
      supplierName: input.supplierName || access.provider.companyName,
      amount: input.invoiceAmount ?? input.finalCost,
      actorType: "PROVIDER_LINK"
    });
    await tx.statusHistory.create({
      data: {
        ticketId: access.ticketId,
        fromStatus: access.ticket.status,
        toStatus: "WARTEN_AUF_FREIGABE",
        note: "Ausführung, Fotodokumentation, Material und Rechnung vollständig eingereicht."
      }
    });
    await tx.message.create({
      data: {
        ticketId: access.ticketId,
        kind: "SYSTEM",
        body: `Ausführung dokumentiert. Rechnungsprüfung: ${invoice.recommendation}`
      }
    });
    await tx.notification.create({
      data: {
        userId: access.ticket.managerId,
        ticketId: access.ticketId,
        type: "WORK_COMPLETED",
        title: "Ausführung und Rechnung prüfen",
        body: `${access.ticket.number}: ${input.finalCost.toFixed(2)} EUR`,
        href: `/tickets/${access.ticketId}`
      }
    });
    return invoice;
  });
}

export async function requestProviderOtp(token: string) {
  return withProviderAccess(token, "REQUEST_OTP", async (tx, access) => {
    const generated = createOneTimeCode();
    await tx.providerAccess.update({
      where: { id: access.id },
      data: { otpHash: generated.codeHash, otpExpiresAt: expiresInHours(0.25), otpVerifiedAt: null }
    });
    return generated.code;
  });
}

async function findValidAccess(token: string, updateUsage = true) {
  if (token.length < 20) return null;
  const access = await prisma.providerAccess.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      provider: true,
      organization: { include: { settings: true } },
      ticket: {
        include: {
          tenant: true,
          manager: true,
          property: true,
          building: true,
          unit: true,
          assignedProvider: true,
          appointments: { orderBy: { startsAt: "asc" } },
          documents: { where: { visibility: { in: ["ALL", "PROVIDER"] } }, orderBy: { createdAt: "desc" } },
          messages: { where: { kind: { not: "INTERNAL" } }, orderBy: { createdAt: "asc" } },
          invoices: { orderBy: { createdAt: "desc" } },
          offers: { include: { document: true }, orderBy: { createdAt: "desc" } },
          materials: true
        }
      }
    }
  });
  if (!access || access.revokedAt || access.expiresAt <= new Date()) return null;
  if (access.ticket.assignedProviderId !== access.providerId) return null;
  if (updateUsage) {
    await prisma.providerAccess.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
  }
  return access;
}

async function withProviderAccess<T>(
  token: string,
  action: AccessAction,
  callback: (tx: Prisma.TransactionClient, access: NonNullable<Awaited<ReturnType<typeof findValidAccess>>>) => Promise<T>
) {
  const access = await findValidAccess(token);
  if (!access) throw new Error("Der Auftragslink ist ungültig, abgelaufen oder wurde widerrufen.");
  if (!access.allowedActions.includes(action)) throw new Error("Der Link erlaubt diese Aktion nicht.");
  const recentEvents = await prisma.accessEvent.count({
    where: { accessId: access.id, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } }
  });
  if (recentEvents >= 25) throw new Error("Zu viele Aktionen. Bitte warten Sie einige Minuten.");

  return prisma.$transaction(async (tx) => {
    const result = await callback(tx, access);
    await tx.accessEvent.create({ data: { accessId: access.id, action, success: true } });
    await tx.auditLog.create({
      data: {
        organizationId: access.organizationId,
        ticketId: access.ticketId,
        actorType: "PROVIDER_LINK",
        action: `PROVIDER_${action}`,
        reason: `Aktion über registrierungsfreien Auftragslink durch ${access.provider.companyName}.`,
        metadata: { providerId: access.providerId, accessId: access.id }
      }
    });
    return result;
  });
}

export function calendarForConfirmedAppointment(access: NonNullable<Awaited<ReturnType<typeof getProviderOrder>>>) {
  const appointment = access.ticket.appointments.find((entry) => entry.status === "CONFIRMED");
  if (!appointment) return null;
  return createIcsEvent({
    uid: appointment.calendarUid,
    title: `${access.ticket.number}: ${access.ticket.title}`,
    description: `Reparaturtermin mit ${access.provider.companyName}.`,
    location: `${access.ticket.property.address}, ${access.ticket.unit.label}`,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    organizerEmail: access.ticket.manager.email,
    attendeeEmails: [access.ticket.tenant.email, access.provider.email]
  });
}
