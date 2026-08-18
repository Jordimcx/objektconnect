import Link from "next/link";
import { ArrowRight, Building2, CalendarCheck2, CalendarDays, MapPin, Search, UserRound } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ticketWhereForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; horizon?: string; scope?: string }> }) {
  const user = await requireSessionUser();
  const query = await searchParams;
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekEnd = new Date(todayEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
  const ticketFilter = {
    ...ticketWhereForUser(user),
    ...(query.scope ? (user.role === "DIENSTLEISTER" ? { organizationId: query.scope } : { propertyId: query.scope }) : {}),
    ...(query.q ? { OR: [
      { number: { contains: query.q, mode: "insensitive" as const } },
      { title: { contains: query.q, mode: "insensitive" as const } },
      { property: { name: { contains: query.q, mode: "insensitive" as const } } },
      { tenant: { name: { contains: query.q, mode: "insensitive" as const } } }
    ] } : {})
  };
  const horizonFilter = query.horizon === "today" ? { startsAt: { gte: todayStart, lte: todayEnd } }
    : query.horizon === "week" ? { startsAt: { gte: todayStart, lte: weekEnd } }
      : query.horizon === "past" ? { startsAt: { lt: todayStart } }
        : query.horizon === "future" ? { startsAt: { gte: todayStart } }
          : {};

  const [appointments, actionTickets, scopes] = await Promise.all([
    prisma.appointment.findMany({
      where: { ticket: ticketFilter, ...(query.status ? { status: query.status as "PROPOSED" | "CONFIRMED" | "DECLINED" | "CANCELLED" | "NO_SHOW" } : {}), ...horizonFilter },
      include: {
        proposedBy: true,
        ticket: { include: { property: true, unit: true, tenant: true, assignedProvider: { include: { organization: { select: { id: true, name: true } } } } } }
      },
      orderBy: { startsAt: "asc" },
      take: 150
    }),
    prisma.ticket.findMany({
      where: { ...ticketFilter, status: { in: ["DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG"] } },
      include: { property: true, unit: true, tenant: true, assignedProvider: { include: { organization: { select: { name: true } } } } },
      orderBy: { updatedAt: "asc" },
      take: 20
    }),
    user.role === "DIENSTLEISTER"
      ? prisma.organization.findMany({ where: { serviceProviders: { some: { id: { in: user.serviceProviderIds ?? [] } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : prisma.property.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } })
  ]);

  const confirmedFuture = appointments.filter((appointment) => appointment.status === "CONFIRMED" && appointment.startsAt >= now);
  const nextAppointment = confirmedFuture[0];
  const today = appointments.filter((appointment) => appointment.status === "CONFIRMED" && appointment.startsAt >= todayStart && appointment.startsAt <= todayEnd);
  const proposed = appointments.filter((appointment) => appointment.status === "PROPOSED");
  const upcoming = confirmedFuture.filter((appointment) => appointment.startsAt > todayEnd);
  const history = appointments.filter((appointment) => ["CANCELLED", "NO_SHOW", "DECLINED"].includes(appointment.status) || appointment.endsAt < now);

  return <div className="space-y-6">
    <PageHeader eyebrow={user.role === "DIENSTLEISTER" ? "Einsatzplanung" : "Terminsteuerung"} title={user.role === "DIENSTLEISTER" ? "Was steht als Nächstes an?" : "Termine und offene Abstimmungen"} description={user.role === "DIENSTLEISTER" ? "Tagesagenda über alle Auftraggeber mit Einsatzort, Kontakt und nächstem Schritt." : "Bestätigte Einsätze, offene Mieterauswahl und Terminprobleme in einer handlungsorientierten Agenda."} />

    <form className="grid gap-3 border-y border-slate-200 bg-white py-4 md:grid-cols-[minmax(220px,1fr)_190px_190px_220px_auto]">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input name="q" defaultValue={query.q} placeholder="Vorgang, Objekt oder Mieter" className="pl-9" /></div>
      <NativeSelect name="horizon" defaultValue={query.horizon ?? ""} aria-label="Zeitraum filtern"><option value="">Alle Zeiträume</option><option value="today">Heute</option><option value="week">Nächste 7 Tage</option><option value="future">Zukünftig</option><option value="past">Vergangen</option></NativeSelect>
      <NativeSelect name="status" defaultValue={query.status ?? ""} aria-label="Terminstatus filtern"><option value="">Alle Terminstatus</option><option value="CONFIRMED">Bestätigt</option><option value="PROPOSED">Vorgeschlagen</option><option value="CANCELLED">Abgesagt</option><option value="NO_SHOW">Nicht erschienen</option></NativeSelect>
      <NativeSelect name="scope" defaultValue={query.scope ?? ""} aria-label={user.role === "DIENSTLEISTER" ? "Auftraggeber filtern" : "Objekt filtern"}><option value="">{user.role === "DIENSTLEISTER" ? "Alle Auftraggeber" : "Alle Objekte"}</option>{scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name}</option>)}</NativeSelect>
      <div className="flex gap-2"><Button type="submit">Filtern</Button><Button asChild variant="outline"><Link href="/termine">Zurücksetzen</Link></Button></div>
    </form>

    {nextAppointment ? <section className="grid gap-5 border-l-4 border-accent bg-white p-5 shadow-soft lg:grid-cols-[180px_1fr_auto] lg:items-center">
      <div><p className="text-xs font-semibold uppercase text-slate-500">Nächster bestätigter Einsatz</p><p className="mt-2 text-2xl font-bold text-primary">{timeLabel(nextAppointment.startsAt)}</p><p className="mt-1 text-sm text-slate-500">{dayLabel(nextAppointment.startsAt)}</p></div>
      <div><p className="text-lg font-bold text-primary">{nextAppointment.ticket.number} · {nextAppointment.ticket.title}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600"><span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" aria-hidden="true" />{nextAppointment.ticket.property.address}, {nextAppointment.ticket.unit.label}</span><span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-accent" aria-hidden="true" />{nextAppointment.ticket.tenant.name} · {nextAppointment.ticket.tenant.phone ?? nextAppointment.ticket.tenant.email}</span>{user.role === "DIENSTLEISTER" ? <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-accent" aria-hidden="true" />{nextAppointment.ticket.assignedProvider?.organization.name}</span> : null}</div><p className="mt-3 text-sm font-semibold text-teal-700">Nächster Schritt: Einsatz vorbereiten und zum Termin Status „Arbeit begonnen“ setzen.</p></div>
      <Button asChild variant="accent"><Link href={`/tickets/${nextAppointment.ticketId}`}>Auftrag öffnen<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
    </section> : null}

    {actionTickets.length ? <section><SectionTitle eyebrow="Vor der Terminplanung" title="Hier ist eine Aktion nötig" count={actionTickets.length} /><div className="mt-3 grid gap-3 md:grid-cols-2">{actionTickets.map((ticket) => <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="grid gap-3 rounded-md border border-orange-200 bg-orange-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-bold text-primary">{ticket.number} · {ticket.title}</p><p className="mt-1 text-sm text-slate-600">{ticket.property.name} · {ticket.unit.label} · {ticket.tenant.name}</p><p className="mt-2 text-sm font-semibold text-orange-700">{ticket.status === "DIENSTLEISTER_ANGEFRAGT" ? "Auftrag annehmen oder ablehnen" : "Terminoptionen senden oder Mieterauswahl abwarten"}</p></div><ArrowRight className="h-5 w-5 text-orange-700" aria-hidden="true" /></Link>)}</div></section> : null}

    {today.length ? <AgendaSection eyebrow="Tagesagenda" title="Heute" items={today} userRole={user.role} /> : <div className="rounded-md border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><CalendarCheck2 className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="font-bold text-primary">Heute keine bestätigten Einsätze</p><p className="mt-1 text-sm text-slate-500">Offene Abstimmungen und kommende Termine stehen darunter.</p></div></div></div>}
    {proposed.length ? <AgendaSection eyebrow="Mieterauswahl" title="Vorgeschlagene Termine" items={proposed} userRole={user.role} proposed /> : null}
    {upcoming.length ? <AgendaSection eyebrow="Planung" title="Kommende bestätigte Einsätze" items={upcoming} userRole={user.role} /> : null}
    {history.length ? <AgendaSection eyebrow="Verlauf" title="Vergangene oder ausgefallene Termine" items={history.slice(-20).reverse()} userRole={user.role} subdued /> : null}
    {!appointments.length && !actionTickets.length ? <EmptyState icon={CalendarDays} title="Keine Termine gefunden" description="Für die aktuelle Auswahl gibt es keine Terminabstimmungen oder Einsätze." /> : null}
  </div>;
}

type AppointmentItem = Awaited<ReturnType<typeof prisma.appointment.findMany<{ include: { proposedBy: true; ticket: { include: { property: true; unit: true; tenant: true; assignedProvider: { include: { organization: { select: { id: true; name: true } } } } } } } }>>>[number];

function AgendaSection({ eyebrow, title, items, userRole, proposed = false, subdued = false }: { eyebrow: string; title: string; items: AppointmentItem[]; userRole: string; proposed?: boolean; subdued?: boolean }) {
  return <section><SectionTitle eyebrow={eyebrow} title={title} count={items.length} /><div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">{items.map((appointment) => <Link key={appointment.id} href={`/tickets/${appointment.ticketId}`} className={`grid gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0 hover:bg-slate-50 md:grid-cols-[150px_1fr_220px_auto] md:items-center ${subdued ? "opacity-75" : ""}`}><div><p className="font-bold text-primary">{timeLabel(appointment.startsAt)}</p><p className="mt-1 text-xs text-slate-500">{dayLabel(appointment.startsAt)}</p></div><div><p className="font-bold text-primary">{appointment.ticket.number} · {appointment.ticket.title}</p><p className="mt-1 text-sm text-slate-500">{appointment.ticket.property.name} · {appointment.ticket.unit.label} · {appointment.ticket.tenant.name}</p></div><div><p className="text-sm font-semibold text-primary">{proposed ? "Wartet auf Auswahl des Mieters" : appointment.status === "CONFIRMED" ? "Bestätigter Einsatz" : appointment.status === "NO_SHOW" ? "Nicht erschienen" : appointment.status === "CANCELLED" ? "Abgesagt" : "Nicht gewählt"}</p>{userRole === "DIENSTLEISTER" ? <p className="mt-1 text-xs text-slate-500">{appointment.ticket.assignedProvider?.organization.name}</p> : null}</div><div className="flex items-center gap-3"><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">{appointment.status === "CONFIRMED" ? "Bestätigt" : appointment.status === "PROPOSED" ? "Vorgeschlagen" : appointment.status === "NO_SHOW" ? "Nicht erschienen" : appointment.status === "CANCELLED" ? "Abgesagt" : "Abgelehnt"}</span><ArrowRight className="h-4 w-4 text-accent" aria-hidden="true" /></div></Link>)}</div></section>;
}

function SectionTitle({ eyebrow, title, count }: { eyebrow: string; title: string; count: number }) { return <div className="flex items-end justify-between gap-3"><div><p className="text-sm font-semibold text-accent">{eyebrow}</p><h2 className="text-xl font-bold text-primary">{title}</h2></div><p className="text-sm text-slate-500">{count} {count === 1 ? "Eintrag" : "Einträge"}</p></div>; }
function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function endOfDay(date: Date) { const value = new Date(date); value.setHours(23, 59, 59, 999); return value; }
function timeLabel(date: Date) { return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date); }
function dayLabel(date: Date) { return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long" }).format(date); }
