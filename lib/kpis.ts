import type { SessionUser } from "@/lib/permissions";
import { ticketWhereForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type KpiTicket = Awaited<ReturnType<typeof loadTickets>>[number];

export async function getOperationalKpis(user: SessionUser) {
  const tickets = await loadTickets(user);
  return calculateOperationalKpis(tickets);
}

async function loadTickets(user: SessionUser) {
  return prisma.ticket.findMany({
    where: ticketWhereForUser(user),
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      category: true,
      priority: true,
      createdAt: true,
      archivedAt: true,
      autoQualifiedAt: true,
      autoDispatchedAt: true,
      providerRequestedAt: true,
      providerAcceptedAt: true,
      appointmentConfirmedAt: true,
      workStartedAt: true,
      completedAt: true,
      tenantConfirmedAt: true,
      approvedCostLimit: true,
      finalCost: true,
      reviewRequired: true,
      reviewReason: true,
      reopenedCount: true,
      relatedTicketId: true,
      warrantySuspected: true,
      incidentKey: true,
      property: { select: { id: true, name: true } },
      assignedProvider: { select: { id: true, companyName: true } },
      relatedTicket: { select: { createdAt: true } },
      appointments: { select: { status: true } },
      invoices: { select: { status: true, risk: true, amount: true } },
      ratings: { select: { score: true } },
      statusHistory: { select: { toStatus: true } }
    },
    orderBy: { createdAt: "desc" }
  });
}

