"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/app-url";
import { CATEGORY_LABELS } from "@/lib/constants";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { createTenantActivationLink } from "@/lib/tenant-access";
import {
  organizationMasterDataSchema,
  propertyOnboardingSchema,
  providerOnboardingSchema,
  tenantOnboardingSchema,
  unitOnboardingSchema
} from "@/lib/validators";

export async function updateMasterDataAction(formData: FormData) {
  try {
    const user = await requireManager();
    const parsed = organizationMasterDataSchema.parse({
      name: value(formData, "name"),
      claim: value(formData, "claim"),
      senderName: value(formData, "senderName"),
      senderEmail: value(formData, "senderEmail")
    });
    await getOrganizationSettings(user.organizationId);
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: user.organizationId },
        data: { name: parsed.name, claim: parsed.claim }
      });
      await tx.organizationSettings.update({
        where: { organizationId: user.organizationId },
        data: { senderName: parsed.senderName, senderEmail: parsed.senderEmail }
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.id,
          actorType: "USER",
          action: "ORGANIZATION_MASTER_DATA_UPDATED",
          reason: "Stammdaten und Kommunikationsabsender wurden aktualisiert.",
          metadata: { organizationName: parsed.name, senderEmail: parsed.senderEmail }
        }
      });
    });
    done("Verwaltungsdaten wurden gespeichert.", "success", "verwaltung");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(message(error, "Verwaltungsdaten konnten nicht gespeichert werden."), "error", "verwaltung");
  }
}

export async function createPropertyAction(formData: FormData) {
  try {
    const user = await requireManager();
    const parsed = propertyOnboardingSchema.parse({
      name: value(formData, "name"),
      address: value(formData, "address"),
      buildingName: value(formData, "buildingName"),
      contactName: value(formData, "contactName"),
      contactEmail: value(formData, "contactEmail")
    });
    await prisma.$transaction(async (tx) => {
      const property = await tx.property.create({
        data: {
          organizationId: user.organizationId,
          name: parsed.name,
          address: parsed.address,
          contactName: parsed.contactName,
          contactEmail: parsed.contactEmail,
          buildings: { create: { name: parsed.buildingName, address: parsed.address } }
        }
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.id,
          actorType: "USER",
          action: "PROPERTY_CREATED",
          reason: `Objekt ${property.name} wurde im Onboarding angelegt.`,
          metadata: { propertyId: property.id }
        }
      });
    });
    done("Objekt und erstes Gebäude wurden angelegt.", "success", "bestand");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(message(error, "Objekt konnte nicht angelegt werden."), "error", "bestand");
  }
}

export async function createUnitAction(formData: FormData) {
  try {
    const user = await requireManager();
    const parsed = unitOnboardingSchema.parse({
      buildingId: value(formData, "buildingId"),
      label: value(formData, "label"),
      floor: value(formData, "floor"),
      rooms: value(formData, "rooms"),
      squareMeter: value(formData, "squareMeter")
    });
    const building = await prisma.building.findFirst({
      where: { id: parsed.buildingId, property: { organizationId: user.organizationId } },
      select: { id: true, propertyId: true }
    });
    if (!building) throw new Error("Das ausgewählte Gebäude wurde nicht gefunden.");

    await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({
        data: {
          buildingId: building.id,
          label: parsed.label,
          floor: parsed.floor,
          rooms: parsed.rooms,
          squareMeter: parsed.squareMeter
        }
      });
      const unitCount = await tx.unit.count({ where: { building: { propertyId: building.propertyId } } });
      await tx.property.update({ where: { id: building.propertyId }, data: { unitCount } });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.id,
          actorType: "USER",
          action: "UNIT_CREATED",
          reason: `Wohneinheit ${unit.label} wurde im Onboarding angelegt.`,
          metadata: { unitId: unit.id, buildingId: building.id, propertyId: building.propertyId }
        }
      });
    });
    done("Wohneinheit wurde angelegt.", "success", "bestand");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(message(error, "Wohneinheit konnte nicht angelegt werden."), "error", "bestand");
  }
}

