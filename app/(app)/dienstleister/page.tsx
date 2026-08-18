import Link from "next/link";
import { redirect } from "next/navigation";
import { BriefcaseBusiness, KeyRound, Mail, Search, UsersRound, Wrench } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { providerIdsForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";

const closedStatuses = ["ABGESCHLOSSEN", "ABGELEHNT"] as const;

export default async function ProvidersPage({ searchParams }: { searchParams: Promise<{ q?: string; trade?: string; status?: string; workload?: string }> }) {
  const user = await requireSessionUser();
  if (user.role === "MIETER") redirect("/dashboard");
  const query = await searchParams;
  const search = query.q?.trim();
  const providerIds = providerIdsForUser(user);
  const where = {
    ...(user.role === "DIENSTLEISTER" ? { id: { in: providerIds } } : { organizationId: user.organizationId }),
    ...(search ? { OR: [
      { companyName: { contains: search, mode: "insensitive" as const } },
      { contactName: { contains: search, mode: "insensitive" as const } },
      { email: { contains: search, mode: "insensitive" as const } },
      { serviceArea: { contains: search, mode: "insensitive" as const } }
    ] } : {}),
    ...(query.trade ? { trades: { some: { tradeId: query.trade } } } : {}),
    ...(query.status ? { status: query.status as "ACTIVE" | "INACTIVE" } : {}),
    ...(query.workload === "open" ? { assignedTickets: { some: { status: { notIn: [...closedStatuses] } } } } : {}),
    ...(query.workload === "free" ? { assignedTickets: { none: { status: { notIn: [...closedStatuses] } } } } : {})
  };

  const [providers, trades] = await Promise.all([
    prisma.serviceProvider.findMany({
      where,
      include: {
        organization: { select: { name: true } },
        trades: { include: { trade: true } },
        properties: { include: { property: { select: { name: true } } } },
        assignedTickets: { select: { status: true, appointmentAt: true, updatedAt: true } }
      },
      orderBy: [{ status: "asc" }, { companyName: "asc" }]
    }),
    prisma.trade.findMany({
      where: user.role === "DIENSTLEISTER" ? { providers: { some: { providerId: { in: providerIds } } } } : { organizationId: user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    })
  ]);
  const emails = [...new Set(providers.map((provider) => provider.email.toLowerCase()))];
  const accounts = emails.length ? await prisma.user.findMany({ where: { role: "DIENSTLEISTER", email: { in: emails, mode: "insensitive" } }, select: { email: true } }) : [];
  const accountEmails = new Set(accounts.map((account) => account.email.toLowerCase()));
  const openJobs = providers.reduce((sum, provider) => sum + provider.assignedTickets.filter((ticket) => !closedStatuses.includes(ticket.status as never)).length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={user.role === "DIENSTLEISTER" ? "Zentraler Dienstleisterzugang" : "Dienstleisterverwaltung"}
        title={user.role === "DIENSTLEISTER" ? "Meine Auftraggeber" : "Dienstleister"}
        description={user.role === "DIENSTLEISTER" ? "Alle Verwaltungen, Aufträge und Zugänge, die Ihrer Firmen-E-Mail zugeordnet sind." : "Betriebe nach Gewerk, Auslastung, Zugang und Objektfreigabe steuern."}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary icon={Wrench} label={user.role === "DIENSTLEISTER" ? "Kundenverwaltungen" : "Betriebe"} value={providers.length} />
        <Summary icon={BriefcaseBusiness} label="Offene Aufträge" value={openJobs} />
        <Summary icon={KeyRound} label="Mit Sammelzugang" value={providers.filter((provider) => accountEmails.has(provider.email.toLowerCase())).length} />
      </div>

      <form className="grid gap-3 border-y border-slate-200 bg-white py-4 md:grid-cols-[minmax(220px,1fr)_200px_160px_180px_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input name="q" defaultValue={query.q} placeholder="Firma, Kontakt, E-Mail, Gebiet" className="pl-9" /></div>
        <NativeSelect name="trade" defaultValue={query.trade ?? ""} aria-label="Gewerk filtern"><option value="">Alle Gewerke</option>{trades.map((trade) => <option key={trade.id} value={trade.id}>{trade.name}</option>)}</NativeSelect>
        <NativeSelect name="status" defaultValue={query.status ?? ""} aria-label="Status filtern"><option value="">Alle Status</option><option value="ACTIVE">Aktiv</option><option value="INACTIVE">Inaktiv</option></NativeSelect>
        <NativeSelect name="workload" defaultValue={query.workload ?? ""} aria-label="Auslastung filtern"><option value="">Jede Auslastung</option><option value="open">Mit offenen Aufträgen</option><option value="free">Aktuell frei</option></NativeSelect>
        <div className="flex gap-2"><Button type="submit">Filtern</Button><Button asChild variant="outline"><Link href="/dienstleister">Zurücksetzen</Link></Button></div>
      </form>

      {providers.length ? <div className="overflow-x-auto rounded-md border border-slate-200 bg-white"><table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Betrieb</th>{user.role === "DIENSTLEISTER" ? <th className="px-4 py-3">Auftraggeber</th> : null}<th className="px-4 py-3">Gewerke</th><th className="px-4 py-3">Objekte</th><th className="px-4 py-3">Leistung</th><th className="px-4 py-3">Aufträge</th><th className="px-4 py-3">Zugang</th></tr></thead>
        <tbody>{providers.map((provider) => {
          const open = provider.assignedTickets.filter((ticket) => !closedStatuses.includes(ticket.status as never)).length;
          const hasAccount = accountEmails.has(provider.email.toLowerCase());
          return <tr key={provider.id} className="border-b border-slate-100 align-top last:border-b-0 hover:bg-slate-50">
            <td className="px-4 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-primary">{provider.companyName}</p><p className="mt-1 text-slate-500">{provider.contactName}</p><p className="mt-1 text-xs text-slate-500">{provider.email} · {provider.phone}</p></div><Badge variant={provider.status === "ACTIVE" ? "success" : "default"}>{provider.status === "ACTIVE" ? "Aktiv" : "Inaktiv"}</Badge></div></td>
            {user.role === "DIENSTLEISTER" ? <td className="px-4 py-4 font-semibold text-primary">{provider.organization.name}</td> : null}
            <td className="px-4 py-4"><div className="flex max-w-56 flex-wrap gap-1.5">{provider.trades.map(({ trade }) => <span key={trade.id} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{trade.name}</span>)}</div></td>
            <td className="px-4 py-4"><p className="font-semibold text-primary">{provider.properties.length} freigegeben</p><p className="mt-1 max-w-48 truncate text-slate-500">{provider.properties.map(({ property }) => property.name).join(", ") || "Noch keine Zuordnung"}</p></td>
            <td className="px-4 py-4"><p className="font-bold text-primary">{provider.rating.toFixed(1)} / 5</p><p className="mt-1 text-slate-500">Ø {provider.averageResponseHours} Std. Reaktion</p></td>
            <td className="px-4 py-4"><p className="font-bold text-primary">{open} offen</p><p className="mt-1 text-slate-500">{provider.assignedTickets.length} gesamt</p></td>
            <td className="px-4 py-4"><p className="flex items-center gap-2 font-semibold text-primary"><Mail className="h-4 w-4 text-accent" aria-hidden="true" />E-Mail-Link aktiv</p><p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><KeyRound className="h-4 w-4" aria-hidden="true" />{hasAccount ? "Im Sammelkonto sichtbar" : "Kein Login erforderlich"}</p></td>
          </tr>;
        })}</tbody>
      </table></div> : <EmptyState icon={UsersRound} title="Keine Dienstleister gefunden" description="Hinterlege passende Partnerbetriebe mit Gewerken und Zuständigkeiten." action={{ label: "Dienstleister einrichten", href: "/onboarding#dienstleister" }} />}
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: typeof Wrench; label: string; value: number }) { return <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-primary">{value}</p></div></div>; }
