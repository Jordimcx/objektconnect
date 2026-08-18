import {
  AccessAction,
  DocumentVisibility,
  NotificationType,
  Prisma,
  Role,
  TicketPriority,
  TicketStatus
} from "@prisma/client";
import { appUrl } from "@/lib/app-url";
import { revalidatePath } from "next/cache";
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/constants";
import { canAutoDispatch, needsCostApproval, resolveDispatchDecision } from "@/lib/operations";
import { rankProviders } from "@/lib/provider-matching";
import { createTicketSuggestion, nextBestAction } from "@/lib/ticket-intelligence";
import { canTransition, dueDateForPriority } from "@/lib/workflow";
import { canViewTicket, providerIdsForUser, ticketWhereForUser, type SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StoredUpload } from "@/lib/uploads";
import { createIcsEvent } from "@/lib/calendar";
import { deliverPendingOutboundMessages, queueOutboundMessage } from "@/lib/outbound";
import { createOpaqueToken, expiresInHours, hashToken } from "@/lib/security-tokens";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { submitAndCheckInvoice } from "@/lib/invoice-processing";

type TicketWithActors = Prisma.TicketGetPayload<{
  include: {
    tenant: true;
    manager: true;
    assignedProvider: { include: { user: true } };
  };
}>;

const activeStatuses: TicketStatus[] = [
  "NEU",
  "PRUEFUNG_ERFORDERLICH",
  "RUECKFRAGE_AN_MIETER",
  "FREIGEGEBEN",
  "DIENSTLEISTER_ANGEFRAGT",
  "TERMINABSTIMMUNG",
  "TERMIN_BESTAETIGT",
  "IN_BEARBEITUNG",
  "WARTEN_AUF_MATERIAL",
  "WARTEN_AUF_FREIGABE",
  "ERLEDIGT"
];

export async function getTicketForUser(ticketId: string, user: SessionUser) {
  const documentVisibility = user.role === "HAUSVERWALTER"
    ? undefined
    : user.role === "DIENSTLEISTER"
      ? { in: ["ALL", "PROVIDER"] as DocumentVisibility[] }
      : { in: ["ALL", "TENANT"] as DocumentVisibility[] };
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      property: true,
      building: true,
      unit: true,
      tenant: true,
      manager: true,
      assignedProvider: { include: { trades: { include: { trade: true } }, user: true } },
      messages: { include: { author: true }, orderBy: { createdAt: "asc" } },
      internalNotes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      documents: { where: documentVisibility ? { visibility: documentVisibility } : undefined, orderBy: { createdAt: "desc" } },
      appointments: { include: { proposedBy: true }, orderBy: { startsAt: "desc" } },
      statusHistory: { include: { changedBy: true }, orderBy: { createdAt: "desc" } },
      ratings: { orderBy: { createdAt: "desc" } },
      providerAccesses: { orderBy: { createdAt: "desc" } },
      invoices: { include: { document: true, reviewedBy: true }, orderBy: { createdAt: "desc" } },
      offers: { include: { provider: true, document: true }, orderBy: { createdAt: "desc" } },
      materials: { orderBy: { createdAt: "asc" } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 50 }
    }
  });

  if (!ticket || !canViewTicket(user, ticket)) return null;

  return {
    ...ticket,
    documents: ticket.documents.filter((document) => canSeeDocument(user.role, document.visibility))
  };
}