export function calculateOperationalKpis(tickets: KpiTicket[]) {
  const completed = tickets.filter((ticket) => ticket.completedAt);
  const invoices = tickets.flatMap((ticket) => ticket.invoices);
  const appointments = tickets.flatMap((ticket) => ticket.appointments);
  const comparableCosts = completed.filter(
    (ticket) => Number(ticket.approvedCostLimit ?? 0) > 0 && ticket.finalCost != null
  );
  const exceptions = tickets.filter(
    (ticket) =>
      ticket.reviewRequired ||
      ticket.statusHistory.some((history) => history.toStatus === "PRUEFUNG_ERFORDERLICH") ||
      ticket.invoices.some((invoice) => ["HIGH", "CRITICAL"].includes(invoice.risk))
  );

  const durations = [
    durationMetric("Meldung bis Prüfung", tickets, "createdAt", "autoQualifiedAt"),
    durationMetric("Prüfung bis Beauftragung", tickets, "autoQualifiedAt", "providerRequestedAt"),
    durationMetric("Beauftragung bis Annahme", tickets, "providerRequestedAt", "providerAcceptedAt"),
    durationMetric("Annahme bis Termin", tickets, "providerAcceptedAt", "appointmentConfirmedAt"),
    durationMetric("Termin bis Arbeitsbeginn", tickets, "appointmentConfirmedAt", "workStartedAt"),
    durationMetric("Arbeitsbeginn bis Abschluss", tickets, "workStartedAt", "completedAt"),
    durationMetric("Abschluss bis Mieterbestätigung", tickets, "completedAt", "tenantConfirmedAt")
  ];

  const propertyMap = new Map<string, {
    id: string;
    name: string;
    total: number;
    open: number;
    exceptions: number;
    repeatCases: number;
    cost: number;
    incidentCases: number;
  }>();
  for (const ticket of tickets) {
    const current = propertyMap.get(ticket.property.id) ?? {
      id: ticket.property.id,
      name: ticket.property.name,
      total: 0,
      open: 0,
      exceptions: 0,
      repeatCases: 0,
      cost: 0,
      incidentCases: 0
    };
    current.total += 1;
    current.open += ticket.archivedAt ? 0 : 1;
    current.exceptions += exceptions.some((entry) => entry.id === ticket.id) ? 1 : 0;
    current.repeatCases += ticket.relatedTicketId ? 1 : 0;
    current.cost += Number(ticket.finalCost ?? 0);
    current.incidentCases += ticket.incidentKey ? 1 : 0;
    propertyMap.set(ticket.property.id, current);
  }

  const providerMap = new Map<string, {
    id: string;
    name: string;
    jobs: number;
    completed: number;
    firstSolved: number;
    ratings: number[];
    responseHours: number[];
  }>();
  for (const ticket of tickets) {
    if (!ticket.assignedProvider) continue;
    const current = providerMap.get(ticket.assignedProvider.id) ?? {
      id: ticket.assignedProvider.id,
      name: ticket.assignedProvider.companyName,
      jobs: 0,
      completed: 0,
      firstSolved: 0,
      ratings: [],
      responseHours: []
    };
    current.jobs += 1;
    if (ticket.completedAt) {
      current.completed += 1;
      current.firstSolved += ticket.reopenedCount === 0 ? 1 : 0;
    }
    current.ratings.push(...ticket.ratings.map((rating) => rating.score));
    if (ticket.providerRequestedAt && ticket.providerAcceptedAt) {
      current.responseHours.push(hoursBetween(ticket.providerRequestedAt, ticket.providerAcceptedAt));
    }
    providerMap.set(ticket.assignedProvider.id, current);
  }

  return {
    total: tickets.length,
    closed: tickets.filter((ticket) => ticket.archivedAt).length,
    autoQualificationRate: rate(tickets.filter((ticket) => ticket.autoQualifiedAt).length, tickets.length),
    autoDispatchRate: rate(tickets.filter((ticket) => ticket.autoDispatchedAt).length, tickets.length),
    firstSolveRate: rate(completed.filter((ticket) => ticket.reopenedCount === 0).length, completed.length),
    reopenRate: rate(tickets.filter((ticket) => ticket.reopenedCount > 0).length, completed.length),
    cancellationRate: rate(appointments.filter((appointment) => appointment.status === "CANCELLED").length, appointments.length),
    noShowRate: rate(appointments.filter((appointment) => appointment.status === "NO_SHOW").length, appointments.length),
    invoiceMatchRate: rate(
      invoices.filter((invoice) => ["MATCHED", "APPROVED"].includes(invoice.status)).length,
      invoices.length
    ),
    exceptionRate: rate(exceptions.length, tickets.length),
    repeat90Rate: rate(
      tickets.filter((ticket) => ticket.relatedTicket && daysBetween(ticket.relatedTicket.createdAt, ticket.createdAt) <= 90).length,
      tickets.length
    ),
    repeat180Rate: rate(tickets.filter((ticket) => ticket.relatedTicketId).length, tickets.length),
    averageCostDeviation: comparableCosts.length
      ? comparableCosts.reduce(
          (sum, ticket) => sum + ((Number(ticket.finalCost) - Number(ticket.approvedCostLimit)) / Number(ticket.approvedCostLimit)) * 100,
          0
        ) / comparableCosts.length
      : 0,
    durations,
    properties: [...propertyMap.values()].sort((left, right) => right.exceptions - left.exceptions || right.open - left.open),
    providers: [...providerMap.values()]
      .map((provider) => ({
        id: provider.id,
        name: provider.name,
        jobs: provider.jobs,
        firstSolveRate: rate(provider.firstSolved, provider.completed),
        rating: average(provider.ratings),
        responseHours: average(provider.responseHours)
      }))
      .sort((left, right) => right.firstSolveRate - left.firstSolveRate || right.rating - left.rating),
    exceptions: exceptions.slice(0, 8).map((ticket) => ({
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      property: ticket.property.name,
      reason: ticket.reviewReason ?? (ticket.incidentKey ? "Sammelstörung erkannt" : "Manuelle Prüfung erforderlich")
    }))
  };
}

function durationMetric(
  label: string,
  tickets: KpiTicket[],
  from: keyof Pick<KpiTicket, "createdAt" | "autoQualifiedAt" | "providerRequestedAt" | "providerAcceptedAt" | "appointmentConfirmedAt" | "workStartedAt" | "completedAt">,
  to: keyof Pick<KpiTicket, "autoQualifiedAt" | "providerRequestedAt" | "providerAcceptedAt" | "appointmentConfirmedAt" | "workStartedAt" | "completedAt" | "tenantConfirmedAt">
) {
  const values = tickets.flatMap((ticket) => {
    const start = ticket[from];
    const end = ticket[to];
    return start instanceof Date && end instanceof Date && end >= start ? [hoursBetween(start, end)] : [];
  });
  return { label, hours: average(values), samples: values.length };
}

function rate(value: number, total: number) {
  return total ? (value / total) * 100 : 0;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function hoursBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

function daysBetween(from: Date, to: Date) {
  return hoursBetween(from, to) / 24;
}
