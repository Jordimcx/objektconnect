import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2, CircuitBoard, FileText, Home, ReceiptText, TicketIcon, UsersRound, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { PriorityBadge, StatusBadge } from "@/components/app-shell/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

const closedStatuses = ["ABGESCHLOSSEN", "ABGELEHNT"] as const;

export default async function ObjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSessionUser();
  if (user.role !== "HAUSVERWALTER") redirect("/dashboard");
  const { id } = await params;
  const property = await prisma.property.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      buildings: { include: { units: { include: { leases: { where: { endsAt: null }, include: { tenant: true } }, _count: { select: { tickets: true, documents: true } } } } } },
      tickets: { include: { unit: true, assignedProvider: true, invoices: true, documents: true }, orderBy: { updatedAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      assets: { include: { unit: true, tickets: { select: { id: true, finalCost: true, status: true } } }, orderBy: { name: "asc" } },
      serviceProviders: { include: { provider: { include: { trades: { include: { trade: true } } } } } }
    }
  });
  if (!property) notFound();
  const units = property.buildings.flatMap((building) => building.units);
  const openTickets = property.tickets.filter((ticket) => !closedStatuses.includes(ticket.status as never));
  const repeatTickets = property.tickets.filter((ticket) => ticket.warrantySuspected);
  const totalCost = property.tickets.reduce((sum, ticket) => sum + Number(ticket.finalCost ?? 0), 0);
  const ticketDocuments = property.tickets.flatMap((ticket) => ticket.documents);

  return <div className="space-y-6">
    <Button asChild variant="outline" size="sm"><Link href="/objekte"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Alle Objekte</Link></Button>
    <PageHeader eyebrow="Objektakte" title={property.name} description={property.address} action={<Button asChild variant="outline"><a href={`mailto:${property.contactEmail}`}>{property.contactName}</a></Button>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Summary icon={Home} label="Einheiten" value={String(units.length)} /><Summary icon={UsersRound} label="Vermietet" value={String(units.filter((unit) => unit.leases.length).length)} /><Summary icon={TicketIcon} label="Offene Reparaturen" value={String(openTickets.length)} /><Summary icon={ReceiptText} label="Gesamtkosten" value={`${totalCost.toFixed(0)} EUR`} /><Summary icon={FileText} label="Nachweise" value={String(property.documents.length + ticketDocuments.length)} /></div>

    {repeatTickets.length ? <div className="rounded-md border border-orange-200 bg-orange-50 p-4"><p className="font-bold text-primary">{repeatTickets.length} mögliche Gewährleistungs- oder Wiederholungsfälle</p><p className="mt-1 text-sm text-slate-600">Diese Vorgänge sollten vor einer erneuten Beauftragung gemeinsam geprüft werden.</p></div> : null}

    <section><div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold text-accent">Reparaturhistorie</p><h2 className="text-xl font-bold text-primary">Alle Vorgänge am Objekt</h2></div><Button asChild variant="outline" size="sm"><Link href={`/tickets?q=${encodeURIComponent(property.name)}`}>In Ticketliste öffnen</Link></Button></div>
      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Vorgang</th><th className="px-4 py-3">Einheit</th><th className="px-4 py-3">Kategorie</th><th className="px-4 py-3">Dienstleister</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Kosten</th><th className="px-4 py-3">Aktualisiert</th></tr></thead><tbody>{property.tickets.map((ticket) => <tr key={ticket.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"><td className="px-4 py-4"><Link href={`/tickets/${ticket.id}`} className="font-bold text-primary hover:text-accent">{ticket.number} · {ticket.title}</Link><div className="mt-2 flex gap-2"><PriorityBadge priority={ticket.priority} />{ticket.warrantySuspected ? <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">Wiederholung</span> : null}</div></td><td className="px-4 py-4">{ticket.unit.label}</td><td className="px-4 py-4">{CATEGORY_LABELS[ticket.category]}</td><td className="px-4 py-4">{ticket.assignedProvider?.companyName ?? "Nicht zugewiesen"}</td><td className="px-4 py-4"><StatusBadge status={ticket.status} /></td><td className="px-4 py-4 font-semibold">{ticket.finalCost ? `${Number(ticket.finalCost).toFixed(2)} EUR` : "-"}</td><td className="px-4 py-4 text-slate-500">{formatDate(ticket.updatedAt)}</td></tr>)}</tbody></table></div>
    </section>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Gebäude und Einheiten</CardTitle></CardHeader><CardContent className="space-y-3">{property.buildings.map((building) => <div key={building.id} className="border-b border-slate-100 pb-3 last:border-b-0"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" aria-hidden="true" /><p className="font-bold text-primary">{building.name}</p></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{building.units.map((unit) => <div key={unit.id} className="rounded-md border border-slate-200 bg-slate-50 p-3"><p className="font-semibold text-primary">{unit.label}</p><p className="mt-1 text-xs text-slate-500">{unit.leases[0]?.tenant.name ?? "Leerstand"} · {unit._count.tickets} Vorgänge</p></div>)}</div></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle>Technische Komponenten</CardTitle></CardHeader><CardContent className="space-y-3">{property.assets.length ? property.assets.map((asset) => { const repairCost = asset.tickets.reduce((sum, ticket) => sum + Number(ticket.finalCost ?? 0), 0); return <div key={asset.id} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-b-0"><CircuitBoard className="mt-1 h-5 w-5 text-accent" aria-hidden="true" /><div><p className="font-bold text-primary">{asset.name}</p><p className="mt-1 text-sm text-slate-500">{asset.category} · {asset.unit?.label ?? "Gebäudeweit"} · {asset.tickets.length} Reparaturen · {repairCost.toFixed(2)} EUR</p>{asset.warrantyUntil ? <p className="mt-1 text-xs text-slate-500">Garantie bis {formatDate(asset.warrantyUntil)}</p> : null}</div></div>; }) : <p className="text-sm text-slate-600">Noch keine technischen Komponenten hinterlegt. Sie werden hier mit ihrer Reparaturhistorie geführt.</p>}</CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Freigegebene Partnerbetriebe</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{property.serviceProviders.map(({ provider }) => <div key={provider.id} className="rounded-md border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-accent" aria-hidden="true" /><p className="font-bold text-primary">{provider.companyName}</p></div><p className="mt-2 text-xs text-slate-500">{provider.trades.map(({ trade }) => trade.name).join(", ")}</p></div>)}</CardContent></Card>
  </div>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string }) { return <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-primary">{value}</p></div></div>; }