export async function getPublicTicketByToken(token: string) {
  if (token.length < 16) return null;
  const ticket = await prisma.ticket.findFirst({
    where: {
      AND: [
        { OR: [{ publicTokenHash: hashToken(token) }, { publicToken: token }] },
        { OR: [{ publicTokenExpiresAt: null }, { publicTokenExpiresAt: { gt: new Date() } }] }
      ],
      publicTokenRevokedAt: null
    },
    include: {
      property: { select: { name: true } },
      unit: { select: { label: true } },
      assignedProvider: {
        select: { companyName: true, contactName: true, phone: true, rating: true }
      },
      appointments: { orderBy: { startsAt: "asc" } },
      documents: {
        where: { visibility: "ALL" },
        select: { id: true, originalName: true, url: true, contentType: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      },
      messages: {
        where: { kind: "SYSTEM" },
        select: { id: true, body: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      },
      statusHistory: {
        select: { id: true, toStatus: true, note: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      },
      ratings: { select: { score: true, comment: true }, take: 1 }
    }
  });
  return ticket;
}

export async function listTicketsForUser(user: SessionUser, params?: { query?: string; status?: TicketStatus; sort?: string }) {
  const query = params?.query?.trim();
  const where: Prisma.TicketWhereInput = {
    ...ticketWhereForUser(user),
    ...(params?.status ? { status: params.status } : {}),
    ...(query
      ? {
          OR: [
            { number: { contains: query, mode: "insensitive" } },
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { property: { name: { contains: query, mode: "insensitive" } } },
            { tenant: { name: { contains: query, mode: "insensitive" } } }
          ]
        }
      : {})
  };

  const orderBy: Prisma.TicketOrderByWithRelationInput =
    params?.sort === "due" ? { dueDate: "asc" } : params?.sort === "priority" ? { priority: "desc" } : { updatedAt: "desc" };

  return prisma.ticket.findMany({
    where,
    orderBy,
    include: {
      property: true,
      unit: true,
      tenant: true,
      assignedProvider: true
    }
  });
}

export async function createTicketForTenant({
  user,
  input,
  uploads
}: {
  user: SessionUser;
  input: {
    title: string;
    description: string;
    room: string;
    category: string;
    priority: string;
    preferredWindows: string[];
  };
  uploads: StoredUpload[];
}) {
  if (user.role !== "MIETER") throw new Error("Nur Mieter können Schadensmeldungen erstellen.");

  const lease = await prisma.lease.findFirst({
    where: { tenantId: user.id, endsAt: null },
    include: {
      unit: {
        include: {
          building: {
            include: {
              property: true
            }
          }
        }
      },
      tenant: true
    }
  });

  if (!lease) throw new Error("Für diesen Mieter ist keine aktive Wohneinheit hinterlegt.");

  const manager = await prisma.user.findFirst({
    where: { organizationId: user.organizationId, role: "HAUSVERWALTER" },
    orderBy: { createdAt: "asc" }
  });
  if (!manager) throw new Error("Es ist kein Hausverwalter hinterlegt.");

  const suggestion = createTicketSuggestion({
    title: input.title,
    description: input.description,
    room: input.room,
    preferredWindows: input.preferredWindows
  });
  const reportedCategory = input.category as Prisma.TicketCreateInput["category"];
  const category = suggestion.category === "SONSTIGES" ? reportedCategory : suggestion.category;
  const reportedPriority = input.priority as TicketPriority;
  const priorityOrder: TicketPriority[] = ["NIEDRIG", "NORMAL", "HOCH", "NOTFALL"];
  const priority = priorityOrder[Math.max(priorityOrder.indexOf(reportedPriority), priorityOrder.indexOf(suggestion.priority))];
  const settings = await getOrganizationSettings(user.organizationId);
  const [duplicate, repeatTicket, incidentCount, providers] = await Promise.all([
    prisma.ticket.findFirst({
      where: {
        buildingId: lease.unit.buildingId,
        category,
        status: { notIn: ["ABGESCHLOSSEN", "ABGELEHNT"] },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.ticket.findFirst({
      where: {
        unitId: lease.unitId,
        category,
        createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.ticket.count({
      where: {
        buildingId: lease.unit.buildingId,
        category,
        createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
      }
    }),
    prisma.serviceProvider.findMany({
      where: { organizationId: user.organizationId, status: "ACTIVE" },
      include: {
        trades: { include: { trade: true } },
        properties: true,
        assignedTickets: {
          select: {
            propertyId: true,
            providerRequestedAt: true,
            providerAcceptedAt: true,
            completedAt: true,
            dueDate: true,
            finalCost: true,
            approvedCostLimit: true,
            reopenedCount: true,
            ratings: { select: { score: true } }
          },
          take: 50,
          orderBy: { createdAt: "desc" }
        },
        _count: { select: { assignedTickets: { where: { status: { in: activeStatuses } } } } }
      }
    })
  ]);
  const recommendedProvider = rankProviders(providers, category, lease.unit.building.propertyId).find((provider) => provider.tradeMatch);
  const automation = canAutoDispatch({
    priority,
    missingFields: suggestion.missingFields,
    hasMatchingProvider: Boolean(recommendedProvider),
    possibleDuplicate: Boolean(duplicate)
  });
  const dispatch = resolveDispatchDecision({
    qualified: automation.eligible,
    autopilotEnabled: settings.autopilotEnabled,
    dispatchStrategy: settings.dispatchStrategy
  });
  const status: TicketStatus = dispatch.shouldContactProvider ? "DIENSTLEISTER_ANGEFRAGT" : "PRUEFUNG_ERFORDERLICH";
  const reviewReason = dispatch.mode === "REVIEW"
    ? !automation.eligible
      ? automation.reason
      : settings.autopilotEnabled
        ? "Die Verwaltung möchte automatisch geprüfte Vorgänge vor dem Versand kontrollieren."
        : "Der Autopilot ist deaktiviert. Der Vorgang wurde vorbereitet und wartet auf Freigabe."
    : null;
  const incidentKey = incidentCount >= 1 ? `${lease.unit.buildingId}:${category}:${new Date().toISOString().slice(0, 10)}` : null;
  const providerAccess = dispatch.shouldContactProvider ? createOpaqueToken() : null;

  const ticket = await prisma.$transaction(async (tx) => {
    const number = await nextTicketNumber(tx);
    const ticket = await tx.ticket.create({
      data: {
        organizationId: user.organizationId,
        number,
        title: input.title,
        description: input.description,
        room: input.room,
        category,
        priority,
        status,
        propertyId: lease.unit.building.propertyId,
        buildingId: lease.unit.buildingId,
        unitId: lease.unitId,
        tenantId: user.id,
        managerId: manager.id,
        dueDate: dueDateForPriority(priority),
        preferredWindows: input.preferredWindows,
        assignedProviderId: recommendedProvider?.id ?? null,
        providerRequestType: dispatch.mode === "QUOTE_REQUEST" ? "QUOTE_REQUEST" : "WORK_ORDER",
        approvedCostLimit: recommendedProvider ? Number(settings.defaultCostLimit) : null,
        autoQualifiedAt: new Date(),
        providerRequestedAt: dispatch.shouldContactProvider ? new Date() : null,
        relatedTicketId: repeatTicket?.id ?? null,
        warrantySuspected: Boolean(repeatTicket),
        incidentKey,
        reviewRequired: dispatch.mode === "REVIEW",
        reviewReason,
        reviewedAt: dispatch.mode === "REVIEW" ? null : new Date(),
        autoDispatchedAt: dispatch.shouldContactProvider ? new Date() : null,
        documents: {
          create: uploads.map((upload) => ({
            organizationId: user.organizationId,
            ownerId: user.id,
            fileName: upload.fileName,
            originalName: upload.originalName,
            url: upload.url,
            contentType: upload.contentType,
            sizeBytes: upload.sizeBytes,
            checksum: upload.checksum,
            kind: upload.contentType.startsWith("image/") ? "DAMAGE_PHOTO" : "GENERAL",
            visibility: "ALL"
          }))
        },
        statusHistory: {
          create: [
            { toStatus: "NEU", changedById: user.id, note: "Schadensmeldung durch Mieter erstellt." },
            {
              fromStatus: "NEU",
              toStatus: status,
              changedById: user.id,
              note: dispatch.mode === "WORK_ORDER"
                ? "Autopilot hat den Routinefall geprüft und als Auftrag weitergeleitet."
                : dispatch.mode === "QUOTE_REQUEST"
                  ? "Autopilot hat den Routinefall geprüft und ein Angebot angefordert."
                  : reviewReason
            }
          ]
        },
        messages: {
          create: [
            {
              authorId: user.id,
              kind: "MESSAGE",
              body: input.description
            },
            {
              kind: "SYSTEM",
              body: `${suggestion.recommendation} Vorgeschlagen: ${CATEGORY_LABELS[suggestion.category]}, ${PRIORITY_LABELS[suggestion.priority]}.`
            },
            {
              kind: "SYSTEM",
              body: dispatch.mode === "WORK_ORDER"
                ? `Autopilot: ${recommendedProvider?.companyName} wurde ausgewählt und bis ${Number(settings.defaultCostLimit).toFixed(2)} EUR beauftragt.`
                : dispatch.mode === "QUOTE_REQUEST"
                  ? `Autopilot: ${recommendedProvider?.companyName} wurde ausgewählt und um ein Angebot zum Kostenrahmen von ${Number(settings.defaultCostLimit).toFixed(2)} EUR gebeten.`
                  : `Entscheidung vorbereitet: ${reviewReason}${duplicate ? ` Ähnlicher Vorgang: ${duplicate.number}.` : ""}`
            },
            ...(repeatTicket
              ? [{ kind: "SYSTEM" as const, body: `Objektgedächtnis: Möglicher Gewährleistungsfall zu ${repeatTicket.number} innerhalb von 180 Tagen.` }]
              : []),
            ...(incidentKey
              ? [{ kind: "SYSTEM" as const, body: `Sammelstörung erkannt: Mehrere Meldungen der Kategorie ${CATEGORY_LABELS[category]} im selben Gebäude.` }]
              : [])
          ]
        },
        providerAccesses: providerAccess && recommendedProvider
          ? {
              create: {
                organizationId: user.organizationId,
                providerId: recommendedProvider.id,
                tokenHash: providerAccess.tokenHash,
                tokenHint: providerAccess.tokenHint,
                allowedActions: Object.values(AccessAction),
                expiresAt: expiresInHours(24 * 14)
              }
            }
          : undefined
      },
      include: {
        tenant: true,
        manager: true,
        assignedProvider: { include: { user: true } }
      }
    });

    await notifyUsers(tx, [manager.id], ticket.id, "NEW_TICKET", dispatch.mode === "REVIEW" ? "Versandfreigabe erforderlich" : dispatch.mode === "QUOTE_REQUEST" ? "Angebot automatisch angefordert" : "Routineauftrag automatisch gestartet", `${ticket.number}: ${ticket.title}`);
    if (dispatch.shouldContactProvider && ticket.assignedProvider?.userId) {
      await notifyUsers(tx, [ticket.assignedProvider.userId], ticket.id, "WORK_ORDER_REQUEST", dispatch.mode === "QUOTE_REQUEST" ? "Neue Angebotsanfrage" : "Neuer Auftrag", `${ticket.number}: ${ticket.title}`);
    }
    if (providerAccess && recommendedProvider?.email) {
      await queueOutboundMessage(tx, {
        organizationId: user.organizationId,
        ticketId: ticket.id,
        recipient: recommendedProvider.email,
        subject: `${dispatch.mode === "QUOTE_REQUEST" ? "Angebotsanfrage" : "Auftrag"} ${ticket.number}`,
        body: [
          `${ticket.number}: ${ticket.title}`,
          `Auftraggeber: ${lease.unit.building.property.name}`,
          `Einsatzort: ${lease.unit.building.property.address}, Einheit ${lease.unit.label}, ${input.room}`,
          `Mieter: ${lease.tenant.name} (${lease.tenant.phone ?? lease.tenant.email})`,
          `Beschreibung: ${input.description}`,
          `${dispatch.mode === "QUOTE_REQUEST" ? "Orientierungsrahmen" : "Freigegebener Kostenrahmen"}: ${Number(settings.defaultCostLimit).toFixed(2)} EUR`,
          dispatch.mode === "QUOTE_REQUEST"
            ? "Bitte senden Sie über den sicheren Link Ihr Angebot an die Verwaltung:"
            : "Passt der Kostenrahmen, können Sie den Auftrag annehmen und direkt Termine an den Mieter senden. Andernfalls senden Sie dort ein Gegenangebot:",
          appUrl(`/auftrag/${providerAccess.token}`)
        ].join("\n\n"),
        eventKey: `provider-auto-dispatch:${ticket.id}:${recommendedProvider.id}`
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        ticketId: ticket.id,
        actorUserId: user.id,
        actorType: "USER",
        action: "TENANT_TICKET_QUALIFIED",
        reason: dispatch.mode === "REVIEW" ? reviewReason! : dispatch.mode === "QUOTE_REQUEST" ? "Routinefall automatisch qualifiziert und Angebot angefordert." : "Routinefall automatisch qualifiziert und beauftragt.",
        metadata: { category, priority, dispatchMode: dispatch.mode, repeatTicket: repeatTicket?.number ?? null, incidentKey }
      }
    });
    await runAutomations(tx, ticket);
    return ticket;
  });
  await deliverPendingOutboundMessages(user.organizationId);
  return ticket;
}

export async function createPublicTicket({
  input,
  uploads,
  channel = "PUBLIC_LINK"
}: {
  input: {
    reportingCode: string;
    reporterName: string;
    reporterEmail: string;
    reporterPhone: string;
    title: string;
    description: string;
    room: string;
    preferredWindows: string[];
  };
  uploads: StoredUpload[];
  channel?: "PUBLIC_LINK" | "QR_CODE";
}) {
  const unit = await prisma.unit.findFirst({
    where: { reportingCode: { equals: input.reportingCode.trim(), mode: "insensitive" } },
    include: {
      building: { include: { property: true } },
      leases: {
        where: { endsAt: null },
        include: { tenant: true },
        orderBy: { startsAt: "desc" },
        take: 1
      }
    }
  });
  if (!unit) throw new Error("Der Objektcode wurde nicht gefunden. Bitte prüfen Sie den Aushang oder QR-Code.");
  const lease = unit.leases[0];
  if (!lease) throw new Error("Für diese Wohneinheit ist kein aktives Mietverhältnis hinterlegt.");

  const manager = await prisma.user.findFirst({
    where: { organizationId: unit.building.property.organizationId, role: "HAUSVERWALTER" },
    orderBy: { createdAt: "asc" }
  });
  if (!manager) throw new Error("Für dieses Objekt ist keine Hausverwaltung hinterlegt.");

  const settings = await getOrganizationSettings(unit.building.property.organizationId);
  const publicAccess = createOpaqueToken();

  const suggestion = createTicketSuggestion(input);
  const duplicate = await prisma.ticket.findFirst({
    where: {
      buildingId: unit.buildingId,
      category: suggestion.category,
      status: { notIn: ["ABGESCHLOSSEN", "ABGELEHNT"] },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    },
    orderBy: { createdAt: "desc" }
  });
  const repeatTicket = await prisma.ticket.findFirst({
    where: {
      unitId: unit.id,
      category: suggestion.category,
      createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
    },
    orderBy: { createdAt: "desc" }
  });
  const incidentCount = await prisma.ticket.count({
    where: {
      buildingId: unit.buildingId,
      category: suggestion.category,
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) }
    }
  });
  const incidentKey = incidentCount >= 1 ? `${unit.buildingId}:${suggestion.category}:${new Date().toISOString().slice(0, 10)}` : null;

  const providers = await prisma.serviceProvider.findMany({
    where: { organizationId: unit.building.property.organizationId, status: "ACTIVE" },
    include: {
      trades: { include: { trade: true } },
      properties: true,
      assignedTickets: {
        select: {
          propertyId: true,
          providerRequestedAt: true,
          providerAcceptedAt: true,
          completedAt: true,
          dueDate: true,
          finalCost: true,
          approvedCostLimit: true,
          reopenedCount: true,
          ratings: { select: { score: true } }
        },
        take: 50,
        orderBy: { createdAt: "desc" }
      },
      _count: {
        select: {
          assignedTickets: { where: { status: { in: activeStatuses } } }
        }
      }
    }
  });
  const rankedProviders = rankProviders(providers, suggestion.category, unit.building.propertyId);
  const recommendedProvider = rankedProviders.find((provider) => provider.tradeMatch);
  const automation = canAutoDispatch({
    priority: suggestion.priority,
    missingFields: suggestion.missingFields,
    hasMatchingProvider: Boolean(recommendedProvider),
    possibleDuplicate: Boolean(duplicate)
  });
  const dispatch = resolveDispatchDecision({
    qualified: automation.eligible,
    autopilotEnabled: settings.autopilotEnabled,
    dispatchStrategy: settings.dispatchStrategy
  });
  const reviewReason = dispatch.mode === "REVIEW"
    ? !automation.eligible
      ? automation.reason
      : settings.autopilotEnabled
        ? "Die Verwaltung möchte automatisch geprüfte Vorgänge vor dem Versand kontrollieren."
        : "Der Autopilot ist deaktiviert. Der Vorgang wurde vorbereitet und wartet auf Freigabe."
    : null;
  const providerAccess = dispatch.shouldContactProvider ? createOpaqueToken() : null;

  const result = await prisma.$transaction(async (tx) => {
    const number = await nextTicketNumber(tx);
    const status: TicketStatus = dispatch.shouldContactProvider ? "DIENSTLEISTER_ANGEFRAGT" : "PRUEFUNG_ERFORDERLICH";
    const ticket = await tx.ticket.create({
      data: {
        organizationId: unit.building.property.organizationId,
        number,
        publicTokenHash: publicAccess.tokenHash,
        publicTokenExpiresAt: expiresInHours(24 * 30),
        source: channel,
        reportedWithoutLogin: true,
        reporterName: input.reporterName,
        reporterEmail: input.reporterEmail,
        reporterPhone: input.reporterPhone,
        title: input.title,
        description: input.description,
        room: input.room,
        category: suggestion.category,
        priority: suggestion.priority,
        status,
        propertyId: unit.building.propertyId,
        buildingId: unit.buildingId,
        unitId: unit.id,
        tenantId: lease.tenantId,
        managerId: manager.id,
        assignedProviderId: recommendedProvider?.id ?? null,
        providerRequestType: dispatch.mode === "QUOTE_REQUEST" ? "QUOTE_REQUEST" : "WORK_ORDER",
        dueDate: dueDateForPriority(suggestion.priority),
        preferredWindows: input.preferredWindows,
        approvedCostLimit: recommendedProvider ? Number(settings.defaultCostLimit) : null,
        autoQualifiedAt: new Date(),
        providerRequestedAt: dispatch.shouldContactProvider ? new Date() : null,
        relatedTicketId: repeatTicket?.id ?? null,
        warrantySuspected: Boolean(repeatTicket),
        incidentKey,
        reviewRequired: dispatch.mode === "REVIEW",
        reviewReason,
        reviewedAt: dispatch.mode === "REVIEW" ? null : new Date(),
        autoDispatchedAt: dispatch.shouldContactProvider ? new Date() : null,
        documents: {
          create: uploads.map((upload) => ({
            organizationId: unit.building.property.organizationId,
            ownerId: lease.tenantId,
            fileName: upload.fileName,
            originalName: upload.originalName,
            url: upload.url,
            contentType: upload.contentType,
            sizeBytes: upload.sizeBytes,
            checksum: upload.checksum,
            kind: upload.contentType.startsWith("image/") ? "DAMAGE_PHOTO" : "GENERAL",
            visibility: "ALL"
          }))
        },
        statusHistory: {
          create: [
            { toStatus: "NEU", note: `Meldung ohne Login durch ${input.reporterName}.` },
            {
              fromStatus: "NEU",
              toStatus: status,
              note: dispatch.mode === "WORK_ORDER"
                ? "Autopilot hat den Routinefall geprüft und als Auftrag weitergeleitet."
                : dispatch.mode === "QUOTE_REQUEST"
                  ? "Autopilot hat den Routinefall geprüft und ein Angebot angefordert."
                  : reviewReason
            }
          ]
        },
        messages: {
          create: [
            { kind: "MESSAGE", body: input.description, authorId: lease.tenantId },
            {
              kind: "SYSTEM",
              body: `Automatische Prüfung: ${CATEGORY_LABELS[suggestion.category]}, ${PRIORITY_LABELS[suggestion.priority]}. ${suggestion.recommendation}`
            },
            {
              kind: "SYSTEM",
              body: dispatch.mode === "WORK_ORDER"
                ? `Autopilot: ${recommendedProvider?.companyName} wurde ausgewählt und bis ${Number(settings.defaultCostLimit).toFixed(2)} EUR beauftragt.`
                : dispatch.mode === "QUOTE_REQUEST"
                  ? `Autopilot: ${recommendedProvider?.companyName} wurde ausgewählt und um ein Angebot zum Kostenrahmen von ${Number(settings.defaultCostLimit).toFixed(2)} EUR gebeten.`
                  : `Entscheidung vorbereitet: ${reviewReason}${duplicate ? ` Ähnlicher Vorgang: ${duplicate.number}.` : ""}`
            },
            ...(repeatTicket
              ? [{ kind: "SYSTEM" as const, body: `Objektgedächtnis: Möglicher Gewährleistungsfall zu ${repeatTicket.number} innerhalb von 180 Tagen.` }]
              : []),
            ...(incidentKey
              ? [{ kind: "SYSTEM" as const, body: `Sammelstörung erkannt: Mehrere Meldungen der Kategorie ${CATEGORY_LABELS[suggestion.category]} im selben Gebäude.` }]
              : [])
          ]
        },
        providerAccesses: providerAccess && recommendedProvider
          ? {
              create: {
                organizationId: unit.building.property.organizationId,
                providerId: recommendedProvider.id,
                tokenHash: providerAccess.tokenHash,
                tokenHint: providerAccess.tokenHint,
                allowedActions: Object.values(AccessAction),
                expiresAt: expiresInHours(24 * 14)
              }
            }
          : undefined
      },
      include: {
        tenant: true,
        manager: true,
        assignedProvider: { include: { user: true } }
      }
    });

    await notifyUsers(tx, [manager.id], ticket.id, "NEW_TICKET", dispatch.mode === "REVIEW" ? "Versandfreigabe erforderlich" : dispatch.mode === "QUOTE_REQUEST" ? "Angebot automatisch angefordert" : "Routineauftrag automatisch gestartet", `${ticket.number}: ${ticket.title}`);
    await notifyUsers(tx, [lease.tenantId], ticket.id, "STATUS_CHANGED", "Schadensmeldung erfasst", `${ticket.number}: ${STATUS_LABELS[status]}`);
    if (dispatch.shouldContactProvider && ticket.assignedProvider?.userId) {
      await notifyUsers(tx, [ticket.assignedProvider.userId], ticket.id, "WORK_ORDER_REQUEST", dispatch.mode === "QUOTE_REQUEST" ? "Neue Angebotsanfrage" : "Neuer Auftrag", `${ticket.number}: ${ticket.title}`);
    }
    if (providerAccess && recommendedProvider?.email) {
      await queueOutboundMessage(tx, {
        organizationId: ticket.organizationId,
        ticketId: ticket.id,
        recipient: recommendedProvider.email,
        subject: `${dispatch.mode === "QUOTE_REQUEST" ? "Angebotsanfrage" : "Auftrag"} ${ticket.number}`,
        body: [
          `${ticket.number}: ${ticket.title}`,
          `Auftraggeber: ${unit.building.property.name}`,
          `Einsatzort: ${unit.building.property.address}, Einheit ${unit.label}, ${input.room}`,
          `Mieter: ${lease.tenant.name} (${lease.tenant.phone ?? lease.tenant.email})`,
          `Beschreibung: ${input.description}`,
          `${dispatch.mode === "QUOTE_REQUEST" ? "Orientierungsrahmen" : "Freigegebener Kostenrahmen"}: ${Number(settings.defaultCostLimit).toFixed(2)} EUR`,
          dispatch.mode === "QUOTE_REQUEST"
            ? "Bitte senden Sie über den sicheren Link Ihr Angebot an die Verwaltung:"
            : "Passt der Kostenrahmen, können Sie den Auftrag annehmen und direkt Termine an den Mieter senden. Andernfalls senden Sie dort ein Gegenangebot:",
          appUrl(`/auftrag/${providerAccess.token}`)
        ].join("\n\n"),
        eventKey: `provider-auto-dispatch:${ticket.id}:${recommendedProvider.id}`
      });
    }
    await runAutomations(tx, ticket);
    await tx.auditLog.create({
      data: {
        organizationId: ticket.organizationId,
        ticketId: ticket.id,
        actorType: "SYSTEM",
        action: "PUBLIC_TICKET_QUALIFIED",
        reason: dispatch.mode === "REVIEW" ? reviewReason! : dispatch.mode === "QUOTE_REQUEST" ? "Routinefall automatisch qualifiziert und Angebot angefordert." : "Routinefall automatisch qualifiziert und beauftragt.",
        metadata: {
          category: suggestion.category,
          priority: suggestion.priority,
          dispatchMode: dispatch.mode,
          repeatTicket: repeatTicket?.number ?? null,
          incidentKey
        }
      }
    });
    return { ticket, publicToken: publicAccess.token, automation, recommendedProvider: recommendedProvider ?? null, possibleDuplicate: duplicate?.number ?? null };
  });
  await deliverPendingOutboundMessages(unit.building.property.organizationId);
  return result;
}

export async function assignTicket({
  user,
  ticketId,
  providerId,
  priority,
  approvedCostLimit,
  requestType,
  note
}: {
  user: SessionUser;
  ticketId: string;
  providerId: string;
  priority: TicketPriority;
  approvedCostLimit: number;
  requestType: "WORK_ORDER" | "QUOTE_REQUEST";
  note?: string;
}) {
  ensureRole(user.role, ["HAUSVERWALTER"]);

  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    const provider = await tx.serviceProvider.findFirst({
      where: { id: providerId, organizationId: user.organizationId, status: "ACTIVE" },
      include: { user: true }
    });
    if (!provider) throw new Error("Der ausgewählte Dienstleister ist nicht verfügbar.");

    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        assignedProviderId: provider.id,
        providerRequestType: requestType,
        priority,
        status: "DIENSTLEISTER_ANGEFRAGT",
        providerRequestedAt: new Date(),
        approvedCostLimit,
        reviewRequired: false,
        reviewReason: null,
        reviewedAt: new Date()
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });

    const requestLabel = requestType === "QUOTE_REQUEST" ? "Angebotsanfrage" : "Auftrag";
    await recordStatus(tx, ticket, "DIENSTLEISTER_ANGEFRAGT", user.id, note ?? `${requestLabel} an ${provider.companyName} gesendet. Kostenrahmen: ${approvedCostLimit.toFixed(2)} EUR.`);
    await addSystemMessage(tx, ticket.id, requestType === "QUOTE_REQUEST" ? `${provider.companyName} wurde um ein Angebot zum Orientierungsrahmen von ${approvedCostLimit.toFixed(2)} EUR gebeten.` : `${provider.companyName} wurde bis ${approvedCostLimit.toFixed(2)} EUR beauftragt.`);
    await notifyUsers(tx, [ticket.tenantId], ticket.id, "STATUS_CHANGED", "Dienstleister angefragt", `${provider.companyName} wurde kontaktiert.`);
    if (provider.userId) {
      await notifyUsers(tx, [provider.userId], ticket.id, "WORK_ORDER_REQUEST", requestType === "QUOTE_REQUEST" ? "Neue Angebotsanfrage" : "Neuer Auftrag", `${ticket.number}: ${ticket.title}`);
    }
    await runAutomations(tx, updated);
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        ticketId: ticket.id,
        actorUserId: user.id,
        actorType: "USER",
        action: "PROVIDER_ASSIGNED",
        reason: note ?? `${requestLabel} wurde mit einem Kostenrahmen von ${approvedCostLimit.toFixed(2)} EUR an ${provider.companyName} gesendet.`,
        metadata: { providerId: provider.id, approvedCostLimit, priority, requestType }
      }
    });
    return updated;
  });
}

