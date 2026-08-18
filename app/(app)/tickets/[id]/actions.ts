"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { TicketStatus } from "@prisma/client";
import { appUrl } from "@/lib/app-url";
import {
  addInternalNote,
  addTicketMessage,
  approveFinalCost,
  assignTicket,
  closeTicket,
  completeWork,
  confirmAppointment,
  confirmCompletion,
  cancelConfirmedAppointment,
  proposeAppointmentSlots,
  providerDecision,
  reopenTicket,
  requestNewAppointments,
  submitProviderOffer,
  updateTicketStatus
} from "@/lib/ticket-service";
import { createProviderAccessLink, reviewProviderOffer, revokeProviderAccess } from "@/lib/provider-access";
import { reviewInvoice } from "@/lib/invoice-processing";
import { storeUploads } from "@/lib/uploads";
import { requireSessionUser } from "@/lib/session";
import {
  assignTicketSchema,
  completionSchema,
  costApprovalSchema,
  feedbackSchema,
  internalNoteSchema,
  messageSchema,
  providerAccountOfferSchema,
  statusUpdateSchema
} from "@/lib/validators";

type NoticeType = "success" | "error" | "info";

export async function assignTicketAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const parsed = assignTicketSchema.parse({
      ticketId,
      providerId: String(formData.get("providerId") ?? ""),
      priority: String(formData.get("priority") ?? ""),
      approvedCostLimit: String(formData.get("approvedCostLimit") ?? "250"),
      requestType: String(formData.get("requestType") ?? "WORK_ORDER"),
      note: String(formData.get("note") ?? "")
    });
    await assignTicket({ user, ...parsed });
    const access = await createProviderAccessLink(user, ticketId);
    const link = appUrl(`/auftrag/${access.token}`);
    done(ticketId, parsed.requestType === "QUOTE_REQUEST" ? "Angebot wurde angefordert." : "Dienstleister wurde beauftragt.", "success", { providerLink: link });
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function createProviderAccessAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const result = await createProviderAccessLink(user, ticketId);
    done(ticketId, "Neuer Auftragslink wurde erstellt.", "success", {
      providerLink: appUrl(`/auftrag/${result.token}`)
    });
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function revokeProviderAccessAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    await revokeProviderAccess(user, ticketId);
    done(ticketId, "Alle offenen Auftragslinks wurden widerrufen.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function reviewInvoiceAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const decision = String(formData.get("decision") ?? "");
    if (!(["APPROVED", "REJECTED", "QUESTION"] as const).includes(decision as "APPROVED" | "REJECTED" | "QUESTION")) {
      throw new Error("Ungültige Rechnungsentscheidung.");
    }
    await reviewInvoice({
      user,
      invoiceId: String(formData.get("invoiceId") ?? ""),
      decision: decision as "APPROVED" | "REJECTED" | "QUESTION",
      note: String(formData.get("note") ?? "")
    });
    done(ticketId, decision === "APPROVED" ? "Rechnung wurde freigegeben." : "Rechnungsprüfung wurde gespeichert.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function reopenTicketAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    await reopenTicket({ user, ticketId, reason: String(formData.get("reason") ?? "") });
    done(ticketId, "Vorgang wurde zur Gewährleistungsprüfung erneut geöffnet.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function requestNewAppointmentsAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    await requestNewAppointments({ user, ticketId, reason: String(formData.get("reason") ?? "") });
    done(ticketId, "Neue Terminoptionen wurden angefordert.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function cancelAppointmentAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    await cancelConfirmedAppointment({
      user,
      ticketId,
      reason: String(formData.get("reason") ?? ""),
      noShow: String(formData.get("noShow")) === "true"
    });
    done(ticketId, "Termin wurde aktualisiert. Eine neue Abstimmung ist erforderlich.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function providerAcceptAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    await providerDecision({ user, ticketId, accepted: true });
    done(ticketId, "Auftrag wurde angenommen.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function providerRejectAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    await providerDecision({
      user,
      ticketId,
      accepted: false,
      reason: String(formData.get("reason") ?? "")
    });
    done(ticketId, "Auftrag wurde abgelehnt.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function providerOfferAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const parsed = providerAccountOfferSchema.parse({
      ticketId,
      amount: String(formData.get("amount") ?? ""),
      description: String(formData.get("description") ?? ""),
      validUntil: String(formData.get("validUntil") ?? "")
    });
    const files = formData.getAll("offerFile").filter((file): file is File => file instanceof File && file.size > 0);
    if (files.length > 1) throw new Error("Bitte höchstens eine Angebotsdatei hochladen.");
    if (files[0] && files[0].type !== "application/pdf") throw new Error("Die Angebotsdatei muss ein PDF sein.");
    const uploads = await storeUploads(files);
    await submitProviderOffer({
      user,
      ticketId,
      amount: parsed.amount,
      description: parsed.description,
      validUntil: parsed.validUntil ? parseLocalDateTime(parsed.validUntil) : null,
      upload: uploads[0]
    });
    done(ticketId, "Angebot wurde an die Hausverwaltung gesendet.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function reviewProviderOfferAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const approved = String(formData.get("decision")) === "approve";
    const result = await reviewProviderOffer(user, String(formData.get("offerId") ?? ""), approved, String(formData.get("note") ?? ""));
    done(ticketId, approved ? "Angebot freigegeben und Auftrag versendet." : "Angebot wurde abgelehnt.", "success", result.token ? { providerLink: appUrl(`/auftrag/${result.token}`) } : undefined);
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function updateStatusAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const parsed = statusUpdateSchema.parse({
      ticketId,
      status: String(formData.get("status") ?? ""),
      note: String(formData.get("note") ?? "")
    });
    await updateTicketStatus({ user, ...parsed });
    done(ticketId, "Status wurde aktualisiert.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function quickStatusAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const status = String(formData.get("status") ?? "") as TicketStatus;
    const note = String(formData.get("note") ?? "");
    await updateTicketStatus({ user, ticketId, status, note });
    done(ticketId, "Status wurde aktualisiert.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function proposeAppointmentAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const slots = [0, 1, 2]
      .map((index) => {
        const startsAt = String(formData.get(`startsAt${index}`) ?? "");
        const endsAt = String(formData.get(`endsAt${index}`) ?? "");
        return startsAt && endsAt ? { startsAt: parseLocalDateTime(startsAt), endsAt: parseLocalDateTime(endsAt) } : null;
      })
      .filter((slot): slot is { startsAt: Date; endsAt: Date } => Boolean(slot));
    if (!slots.length) {
      slots.push({
        startsAt: parseLocalDateTime(String(formData.get("startsAt") ?? "")),
        endsAt: parseLocalDateTime(String(formData.get("endsAt") ?? ""))
      });
    }
    await proposeAppointmentSlots({
      user,
      ticketId,
      slots,
      note: String(formData.get("note") ?? "")
    });
    done(ticketId, `${slots.length} Terminfenster wurden angeboten.`);
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function confirmAppointmentAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    await confirmAppointment({
      user,
      ticketId,
      appointmentId: String(formData.get("appointmentId") ?? "")
    });
    done(ticketId, "Termin wurde bestätigt.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function completeWorkAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const parsed = completionSchema.parse({
      ticketId,
      completionReport: String(formData.get("completionReport") ?? ""),
      workHours: String(formData.get("workHours") ?? "0"),
      finalCost: String(formData.get("finalCost") ?? "0")
    });
    const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
    const invoiceFiles = formData.getAll("invoice").filter((file): file is File => file instanceof File && file.size > 0);
    if (invoiceFiles.length !== 1) throw new Error("Bitte genau eine Rechnung als PDF oder XML hochladen.");
    const [uploads, invoiceUploads] = await Promise.all([storeUploads(files), storeUploads(invoiceFiles)]);
    await completeWork({
      user,
      uploads,
      invoiceUpload: invoiceUploads[0],
      invoiceNumber: String(formData.get("invoiceNumber") ?? ""),
      supplierName: String(formData.get("supplierName") ?? ""),
      ...parsed
    });
    done(ticketId, "Ausführung und Rechnung wurden zur Prüfung eingereicht.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function approveFinalCostAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const parsed = costApprovalSchema.parse({
      ticketId,
      approvedCostLimit: String(formData.get("approvedCostLimit") ?? ""),
      note: String(formData.get("note") ?? "")
    });
    await approveFinalCost({ user, ...parsed });
    done(ticketId, "Abschlusskosten wurden freigegeben. Der Mieter wurde informiert.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function confirmCompletionAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const parsed = feedbackSchema.parse({
      ticketId,
      score: String(formData.get("score") ?? "5"),
      comment: String(formData.get("comment") ?? "")
    });
    await confirmCompletion({ user, ...parsed });
    done(ticketId, "Erledigung wurde bestätigt.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function closeTicketAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    await closeTicket({ user, ticketId });
    done(ticketId, "Ticket wurde abgeschlossen und archiviert.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function sendMessageAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const parsed = messageSchema.parse({
      ticketId,
      body: String(formData.get("body") ?? "")
    });
    await addTicketMessage({ user, ...parsed });
    done(ticketId, "Nachricht wurde gesendet.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

export async function addInternalNoteAction(formData: FormData) {
  const ticketId = String(formData.get("ticketId") ?? "");
  try {
    const user = await requireSessionUser();
    const parsed = internalNoteSchema.parse({
      ticketId,
      body: String(formData.get("body") ?? "")
    });
    await addInternalNote({ user, ...parsed });
    done(ticketId, "Interne Notiz wurde gespeichert.");
  } catch (error) {
    done(ticketId, errorMessage(error), "error");
  }
}

function parseLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Bitte einen gültigen Termin angeben.");
  return date;
}

function errorMessage(error: unknown) {
  if (isRedirectError(error)) throw error;
  return error instanceof Error ? error.message : "Die Aktion konnte nicht ausgeführt werden.";
}

function isRedirectError(error: unknown): error is Error & { digest: string } {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}

function done(
  ticketId: string,
  message: string,
  type: NoticeType = "success",
  extra?: Record<string, string>
): never {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/dashboard");
  const query = new URLSearchParams({ notice: message, type, ...extra });
  redirect(`/tickets/${ticketId}?${query.toString()}`);
}
