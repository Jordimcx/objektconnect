"use server";

import { redirect } from "next/navigation";
import {
  providerPortalCompleteWork,
  providerPortalDecision,
  providerPortalMessage,
  providerPortalProposeAppointments,
  providerPortalSubmitOffer,
  providerPortalUpdateStatus,
  requestProviderOtp
} from "@/lib/provider-access";
import { storeUploads } from "@/lib/uploads";
import { providerAccessCompletionSchema, providerAccessMessageSchema, providerOfferSchema } from "@/lib/validators";

export async function providerLinkDecisionAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const accepted = String(formData.get("decision")) === "accept";
    await providerPortalDecision({ token, accepted, reason: String(formData.get("reason") ?? "") });
    done(token, accepted ? "Auftrag angenommen." : "Auftrag abgelehnt.");
  } catch (error) {
    done(token, message(error), "error");
  }
}

export async function providerLinkMessageAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const parsed = providerAccessMessageSchema.parse({ token, body: String(formData.get("body") ?? "") });
    await providerPortalMessage(parsed);
    done(token, "Nachricht gesendet.");
  } catch (error) {
    done(token, message(error), "error");
  }
}

export async function providerLinkAppointmentsAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const slots = [0, 1, 2]
      .map((index) => {
        const startsAt = parseDate(String(formData.get(`startsAt${index}`) ?? ""));
        const endsAt = parseDate(String(formData.get(`endsAt${index}`) ?? ""));
        return startsAt && endsAt ? { startsAt, endsAt } : null;
      })
      .filter((slot): slot is { startsAt: Date; endsAt: Date } => Boolean(slot));
    await providerPortalProposeAppointments({ token, slots, note: String(formData.get("note") ?? "") });
    done(token, `${slots.length} Terminoptionen gesendet.`);
  } catch (error) {
    done(token, message(error), "error");
  }
}

export async function providerLinkOfferAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const parsed = providerOfferSchema.parse({
      token,
      amount: String(formData.get("amount") ?? ""),
      description: String(formData.get("description") ?? ""),
      validUntil: String(formData.get("validUntil") ?? "")
    });
    const files = fileList(formData, "offerFile");
    if (files.length > 1) throw new Error("Bitte höchstens eine Angebotsdatei hochladen.");
    if (files[0] && files[0].type !== "application/pdf") throw new Error("Die Angebotsdatei muss ein PDF sein.");
    const uploads = await storeUploads(files);
    await providerPortalSubmitOffer({
      token,
      amount: parsed.amount,
      description: parsed.description,
      validUntil: parsed.validUntil ? parseDate(parsed.validUntil) : null,
      upload: uploads[0]
    });
    done(token, "Angebot wurde an die Hausverwaltung gesendet.");
  } catch (error) {
    done(token, message(error), "error");
  }
}

export async function providerLinkStatusAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const status = String(formData.get("status"));
    if (status !== "IN_BEARBEITUNG" && status !== "WARTEN_AUF_MATERIAL") throw new Error("Ungültiger Status.");
    await providerPortalUpdateStatus({ token, status, note: String(formData.get("note") ?? "Status aktualisiert.") });
    done(token, "Status aktualisiert.");
  } catch (error) {
    done(token, message(error), "error");
  }
}

export async function providerLinkCompleteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const parsed = providerAccessCompletionSchema.parse({
      token,
      completionReport: String(formData.get("completionReport") ?? ""),
      workHours: String(formData.get("workHours") ?? "0"),
      finalCost: String(formData.get("finalCost") ?? "0"),
      materialDescription: String(formData.get("materialDescription") ?? ""),
      materialQuantity: optional(formData.get("materialQuantity")),
      materialUnitCost: optional(formData.get("materialUnitCost")),
      invoiceNumber: String(formData.get("invoiceNumber") ?? ""),
      supplierName: String(formData.get("supplierName") ?? ""),
      invoiceAmount: optional(formData.get("invoiceAmount")),
      otp: String(formData.get("otp") ?? "")
    });
    const beforeUploads = await storeUploads(fileList(formData, "beforeFiles"));
    const afterUploads = await storeUploads(fileList(formData, "afterFiles"));
    const invoices = await storeUploads(fileList(formData, "invoiceFile"));
    if (invoices.length !== 1) throw new Error("Bitte genau eine Rechnung hochladen.");
    await providerPortalCompleteWork({ ...parsed, beforeUploads, afterUploads, invoiceUpload: invoices[0] });
    done(token, "Ausführung und Rechnung wurden zur Prüfung eingereicht.");
  } catch (error) {
    done(token, message(error), "error");
  }
}

export async function providerLinkOtpAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const otp = await requestProviderOtp(token);
    redirect(`/auftrag/${token}?otp=${encodeURIComponent(otp)}&notice=${encodeURIComponent("Einmalcode für den lokalen Testmodus erstellt.")}`);
  } catch (error) {
    done(token, message(error), "error");
  }
}

function fileList(formData: FormData, name: string) {
  return formData.getAll(name).filter((file): file is File => file instanceof File && file.size > 0);
}

function optional(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Bitte gültige Terminzeiten eingeben.");
  return date;
}

function message(error: unknown) {
  if (isRedirectError(error)) throw error;
  return error instanceof Error ? error.message : "Die Aktion konnte nicht ausgeführt werden.";
}

function isRedirectError(error: unknown): error is Error & { digest: string } {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}

function done(token: string, notice: string, type: "success" | "error" = "success"): never {
  redirect(`/auftrag/${token}?notice=${encodeURIComponent(notice)}&type=${type}`);
}