export async function providerDecision({
  user,
  ticketId,
  accepted,
  reason
}: {
  user: SessionUser;
  ticketId: string;
  accepted: boolean;
  reason?: string;
}) {
  ensureRole(user.role, ["DIENSTLEISTER"]);

  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    if (!ticket.assignedProviderId || !providerIdsForUser(user).includes(ticket.assignedProviderId)) {
      throw new Error("Dieser Auftrag ist Ihnen nicht zugewiesen.");
    }
    if (accepted && ticket.providerRequestType === "QUOTE_REQUEST") {
      throw new Error("Die Hausverwaltung hat zunächst ein Angebot angefordert.");
    }

    const nextStatus: TicketStatus = accepted ? "TERMINABSTIMMUNG" : "PRUEFUNG_ERFORDERLICH";
    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        providerAcceptedAt: accepted ? new Date() : null,
        reviewRequired: !accepted,
        reviewReason: accepted ? null : `Dienstleister hat abgelehnt: ${reason ?? "Kein Grund angegeben"}`
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });

    await recordStatus(tx, ticket, nextStatus, user.id, accepted ? "Auftrag angenommen." : `Auftrag abgelehnt: ${reason ?? "Kein Grund angegeben"}. Neue Auswahl erforderlich.`);
    await addSystemMessage(tx, ticket.id, accepted ? "Der Dienstleister hat den Auftrag angenommen." : `Ausnahme: Der Dienstleister hat abgelehnt. ${reason ?? "Kein Grund angegeben"}`);
    await notifyUsers(tx, [ticket.managerId, ticket.tenantId], ticket.id, "STATUS_CHANGED", accepted ? "Auftrag angenommen" : "Auftrag abgelehnt", `${ticket.number}: ${ticket.title}`);
    return updated;
  });
}

