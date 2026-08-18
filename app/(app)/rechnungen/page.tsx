import Link from "next/link";
import { AlertTriangle, CheckCircle2, Inbox, ReceiptText, Upload } from "lucide-react";
import { NoticeToast } from "@/components/app-shell/notice-toast";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { ingestInvoiceAction } from "./actions";

const sourceLabels = {
  MANUAL: "Manueller Upload",
  MICROSOFT_365: "Microsoft 365 Testmodus",
  GOOGLE_WORKSPACE: "Google Workspace Testmodus",
  FORWARDING: "Weiterleitungsadresse",
  IMAP: "IMAP-Fallback"
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ notice?: string; type?: "success" | "error" }> }) {
  const user = await requireSessionUser();
  const query = await searchParams;
  if (user.role !== "HAUSVERWALTER") throw new Error("Diese Seite ist der Hausverwaltung vorbehalten.");
  const [invoices, tickets, connectors] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId: user.organizationId },
      include: { ticket: { include: { property: true, unit: true } }, provider: true, document: true, reviewedBy: true },
      orderBy: { createdAt: "desc" }
    }),
    prisma.ticket.findMany({
      where: { organizationId: user.organizationId, status: { notIn: ["ABGELEHNT"] } },
      include: { assignedProvider: true, property: true },
      orderBy: { updatedAt: "desc" },
      take: 100
    }),
    prisma.inboundConnector.findMany({ where: { organizationId: user.organizationId } })
  ]);
  const pending = invoices.filter((invoice) => !["APPROVED", "REJECTED"].includes(invoice.status));
  const highRisk = invoices.filter((invoice) => invoice.risk === "HIGH" && invoice.status !== "APPROVED");
  const approved = invoices.filter((invoice) => invoice.status === "APPROVED");

  return (
    <div className="space-y-6">
      <NoticeToast message={query.notice} type={query.type} />
      <PageHeader eyebrow="Rechnungseingang" title="Rechnungen fachlich prüfen" description="Jede Rechnung wird gegen Auftrag, Ausführungsnachweis und freigegebenen Kostenrahmen abgeglichen. Freigaben bleiben eine bewusste Entscheidung." />
      <div className="grid gap-4 md:grid-cols-3"><Metric icon={Inbox} label="Offen" value={pending.length} /><Metric icon={AlertTriangle} label="Hohes Risiko" value={highRisk.length} tone="red" /><Metric icon={CheckCircle2} label="Freigegeben" value={approved.length} tone="teal" /></div>

      <Card>
        <CardHeader><CardTitle>Lokalen Rechnungseingang testen</CardTitle></CardHeader>
        <CardContent>
          <form action={ingestInvoiceAction} className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2"><Label htmlFor="invoice-ticket">Vorgang</Label><NativeSelect id="invoice-ticket" name="ticketId" required><option value="">Vorgang auswählen</option>{tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.number} · {ticket.property.name} · {ticket.assignedProvider?.companyName ?? "ohne Betrieb"}</option>)}</NativeSelect></div>
            <div><Label htmlFor="invoice-source">Eingang</Label><NativeSelect id="invoice-source" name="source" defaultValue="MANUAL">{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></div>
            <div><Label htmlFor="invoice-number">Rechnungsnummer</Label><Input id="invoice-number" name="invoiceNumber" placeholder="wird sonst erkannt" /></div>
            <div><Label htmlFor="invoice-supplier">Rechnungssteller</Label><Input id="invoice-supplier" name="supplierName" placeholder="wird sonst erkannt" /></div>
            <div><Label htmlFor="invoice-amount">Betrag</Label><Input id="invoice-amount" name="amount" type="number" step="0.01" min="0" placeholder="wird sonst erkannt" /></div>
            <div className="lg:col-span-2"><Label htmlFor="invoice-file">PDF, XRechnung oder ZUGFeRD</Label><Input id="invoice-file" name="invoiceFile" type="file" accept="application/pdf,application/xml,text/xml" required /></div>
            <div className="flex items-end"><Button type="submit" variant="accent" className="w-full"><Upload className="h-4 w-4" aria-hidden="true" />Einlesen und prüfen</Button></div>
          </form>
          <p className="mt-4 text-xs text-slate-500">{connectors.filter((connector) => connector.status === "TEST_MODE").length} Eingangskanäle laufen im lokalen Testmodus. Externe Nachrichten werden erst mit Zugangsdaten abgerufen.</p>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Rechnung</th><th className="px-4 py-3">Vorgang</th><th className="px-4 py-3">Betrag</th><th className="px-4 py-3">Prüfung</th><th className="px-4 py-3">Empfehlung</th><th className="px-4 py-3">Eingang</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{invoices.map((invoice) => <tr key={invoice.id} className="align-top"><td className="px-4 py-4"><p className="font-bold text-primary">{invoice.invoiceNumber ?? "Nummer offen"}</p><p className="mt-1 text-slate-500">{invoice.supplierName ?? invoice.provider?.companyName ?? "Aussteller offen"}</p></td><td className="px-4 py-4"><Link href={`/tickets/${invoice.ticketId}`} className="font-bold text-accent">{invoice.ticket.number}</Link><p className="mt-1 text-slate-500">{invoice.ticket.property.name} · {invoice.ticket.unit.label}</p></td><td className="px-4 py-4 font-bold text-primary">{invoice.amount == null ? "-" : `${Number(invoice.amount).toFixed(2)} EUR`}</td><td className="px-4 py-4"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${invoice.risk === "HIGH" ? "border-red-200 bg-red-50 text-red-700" : invoice.risk === "MEDIUM" ? "border-orange-200 bg-orange-50 text-orange-700" : "border-teal-200 bg-teal-50 text-teal-700"}`}>{invoice.status.replaceAll("_", " ")}</span></td><td className="max-w-md px-4 py-4 text-slate-600">{invoice.recommendation}</td><td className="px-4 py-4 text-slate-500">{sourceLabels[invoice.source]}<br />{formatDate(invoice.createdAt)}</td></tr>)}</tbody>
        </table>
        {!invoices.length ? <div className="p-8 text-center text-sm text-slate-600"><ReceiptText className="mx-auto mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />Noch keine Rechnungen eingegangen.</div> : null}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone = "default" }: { icon: typeof Inbox; label: string; value: number; tone?: "default" | "red" | "teal" }) {
  const iconClass = tone === "red" ? "text-red-600" : tone === "teal" ? "text-accent" : "text-primary";
  return <Card><CardContent className="flex items-center gap-4 p-5"><Icon className={`h-6 w-6 ${iconClass}`} aria-hidden="true" /><div><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-primary">{value}</p></div></CardContent></Card>;
}
