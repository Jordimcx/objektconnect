import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ChevronLeft, ChevronRight, KeyRound, Search, TicketIcon, UserCheck, UsersRound } from "lucide-react";
import { CopyLink } from "@/components/app-shell/copy-link";
import { EmptyState } from "@/components/app-shell/empty-state";
import { NoticeToast } from "@/components/app-shell/notice-toast";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { createTenantActivationAction } from "./actions";

const PAGE_SIZE = 20;
const closedStatuses = ["ABGESCHLOSSEN", "ABGELEHNT"] as const;

export default async function TenantsPage({
  searchParams
}: {
  searchParams: Promise<{ activationLink?: string; tenant?: string; mailStatus?: string; error?: string; q?: string; property?: string; occupancy?: string; page?: string }>;
}) {
  const user = await requireSessionUser();
  if (user.role !== "HAUSVERWALTER") redirect("/dashboard");
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const search = query.q?.trim();
  const tenantWhere = { AND: [
    { organizationId: user.organizationId, role: "MIETER" as const },
    search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search, mode: "insensitive" as const } },
        { leases: { some: { unit: { label: { contains: search, mode: "insensitive" as const } } } } }
      ]
    } : {},
    query.property ? { leases: { some: { unit: { building: { propertyId: query.property } } } } } : {},
    query.occupancy === "active" ? { leases: { some: { endsAt: null } } } : {},
    query.occupancy === "inactive" ? { NOT: { leases: { some: { endsAt: null } } } } : {}
  ] };

  const [tenants, total, properties, activeCount, openTicketCount] = await Promise.all([
    prisma.user.findMany({
      where: tenantWhere,
      include: {
        leases: {
          include: { unit: { include: { building: { include: { property: true } } } } },
          orderBy: { startsAt: "desc" }
        },
        tenantTickets: { select: { status: true, updatedAt: true }, orderBy: { updatedAt: "desc" } },
        activationTokens: { where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, take: 1 }
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.user.count({ where: tenantWhere }),
    prisma.property.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.count({ where: { organizationId: user.organizationId, role: "MIETER", leases: { some: { endsAt: null } } } }),
    prisma.ticket.count({ where: { organizationId: user.organizationId, status: { notIn: [...closedStatuses] } } })
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <NoticeToast message={query.error} type="error" />
      <PageHeader eyebrow="Mieterverwaltung" title="Mieter und Mietverhältnisse" description="Nach Objekt, Belegung und Kontakt durchsuchen. Vorgänge und Zugang sind direkt zugeordnet." />
      {query.activationLink ? <div className="rounded-md border border-teal-200 bg-teal-50 p-4"><p className="font-bold text-primary">Aktivierungslink für {query.tenant ?? "Mieter"}</p><p className="mt-1 text-sm text-slate-600">{query.mailStatus === "SENT" ? "Die Aktivierungsmail wurde versendet." : query.mailStatus === "FAILED" ? "Der Mailversand ist fehlgeschlagen. Bitte den Link vorerst direkt weitergeben." : "Der Mailversand ist noch nicht vollständig verbunden."} Der Link läuft nach 48 Stunden ab.</p><div className="mt-3"><CopyLink value={query.activationLink} label="Aktivierungslink kopieren" /></div></div> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary icon={UsersRound} label="Mieter gesamt" value={total} />
        <Summary icon={UserCheck} label="Aktiv vermietet" value={activeCount} />
        <Summary icon={TicketIcon} label="Offene Vorgänge" value={openTicketCount} />
      </div>

      <form className="grid gap-3 border-y border-slate-200 bg-white py-4 md:grid-cols-[minmax(220px,1fr)_220px_190px_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input name="q" defaultValue={query.q} placeholder="Name, E-Mail, Telefon, Einheit" className="pl-9" /></div>
        <NativeSelect name="property" defaultValue={query.property ?? ""} aria-label="Objekt filtern"><option value="">Alle Objekte</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</NativeSelect>
        <NativeSelect name="occupancy" defaultValue={query.occupancy ?? ""} aria-label="Mietstatus filtern"><option value="">Alle Mietverhältnisse</option><option value="active">Aktiv vermietet</option><option value="inactive">Ohne aktiven Vertrag</option></NativeSelect>
        <div className="flex gap-2"><Button type="submit">Filtern</Button><Button asChild type="button" variant="outline"><Link href="/mieter">Zurücksetzen</Link></Button></div>
      </form>

      {tenants.length ? (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Mieter</th><th className="px-4 py-3">Objekt und Einheit</th><th className="px-4 py-3">Kontakt</th><th className="px-4 py-3">Vorgänge</th><th className="px-4 py-3">Zugang</th><th className="px-4 py-3 text-right">Aktion</th></tr></thead>
            <tbody>{tenants.map((tenant) => {
              const activeLease = tenant.leases.find((lease) => !lease.endsAt);
              const lease = activeLease ?? tenant.leases[0];
              const openTickets = tenant.tenantTickets.filter((ticket) => !closedStatuses.includes(ticket.status as never)).length;
              return <tr key={tenant.id} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50">
                <td className="px-4 py-4"><p className="font-bold text-primary">{tenant.name}</p><p className="mt-1 text-xs text-slate-500">{activeLease ? "Aktives Mietverhältnis" : "Kein aktiver Vertrag"}</p></td>
                <td className="px-4 py-4">{lease ? <><p className="font-semibold text-primary">{lease.unit.building.property.name}</p><p className="mt-1 text-slate-500">{lease.unit.building.name} · {lease.unit.label}</p></> : <span className="text-slate-400">Nicht zugeordnet</span>}</td>
                <td className="px-4 py-4"><p>{tenant.email}</p><p className="mt-1 text-slate-500">{tenant.phone ?? "Kein Telefon"}</p></td>
                <td className="px-4 py-4"><p className="font-bold text-primary">{openTickets} offen</p><p className="mt-1 text-slate-500">{tenant.tenantTickets.length} gesamt</p></td>
                <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tenant.activationTokens.length ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{tenant.activationTokens.length ? "Einladung offen" : "Kein offener Link"}</span></td>
                <td className="px-4 py-4 text-right"><form action={createTenantActivationAction}><input type="hidden" name="tenantId" value={tenant.id} /><Button type="submit" variant="outline" size="sm"><KeyRound className="h-4 w-4" aria-hidden="true" />Zugang</Button></form></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : <EmptyState icon={UsersRound} title="Keine Mieter gefunden" description="Lege den ersten Mieter an und ordne das Mietverhältnis einer freien Einheit zu." action={{ label: "Mieter einrichten", href: "/onboarding#mieter" }} />}

      <div className="flex items-center justify-between text-sm"><p className="text-slate-500">{total} Treffer · Seite {page} von {pageCount}</p><div className="flex gap-2"><Button asChild variant="outline" size="sm" disabled={page <= 1}><Link href={pageHref(query, page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Zurück</Link></Button><Button asChild variant="outline" size="sm" disabled={page >= pageCount}><Link href={pageHref(query, page + 1)}>Weiter<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></Button></div></div>
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number }) { return <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-primary">{value}</p></div></div>; }
function pageHref(query: { q?: string; property?: string; occupancy?: string }, page: number) { const params = new URLSearchParams(); if (query.q) params.set("q", query.q); if (query.property) params.set("property", query.property); if (query.occupancy) params.set("occupancy", query.occupancy); params.set("page", String(Math.max(1, page))); return `/mieter?${params}`; }