export async function submitProviderOffer({
  user,
  ticketId,
  amount,
  description,
  validUntil,
  upload
}: {
  user: SessionUser;
  ticketId: string;
  amount: number;
  description: string;
  validUntil?: Date | null;
  upload?: StoredUpload;
}) {
  ensureRole(user.role, ["DIENSTLEISTER"]);
  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    if (!ticket.assignedProviderId || !providerIdsForUser(user).includes(ticket.assignedProviderId)) {
      throw new Error("Dieser Vorgang ist Ihnen nicht zugewiesen.");
    }
    if (ticket.status !== "DIENSTLEISTER_ANGEFRAGT") throw new Error("Für diesen Vorgang kann derzeit kein Angebot eingereicht werden.");
    await tx.offer.updateMany({
      where: { ticketId, providerId: ticket.assignedProviderId, status: "SUBMITTED" },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewNote: "Durch ein neueres Angebot ersetzt." }
    });
    const document = upload
      ? await tx.document.create({
          data: {
            organizationId: ticket.organizationId,
            ticketId,
            ownerId: user.id,
            fileName: upload.fileName,
            originalName: upload.originalName,
            url: upload.url,
            contentType: upload.contentType,
            sizeBytes: upload.sizeBytes,
            checksum: upload.checksum,
            kind: "OFFER",
            visibility: "PROVIDER"
          }
        })
      : null;
    const offer = await tx.offer.create({
      data: { ticketId, providerId: ticket.assignedProviderId, documentId: document?.id, amount, description: description.trim(), validUntil: validUntil ?? null }
    });
    const reason = `${ticket.assignedProvider?.companyName ?? "Dienstleister"} hat ein Angebot über ${amount.toFixed(2)} EUR eingereicht.`;
    await tx.ticket.update({ where: { id: ticketId }, data: { status: "WARTEN_AUF_FREIGABE", costEstimate: amount, reviewRequired: true, reviewReason: reason } });
    await recordStatus(tx, ticket, "WARTEN_AUF_FREIGABE", user.id, reason);
    await addSystemMessage(tx, ticketId, "Ein Angebot liegt zur Prüfung durch die Hausverwaltung vor.");
    await notifyUsers(tx, [ticket.managerId], ticketId, "STATUS_CHANGED", "Angebot prüfen", `${ticket.number}: ${amount.toFixed(2)} EUR`);
    return offer;
  });
}

