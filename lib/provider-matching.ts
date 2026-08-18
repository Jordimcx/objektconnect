import type { TicketCategory } from "@prisma/client";

export type ProviderCandidate = {
  id: string;
  companyName: string;
  email?: string;
  rating: number;
  averageResponseHours: number;
  availability: string;
  trades: Array<{ trade: { name: string; category: TicketCategory } }>;
  properties: Array<{ propertyId: string }>;
  _count: { assignedTickets: number };
  assignedTickets?: Array<{
    propertyId: string;
    providerRequestedAt: Date | null;
    providerAcceptedAt: Date | null;
    completedAt: Date | null;
    dueDate: Date;
    finalCost: unknown;
    approvedCostLimit: unknown;
    reopenedCount: number;
    ratings: Array<{ score: number }>;
  }>;
};

export type RankedProvider = ProviderCandidate & {
  score: number;
  tradeMatch: boolean;
  reasons: string[];
};

export function rankProviders(
  providers: ProviderCandidate[],
  category: TicketCategory,
  propertyId: string
): RankedProvider[] {
  return providers
    .map((provider) => {
      const trade = provider.trades.find((entry) => entry.trade.category === category);
      const propertyMatch = provider.properties.some((entry) => entry.propertyId === propertyId);
      const workloadScore = Math.max(0, 10 - provider._count.assignedTickets * 2);
      const history = provider.assignedTickets ?? [];
      const responseHours = history
        .filter((ticket) => ticket.providerRequestedAt && ticket.providerAcceptedAt)
        .map((ticket) => (ticket.providerAcceptedAt!.getTime() - ticket.providerRequestedAt!.getTime()) / 3_600_000);
      const measuredResponse = responseHours.length ? average(responseHours) : provider.averageResponseHours;
      const completed = history.filter((ticket) => ticket.completedAt);
      const onTimeRate = completed.length
        ? completed.filter((ticket) => ticket.completedAt! <= ticket.dueDate).length / completed.length
        : 1;
      const firstSolveRate = completed.length
        ? completed.filter((ticket) => ticket.reopenedCount === 0).length / completed.length
        : 1;
      const costComparable = completed.filter((ticket) => ticket.finalCost != null && ticket.approvedCostLimit != null);
      const costDiscipline = costComparable.length
        ? costComparable.filter((ticket) => Number(ticket.finalCost) <= Number(ticket.approvedCostLimit)).length / costComparable.length
        : 1;
      const ratingValues = history.flatMap((ticket) => ticket.ratings.map((rating) => rating.score));
      const measuredQuality = ratingValues.length ? average(ratingValues) : provider.rating;
      const propertyExperience = history.filter((ticket) => ticket.propertyId === propertyId).length;
      const performanceScore = onTimeRate * 12 + firstSolveRate * 12 + costDiscipline * 8 + measuredQuality * 3;
      const score =
        (trade ? 45 : 0) +
        (propertyMatch ? 12 : 0) +
        Math.min(8, propertyExperience * 2) +
        Math.max(0, 16 - measuredResponse) +
        workloadScore +
        performanceScore;
      const reasons = [
        trade ? `Passendes Gewerk: ${trade.trade.name}` : "Kein direkt passendes Gewerk hinterlegt",
        propertyMatch ? "Für dieses Objekt freigegeben" : "Noch nicht objektspezifisch hinterlegt",
        `${measuredQuality.toFixed(1)} Qualität`,
        `Ø ${measuredResponse.toFixed(1)} Std. Reaktionszeit`,
        `${Math.round(onTimeRate * 100)} % Termintreue`,
        `${Math.round(firstSolveRate * 100)} % Erstlösungsquote`,
        `${Math.round(costDiscipline * 100)} % im Kostenrahmen`,
        `${provider._count.assignedTickets} laufende Aufträge`,
        `${propertyExperience} Erfahrungen am Objekt`
      ];

      return { ...provider, score: Math.round(score), tradeMatch: Boolean(trade), reasons };
    })
    .sort((left, right) => right.score - left.score || left.companyName.localeCompare(right.companyName));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
