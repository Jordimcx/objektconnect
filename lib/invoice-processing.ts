import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { InvoiceRisk, InvoiceSource, InvoiceStatus, Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { StoredUpload } from "@/lib/uploads";

export type InvoiceCheck = {
  key: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
};

export async function submitAndCheckInvoice(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    ticketId: string;
    providerId?: string | null;
    ownerId?: string | null;
    upload: StoredUpload;
    source?: InvoiceSource;
    invoiceNumber?: string | null;
    supplierName?: string | null;
    amount?: number | null;
    issuedAt?: Date | null;
    actorType: "USER" | "PROVIDER_LINK" | "SYSTEM";
    actorUserId?: string | null;
  }
) {
  const ticket = await tx.ticket.findFirst({
    where: { id: input.ticketId, organizationId: input.organizationId },
    include: {
      property: true,
      unit: true,
      assignedProvider: true,
      documents: true,
      invoices: true
    }
  });
  if (!ticket) throw new Error("Der zugehörige Vorgang wurde nicht gefunden.");

  const extracted = await extractInvoiceData(input.upload);
  const invoiceNumber = clean(input.invoiceNumber) ?? extracted.invoiceNumber;
  const supplierName = clean(input.supplierName) ?? extracted.supplierName;
  const amount = input.amount ?? extracted.amount;
  const issuedAt = input.issuedAt ?? extracted.issuedAt;
  const idempotencyKey = createHash("sha256")
    .update(`${input.organizationId}:${input.upload.checksum}:${invoiceNumber ?? "unknown"}`)
    .digest("hex");

  const duplicate = await tx.invoice.findFirst({
    where: {
      organizationId: input.organizationId,
      OR: [
        { idempotencyKey },
        ...(invoiceNumber && supplierName
          ? [{ invoiceNumber, supplierName: { equals: supplierName, mode: "insensitive" as const } }]
          : [])
      ]
    }
  });
  if (duplicate) throw new Error(`Diese Rechnung wurde bereits unter ${duplicate.invoiceNumber ?? duplicate.id} erfasst.`);

  const checks = buildInvoiceChecks({
    ticket,
    invoiceNumber,
    supplierName,
    amount,
    rawText: extracted.rawText,
    duplicate: false
  });
  const { risk, status, recommendation } = summarizeChecks(checks);

  const document = await tx.document.create({
    data: {
      organizationId: input.organizationId,
      ticketId: ticket.id,
      ownerId: input.ownerId ?? null,
      fileName: input.upload.fileName,
      originalName: input.upload.originalName,
      url: input.upload.url,
      contentType: input.upload.contentType,
      sizeBytes: input.upload.sizeBytes,
      checksum: input.upload.checksum,
      kind: "INVOICE",
      visibility: "MANAGER_ONLY"
    }
  });

  const invoice = await tx.invoice.create({
    data: {
      organizationId: input.organizationId,
      ticketId: ticket.id,
      providerId: input.providerId ?? ticket.assignedProviderId,
      documentId: document.id,
      source: input.source ?? "MANUAL",
      status,
      risk,
      invoiceNumber,
      supplierName,
      amount,
      issuedAt,
      idempotencyKey,
      extractedData: {
        format: extracted.format,
        ticketReferenceDetected: extracted.rawText.includes(ticket.number),
        objectReferenceDetected: extracted.rawText.toLowerCase().includes(ticket.property.name.toLowerCase()),
        unitReferenceDetected: extracted.rawText.toLowerCase().includes(ticket.unit.label.toLowerCase())
      },
      checks,
      recommendation,
      matchedAt: status === "MATCHED" ? new Date() : null
    }
  });

  await tx.ticket.update({
    where: { id: ticket.id },
    data: {
      invoiceMatchedAt: status === "MATCHED" ? new Date() : ticket.invoiceMatchedAt,
      reviewRequired: status !== "MATCHED" ? true : ticket.reviewRequired,
      reviewReason: status !== "MATCHED" ? recommendation : ticket.reviewReason
    }
  });
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      ticketId: ticket.id,
      actorUserId: input.actorUserId ?? null,
      actorType: input.actorType,
      action: "INVOICE_TRIAGE_COMPLETED",
      reason: recommendation,
      metadata: { invoiceId: invoice.id, risk, status, checks }
    }
  });
  return invoice;
}

