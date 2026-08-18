import { describe, expect, it } from "vitest";
import { canAutoDispatch, getOperationalException, needsCostApproval, resolveDispatchDecision } from "@/lib/operations";
import { rankProviders } from "@/lib/provider-matching";

describe("ObjektConnect Autopilot", () => {
  it("gibt vollständige Routinefälle automatisch frei", () => {
    expect(
      canAutoDispatch({ priority: "NORMAL", missingFields: [], hasMatchingProvider: true, possibleDuplicate: false })
    ).toEqual({ eligible: true, reason: "Vollständiger Routinefall mit passendem Dienstleister." });
  });

  it("hält Notfälle und Doppelmeldungen zur Prüfung zurück", () => {
    expect(canAutoDispatch({ priority: "NOTFALL", missingFields: [], hasMatchingProvider: true, possibleDuplicate: false }).eligible).toBe(false);
    expect(canAutoDispatch({ priority: "NORMAL", missingFields: [], hasMatchingProvider: true, possibleDuplicate: true }).eligible).toBe(false);
  });

  it("fordert eine Freigabe oberhalb des Kostenrahmens", () => {
    expect(needsCostApproval(320, 250)).toBe(true);
    expect(needsCostApproval(220, 250)).toBe(false);
  });

  it("beauftragt qualifizierte Routinefälle im Vollautomatik-Modus", () => {
    expect(resolveDispatchDecision({ qualified: true, autopilotEnabled: true, dispatchStrategy: "AUTO_ORDER" })).toEqual({
      mode: "WORK_ORDER",
      shouldContactProvider: true
    });
  });

  it("bereitet Vorgänge im Kontrollmodus nur zur Freigabe vor", () => {
    expect(resolveDispatchDecision({ qualified: true, autopilotEnabled: true, dispatchStrategy: "REVIEW_FIRST" })).toEqual({
      mode: "REVIEW",
      shouldContactProvider: false
    });
  });

  it("fordert im Angebotsmodus automatisch ein Angebot an", () => {
    expect(resolveDispatchDecision({ qualified: true, autopilotEnabled: true, dispatchStrategy: "QUOTE_FIRST" })).toEqual({
      mode: "QUOTE_REQUEST",
      shouldContactProvider: true
    });
    expect(resolveDispatchDecision({ qualified: false, autopilotEnabled: true, dispatchStrategy: "QUOTE_FIRST" }).mode).toBe("REVIEW");
  });

  it("priorisiert passendes Gewerk, Objektkenntnis und Reaktionszeit", () => {
    const ranked = rankProviders(
      [
        {
          id: "slow",
          companyName: "Langsam GmbH",
          rating: 4.9,
          averageResponseHours: 20,
          availability: "Werktags",
          trades: [{ trade: { name: "Elektro", category: "ELEKTRIK" } }],
          properties: [],
          _count: { assignedTickets: 4 }
        },
        {
          id: "match",
          companyName: "AquaFix",
          rating: 4.6,
          averageResponseHours: 2,
          availability: "24/7",
          trades: [{ trade: { name: "Wasser", category: "WASSER" } }],
          properties: [{ propertyId: "property-1" }],
          _count: { assignedTickets: 1 }
        }
      ],
      "WASSER",
      "property-1"
    );
    expect(ranked[0].id).toBe("match");
    expect(ranked[0].tradeMatch).toBe(true);
  });

  it("zeigt Kostenfreigaben als operative Ausnahme", () => {
    const exception = getOperationalException({
      status: "WARTEN_AUF_FREIGABE",
      priority: "NORMAL",
      reviewRequired: true,
      reviewReason: "Kosten überschritten",
      assignedProviderId: "provider-1",
      dueDate: new Date("2026-08-20T10:00:00Z"),
      updatedAt: new Date("2026-08-12T10:00:00Z")
    }, new Date("2026-08-12T12:00:00Z"));
    expect(exception?.title).toBe("Kostenfreigabe erforderlich");
  });

  it("bezieht echte Erstlösung, Kosten- und Objektleistung in das Matching ein", () => {
    const ranked = rankProviders(
      [
        {
          id: "reliable",
          companyName: "Zuverlässig GmbH",
          rating: 4,
          averageResponseHours: 12,
          availability: "Werktags",
          trades: [{ trade: { name: "Heizung", category: "HEIZUNG" } }],
          properties: [],
          _count: { assignedTickets: 1 },
          assignedTickets: [{
            propertyId: "property-1",
            providerRequestedAt: new Date("2026-08-01T08:00:00Z"),
            providerAcceptedAt: new Date("2026-08-01T09:00:00Z"),
            completedAt: new Date("2026-08-02T09:00:00Z"),
            dueDate: new Date("2026-08-03T09:00:00Z"),
            finalCost: 200,
            approvedCostLimit: 250,
            reopenedCount: 0,
            ratings: [{ score: 5 }]
          }]
        },
        {
          id: "unreliable",
          companyName: "Billig GmbH",
          rating: 5,
          averageResponseHours: 1,
          availability: "24/7",
          trades: [{ trade: { name: "Heizung", category: "HEIZUNG" } }],
          properties: [{ propertyId: "property-1" }],
          _count: { assignedTickets: 1 },
          assignedTickets: [{
            propertyId: "property-1",
            providerRequestedAt: new Date("2026-08-01T08:00:00Z"),
            providerAcceptedAt: new Date("2026-08-02T08:00:00Z"),
            completedAt: new Date("2026-08-05T09:00:00Z"),
            dueDate: new Date("2026-08-03T09:00:00Z"),
            finalCost: 400,
            approvedCostLimit: 250,
            reopenedCount: 1,
            ratings: [{ score: 2 }]
          }]
        }
      ],
      "HEIZUNG",
      "property-1"
    );
    expect(ranked[0].id).toBe("reliable");
    expect(ranked[0].reasons.join(" ")).toContain("100 % Erstlösungsquote");
  });
});
