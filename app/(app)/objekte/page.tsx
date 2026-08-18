import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Building2, Search, TicketIcon, Wrench } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";

const closedStatuses = ["ABGESCHLOSSEN", "ABGELEHNT"] as const;

export default async function ObjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string }> }) {
  const user = await requireSessionUser();
  if (user.role !== "HAUSVERWALTER") redirect("/dashboard");
  const query = await searchParams;
  const search = query.q?.trim();
  const where = {
    organizationId: user.organizationId,
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { address: { contains: search, mode: "insensitive" as const } },
      { contactName: { contains: search, mode: "insensitive" as const } }
    ] } : {}),
    ...(query.state === "open" ? { tickets: { some: { status: { notIn: [...closedStatuses] } } } } : {}),
    ...(query.state === "repeat" ? { tickets: { some: { warrantySuspected: true } } } : {}),
    ...(query.state === "clear" ? { tickets: { none: { status: { notIn: [...closedStatuses] } } } } : {})
  };
  const properties = await prisma.property.findMany({
    where,
    include: {
      buildings: { include: { units: { include: { leases: { where: { endsAt: null } } } } } },
      tickets: { select: { status: true, finalCost: true, warrantySuspected: true, incidentKey: true, updatedAt: true } },
      serviceProviders: { include: { provider: { select: { companyName: true } } } },
      _count: { select: { documents: true, assets: true } }
    },
    orderBy: { name: "asc" }
  });
  const totalOpen = properties.reduce((sum, property) => sum + property.tickets.filter((ticket) => !closedStatuses.includes(ticket.status as never)).length, 0);
  const repeatCases = properties.reduce((sum, property) => sum + property.tickets.filter((ticket) => ticket.warrantySuspected).length, 0);
  const totalCost = properties.reduce((sum, property) => sum + property.tickets.reduce((ticketSum, ticket) => ticketSum + Number(ticket.finalCost ?? 0), 0), 0);

  return <div className="space-y-6">
    <PageHeader eyebrow="Objektgedächtnis" title="Objekte und Reparaturakten" description="Alle Reparaturen, Kosten, Wiederholungen, Einheiten und Nachweise dauerhaft am Objekt gebündelt." />
    <div className="grid gap-3 sm:grid-cols-4"><Summary icon={Building2} label="Objekte im Filter" value={String(properties.length)} /><Summary icon={TicketIcon} label="Offene Reparaturen" value={String(totalOpen)} /><Summary icon={AlertTriangle} label="Gewährleistungsfälle" value={String(repeatCases)} /><Summary icon={Wrench} label="Dokumentierte Kosten" value={`${totalCost.toFixed(0)} EUR`} /></div>
    <form className="grid gap-3 border-y border-slate-200 bg-white py-4 md:grid-cols-[minmax(240px,1fr)_240px_auto]">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input name="q" defaultValue={query.q} placeholder="Objekt, Adresse, Ansprechpartner" className="pl-9" /></div>
      <NativeSelect name="state" defaultValue={query.state ?? ""} aria-label="Objektstatus filtern"><option value="">Alle Objekte</option><option value="open">Mit offenen Reparaturen</option><option value="repeat">Mit Wiederholungsfällen</option><option value="clear">Ohne offene Reparatur</option></NativeSelect>
      <div className="flex gap-2"><Button type="submit">Filtern</Button><Button asChild variant="outline"><Link href="/objekte">Zurücksetzen</Link></Button></div>
    </form>
    {properties.length ? <div className="overflow-hidden rounded-md border border-slate-200 bg-white">{properties.map((property) => {
      const units = property.buildings.flatMap((building) => building.units);
      const open = property.tickets.filter((ticket) => !closedStatuses.includes(ticket.status as never)).length;
      const repeats = property.tickets.filter((ticket) => ticket.warrantySuspected).length;
      const cost = property.tickets.reduce((sum, ticket) => sum + Number(ticket.finalCost ?? 0), 0);
      return <Link key={property.id} href={`/objekte/${property.id}`} className="grid gap-4 border-b border-slate-100 px-4 py-5 last:border-b-0 hover:bg-slate-50 lg:grid-cols-[minmax(240px,1.3fr)_repeat(5,minmax(100px,0.6fr))_auto] lg:items-center">
        <div><p className="text-lg font-bold text-primary">{property.name}</p><p className="mt-1 text-sm text-slate-500">{property.address}</p><p className="mt-2 text-xs text-slate-500">{property.contactName} · {property.serviceProviders.length} Partnerbetriebe</p></div>
        <Metric label="Einheiten" value={`${units.length}`} detail={`${units.filter((unit) => unit.leases.length).length} vermietet`} />
        <Metric label="Reparaturen" value={`${open} offen`} detail={`${property.tickets.length} gesamt`} tone={open ? "orange" : undefined} />
        <Metric label="Wiederholung" value={`${repeats}`} detail="Gewährleistung" tone={repeats ? "red" : undefined} />
        <Metric label="Kosten" value={`${cost.toFixed(0)} EUR`} detail="dokumentiert" />
        <Metric label="Objektakte" value={`${property._count.documents}`} detail={`${property._count.assets} Komponenten`} />
        <ArrowRight className="h-5 w-5 text-accent" aria-hidden="true" />
      </Link>;
    })}</div> : <EmptyState icon={Building2} title="Keine Objekte gefunden" description="Lege das erste Objekt mit Gebäude und Wohneinheiten an." action={{ label: "Bestand einrichten", href: "/onboarding#bestand" }} />}
  </div>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) { return <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-primary">{value}</p></div></div>; }
function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "orange" | "red" }) { return <div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className={`mt-1 font-bold ${tone === "red" ? "text-red-700" : tone === "orange" ? "text-orange-700" : "text-primary"}`}>{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>; }
