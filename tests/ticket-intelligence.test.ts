import { describe, expect, it } from "vitest";
import {
  createTicketSuggestion,
  detectMissingFields,
  nextBestAction,
  suggestCategory,
  suggestPriority,
  summarizeTicket
} from "@/lib/ticket-intelligence";

describe("Regelbasierte Assistenz", () => {
  it("erkennt Wasser-Notfall aus Beschreibung", () => {
    const description = "Wasser läuft stark aus der Decke";
    expect(suggestCategory(description)).toBe("WASSER");
    expect(suggestPriority(description)).toBe("NOTFALL");
    expect(createTicketSuggestion({ description, title: "Wasser", room: "Bad", preferredWindows: ["Heute"] }).recommendation).toContain("Sanitär");
  });

  it("findet fehlende Angaben", () => {
    expect(detectMissingFields({ description: "zu kurz", preferredWindows: [] })).toEqual([
      "Problem kurz benennen",
      "Betroffenen Raum angeben",
      "Beschreibung genauer ausfüllen",
      "Terminfenster ergänzen"
    ]);
  });

  it("nennt die nächste sinnvolle Aktion", () => {
    expect(nextBestAction({ status: "NEU" })).toBe("Passenden Dienstleister zuweisen");
    expect(nextBestAction({ status: "VOM_MIETER_BESTAETIGT", assignedProviderId: "provider-1" })).toBe("Ticket abschließen und archivieren");
  });

  it("fasst ein Ticket verständlich zusammen", () => {
    const summary = summarizeTicket({
      number: "OC-2026-0001",
      title: "Heizung bleibt kalt",
      category: "HEIZUNG",
      priority: "HOCH",
      status: "PRUEFUNG_ERFORDERLICH",
      propertyName: "Kastanienhof",
      tenantName: "Mia Schneider"
    });
    expect(summary).toContain("OC-2026-0001");
    expect(summary).toContain("Heizung");
  });
});
