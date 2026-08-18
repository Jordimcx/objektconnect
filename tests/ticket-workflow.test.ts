import { describe, expect, it } from "vitest";
import { ticketCreateSchema } from "@/lib/validators";
import {
  canAcceptAssignment,
  canCloseAfterTenantConfirmation,
  canTransition,
  dueDateForPriority
} from "@/lib/workflow";

describe("Ticket-Erstellung", () => {
  it("validiert Pflichtfelder für eine Schadensmeldung", () => {
    const parsed = ticketCreateSchema.safeParse({
      title: "Wasserfleck",
      description: "Wasser läuft sichtbar aus der Decke und tropft auf den Boden.",
      room: "Bad",
      category: "WASSER",
      priority: "NOTFALL",
      preferredWindows: ["Heute 10:00-12:00"]
    });
    expect(parsed.success).toBe(true);
  });

  it("berechnet Notfall-Fälligkeit kurzfristig", () => {
    const from = new Date("2026-08-06T08:00:00Z");
    expect(dueDateForPriority("NOTFALL", from).toISOString()).toBe("2026-08-07T08:00:00.000Z");
  });
});

describe("Ticket-Zuweisung und Statuswechsel", () => {
  it("erlaubt den vorgesehenen Workflow von Anfrage zu Terminabstimmung", () => {
    expect(canTransition("DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG")).toBe(true);
    expect(canTransition("DIENSTLEISTER_ANGEFRAGT", "ABGESCHLOSSEN")).toBe(false);
  });

  it("erlaubt Dienstleistern nur zugewiesene Aufträge anzunehmen", () => {
    expect(canAcceptAssignment("DIENSTLEISTER", true)).toBe(true);
    expect(canAcceptAssignment("DIENSTLEISTER", false)).toBe(false);
    expect(canAcceptAssignment("HAUSVERWALTER", true)).toBe(false);
  });

  it("schließt erst nach Mieterbestätigung ab", () => {
    expect(canCloseAfterTenantConfirmation("VOM_MIETER_BESTAETIGT", "HAUSVERWALTER")).toBe(true);
    expect(canCloseAfterTenantConfirmation("ERLEDIGT", "HAUSVERWALTER")).toBe(false);
  });
});