export async function reviewInvoice(input: {
  user: SessionUser;
  invoiceId: string;
  decision: "APPROVED" | "REJECTED" | "QUESTION";
  note?: string;
}) {
  if (input.user.role !== "HAUSVERWALTER") throw new Error("Nur die Hausverwaltung kann Rechnungen prüfen.");
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: input.invoiceId, organizationId: input.user.organizationId },
      include: { ticket: true }
    });
    if (!invoice) throw new Error("Rechnung wurde nicht gefunden.");

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: input.decision,
        reviewedById: input.user.id,
        reviewedAt: new Date(),
        recommendation: input.note?.trim() || invoice.recommendation
      }
    });

    if (input.decision === "APPROVED" && invoice.ticket.status === "WARTEN_AUF_FREIGABE") {
      const amount = Number(invoice.amount ?? invoice.ticket.finalCost ?? 0);
      await tx.ticket.update({
        where: { id: invoice.ticketId },
        data: {
          status: "ERLEDIGT",
          approvedCostLimit: Math.max(amount, Number(invoice.ticket.approvedCostLimit ?? 0)),
          costApprovedAt: new Date(),
          reviewRequired: false,
          reviewReason: null,
          reviewedAt: new Date()
        }
      });
      await tx.statusHistory.create({
        data: {
          ticketId: invoice.ticketId,
          fromStatus: invoice.ticket.status,
          toStatus: "ERLEDIGT",
          changedById: input.user.id,
          note: input.note || "Rechnung und Abschlusskosten geprüft und freigegeben."
        }
      });
      await tx.notification.create({
        data: {
          userId: invoice.ticket.tenantId,
          ticketId: invoice.ticketId,
          type: "WORK_COMPLETED",
          title: "Reparatur zur Bestätigung bereit",
          body: `${invoice.ticket.number}: Rechnung und Ausführung wurden geprüft.`,
          href: `/tickets/${invoice.ticketId}`
        }
      });
    } else if (input.decision !== "APPROVED") {
      await tx.ticket.update({
        where: { id: invoice.ticketId },
        data: {
          reviewRequired: true,
          reviewReason: input.note || (input.decision === "REJECTED" ? "Rechnung wurde abgelehnt." : "Rückfrage zur Rechnung ist offen.")
        }
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: input.user.organizationId,
        ticketId: invoice.ticketId,
        actorUserId: input.user.id,
        actorType: "USER",
        action: `INVOICE_${input.decision}`,
        reason: input.note || `Rechnung wurde auf ${input.decision} gesetzt.`,
        metadata: { invoiceId: invoice.id, previousStatus: invoice.status }
      }
    });
    return updated;
  });
}

function buildInvoiceChecks(input: {
  ticket: {
    number: string;
    completionReport: string | null;
    approvedCostLimit: Prisma.Decimal | null;
    finalCost: Prisma.Decimal | null;
    costEstimate: Prisma.Decimal | null;
    assignedProvider: { companyName: string } | null;
    property: { name: string };
    unit: { label: string };
    documents: Array<{ kind: string; contentType: string }>;
  };
  invoiceNumber: string | null;
  supplierName: string | null;
  amount: number | null;
  rawText: string;
  duplicate: boolean;
}): InvoiceCheck[] {
  const lowerText = input.rawText.toLowerCase();
  const expectedProvider = input.ticket.assignedProvider?.companyName ?? "";
  const providerMatches = Boolean(
    input.supplierName && expectedProvider && normalize(input.supplierName).includes(normalize(expectedProvider))
  );
  const hasPhoto = input.ticket.documents.some(
    (document) => ["DAMAGE_PHOTO", "BEFORE_PHOTO", "AFTER_PHOTO"].includes(document.kind) || document.contentType.startsWith("image/")
  );
  const approvedLimit = input.ticket.approvedCostLimit ? Number(input.ticket.approvedCostLimit) : null;
  const finalCost = input.ticket.finalCost ? Number(input.ticket.finalCost) : null;
  const amountDeviation = input.amount != null && finalCost != null ? Math.abs(input.amount - finalCost) : null;

  return [
    check("invoice_number", "Rechnungsnummer", Boolean(input.invoiceNumber), "Rechnungsnummer erkannt", "Rechnungsnummer fehlt"),
    check("provider", "Dienstleister", providerMatches, `Aussteller passt zu ${expectedProvider || "dem Auftrag"}`, "Aussteller stimmt nicht sicher mit dem beauftragten Betrieb überein"),
    check("ticket", "Auftragsnummer", lowerText.includes(input.ticket.number.toLowerCase()), `${input.ticket.number} erkannt`, "Auftragsnummer wurde im Dokument nicht erkannt", "WARN"),
    check("object", "Objekt und Einheit", lowerText.includes(input.ticket.property.name.toLowerCase()) || lowerText.includes(input.ticket.unit.label.toLowerCase()), "Objektbezug erkannt", "Objekt oder Einheit ist im Dokument nicht eindeutig", "WARN"),
    check("duplicate", "Dublettenprüfung", !input.duplicate, "Keine Dublette gefunden", "Mögliche Doppelrechnung", "FAIL"),
    check("report", "Arbeitsbericht", Boolean(input.ticket.completionReport), "Arbeitsbericht liegt vor", "Arbeitsbericht fehlt", "FAIL"),
    check("photo", "Fotodokumentation", hasPhoto, "Fotodokumentation liegt vor", "Vorher-/Nachher-Foto fehlt", "FAIL"),
    check(
      "cost_limit",
      "Freigegebener Kostenrahmen",
      input.amount != null && approvedLimit != null && input.amount <= approvedLimit,
      `Betrag liegt innerhalb von ${approvedLimit?.toFixed(2) ?? "0,00"} EUR`,
      input.amount == null ? "Rechnungsbetrag fehlt" : `Betrag ${input.amount.toFixed(2)} EUR überschreitet den Rahmen ${approvedLimit?.toFixed(2) ?? "0,00"} EUR`,
      "FAIL"
    ),
    check(
      "execution_amount",
      "Ausführung und Rechnung",
      amountDeviation != null && amountDeviation <= 0.01,
      "Rechnungsbetrag entspricht den dokumentierten Abschlusskosten",
      amountDeviation == null ? "Beträge können nicht vollständig verglichen werden" : `Abweichung von ${amountDeviation.toFixed(2)} EUR zwischen Ausführung und Rechnung`,
      amountDeviation != null && amountDeviation <= Math.max(25, (finalCost ?? 0) * 0.1) ? "WARN" : "FAIL"
    )
  ];
}

