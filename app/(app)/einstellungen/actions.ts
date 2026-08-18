"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendMail, verifyMailConnection } from "@/lib/mail";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { organizationSettingsSchema } from "@/lib/validators";

export async function updateOrganizationSettingsAction(formData: FormData) {
  try {
    const user = await requireManager();
    const parsed = organizationSettingsSchema.parse({
      brandPrimary: String(formData.get("brandPrimary") ?? ""),
      brandAccent: String(formData.get("brandAccent") ?? ""),
      logoUrl: String(formData.get("logoUrl") ?? ""),
      customDomain: String(formData.get("customDomain") ?? ""),
      senderName: String(formData.get("senderName") ?? ""),
      senderEmail: String(formData.get("senderEmail") ?? ""),
      defaultCostLimit: String(formData.get("defaultCostLimit") ?? "250"),
      highCostThreshold: String(formData.get("highCostThreshold") ?? "1000"),
      providerResponseHours: String(formData.get("providerResponseHours") ?? "24"),
      appointmentReminderHours: String(formData.get("appointmentReminderHours") ?? "24"),
      requireProviderOtpCompletion: formData.has("requireProviderOtpCompletion"),
      autopilotEnabled: formData.has("autopilotEnabled"),
      dispatchStrategy: String(formData.get("dispatchStrategy") ?? "AUTO_ORDER")
    });
    const settings = await getOrganizationSettings(user.organizationId);
    await prisma.$transaction(async (tx) => {
      await tx.organizationSettings.update({
        where: { id: settings.id },
        data: {
          ...parsed,
          logoUrl: parsed.logoUrl || null,
          customDomain: parsed.customDomain || null,
          senderEmail: parsed.senderEmail || null,
          enabledModules: {
            tickets: true,
            appointments: formData.has("moduleAppointments"),
            documents: formData.has("moduleDocuments"),
            invoices: formData.has("moduleInvoices"),
            assets: formData.has("moduleAssets"),
            analytics: formData.has("moduleAnalytics")
          },
          requiredFields: {
            title: true,
            description: true,
            room: true,
            preferredWindows: formData.has("requiredPreferredWindows"),
            damagePhoto: formData.has("requiredDamagePhoto")
          },
          communicationChannels: {
            app: true,
            email: formData.has("channelEmail"),
            push: formData.has("channelPush"),
            sms: formData.has("channelSms")
          }
        }
      });
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorUserId: user.id,
          actorType: "USER",
          action: "ORGANIZATION_SETTINGS_UPDATED",
          reason: "Mandantenbranding und Orchestrierungsregeln wurden aktualisiert.",
          metadata: { providerResponseHours: parsed.providerResponseHours, defaultCostLimit: parsed.defaultCostLimit, dispatchStrategy: parsed.dispatchStrategy }
        }
      });
    });
    done("Konfiguration wurde gespeichert.");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(error instanceof Error ? error.message : "Konfiguration konnte nicht gespeichert werden.", "error");
  }
}

export async function toggleAutomationRuleAction(formData: FormData) {
  try {
    const user = await requireManager();
    const ruleId = String(formData.get("ruleId") ?? "");
    const rule = await prisma.automationRule.findFirst({ where: { id: ruleId, organizationId: user.organizationId } });
    if (!rule) throw new Error("Autopilot-Regel wurde nicht gefunden.");
    await prisma.automationRule.update({ where: { id: rule.id }, data: { enabled: !rule.enabled } });
    revalidatePath("/einstellungen");
    done(`Regel wurde ${rule.enabled ? "deaktiviert" : "aktiviert"}.`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(error instanceof Error ? error.message : "Regel konnte nicht geändert werden.", "error");
  }
}

export async function testConnectorAction(formData: FormData) {
  try {
    const user = await requireManager();
    const connectorId = String(formData.get("connectorId") ?? "");
    const connector = await prisma.inboundConnector.findFirst({ where: { id: connectorId, organizationId: user.organizationId } });
    if (!connector) throw new Error("Eingangskanal wurde nicht gefunden.");
    await prisma.inboundConnector.update({
      where: { id: connector.id },
      data: { status: "TEST_MODE", lastSyncAt: new Date(), lastError: null }
    });
    done(`${connector.displayName}: Testeingang ist bereit.`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(error instanceof Error ? error.message : "Verbindungstest fehlgeschlagen.", "error");
  }
}

export async function sendTestMailAction() {
  try {
    const user = await requireManager();
    const settings = await getOrganizationSettings(user.organizationId);
    const recipient = settings.senderEmail?.trim() || user.email;
    await verifyMailConnection();
    const result = await sendMail({
      fromName: settings.senderName,
      fromAddress: settings.senderEmail,
      to: recipient,
      subject: "ObjektConnect: E-Mail-Versand erfolgreich verbunden",
      text: [
        "Die SMTP-Verbindung zu ObjektConnect funktioniert.",
        `Absender: ${settings.senderName} <${settings.senderEmail ?? recipient}>`,
        "Aktivierungslinks, Aufträge und Terminbenachrichtigungen können jetzt automatisch versendet werden."
      ].join("\n\n")
    });
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorUserId: user.id,
        actorType: "USER",
        action: "SMTP_TEST_SUCCEEDED",
        reason: `SMTP-Testmail an ${recipient} wurde versendet.`,
        metadata: { recipient, smtpMessageId: result.messageId }
      }
    });
    done(`Testmail wurde an ${recipient} versendet.`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    done(error instanceof Error ? error.message : "Testmail konnte nicht versendet werden.", "error");
  }
}

async function requireManager() {
  const user = await requireSessionUser();
  if (user.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann diese Konfiguration ändern.");
  return user;
}

function done(message: string, type: "success" | "error" = "success"): never {
  redirect(`/einstellungen?notice=${encodeURIComponent(message)}&type=${type}`);
}

function isRedirectError(error: unknown): error is Error & { digest: string } {
  return typeof error === "object"
    && error !== null
    && "digest" in error
    && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