export async function updateTicketStatus({
  user,
  ticketId,
  status,
  note
}: {
  user: SessionUser;
  ticketId: string;
  status: TicketStatus;
  note?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    ensureStatusAllowed(user, ticket, status);
    const reviewRequired = ["PRUEFUNG_ERFORDERLICH", "WARTEN_AUF_MATERIAL", "WARTEN_AUF_FREIGABE"].includes(status);

    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status,
        workStartedAt: status === "IN_BEARBEITUNG" ? ticket.workStartedAt ?? new Date() : ticket.workStartedAt,
        reviewRequired,
        reviewReason: reviewRequired ? note || `Status: ${STATUS_LABELS[status]}` : null,
        reviewedAt: reviewRequired ? ticket.reviewedAt : new Date()
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });

    await recordStatus(tx, ticket, status, user.id, note);
    await addSystemMessage(tx, ticket.id, `Status geändert zu: ${STATUS_LABELS[status]}.`);
    await notifyTicketParticipants(tx, updated, user.id, "STATUS_CHANGED", "Status geändert", `${ticket.number}: ${STATUS_LABELS[status]}`);
    await runAutomations(tx, updated);
    return updated;
  });
}

export async function proposeAppointment({
  user,
  ticketId,
  startsAt,
  endsAt,
  note
}: {
  user: SessionUser;
  ticketId: string;
  startsAt: Date;
  endsAt: Date;
  note?: string;
}) {
  return proposeAppointmentSlots({ user, ticketId, slots: [{ startsAt, endsAt }], note });
}

export async function proposeAppointmentSlots({
  user,
  ticketId,
  slots,
  note
}: {
  user: SessionUser;
  ticketId: string;
  slots: Array<{ startsAt: Date; endsAt: Date }>;
  note?: string;
}) {
  if (!["HAUSVERWALTER", "DIENSTLEISTER"].includes(user.role)) {
    throw new Error("Nur Hausverwaltung oder Dienstleister können Termine vorschlagen.");
  }
  if (!slots.length || slots.length > 3) throw new Error("Bitte ein bis drei Terminfenster angeben.");
  if (slots.some((slot) => slot.endsAt <= slot.startsAt)) throw new Error("Das Terminende muss nach dem Beginn liegen.");

  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    await tx.appointment.updateMany({
      where: { ticketId: ticket.id, status: "PROPOSED" },
      data: { status: "DECLINED" }
    });
    await tx.appointment.createMany({
      data: slots.map((slot) => ({
        ticketId: ticket.id,
        proposedById: user.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        note
      }))
    });

    const shouldUpdateStatus = canTransition(ticket.status, "TERMINABSTIMMUNG");
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: shouldUpdateStatus ? "TERMINABSTIMMUNG" : ticket.status
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });

    if (shouldUpdateStatus) {
      await recordStatus(tx, ticket, "TERMINABSTIMMUNG", user.id, "Termin wurde vorgeschlagen.");
    }
    await addSystemMessage(tx, ticket.id, `${slots.length} Terminfenster stehen zur direkten Auswahl bereit.`);
    await notifyUsers(tx, [ticket.tenantId], ticket.id, "APPOINTMENT_PROPOSED", "Termin auswählen", `${ticket.number}: Bitte eines der angebotenen Zeitfenster wählen.`);
    return tx.appointment.findMany({ where: { ticketId: ticket.id, status: "PROPOSED" }, orderBy: { startsAt: "asc" } });
  });
}

export async function confirmAppointment({
  user,
  ticketId,
  appointmentId
}: {
  user: SessionUser;
  ticketId: string;
  appointmentId: string;
}) {
  ensureRole(user.role, ["MIETER"]);

  const updated = await prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    const appointment = await tx.appointment.findFirst({
      where: { id: appointmentId, ticketId: ticket.id, status: "PROPOSED" }
    });
    if (!appointment) throw new Error("Der Termin ist nicht mehr verfügbar.");

    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "CONFIRMED" }
    });
    await tx.appointment.updateMany({
      where: { ticketId: ticket.id, id: { not: appointment.id }, status: "PROPOSED" },
      data: { status: "DECLINED" }
    });

    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "TERMIN_BESTAETIGT",
        appointmentAt: appointment.startsAt,
        appointmentConfirmedAt: new Date()
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });

    await recordStatus(tx, ticket, "TERMIN_BESTAETIGT", user.id, "Mieter hat den Termin bestätigt.");
    await addSystemMessage(tx, ticket.id, "Der Mieter hat den Termin bestätigt.");
    await notifyTicketParticipants(tx, updated, user.id, "APPOINTMENT_CONFIRMED", "Termin bestätigt", `${ticket.number}: Termin wurde bestätigt.`);
    await runAutomations(tx, updated);
    await tx.appointment.update({ where: { id: appointment.id }, data: { confirmedAt: new Date() } });
    const calendarContent = createIcsEvent({
      uid: appointment.calendarUid,
      title: `${ticket.number}: ${ticket.title}`,
      description: "Bestätigter Reparaturtermin über ObjektConnect",
      location: `${ticket.propertyId}, ${ticket.unitId}`,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      organizerEmail: ticket.manager.email,
      attendeeEmails: [ticket.tenant.email, ticket.assignedProvider?.email ?? ""]
    });
    for (const recipient of [ticket.tenant.email, ticket.manager.email, ticket.assignedProvider?.email].filter((value): value is string => Boolean(value))) {
      await queueOutboundMessage(tx, {
        organizationId: user.organizationId,
        ticketId: ticket.id,
        recipient,
        subject: `Termin bestätigt: ${ticket.number}`,
        body: "Der Reparaturtermin wurde bestätigt. Die Kalendereinladung ist beigefügt.",
        calendarContent,
        eventKey: `appointment-confirmed:${appointment.id}`
      });
    }
    return updated;
  });
  await deliverPendingOutboundMessages(user.organizationId);
  return updated;
}

export async function completeWork({
  user,
  ticketId,
  completionReport,
  workHours,
  finalCost,
  uploads,
  invoiceUpload,
  invoiceNumber,
  supplierName
}: {
  user: SessionUser;
  ticketId: string;
  completionReport: string;
  workHours: number;
  finalCost: number;
  uploads: StoredUpload[];
  invoiceUpload: StoredUpload;
  invoiceNumber?: string;
  supplierName?: string;
}) {
  ensureRole(user.role, ["DIENSTLEISTER"]);
  if (!uploads.some((upload) => upload.contentType.startsWith("image/"))) {
    throw new Error("Bitte mindestens ein Foto als Ausführungsnachweis hochladen.");
  }

  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    if (!ticket.assignedProviderId || !providerIdsForUser(user).includes(ticket.assignedProviderId)) {
      throw new Error("Dieser Auftrag ist Ihnen nicht zugewiesen.");
    }
    if (!["IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL"].includes(ticket.status)) {
      throw new Error("Die Arbeit muss vor dem Abschluss gestartet worden sein.");
    }
    const exceedsCostLimit = needsCostApproval(finalCost, ticket.approvedCostLimit ? Number(ticket.approvedCostLimit) : null);
    const nextStatus: TicketStatus = "WARTEN_AUF_FREIGABE";

    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        completionReport,
        workHours,
        finalCost,
        completedAt: new Date(),
        reviewRequired: true,
        reviewReason: exceedsCostLimit
          ? `Abschlusskosten ${finalCost.toFixed(2)} EUR überschreiten den freigegebenen Rahmen von ${ticket.approvedCostLimit ? Number(ticket.approvedCostLimit).toFixed(2) : "0,00"} EUR.`
          : "Ausführung und Rechnung warten auf die Prüfung der Hausverwaltung."
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });

    if (uploads.length) {
      await tx.document.createMany({
        data: uploads.map((upload) => ({
          organizationId: ticket.organizationId,
          ticketId: ticket.id,
          ownerId: user.id,
          fileName: upload.fileName,
          originalName: upload.originalName,
          url: upload.url,
          contentType: upload.contentType,
          sizeBytes: upload.sizeBytes,
          checksum: upload.checksum,
          kind: upload.contentType.startsWith("image/") ? "AFTER_PHOTO" : "WORK_REPORT",
          visibility: "ALL"
        }))
      });
    }

    await submitAndCheckInvoice(tx, {
      organizationId: ticket.organizationId,
      ticketId: ticket.id,
      providerId: ticket.assignedProviderId,
      ownerId: user.id,
      upload: invoiceUpload,
      invoiceNumber,
      supplierName,
      amount: finalCost,
      actorType: "USER",
      actorUserId: user.id
    });

    await recordStatus(tx, ticket, nextStatus, user.id, "Ausführung und Rechnung dokumentiert; Prüfung und Kostenfreigabe erforderlich.");
    await addSystemMessage(
      tx,
      ticket.id,
      `Foto, Arbeitsbericht und Rechnung liegen vor. Die Abschlusskosten von ${finalCost.toFixed(2)} EUR werden jetzt geprüft.`
    );
    await notifyUsers(
      tx,
      [ticket.managerId],
      ticket.id,
      "WORK_COMPLETED",
      "Rechnungs- und Kostenprüfung erforderlich",
      `${ticket.number}: ${finalCost.toFixed(2)} EUR`
    );
    await runAutomations(tx, updated);
    return updated;
  });
}

