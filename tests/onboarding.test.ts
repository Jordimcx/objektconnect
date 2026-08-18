import { describe, expect, it } from "vitest";
import { getOnboardingProgress } from "@/lib/onboarding";

describe("Stammdaten-Onboarding", () => {
  it("bewertet die vier Einrichtungsschritte unabhängig", () => {
    const progress = getOnboardingProgress({
      organizationName: "Muster Hausverwaltung",
      senderName: "Muster Service",
      senderEmail: "service@muster.de",
      propertyCount: 2,
      unitCount: 0,
      tenantCount: 3,
      providerCount: 0
    });

    expect(progress.completed).toEqual({
      organization: true,
      inventory: false,
      tenants: true,
      providers: false
    });
    expect(progress.completedCount).toBe(2);
    expect(progress.percent).toBe(50);
    expect(progress.isComplete).toBe(false);
  });

  it("ist erst mit Bestand, Mietern und Dienstleistern vollständig", () => {
    const progress = getOnboardingProgress({
      organizationName: "Muster Hausverwaltung",
      senderName: "Muster Service",
      senderEmail: "service@muster.de",
      propertyCount: 1,
      unitCount: 1,
      tenantCount: 1,
      providerCount: 1
    });

    expect(progress.completedCount).toBe(4);
    expect(progress.percent).toBe(100);
    expect(progress.isComplete).toBe(true);
  });
});