export async function createTenantAction(formData: FormData) {
  try {
    const manager = await requireManager();
    const parsed = tenantOnboardingSchema.parse({
      name: value(formData, "name"),
      email: value(formData, "email"),
      phone: value(formData, "phone"),
      unitId: value(formData, "unitId"),
      startsAt: value(formData, "startsAt")
    });
    const [unit, existingUser] = await Promise.all([
      prisma.unit.findFirst({
        where: {
          id: parsed.unitId,
          building: { property: { organizationId: manager.organizationId } },
          leases: { none: { endsAt: null } }
        },
        select: { id: true, label: true }
      }),
      prisma.user.findUnique({ where: { email: parsed.email } })
    ]);
    if (!unit) throw new Error("Die Wohneinheit ist nicht verfügbar oder wurde nicht gefunden.");
    if (existingUser) throw new Error("Für diese E-Mail-Adresse besteht bereits ein Benutzerkonto.");

    const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: manager.organizationId,
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          passwordHash,
          role: "MIETER",
          leases: { create: { unitId: unit.id, startsAt: startOfDate(parsed.startsAt) } }
        }
      });
      await tx.auditLog.create({
        data: {
          organizationId: manager.organizationId,
          actorUserId: manager.id,
          actorType: "USER",
          action: "TENANT_CREATED",
          reason: `Mieter ${created.name} wurde der Wohneinheit ${unit.label} zugeordnet.`,
          metadata: { tenantId: created.id, unitId: unit.id }
        }
      });
      return created;
    });
    const activation = await createTenantActivationLink(manager, tenant.id);
    const link = appUrl(`/aktivieren/${activation.token}`);
    const mailNotice = activation.mailStatus === "SENT"
      ? "Die Aktivierungsmail wurde versendet."
      : activation.mailStatus === "FAILED"
        ? "Die E-Mail konnte nicht versendet werden; der Aktivierungslink ist unten verfügbar."
        : "Der Mailversand ist noch nicht vollständig verbunden; der Aktivierungslink ist unten verfügbar.";
    redirect(`/onboarding?notice=${encodeURIComponent(`Mieter wurde angelegt. ${mailNotice}`)}&type=${activation.mailStatus === "FAILED" ? "error" : "success"}&activationLink=${encodeURIComponent(link)}&tenant=${encodeURIComponent(tenant.name)}#mieter`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(message(error, "Mieter konnte nicht angelegt werden."), "error", "mieter");
  }
}

export async function createProviderAction(formData: FormData) {
  try {
    const user = await requireManager();
    const propertyIds = [...new Set(formData.getAll("propertyIds").map(String).filter(Boolean))];
    const parsed = providerOnboardingSchema.parse({
      companyName: value(formData, "companyName"),
      contactName: value(formData, "contactName"),
      email: value(formData, "email"),
      phone: value(formData, "phone"),
      address: value(formData, "address"),
      serviceArea: value(formData, "serviceArea"),
      availability: value(formData, "availability"),
      categories: formData.getAll("categories").map(String),
      propertyIds
    });
    const [matchingProperties, existingProvider] = await Promise.all([
      prisma.property.count({ where: { id: { in: parsed.propertyIds }, organizationId: user.organizationId } }),
      prisma.serviceProvider.findFirst({
        where: { organizationId: user.organizationId, email: { equals: parsed.email, mode: "insensitive" } }
      })
    ]);
    if (matchingProperties !== parsed.propertyIds.length) throw new Error("Mindestens ein ausgewähltes Objekt ist nicht mehr verfügbar.");
    if (existingProvider) throw new Error("Dieser Dienstleister ist bereits für die Verwaltung hinterlegt.");

    await prisma.$transaction(async (tx) => {
      const tradeIds: string[] = [];
      for (const category of parsed.categories) {
        const name = CATEGORY_LABELS[category];
        const trade = await tx.trade.upsert({
          where: { organizationId_name: { organizationId: user.organizationId, name } },
          create: { organizationId: user.organizationId, name, category },
          update: { category }
        });
        tradeIds.push(trade.id);
      }
      const provider = await tx.serviceProvider.create({
        data: {
          organizationId: user.organizationId,
          companyName: parsed.companyName,
          contactName: parsed.contactName,
          email: parsed.email,
          phone: parsed.phone,
          address: parsed.address,
          serviceArea: parsed.serviceArea,
          availability: parsed.availability,
          trades: { create: tradeIds.map((tradeId) => ({ trade: { connect: { id: tradeId } } })) },
          properties: { create: parsed.propertyIds.map((propertyId) => ({ property: { connect: { id: propertyId } } })) }
        }
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.id,
          actorType: "USER",
          action: "SERVICE_PROVIDER_CREATED",
          reason: `Dienstleister ${provider.companyName} wurde im Onboarding angelegt.`,
          metadata: { providerId: provider.id, categories: parsed.categories, propertyIds: parsed.propertyIds }
        }
      });
    });
    done("Dienstleister wurde angelegt und kann per sicherem Auftragslink arbeiten.", "success", "dienstleister");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(message(error, "Dienstleister konnte nicht angelegt werden."), "error", "dienstleister");
  }
}

async function requireManager() {
  const user = await requireSessionUser();
  if (user.role !== "HAUSVERWALTER") throw new Error("Diese Einrichtung ist der Hausverwaltung vorbehalten.");
  return user;
}

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function startOfDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Bitte einen gültigen Mietbeginn eingeben.");
  return date;
}

function message(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }
  return error instanceof Error ? error.message : fallback;
}

function done(notice: string, type: "success" | "error", anchor: string): never {
  redirect(`/onboarding?notice=${encodeURIComponent(notice)}&type=${type}#${anchor}`);
}

function isRedirectError(error: unknown): error is Error & { digest: string } {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