export async function approveFinalCost({
  user,
  ticketId,
  approvedCostLimit,
  note
}: {
  user: SessionUser;
  ticketId: string;
  approvedCostLimit: number;
  note?: string;
}) {
  ensureRole(user.role, ["HAUSVERWALTER"]);
  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    if (ticket.status !== "WARTEN_AUF_FREIGABE" || ticket.finalCost == null) {
      throw new Error("Für diesen Vorgang liegt keine offene Kostenfreigabe vor.");
    }
    if (approvedCostLimit < Number(ticket.finalCost)) {
      throw new Error("Der freigegebene Betrag muss mindestens den gemeldeten Abschlusskosten entsprechen.");
    }

    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "ERLEDIGT",
        approvedCostLimit,
        costApprovedAt: new Date(),
        reviewRequired: false,
        reviewReason: null,
        reviewedAt: new Date()
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, ticket, "ERLEDIGT", user.id, note || `Abschlusskosten bis ${approvedCostLimit.toFixed(2)} EUR freigegeben.`);
    await addSystemMessage(tx, ticket.id, `Die Hausverwaltung hat die Abschlusskosten freigegeben. Der Mieter kann die Erledigung jetzt bestätigen.`);
    await notifyUsers(tx, [ticket.tenantId], ticket.id, "WORK_COMPLETED", "Reparatur zur Bestätigung bereit", `${ticket.number}: Bitte prüfen Sie die Erledigung.`);
    return updated;
  });
}

export async function confirmCompletion({
  user,
  ticketId,
  score,
  comment
}: {
  user: SessionUser;
  ticketId: string;
  score: number;
  comment?: string;
}) {
  ensureRole(user.role, ["MIETER"]);

  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    if (ticket.status !== "ERLEDIGT") throw new Error("Der Auftrag ist noch nicht als erledigt markiert.");

    await tx.rating.create({
      data: {
        ticketId: ticket.id,
        tenantId: user.id,
        providerId: ticket.assignedProviderId,
        score,
        comment
      }
    });

    const tenantConfirmed = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "VOM_MIETER_BESTAETIGT", tenantConfirmedAt: new Date() },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, ticket, "VOM_MIETER_BESTAETIGT", user.id, "Mieter hat die Erledigung bestätigt.");
    await addSystemMessage(tx, ticket.id, "Der Mieter hat die Erledigung bestätigt und Feedback abgegeben.");
    const closed = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "ABGESCHLOSSEN", archivedAt: new Date(), reviewRequired: false, reviewReason: null },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, tenantConfirmed, "ABGESCHLOSSEN", undefined, "Autopilot hat den bestätigten Vorgang abgeschlossen und archiviert.");
    await addSystemMessage(tx, ticket.id, "Autopilot: Vorgang vollständig abgeschlossen und im Objektgedächtnis archiviert.");
    await notifyTicketParticipants(tx, closed, user.id, "FEEDBACK_RECEIVED", "Vorgang abgeschlossen", `${ticket.number}: Mieter hat die Erledigung bestätigt.`);
    return closed;
  });
}

export async function reopenTicket({
  user,
  ticketId,
  reason
}: {
  user: SessionUser;
  ticketId: string;
  reason: string;
}) {
  ensureRole(user.role, ["MIETER"]);
  if (reason.trim().length < 10) throw new Error("Bitte beschreiben Sie kurz, was noch nicht behoben ist.");
  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    if (!["ERLEDIGT", "VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(ticket.status)) {
      throw new Error("Dieser Vorgang kann im aktuellen Status nicht erneut geöffnet werden.");
    }
    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "PRUEFUNG_ERFORDERLICH",
        reopenedCount: { increment: 1 },
        warrantySuspected: true,
        reviewRequired: true,
        reviewReason: `Mieter meldet Problem nach Ausführung erneut: ${reason.trim()}`,
        archivedAt: null,
        tenantConfirmedAt: null
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, ticket, "PRUEFUNG_ERFORDERLICH", user.id, reason.trim());
    await addSystemMessage(tx, ticket.id, `Gewährleistungsprüfung: Der Mieter hat den Vorgang erneut geöffnet. ${reason.trim()}`);
    await notifyUsers(tx, [ticket.managerId], ticket.id, "QUESTION", "Gewährleistungsfall prüfen", `${ticket.number}: Problem besteht weiter.`);
    await tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        ticketId: ticket.id,
        actorUserId: user.id,
        actorType: "USER",
        action: "TICKET_REOPENED",
        reason: reason.trim(),
        metadata: { reopenedCount: ticket.reopenedCount + 1 }
      }
    });
    return updated;
  });
}

export async function requestNewAppointments({ user, ticketId, reason }: { user: SessionUser; ticketId: string; reason: string }) {
  ensureRole(user.role, ["MIETER"]);
  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    if (ticket.status !== "TERMINABSTIMMUNG") throw new Error("Es liegen aktuell keine offenen Terminoptionen vor.");
    await tx.appointment.updateMany({
      where: { ticketId: ticket.id, status: "PROPOSED" },
      data: { status: "DECLINED", cancelledAt: new Date(), cancellationReason: reason || "Mieter benötigt neue Optionen" }
    });
    await addSystemMessage(tx, ticket.id, `Mieter bittet um neue Terminoptionen. ${reason}`);
    const recipients = [ticket.managerId, ticket.assignedProvider?.userId].filter((id): id is string => Boolean(id));
    await notifyUsers(tx, recipients, ticket.id, "QUESTION", "Neue Terminoptionen benötigt", `${ticket.number}: ${reason || "Mieter kann keinen Termin wahrnehmen."}`);
  });
}

export async function cancelConfirmedAppointment({
  user,
  ticketId,
  reason,
  noShow = false
}: {
  user: SessionUser;
  ticketId: string;
  reason: string;
  noShow?: boolean;
}) {
  if (!reason.trim()) throw new Error("Bitte einen Grund angeben.");
  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    const appointment = await tx.appointment.findFirst({ where: { ticketId: ticket.id, status: "CONFIRMED" } });
    if (!appointment) throw new Error("Es gibt keinen bestätigten Termin.");
    if (noShow && user.role !== "HAUSVERWALTER") throw new Error("Nichterscheinen kann nur die Hausverwaltung erfassen.");
    await tx.appointment.update({
      where: { id: appointment.id },
      data: noShow
        ? { status: "NO_SHOW", noShowAt: new Date(), cancellationReason: reason.trim() }
        : { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: reason.trim() }
    });
    await tx.ticket.update({ where: { id: ticket.id }, data: { status: "TERMINABSTIMMUNG", appointmentAt: null, appointmentConfirmedAt: null, reviewRequired: noShow, reviewReason: noShow ? reason.trim() : null } });
    await recordStatus(tx, ticket, "TERMINABSTIMMUNG", user.id, `${noShow ? "Nichterscheinen" : "Termin abgesagt"}: ${reason.trim()}`);
    await notifyTicketParticipants(tx, ticket, user.id, "STATUS_CHANGED", noShow ? "Nichterscheinen erfasst" : "Termin abgesagt", `${ticket.number}: Neue Terminabstimmung erforderlich.`);
  });
}

export async function confirmPublicAppointment({ token, appointmentId }: { token: string; appointmentId: string }) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({
      where: {
        AND: [
          { OR: [{ publicTokenHash: hashToken(token) }, { publicToken: token }] },
          { OR: [{ publicTokenExpiresAt: null }, { publicTokenExpiresAt: { gt: new Date() } }] }
        ],
        publicTokenRevokedAt: null
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    if (!ticket || !ticket.reportedWithoutLogin) throw new Error("Der öffentliche Vorgang wurde nicht gefunden.");
    const appointment = await tx.appointment.findFirst({
      where: { id: appointmentId, ticketId: ticket.id, status: "PROPOSED" }
    });
    if (!appointment) throw new Error("Das Terminfenster ist nicht mehr verfügbar.");

    await tx.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await tx.appointment.updateMany({
      where: { ticketId: ticket.id, id: { not: appointment.id }, status: "PROPOSED" },
      data: { status: "DECLINED" }
    });
    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "TERMIN_BESTAETIGT", appointmentAt: appointment.startsAt, appointmentConfirmedAt: new Date() },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, ticket, "TERMIN_BESTAETIGT", undefined, "Termin über den sicheren Vorgangslink bestätigt.");
    await addSystemMessage(tx, ticket.id, "Der Mieter hat ein Terminfenster direkt bestätigt.");
    await notifyUsers(tx, visibleParticipantIds(updated), ticket.id, "APPOINTMENT_CONFIRMED", "Termin bestätigt", `${ticket.number}: Termin wurde bestätigt.`);
    await runAutomations(tx, updated);
    return updated;
  });
}

