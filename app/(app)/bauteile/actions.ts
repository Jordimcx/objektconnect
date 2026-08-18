"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { assetCreateSchema } from "@/lib/validators";

export async function createAssetAction(formData: FormData) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Bauteile anlegen.");
    const parsed = assetCreateSchema.parse({
      propertyId: String(formData.get("propertyId") ?? ""),
      unitId: String(formData.get("unitId") ?? "") || undefined,
      name: String(formData.get("name") ?? ""),
      category: String(formData.get("category") ?? ""),
      manufacturer: String(formData.get("manufacturer") ?? ""),
      model: String(formData.get("model") ?? ""),
      serialNumber: String(formData.get("serialNumber") ?? ""),
      installedAt: String(formData.get("installedAt") ?? ""),
      warrantyUntil: String(formData.get("warrantyUntil") ?? ""),
      replacementThreshold: String(formData.get("replacementThreshold") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "")
    });
    const property = await prisma.property.findFirst({ where: { id: parsed.propertyId, organizationId: user.organizationId } });
    if (!property) throw new Error("Objekt wurde nicht gefunden.");
    if (parsed.unitId) {
      const unit = await prisma.unit.findFirst({ where: { id: parsed.unitId, building: { property: { organizationId: user.organizationId } } } });
      if (!unit) throw new Error("Wohneinheit wurde nicht gefunden.");
    }
    await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          organizationId: user.organizationId,
          propertyId: parsed.propertyId,
          unitId: parsed.unitId || null,
          name: parsed.name,
          category: parsed.category,
          manufacturer: parsed.manufacturer || null,
          model: parsed.model || null,
          serialNumber: parsed.serialNumber || null,
          installedAt: optionalDate(parsed.installedAt),
          warrantyUntil: optionalDate(parsed.warrantyUntil),
          replacementThreshold: parsed.replacementThreshold ?? null,
          notes: parsed.notes || null
        }
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.id,
          actorType: "USER",
          action: "ASSET_CREATED",
          reason: `Bauteil ${asset.name} wurde in die Objektakte aufgenommen.`,
          metadata: { assetId: asset.id, propertyId: asset.propertyId, unitId: asset.unitId }
        }
      });
    });
    done("Bauteil wurde angelegt.");
  } catch (error) {
    done(error instanceof Error ? error.message : "Bauteil konnte nicht angelegt werden.", "error");
  }
}

export async function linkAssetToTicketAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    if (user.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Bauteile zuordnen.");
    const assetId = String(formData.get("assetId") ?? "");
    const [ticket, asset] = await Promise.all([
      prisma.ticket.findFirst({ where: { id: ticketId, organizationId: user.organizationId } }),
      prisma.asset.findFirst({ where: { id: assetId, organizationId: user.organizationId } })
    ]);
    if (!ticket || !asset || asset.propertyId !== ticket.propertyId) throw new Error("Bauteil passt nicht zu diesem Vorgang.");
    await prisma.ticket.update({ where: { id: ticket.id }, data: { assetId: asset.id } });
    redirect(`/tickets/${ticket.id}?notice=${encodeURIComponent("Bauteil wurde dem Vorgang zugeordnet.")}&type=success`);
  } catch (error) {
    redirect(`/tickets/${ticketId}?notice=${encodeURIComponent(error instanceof Error ? error.message : "Zuordnung fehlgeschlagen.")}&type=error`);
  }
}

function optionalDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Bitte ein gültiges Datum angeben.");
  return date;
}

function done(message: string, type: "success" | "error" = "success"): never {
  redirect(`/bauteile?notice=${encodeURIComponent(message)}&type=${type}`);
}
