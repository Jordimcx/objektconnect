import Link from "next/link";
import { Building2, DoorOpen, ExternalLink, Home, QrCode, Search, TicketIcon, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";

const closedStatuses = ["ABGESCHLOSSEN", "ABGELEHNT"] as const;

export default async function UnitsPage({ searchParams }: { searchParams: Promise<{ q?: string; property?: string; occupancy?: string; sort?: string }> }) {
  const user = await requireSessionUser();
  const query = await searchParams;
  const search = query.q?.trim();
  const baseWhere = user.role === "HAUSVERWALTER"
    ? { building: { property: { organizationId: user.organizationId } } }
    : { leases: { some: { tenantId: user.id, endsAt: null } } };
  const where = { AND: [
    baseWhere,
    search ? { OR: [
      { label: { contains: search, mode: "insensitive" as const } },
      { reportingCode: { contains: search, mode: "insensitive" as const } },
      { building: { name: { contains: search, mode: "insensitive" as const } } },
      { leases: { some: { tenant: { name: { contains: search, mode: "insensitive" as const } } } } }
    ] } : {},
    query.property ? { building: { propertyId: query.property } } : {},
    query.occupancy === "occupied" ? { leases: { some: { endsAt: null } } } : {},
    query.occupancy === "vacant" ? { leases: { none: { endsAt: null } } } : {}
  ] };
  const [units, properties, totalUnits, occupiedUnits] = await Promise.all([
    prisma.unit.findMany({
      where,
      include: {
        building: { include: { property: true } },
        leases: { include: { tenant: true }, orderBy: { startsAt: "desc" } },
        tickets: { select: { status: true } },
        _count: { select: { documents: true, assets: true } }
      },
      orderBy: query.sort === "unit"
        ? { label: "asc" }
        : [{ building: { property: { name: "asc" } } }, { building: { name: "asc" } }, { label: "asc" }]
    }),
    prisma.property.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.unit.count({ where: baseWhere }),
    prisma.unit.count({ where: { ...baseWhere, leases: { some: { endsAt: null } } } })
  ]);
  const openTickets = units.reduce((sum, unit) => sum + unit.tickets.filter((ticket) => !closedStatuses.includes(ticket.status as never)).length, 0);

  return <div className="space-y-6">
    <PageHeader eyebrow="Bestandsstruktur" title="Wohneinheiten" description="Belegung, Mieter, Reparaturen, Dokumente und Meldezugänge objektbezogen verwalten." />
    <div className="grid gap-3 sm:grid-cols-4"><Summary icon={DoorOpen} label="Einheiten" value={totalUnits} /><Summary icon={UsersRound} label="Vermietet" value={occupiedUnits} /><Summary icon={Home} label="Leerstand" value={totalUnits - occupiedUnits} /><Summary icon={TicketIcon} label="Offen im Filter" value={openTickets} /></div>
    <form className="grid gap-3 border-y border-slate-200 bg-white py-4 md:grid-cols-[minmax(220px,1fr)_220px_180px_180px_auto]">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input name="q" defaultValue={query.q} placeholder="Einheit, Gebäude, Mieter, Meldecode" className="pl-9" /></div>
      <NativeSelect name="property" defaultValue={query.property ?? ""} aria-label="Objekt filtern"><option value="">Alle Objekte</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</NativeSelect>
      <NativeSelect name="occupancy" defaultValue={query.occupancy ?? ""} aria-label="Belegung filtern"><option value="">Jede Belegung</option><option value="occupied">Vermietet</option><option value="vacant">Leerstand</option></NativeSelect>
      <NativeSelect name="sort" defaultValue={query.sort ?? "object"} aria-label="Sortierung"><option value="object">Nach Objekt</option><option value="unit">Nach Einheit</option></NativeSelect>
      <div className="flex gap-2"><Button type="submit">Filtern</Button><Button asChild variant="outline"><Link href="/wohneinheiten">Zurücksetzen</Link></Button></div>
    </form>
    {units.length ? <div className="overflow-x-auto rounded-md border border-slate-200 bg-white"><table className="w-full min-w-[1040px] text-left text-sm">
      <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Objekt</th><th className="px-4 py-3">Einheit</th><th className="px-4 py-3">Belegung</th><th className="px-4 py-3">Reparaturen</th><th className="px-4 py-3">Akte</th><th className="px-4 py-3">Meldezugang</th></tr></thead>
      <tbody>{units.map((unit) => {
        const activeLease = unit.leases.find((lease) => !lease.endsAt);
        const open = unit.tickets.filter((ticket) => !closedStatuses.includes(ticket.status as never)).length;
        return <tr key={unit.id} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50">
          <td className="px-4 py-4"><p className="font-bold text-primary">{unit.building.property.name}</p><p className="mt-1 text-slate-500">{unit.building.name}</p></td>
          <td className="px-4 py-4"><p className="font-bold text-primary">{unit.label}</p><p className="mt-1 text-slate-500">Etage {unit.floor} · {unit.rooms} Zimmer · {unit.squareMeter} m²</p></td>
          <td className="px-4 py-4">{activeLease ? <><p className="font-semibold text-primary">{activeLease.tenant.name}</p><p className="mt-1 text-xs text-teal-700">Aktiv vermietet</p></> : <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">Leerstand</span>}</td>
          <td className="px-4 py-4"><p className="font-bold text-primary">{open} offen</p><p className="mt-1 text-slate-500">{unit.tickets.length} gesamt</p></td>
          <td className="px-4 py-4"><p className="font-semibold text-primary">{unit._count.documents} Dokumente</p><p className="mt-1 text-slate-500">{unit._count.assets} Komponenten</p></td>
          <td className="px-4 py-4"><div className="flex items-center gap-2"><QrCode className="h-4 w-4 text-accent" aria-hidden="true" /><code className="font-bold text-primary">{unit.reportingCode}</code></div><Link href={`/schaden-melden?code=${unit.reportingCode}`} target="_blank" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent">Meldeweg testen<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></Link></td>
        </tr>;
      })}</tbody>
    </table></div> : <EmptyState icon={Building2} title="Keine Wohneinheiten gefunden" description="Erfasse Gebäude und Wohneinheiten als Grundlage für Mietverhältnisse." action={{ label: "Wohneinheiten einrichten", href: "/onboarding#bestand" }} />}
  </div>;
}

function Summary({ icon: Icon, label, value }: { icon: typeof DoorOpen; label: string; value: number }) { return <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-primary">{value}</p></div></div>; }
