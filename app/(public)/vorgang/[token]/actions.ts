"use server";

import { redirect } from "next/navigation";
import { confirmPublicAppointment, confirmPublicCompletion, reopenPublicTicket } from "@/lib/ticket-service";
import { publicFeedbackSchema } from "@/lib/validators";

export async function confirmPublicAppointmentAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await confirmPublicAppointment({ token, appointmentId: String(formData.get("appointmentId") ?? "") });
    done(token, "Termin wurde bestätigt.");
  } catch (error) {
    done(token, errorMessage(error), "error");
  }
}

export async function confirmPublicCompletionAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    const parsed = publicFeedbackSchema.parse({
      token,
      score: String(formData.get("score") ?? "5"),
      comment: String(formData.get("comment") ?? "")
    });
    await confirmPublicCompletion(parsed);
    done(token, "Danke. Die Erledigung wurde bestätigt und der Vorgang abgeschlossen.");
  } catch (error) {
    done(token, errorMessage(error), "error");
  }
}

export async function reopenPublicTicketAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  try {
    await reopenPublicTicket({ token, reason: String(formData.get("reason") ?? "") });
    done(token, "Der Vorgang wurde zur Gewährleistungsprüfung erneut geöffnet.");
  } catch (error) {
    done(token, errorMessage(error), "error");
  }
}

function done(token: string, notice: string, type: "success" | "error" = "success"): never {
  redirect(`/vorgang/${token}?notice=${encodeURIComponent(notice)}&type=${type}`);
}

function errorMessage(error: unknown) {
  if (isRedirectError(error)) throw error;
  return error instanceof Error ? error.message : "Die Aktion konnte nicht ausgeführt werden.";
}

function isRedirectError(error: unknown): error is Error & { digest: string } {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}
