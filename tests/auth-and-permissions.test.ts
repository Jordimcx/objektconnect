import { describe, expect, it } from "vitest";
import { navigationByRole } from "@/lib/constants";
import { canAssignTicket, canConfirmAppointment } from "@/lib/workflow";
import { canViewTicket, ticketWhereForUser } from "@/lib/permissions";
import { loginSchema } from "@/lib/validators";

describe("Login und Rollen", () => {
  it("validiert Login-Daten", () => {
    expect(loginSchema.safeParse({ email: "verwaltung@objektconnect.de", password: "Demo123!" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "ungueltig", password: "" }).success).toBe(false);
  });

  it("erlaubt Zuweisungen nur der Hausverwaltung", () => {
    expect(canAssignTicket("HAUSVERWALTER")).toBe(true);
    expect(canAssignTicket("MIETER")).toBe(false);
    expect(canAssignTicket("DIENSTLEISTER")).toBe(false);
  });

  it("erlaubt Terminbestätigung durch Mieter", () => {
    expect(canConfirmAppointment("MIETER")).toBe(true);
    expect(canConfirmAppointment("DIENSTLEISTER")).toBe(false);
  });
});

describe("Berechtigungsprüfung", () => {
  const ticket = {
    organizationId: "org-1",
    tenantId: "tenant-1",
    assignedProviderId: "provider-1"
  };

  it("trennt Mieterzugriff nach Ticket", () => {
    expect(canViewTicket({ id: "tenant-1", role: "MIETER", organizationId: "org-1" }, ticket)).toBe(true);
    expect(canViewTicket({ id: "tenant-2", role: "MIETER", organizationId: "org-1" }, ticket)).toBe(false);
  });

  it("trennt Dienstleisterzugriff nach Zuweisung", () => {
    expect(canViewTicket({ id: "user-1", role: "DIENSTLEISTER", organizationId: "org-1", serviceProviderId: "provider-1" }, ticket)).toBe(true);
    expect(canViewTicket({ id: "user-2", role: "DIENSTLEISTER", organizationId: "org-1", serviceProviderId: "provider-2" }, ticket)).toBe(false);
  });

  it("bündelt mehrere Kundenverwaltungen in einem Dienstleisterkonto", () => {
    const providerUser = {
      id: "provider-user",
      role: "DIENSTLEISTER" as const,
      organizationId: "primary-org",
      organizationIds: ["primary-org", "customer-org"],
      serviceProviderId: "provider-1",
      serviceProviderIds: ["provider-1", "provider-2"]
    };
    expect(canViewTicket(providerUser, { ...ticket, organizationId: "customer-org", assignedProviderId: "provider-2" })).toBe(true);
    expect(canViewTicket(providerUser, { ...ticket, organizationId: "other-org", assignedProviderId: "provider-3" })).toBe(false);
    expect(ticketWhereForUser(providerUser)).toEqual({ assignedProviderId: { in: ["provider-1", "provider-2"] } });
  });

  it("erzeugt rollenbasierte Datenbankfilter", () => {
    expect(ticketWhereForUser({ id: "tenant-1", role: "MIETER", organizationId: "org-1" })).toMatchObject({
      organizationId: "org-1",
      tenantId: "tenant-1"
    });
  });
});

describe("Navigation", () => {
  it("enthält pro Rolle nur eindeutige Ziele", () => {
    for (const items of Object.values(navigationByRole)) {
      const hrefs = items.map((item) => item.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});
