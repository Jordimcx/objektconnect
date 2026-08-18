import Link from "next/link";
import { FileCheck2, FileImage, FileText, FolderOpen, ReceiptText, Search } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { providerIdsForUser, ticketWhereForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

const kindLabels = {
  GENERAL: "Allgemein",
  DAMAGE_PHOTO: "Schadensfoto",
  BEFORE_PHOTO: "Vorher-Foto",
  AFTER_PHOTO: "Nachher-Foto",
  WORK_REPORT: "Arbeitsbericht",
  INVOICE: "Rechnung",
  OFFER: "Angebot",
  INSURANCE_PACKAGE: "Versicherungspaket"
} as const;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string; scope?: string; sort?: string }> }) {
  const user = await requireSessionUser();
  const query = await searchParams;
  const providerIds = providerIdsForUser(user);
  const baseWhere = user.role === "HAUSVERWALTER"
    ? { organizationId: user.organizationId }
    : user.role === "DIENSTLEISTER"
      ? {
          ticket: ticketWhereForUser(user),
          OR: [
            { visibility: { in: ["ALL" as const, "PROVIDER" as const] } },
            { kind: "INVOICE" as const, invoice: { providerId: { in: providerIds } } }
          ]
        }
      : {
          organizationId: user.organizationId,
          OR: [
            { ownerId: user.id },
            { ticket: ticketWhereForUser(user) },
            { unit: { leases: { some: { tenantId: user.id, endsAt: null } } } }
          ]
        };
  const where = { AND: [
    baseWhere,
    query.scope ? (user.role === "DIENSTLEISTER" ? { organizationId: query.scope } : { OR: [{ propertyId: query.scope }, { ticket: { propertyId: query.scope } }] }) : {},
    query.kind ? { kind: query.kind as keyof typeof kindLabels } : {},
    query.q ? { OR: [
      { originalName: { contains: query.q, mode: "insensitive" as const } },
      { ticket: { number: { contains: query.q, mode: "insensitive" as const } } },
      { ticket: { title: { contains: query.q, mode: "insensitive" as const } } },
      { property: { name: { contains: query.q, mode: "insensitive" as const } } }
    ] } : {}
  ] };
  const [documents, scopes] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        ticket: { include: { property: true, unit: true, assignedProvider: true } },
        property: true,
        unit: true,
        invoice: { select: { invoiceNumber: true, amount: true, status: true } }
      },
      orderBy: query.sort === "name" ? { originalName: "asc" } : { createdAt: "desc" },
      take: 250
    }),
    user.role === "DIENSTLEISTER"
      ? prisma.organization.findMany({ where: { serviceProviders: { some: { id: { in: providerIds } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : prisma.property.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } })
  ]);
  const grouped = new Map<string, typeof documents>();
  for (const document of documents) {
    const group = user.role === "DIENSTLEISTER"
      ? document.organization.name
      : document.ticket?.property.name ?? document.property?.name ?? "Allgemeine Verwaltung";
    grouped.set(group, [...(grouped.get(group) ?? []), document]);
  }
  const invoices = documents.filter((document) => document.kind === "INVOICE").length;
  const photos = documents.filter((document) => ["DAMAGE_PHOTO", "BEFORE_PHOTO", "AFTER_PHOTO"].includes(document.kind)).length;
  const reports = documents.filter((document) => document.kind === "WORK_REPORT").length;

  return <div className="space-y-6">
    <PageHeader eyebrow="Dokumentencenter" title={user.role === "DIENSTLEISTER" ? "Dokumente aller Auftraggeber" : "Dokumente und Nachweise"} description={user.role === "DIENSTLEISTER" ? "Nach Verwaltung, Auftrag und Dokumentart geordnet. Interne Verwaltungsunterlagen bleiben ausgeblendet." : "Objektbezogene Fotos, Berichte, Rechnungen und Nachweise mit direktem Vorgangsbezug."} />
    <div className="grid gap-3 sm:grid-cols-4"><Summary icon={FolderOpen} label="Dokumente" value={documents.length} /><Summary icon={FileImage} label="Fotos" value={photos} /><Summary icon={ReceiptText} label="Rechnungen" value={invoices} /><Summary icon={FileCheck2} label="Berichte" value={reports} /></div>
    <form className="grid gap-3 border-y border-slate-200 bg-white py-4 md:grid-cols-[minmax(220px,1fr)_210px_220px_170px_auto]">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input name="q" defaultValue={query.q} placeholder="Datei, Vorgang oder Objekt" className="pl-9" /></div>
      <NativeSelect name="kind" defaultValue={query.kind ?? ""} aria-label="Dokumentart filtern"><option value="">Alle Dokumentarten</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect>
      <NativeSelect name="scope" defaultValue={query.scope ?? ""} aria-label={user.role === "DIENSTLEISTER" ? "Auftraggeber filtern" : "Objekt filtern"}><option value="">{user.role === "DIENSTLEISTER" ? "Alle Auftraggeber" : "Alle Objekte"}</option>{scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}</NativeSelect>
      <NativeSelect name="sort" defaultValue={query.sort ?? "date"} aria-label="Sortierung"><option value="date">Neueste zuerst</option><option value="name">Nach Dateiname</option></NativeSelect>
      <div className="flex gap-2"><Button type="submit">Filtern</Button><Button asChild variant="outline"><Link href="/dokumente">Zurücksetzen</Link></Button></div>
    </form>

    {documents.length ? [...grouped.entries()].map(([group, items]) => <section key={group}>
      <div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold text-accent">{user.role === "DIENSTLEISTER" ? "Auftraggeber" : "Objektakte"}</p><h2 className="text-xl font-bold text-primary">{group}</h2></div><p className="text-sm text-slate-500">{items.length} Dokumente</p></div>
      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Dokument</th><th className="px-4 py-3">Art</th><th className="px-4 py-3">Vorgang</th><th className="px-4 py-3">Einheit</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">Datum</th></tr></thead><tbody>{items.map((document) => <tr key={document.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"><td className="px-4 py-4"><a href={document.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 font-bold text-primary hover:text-accent"><FileText className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" /><span className="max-w-64 truncate">{document.originalName}</span></a></td><td className="px-4 py-4"><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">{kindLabels[document.kind]}</span></td><td className="px-4 py-4">{document.ticket ? <Link href={`/tickets/${document.ticket.id}`} className="font-semibold text-primary hover:text-accent">{document.ticket.number} · {document.ticket.title}</Link> : <span className="text-slate-400">Ohne Vorgang</span>}</td><td className="px-4 py-4">{document.ticket?.unit.label ?? document.unit?.label ?? "-"}</td><td className="px-4 py-4">{document.invoice ? <><p className="font-semibold text-primary">{document.invoice.invoiceNumber ?? "Rechnung"}</p><p className="mt-1 text-xs text-slate-500">{document.invoice.amount ? `${Number(document.invoice.amount).toFixed(2)} EUR` : "Betrag offen"} · {document.invoice.status}</p></> : <span className="text-slate-500">{Math.round(document.sizeBytes / 1024)} KB</span>}</td><td className="px-4 py-4 text-slate-500">{formatDate(document.createdAt)}</td></tr>)}</tbody></table></div>
    </section>) : <EmptyState icon={FileText} title="Keine Dokumente gefunden" description="Passe die Filter an oder öffne einen Vorgang mit Nachweisen." />}
  </div>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof FolderOpen; label: string; value: number }) { return <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-primary">{value}</p></div></div>; }