export async function confirmPublicCompletion({
  token,
  score,
  comment
}: {
  token: string;
  score: number;
  comment?: string;
}) {
  if (score < 3) throw new Error("Bitte nutzen Sie 'Problem besteht weiter', damit der Vorgang erneut geöffnet wird.");
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({
      where: {
        AND: [
          { OR: [{ publicTokenHash: hashToken(token) }, { publicToken: token }] },
          { OR: [{ publicTokenExpiresAt: null }, { publicTokenExpiresAt: { gt: new Date() } }] }
        ],
        publicTokenRevokedAt: null
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    if (!ticket || !ticket.reportedWithoutLogin) throw new Error("Der öffentliche Vorgang wurde nicht gefunden.");
    if (ticket.status !== "ERLEDIGT") throw new Error("Die Reparatur ist noch nicht zur Bestätigung freigegeben.");

    await tx.rating.create({
      data: { ticketId: ticket.id, tenantId: ticket.tenantId, providerId: ticket.assignedProviderId, score, comment }
    });
    const tenantConfirmed = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "VOM_MIETER_BESTAETIGT", tenantConfirmedAt: new Date() },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, ticket, "VOM_MIETER_BESTAETIGT", undefined, "Mieter hat über den sicheren Vorgangslink bestätigt.");
    const closed = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "ABGESCHLOSSEN", archivedAt: new Date(), reviewRequired: false, reviewReason: null },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, tenantConfirmed, "ABGESCHLOSSEN", undefined, "Autopilot hat den bestätigten Vorgang archiviert.");
    await addSystemMessage(tx, ticket.id, "Mieterbestätigung erhalten. Der Vorgang ist vollständig abgeschlossen.");
    await notifyUsers(tx, visibleParticipantIds(closed), ticket.id, "FEEDBACK_RECEIVED", "Vorgang abgeschlossen", `${ticket.number}: Erledigung wurde bestätigt.`);
    return closed;
  });
}

export async function reopenPublicTicket({ token, reason }: { token: string; reason: string }) {
  if (reason.trim().length < 10) throw new Error("Bitte beschreiben Sie kurz, was noch nicht behoben ist.");
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findFirst({
      where: {
        AND: [
          { OR: [{ publicTokenHash: hashToken(token) }, { publicToken: token }] },
          { OR: [{ publicTokenExpiresAt: null }, { publicTokenExpiresAt: { gt: new Date() } }] }
        ],
        publicTokenRevokedAt: null,
        reportedWithoutLogin: true
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    if (!ticket) throw new Error("Der öffentliche Vorgang wurde nicht gefunden.");
    if (!["ERLEDIGT", "VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(ticket.status)) {
      throw new Error("Dieser Vorgang kann im aktuellen Status nicht erneut geöffnet werden.");
    }
    const detail = reason.trim();
    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "PRUEFUNG_ERFORDERLICH",
        reopenedCount: { increment: 1 },
        warrantySuspected: true,
        reviewRequired: true,
        reviewReason: `Mieter meldet Problem nach Ausführung erneut: ${detail}`,
        archivedAt: null,
        tenantConfirmedAt: null
      },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, ticket, "PRUEFUNG_ERFORDERLICH", undefined, detail);
    await addSystemMessage(tx, ticket.id, `Gewährleistungsprüfung über sicheren Vorgangslink: ${detail}`);
    await notifyUsers(tx, [ticket.managerId], ticket.id, "QUESTION", "Gewährleistungsfall prüfen", `${ticket.number}: Problem besteht weiter.`);
    await tx.auditLog.create({
      data: {
        organizationId: ticket.organizationId,
        ticketId: ticket.id,
        actorType: "TENANT_LINK",
        action: "TICKET_REOPENED",
        reason: detail,
        metadata: { reopenedCount: ticket.reopenedCount + 1 }
      }
    });
    return updated;
  });
}

export async function processOperationalReminders(organizationId: string) {
  const now = new Date();
  const settings = await getOrganizationSettings(organizationId);
  const reminderBoundary = new Date(now.getTime() + settings.appointmentReminderHours * 60 * 60 * 1000);
  const tickets = await prisma.ticket.findMany({
    where: { organizationId, status: { in: activeStatuses } },
    include: {
      tenant: true,
      manager: true,
      assignedProvider: { include: { user: true } },
      property: true,
      unit: true,
      automations: true
    }
  });

  let created = 0;
  for (const ticket of tickets) {
    const automationTypes = new Set(ticket.automations.map((entry) => entry.type));
    const ageHours = (now.getTime() - ticket.updatedAt.getTime()) / 3_600_000;
    if (ticket.status === "DIENSTLEISTER_ANGEFRAGT" && ageHours >= settings.providerResponseHours && !automationTypes.has("PROVIDER_RESPONSE_REMINDER")) {
      const canReplace =
        settings.autopilotEnabled &&
        ["NIEDRIG", "NORMAL"].includes(ticket.priority) &&
        Number(ticket.approvedCostLimit ?? 0) <= Number(settings.highCostThreshold);
      const alternatives = canReplace
        ? await prisma.serviceProvider.findMany({
            where: {
              organizationId,
              status: "ACTIVE",
              id: { not: ticket.assignedProviderId ?? undefined }
            },
            include: {
              trades: { include: { trade: true } },
              properties: true,
              assignedTickets: {
                select: {
                  propertyId: true,
                  providerRequestedAt: true,
                  providerAcceptedAt: true,
                  completedAt: true,
                  dueDate: true,
                  finalCost: true,
                  approvedCostLimit: true,
                  reopenedCount: true,
                  ratings: { select: { score: true } }
                },
                take: 50,
                orderBy: { createdAt: "desc" }
              },
              _count: { select: { assignedTickets: { where: { status: { in: activeStatuses } } } } }
            }
          })
        : [];
      const replacement = rankProviders(alternatives, ticket.category, ticket.propertyId).find((provider) => provider.tradeMatch);
      await prisma.$transaction(async (tx) => {
        if (replacement) {
          const generated = createOpaqueToken();
          await tx.providerAccess.updateMany({ where: { ticketId: ticket.id, revokedAt: null }, data: { revokedAt: now } });
          await tx.providerAccess.create({
            data: {
              organizationId,
              ticketId: ticket.id,
              providerId: replacement.id,
              tokenHash: generated.tokenHash,
              tokenHint: generated.tokenHint,
              allowedActions: Object.values(AccessAction),
              expiresAt: expiresInHours(24 * 14)
            }
          });
          await tx.ticket.update({
            where: { id: ticket.id },
            data: { assignedProviderId: replacement.id, providerRequestedAt: now }
          });
          await tx.message.create({
            data: { ticketId: ticket.id, kind: "SYSTEM", body: `Autopilot: ${replacement.companyName} wurde nach überschrittener Reaktionsfrist als Ersatzbetrieb angefragt. ${replacement.reasons.join(" · ")}` }
          });
          if (replacement.email) {
            await queueOutboundMessage(tx, {
              organizationId,
              ticketId: ticket.id,
              recipient: replacement.email,
              subject: `Auftragsanfrage ${ticket.number}`,
              body: [
                `${ticket.number}: ${ticket.title}`,
                `Auftraggeber: ${ticket.property.name}`,
                `Einsatzort: ${ticket.property.address}, Einheit ${ticket.unit.label}, ${ticket.room}`,
                `Mieter: ${ticket.tenant.name} (${ticket.tenant.phone ?? ticket.tenant.email})`,
                `Beschreibung: ${ticket.description}`,
                `Sicherer Link für Auftragsentscheidung, Terminvorschläge und Dokumentation:`,
                appUrl(`/auftrag/${generated.token}`)
              ].join("\n\n"),
              eventKey: `provider-replacement:${replacement.id}:${ticket.providerRequestedAt?.toISOString() ?? ticket.updatedAt.toISOString()}`
            });
          }
          await tx.auditLog.create({
            data: {
              organizationId,
              ticketId: ticket.id,
              actorType: "SYSTEM",
              action: "PROVIDER_AUTO_REPLACED",
              reason: `Reaktionsfrist von ${settings.providerResponseHours} Stunden überschritten; Ersatz nach Matching gewählt.`,
              metadata: { previousProviderId: ticket.assignedProviderId, replacementProviderId: replacement.id, score: replacement.score }
            }
          });
        }
        await tx.automationLog.create({ data: { ticketId: ticket.id, type: "PROVIDER_RESPONSE_REMINDER", message: replacement ? "Ersatzdienstleister automatisch angefragt." : `Nach ${settings.providerResponseHours} Stunden automatisch eskaliert.` } });
        await notifyUsers(tx, [ticket.managerId, ticket.tenantId], ticket.id, "REMINDER", replacement ? "Ersatzdienstleister angefragt" : "Auftragsanfrage unbeantwortet", `${ticket.number}: ${replacement ? replacement.companyName : "Bitte manuell eskalieren."}`);
      });
      created += 1;
    }
    if (ticket.appointmentAt && ticket.appointmentAt > now && ticket.appointmentAt <= reminderBoundary && !automationTypes.has("APPOINTMENT_REMINDER")) {
      await prisma.$transaction(async (tx) => {
        await tx.automationLog.create({ data: { ticketId: ticket.id, type: "APPOINTMENT_REMINDER", message: `Alle Beteiligten ${settings.appointmentReminderHours} Stunden vor dem Termin erinnert.` } });
        await notifyUsers(tx, visibleParticipantIds(ticket), ticket.id, "REMINDER", "Termin steht bevor", `${ticket.number}: Der bestätigte Termin findet innerhalb der nächsten ${settings.appointmentReminderHours} Stunden statt.`);
      });
      created += 1;
    }
  }
  await deliverPendingOutboundMessages(organizationId);
  return created;
}

