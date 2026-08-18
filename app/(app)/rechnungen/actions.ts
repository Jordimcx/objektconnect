"use server";

import type { InvoiceSource } from "@prisma/client";
import { redirect } from "next/navigation";
import { submitAndCheckInvoice } from "@/lib/invoice-processing";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { storeUploads } from "@/lib/uploads";

const sources: InvoiceSource[] = ["MANUAL", "MICROSOFT_365", "GOOGLE_WORKSPACE", "FORWARDING", "IMAP"];

export async function ingestInvoiceAction(formData: FormData) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Rechnungseingänge simulieren.");
    const ticketId = String(formData.get("ticketId") ?? "");
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, organizationId: user.organizationId } });
    if (!ticket) throw new Error("Vorgang wurde nicht gefunden.");
    const files = formData.getAll("invoiceFile").filter((file): file is File => file instanceof File && file.size > 0);
    const uploads = await storeUploads(files);
    if (uploads.length !== 1) throw new Error("Bitte genau eine Rechnungsdatei auswählen.");
    const sourceValue = String(formData.get("source") ?? "MANUAL") as InvoiceSource;
    const source = sources.includes(sourceValue) ? sourceValue : "MANUAL";
    const amountValue = String(formData.get("amount") ?? "").trim();
    await prisma.$transaction((tx) => submitAndCheckInvoice(tx, {
      organizationId: user.organizationId,
      ticketId,
      providerId: ticket.assignedProviderId,
      ownerId: user.id,
      upload: uploads[0],
      source,
      invoiceNumber: String(formData.get("invoiceNumber") ?? ""),
      supplierName: String(formData.get("supplierName") ?? ""),
      amount: amountValue ? Number(amountValue) : null,
      actorType: "USER",
      actorUserId: user.id
    }));
    done("Rechnung wurde eingelesen, zugeordnet und geprüft.");
  } catch (error) {
    done(error instanceof Error ? error.message : "Rechnung konnte nicht verarbeitet werden.", "error");
  }
}

function done(notice: string, type: "success" | "error" = "success"): never {
  redirect(`/rechnungen?notice=${encodeURIComponent(notice)}&type=${type}`);
}
