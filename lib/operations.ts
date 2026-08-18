import type { TicketPriority, TicketStatus } from "@prisma/client";

const closedStatuses: TicketStatus[] = ["ABGESCHLOSSEN", "ABGELEHNT"];

export type DispatchStrategyValue = "AUTO_ORDER" | "REVIEW_FIRST" | "QUOTE_FIRST";

export function resolveDispatchDecision(input: {
  qualified: boolean;
  autopilotEnabled: boolean;
  dispatchStrategy: DispatchStrategyValue;
}) {
  if (!input.qualified) return { mode: "REVIEW" as const, shouldContactProvider: false };
  if (!input.autopilotEnabled || input.dispatchStrategy === "REVIEW_FIRST") {
    return { mode: "REVIEW" as const, shouldContactProvider: false };
  }
  if (input.dispatchStrategy === "QUOTE_FIRST") {
    return { mode: "QUOTE_REQUEST" as const, shouldContactProvider: true };
  }
  return { mode: "WORK_ORDER" as const, shouldContactProvider: true };
}

export type OperationalException = {
  severity: "critical" | "high" | "medium";
  title: string;
  reason: string;
  action: string;
};

export function canAutoDispatch(input: {
  priority: TicketPriority;
  missingFields: string[];
  hasMatchingProvider: boolean;
  possibleDuplicate: boolean;
}) {
  if (input.priority === "NOTFALL" || input.priority === "HOCH") {
    return { eligible: false, reason: "Dringlichkeit muss von der Hausverwaltung bestätigt werden." };
  }
  if (input.missingFields.length) {
    return { eligible: false, reason: `Angaben fehlen: ${input.missingFields.join(", ")}.` };
  }
  if (input.possibleDuplicate) {
    return { eligible: false, reason: "Mögliche Sammelstörung oder Doppelmeldung erkannt." };
  }
  if (!input.hasMatchingProvider) {
    return { eligible: false, reason: "Kein passender, freigegebener Dienstleister gefunden." };
  }
  return { eligible: true, reason: "Vollständiger Routinefall mit passendem Dienstleister." };
}

export function needsCostApproval(finalCost: number, approvedCostLimit?: number | null) {
  return approvedCostLimit == null || finalCost > approvedCostLimit;
}

export function getOperationalException(
  ticket: {
    status: TicketStatus;
    priority: TicketPriority;
    reviewRequired: boolean;
    reviewReason: string | null;
    assignedProviderId: string | null;
    dueDate: Date;
    updatedAt: Date;
  },
  now = new Date()
): OperationalException | null {
  if (closedStatuses.includes(ticket.status)) return null;
  if (ticket.priority === "NOTFALL") {
    return {
      severity: "critical",
      title: "Notfall sofort entscheiden",
      reason: ticket.reviewReason ?? "Notfallmeldung benötigt eine kontrollierte Freigabe.",
      action: "Notfall prüfen"
    };
  }
  if (ticket.status === "WARTEN_AUF_FREIGABE") {
    return {
      severity: "high",
      title: "Kostenfreigabe erforderlich",
      reason: ticket.reviewReason ?? "Die gemeldeten Kosten liegen außerhalb des freigegebenen Rahmens.",
      action: "Kosten prüfen"
    };
  }
  if (ticket.reviewRequired) {
    return {
      severity: "high",
      title: "Entscheidung erforderlich",
      reason: ticket.reviewReason ?? "Der Autopilot benötigt eine Bestätigung.",
      action: "Vorgang prüfen"
    };
  }
  const hoursSinceUpdate = (now.getTime() - ticket.updatedAt.getTime()) / 3_600_000;
  if (ticket.status === "DIENSTLEISTER_ANGEFRAGT" && hoursSinceUpdate >= 24) {
    return {
      severity: "high",
      title: "Dienstleister reagiert nicht",
      reason: "Die Auftragsanfrage ist seit mindestens 24 Stunden unbeantwortet.",
      action: "Eskalieren"
    };
  }
  if (ticket.dueDate.getTime() < now.getTime()) {
    return {
      severity: "high",
      title: "Vorgang überfällig",
      reason: "Das vereinbarte Fälligkeitsdatum ist überschritten.",
      action: "Weiterbearbeitung klären"
    };
  }
  if (ticket.status === "WARTEN_AUF_MATERIAL") {
    return {
      severity: "medium",
      title: "Material verzögert den Auftrag",
      reason: "Der Dienstleister wartet auf Material; der weitere Termin sollte überwacht werden.",
      action: "Lieferstatus prüfen"
    };
  }
  if (!ticket.assignedProviderId && !["NEU", "PRUEFUNG_ERFORDERLICH", "RUECKFRAGE_AN_MIETER"].includes(ticket.status)) {
    return {
      severity: "medium",
      title: "Kein Dienstleister zugewiesen",
      reason: "Der Vorgang kann ohne ausführenden Betrieb nicht weiterlaufen.",
      action: "Dienstleister wählen"
    };
  }
  return null;
}