function summarizeChecks(checks: InvoiceCheck[]): { risk: InvoiceRisk; status: InvoiceStatus; recommendation: string } {
  const failures = checks.filter((entry) => entry.status === "FAIL");
  const warnings = checks.filter((entry) => entry.status === "WARN");
  if (failures.length) {
    return {
      risk: "HIGH",
      status: "REVIEW_REQUIRED",
      recommendation: `Manuell prüfen: ${failures.map((entry) => entry.detail).join("; ")}.`
    };
  }
  if (warnings.length) {
    return {
      risk: "MEDIUM",
      status: "REVIEW_REQUIRED",
      recommendation: `Zuordnung plausibel, aber Rückfragen offen: ${warnings.map((entry) => entry.detail).join("; ")}.`
    };
  }
  return {
    risk: "LOW",
    status: "MATCHED",
    recommendation: "Auftrag, Ausführungsnachweis und Rechnung stimmen überein. Manuelle Freigabe kann erfolgen."
  };
}

async function extractInvoiceData(upload: StoredUpload) {
  const absolutePath = path.join(process.cwd(), "public", upload.url.replace(/^\//, ""));
  const bytes = await readFile(absolutePath);
  const rawText = bytes.toString("utf8").slice(0, 2_000_000);
  const xmlLike = upload.contentType.includes("xml") || rawText.includes("CrossIndustryInvoice") || rawText.includes("<Invoice");
  const format = xmlLike
    ? rawText.includes("CrossIndustryInvoice")
      ? "ZUGFeRD"
      : "XRECHNUNG"
    : upload.contentType === "application/pdf"
      ? "PDF"
      : "UNKNOWN";

  const invoiceNumber = firstMatch(rawText, [
    /<(?:cbc:)?ID[^>]*>([^<]{2,80})<\/(?:cbc:)?ID>/i,
    /<ram:ID[^>]*>([^<]{2,80})<\/ram:ID>/i,
    /Rechnungs(?:nummer|nr\.?)[\s:]*([A-Z0-9\-_/]{3,40})/i
  ]);
  const supplierName = firstMatch(rawText, [
    /<(?:cbc:)?RegistrationName[^>]*>([^<]+)<\/(?:cbc:)?RegistrationName>/i,
    /<ram:Name[^>]*>([^<]+)<\/ram:Name>/i
  ]);
  const amountText = firstMatch(rawText, [
    /<(?:cbc:)?PayableAmount[^>]*>([0-9.,]+)<\/(?:cbc:)?PayableAmount>/i,
    /<ram:GrandTotalAmount[^>]*>([0-9.,]+)<\/ram:GrandTotalAmount>/i,
    /(?:Gesamtbetrag|Rechnungsbetrag)[\s:]*([0-9.,]+)/i
  ]);
  const issued = firstMatch(rawText, [
    /<(?:cbc:)?IssueDate[^>]*>(\d{4}-\d{2}-\d{2})<\/(?:cbc:)?IssueDate>/i,
    /<udt:DateTimeString[^>]*>(\d{8})<\/udt:DateTimeString>/i
  ]);

  return {
    format,
    rawText,
    invoiceNumber,
    supplierName,
    amount: amountText ? parseAmount(amountText) : null,
    issuedAt: issued ? parseDate(issued) : null
  };
}

function check(key: string, label: string, pass: boolean, success: string, failure: string, failureStatus: "WARN" | "FAIL" = "WARN"): InvoiceCheck {
  return { key, label, status: pass ? "PASS" : failureStatus, detail: pass ? success : failure };
}

function firstMatch(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern)?.[1]?.trim();
    if (match) return match;
  }
  return null;
}

function parseAmount(value: string) {
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseDate(value: string) {
  const normalized = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clean(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
}
