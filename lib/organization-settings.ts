import type { OrganizationSettings, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const defaultModules = {
  tickets: true,
  appointments: true,
  documents: true,
  invoices: true,
  assets: true,
  analytics: true
};

export const defaultRequiredFields = {
  title: true,
  description: true,
  room: true,
  preferredWindows: true,
  damagePhoto: false
};

export const defaultLabels = {
  tenant: "Mieter",
  provider: "Dienstleister",
  ticket: "Vorgang"
};

export const defaultChannels = {
  app: true,
  email: true,
  push: false,
  sms: false
};

export async function getOrganizationSettings(organizationId: string) {
  return prisma.organizationSettings.upsert({
    where: { organizationId },
    update: {},
    create: {
      organizationId,
      enabledModules: defaultModules,
      requiredFields: defaultRequiredFields,
      labels: defaultLabels,
      communicationChannels: defaultChannels
    }
  });
}

export function settingsCreateData(organizationId: string): Prisma.OrganizationSettingsCreateInput {
  return {
    organization: { connect: { id: organizationId } },
    enabledModules: defaultModules,
    requiredFields: defaultRequiredFields,
    labels: defaultLabels,
    communicationChannels: defaultChannels
  };
}

export function jsonRecord(value: Prisma.JsonValue): Record<string, boolean | string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, boolean | string>)
    : {};
}

export type TenantBrand = Pick<
  OrganizationSettings,
  "brandPrimary" | "brandAccent" | "logoUrl" | "customDomain" | "senderName" | "senderEmail"
>;