export async function closeTicket({ user, ticketId }: { user: SessionUser; ticketId: string }) {
  ensureRole(user.role, ["HAUSVERWALTER"]);

  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    if (ticket.status !== "VOM_MIETER_BESTAETIGT") {
      throw new Error("Das Ticket kann erst nach Bestätigung durch den Mieter abgeschlossen werden.");
    }
    const updated = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "ABGESCHLOSSEN", archivedAt: new Date() },
      include: { tenant: true, manager: true, assignedProvider: { include: { user: true } } }
    });
    await recordStatus(tx, ticket, "ABGESCHLOSSEN", user.id, "Ticket abgeschlossen und archiviert.");
    await addSystemMessage(tx, ticket.id, "Das Ticket wurde abgeschlossen und archiviert.");
    await notifyTicketParticipants(tx, updated, user.id, "STATUS_CHANGED", "Ticket abgeschlossen", `${ticket.number} wurde archiviert.`);
    return updated;
  });
}

export async function addTicketMessage({
  user,
  ticketId,
  body
}: {
  user: SessionUser;
  ticketId: string;
  body: string;
}) {
  return prisma.$transaction(async (tx) => {
    const ticket = await getTicketForUpdate(tx, ticketId, user);
    const message = await tx.message.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        kind: "MESSAGE",
        body
      }
    });
    await notifyTicketParticipants(tx, ticket, user.id, "NEW_MESSAGE", "Neue Nachricht", `${ticket.number}: ${body.slice(0, 80)}`);
    return message;
  });
}

export async function addInternalNote({ user, ticketId, body }: { user: SessionUser; ticketId: string; body: string }) {
  ensureRole(user.role, ["HAUSVERWALTER"]);
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, organizationId: user.organizationId }
  });
  if (!ticket) throw new Error("Ticket nicht gefunden.");

  return prisma.internalNote.create({
    data: {
      ticketId,
      authorId: user.id,
      body
    }
  });
}

export async function markAllNotificationsRead(user: SessionUser) {
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() }
  });
  revalidatePath("/benachrichtigungen");
}

export async function markNotificationRead(user: SessionUser, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { readAt: new Date() }
  });
  revalidatePath("/benachrichtigungen");
}

export function visibleParticipantIds(ticket: TicketWithActors) {
  return [
    ticket.tenantId,
    ticket.managerId,
    ticket.assignedProvider?.userId ?? null
  ].filter((id): id is string => Boolean(id));
}

async function nextTicketNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const count = await tx.ticket.count({
    where: {
      number: {
        startsWith: `OC-${year}-`
      }
    }
  });
  return `OC-${year}-${String(count + 1).padStart(4, "0")}`;
}

async function getTicketForUpdate(tx: Prisma.TransactionClient, ticketId: string, user: SessionUser) {
  const ticket = await tx.ticket.findUnique({
    where: { id: ticketId },
    include: {
      tenant: true,
      manager: true,
      assignedProvider: { include: { user: true } }
    }
  });
  if (!ticket || !canViewTicket(user, ticket)) throw new Error("Ticket nicht gefunden oder Zugriff verweigert.");
  return ticket;
}

function ensureRole(role: Role, allowed: Role[]) {
  if (!allowed.includes(role)) throw new Error("Für diese Aktion fehlt die Berechtigung.");
}

function ensureStatusAllowed(user: SessionUser, ticket: TicketWithActors, status: TicketStatus) {
  if (
    user.role === "DIENSTLEISTER" &&
    Boolean(ticket.assignedProviderId && providerIdsForUser(user).includes(ticket.assignedProviderId)) &&
    ticket.status === "IN_BEARBEITUNG" &&
    status === "IN_BEARBEITUNG"
  ) {
    return;
  }
  if (!canTransition(ticket.status, status)) {
    throw new Error(`Statuswechsel von ${STATUS_LABELS[ticket.status]} zu ${STATUS_LABELS[status]} ist nicht vorgesehen.`);
  }
  if (user.role === "HAUSVERWALTER") return;
  if (user.role === "DIENSTLEISTER") {
    const allowed: TicketStatus[] = ["IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL"];
    if (ticket.assignedProviderId && providerIdsForUser(user).includes(ticket.assignedProviderId) && allowed.includes(status)) return;
  }
  throw new Error("Für diesen Statuswechsel fehlt die Berechtigung.");
}

function canSeeDocument(role: Role, visibility: DocumentVisibility) {
  if (visibility === "ALL") return true;
  if (visibility === "MANAGER_ONLY") return role === "HAUSVERWALTER";
  if (visibility === "TENANT") return role === "MIETER" || role === "HAUSVERWALTER";
  return role === "DIENSTLEISTER" || role === "HAUSVERWALTER";
}

async function recordStatus(
  tx: Prisma.TransactionClient,
  ticket: { id: string; status: TicketStatus },
  toStatus: TicketStatus,
  changedById?: string,
  note?: string
) {
  await tx.statusHistory.create({
    data: {
      ticketId: ticket.id,
      fromStatus: ticket.status,
      toStatus,
      changedById,
      note
    }
  });
}

async function addSystemMessage(tx: Prisma.TransactionClient, ticketId: string, body: string) {
  await tx.message.create({
    data: {
      ticketId,
      kind: "SYSTEM",
      body
    }
  });
}

async function notifyUsers(
  tx: Prisma.TransactionClient,
  userIds: string[],
  ticketId: string,
  type: NotificationType,
  title: string,
  body: string
) {
  const uniqueUserIds = [...new Set(userIds)];
  if (!uniqueUserIds.length) return;
  await tx.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      ticketId,
      type,
      title,
      body,
      href: `/tickets/${ticketId}`
    }))
  });
}

async function notifyTicketParticipants(
  tx: Prisma.TransactionClient,
  ticket: TicketWithActors,
  actorId: string | null,
  type: NotificationType,
  title: string,
  body: string
) {
  await notifyUsers(
    tx,
    visibleParticipantIds(ticket).filter((userId) => userId !== actorId),
    ticket.id,
    type,
    title,
    body
  );
}

async function runAutomations(tx: Prisma.TransactionClient, ticket: TicketWithActors) {
  const messages: Array<{ type: Prisma.AutomationLogCreateInput["type"]; message: string }> = [];
  if (ticket.priority === "NOTFALL") {
    messages.push({ type: "EMERGENCY_WARNING", message: "Notfallticket sofort im Dashboard hervorheben." });
  }
  if (ticket.category === "WASSER" && ticket.priority === "NOTFALL") {
    messages.push({ type: "EMERGENCY_WARNING", message: "Wasser-Notfall rot kennzeichnen und Sanitärdienst vorschlagen." });
  }
  if (activeStatuses.includes(ticket.status) && ticket.dueDate.getTime() < Date.now()) {
    messages.push({ type: "OVERDUE_WARNING", message: "Ticket ist überfällig." });
    await notifyUsers(tx, [ticket.managerId], ticket.id, "OVERDUE", "Vorgang überfällig", `${ticket.number}: ${ticket.title}`);
  }
  if (ticket.status === "ERLEDIGT") {
    messages.push({ type: "FEEDBACK_REQUEST", message: "Mieter automatisch zur Bewertung auffordern." });
  }
  if (ticket.status === "ABGESCHLOSSEN") {
    messages.push({ type: "AUTO_ARCHIVE", message: "Abgeschlossenes Ticket für Archivierung markieren." });
  }
  messages.push({
    type: "STATUS_MESSAGE",
    message: `Nächste sinnvolle Aktion: ${nextBestAction(ticket)}`
  });

  if (messages.length) {
    await tx.automationLog.createMany({
      data: messages.map((entry) => ({
        ticketId: ticket.id,
        type: entry.type,
        message: entry.message
      }))
    });
  }
}
