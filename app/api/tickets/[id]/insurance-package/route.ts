import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const insuranceInclude = {
  property: true,
  building: true,
  unit: true,
  tenant: true,
  manager: true,
  assignedProvider: true,
  asset: true,
  appointments: { orderBy: { startsAt: "asc" as const } },
  documents: { orderBy: { createdAt: "asc" as const } },
  materials: { orderBy: { createdAt: "asc" as const } },
  invoices: { include: { document: true }, orderBy: { createdAt: "asc" as const } },
  statusHistory: { include: { changedBy: true }, orderBy: { createdAt: "asc" as const } },
  auditLogs: { orderBy: { createdAt: "asc" as const } },
  relatedTicket: { select: { id: true, number: true, title: true, createdAt: true } }
} satisfies Prisma.TicketInclude;

type InsuranceTicket = Prisma.TicketGetPayload<{ include: typeof insuranceInclude }>;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "HAUSVERWALTER") {
    return NextResponse.json({ error: "Zugriff verweigert." }, { status: 403 });
  }
  const { id } = await params;
  const [ticket, organization] = await Promise.all([prisma.ticket.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: insuranceInclude
  }), prisma.organization.findUnique({ where: { id: session.user.organizationId }, select: { name: true } })]);
  if (!ticket) return NextResponse.json({ error: "Vorgang wurde nicht gefunden." }, { status: 404 });

  const html = renderInsurancePackage(ticket, organization?.name ?? "Hausverwaltung");
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ticket.number}-Schadenakte.html"`,
      "Cache-Control": "private, no-store"
    }
  });
}

function renderInsurancePackage(ticket: InsuranceTicket, organizationName: string) {
  const rows = [
    ["Vorgang", `${ticket.number} · ${ticket.title}`],
    ["Objekt", `${ticket.property.name}, ${ticket.property.address}`],
    ["Gebäude / Einheit", `${ticket.building.name} / ${ticket.unit.label}`],
    ["Kategorie / Priorität", `${CATEGORY_LABELS[ticket.category]} / ${PRIORITY_LABELS[ticket.priority]}`],
    ["Status", STATUS_LABELS[ticket.status]],
    ["Mieter", `${ticket.tenant.name} · ${ticket.tenant.email}`],
    ["Dienstleister", ticket.assignedProvider?.companyName ?? "Nicht zugeordnet"],
    ["Kostenrahmen", money(ticket.approvedCostLimit)],
    ["Abschlusskosten", money(ticket.finalCost)],
    ["Gewährleistungsverdacht", ticket.warrantySuspected ? "Ja" : "Nein"],
    ["Zugehöriger Vorgang", ticket.relatedTicket ? `${ticket.relatedTicket.number} · ${ticket.relatedTicket.title}` : "Keiner"],
    ["Bauteil", ticket.asset ? `${ticket.asset.name}${ticket.asset.serialNumber ? ` · ${ticket.asset.serialNumber}` : ""}` : "Nicht zugeordnet"]
  ];
  const documents = ticket.documents.map((document) => `<li><a href="${escape(document.url)}">${escape(document.originalName)}</a> · ${escape(document.kind)} · ${date(document.createdAt)}</li>`).join("");
  const history = ticket.statusHistory.map((entry) => `<tr><td>${date(entry.createdAt)}</td><td>${escape(STATUS_LABELS[entry.toStatus])}</td><td>${escape(entry.changedBy?.name ?? "System")}</td><td>${escape(entry.note ?? "")}</td></tr>`).join("");
  const appointments = ticket.appointments.map((appointment) => `<li>${date(appointment.startsAt)} bis ${date(appointment.endsAt)} · ${escape(appointment.status)}${appointment.cancellationReason ? ` · ${escape(appointment.cancellationReason)}` : ""}</li>`).join("");
  const invoices = ticket.invoices.map((invoice) => `<li>${escape(invoice.invoiceNumber ?? "Ohne Nummer")} · ${money(invoice.amount)} · ${escape(invoice.status)} / Risiko ${escape(invoice.risk)}${invoice.document ? ` · <a href="${escape(invoice.document.url)}">Beleg</a>` : ""}</li>`).join("");
  const materials = ticket.materials.map((material) => `<li>${escape(material.description)} · ${Number(material.quantity)} ${escape(material.unit)} · ${money(material.unitCost)}</li>`).join("");

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escape(ticket.number)} Schadenakte</title><style>body{font-family:Arial,sans-serif;color:#14233c;margin:40px;line-height:1.45}header{border-bottom:3px solid #18b7a0;padding-bottom:16px;margin-bottom:24px}h1{margin:0;font-size:28px}h2{margin-top:30px;font-size:18px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #dbe3ec;padding:8px;text-align:left;vertical-align:top}th{background:#f4f7fa}a{color:#087f72}ul{padding-left:20px}.meta td:first-child{width:220px;font-weight:bold}@media print{body{margin:16mm}a{color:#14233c}}</style></head><body><header><h1>Schaden- und Versicherungspaket</h1><p>${escape(organizationName)} · erstellt am ${date(new Date())}</p></header><table class="meta">${rows.map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join("")}</table><h2>Schadenbeschreibung</h2><p>${escape(ticket.description)}</p><p><strong>Ort:</strong> ${escape(ticket.room)}</p><h2>Ausführung</h2><p>${escape(ticket.completionReport ?? "Noch kein Abschlussbericht vorhanden.")}</p><h2>Termine</h2><ul>${appointments || "<li>Keine Termine dokumentiert.</li>"}</ul><h2>Material</h2><ul>${materials || "<li>Kein Material dokumentiert.</li>"}</ul><h2>Rechnungen und Prüfung</h2><ul>${invoices || "<li>Keine Rechnung dokumentiert.</li>"}</ul><h2>Nachweise und Dokumente</h2><ul>${documents || "<li>Keine Dokumente vorhanden.</li>"}</ul><h2>Lückenloser Verlauf</h2><table><thead><tr><th>Zeitpunkt</th><th>Status</th><th>Akteur</th><th>Begründung</th></tr></thead><tbody>${history}</tbody></table><h2>Prüfprotokoll</h2><p>${ticket.auditLogs.length} unveränderliche System- und Nutzerentscheidungen sind in ObjektConnect hinterlegt.</p></body></html>`;
}

function escape(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
function date(value: Date) { return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(value); }
function money(value: unknown) { return value == null ? "-" : `${Number(value).toFixed(2)} EUR`; }
