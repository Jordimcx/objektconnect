import Link from "next/link";
import { AlertTriangle, Bot, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Inbox, MessageSquareWarning, Plus, ShieldAlert, Sparkles, TicketIcon } from "lucide-react";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { PriorityBadge, StatusBadge } from "@/components/app-shell/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/constants";
import { ticketWhereForUser } from "@/lib/permissions";
import { getOperationalException, type OperationalException } from "@/lib/operations";
import { getOnboardingProgress } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { processOperationalReminders } from "@/lib/ticket-service";
import { formatDateTime, isOverdue } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireSessionUser();
  if (user.role === "HAUSVERWALTER") await processOperationalReminders(user.organizationId);
  const where = ticketWhereForUser(user);
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const setupPromise = user.role === "HAUSVERWALTER"
    ? Promise.all([
        prisma.organization.findUniqueOrThrow({
          where: { id: user.organizationId },
          select: {
            name: true,
            settings: { select: { senderName: true, senderEmail: true } },
            _count: { select: { properties: true, serviceProviders: true, users: { where: { role: "MIETER" } } } }
          }
        }),
        prisma.unit.count({ where: { building: { property: { organizationId: user.organizationId } } } })
      ])
    : Promise.resolve(null);

  const [tickets, notifications, setup] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        property: true,
        tenant: true,
        assignedProvider: { include: { organization: { select: { name: true } } } }
      },
      orderBy: { updatedAt: "desc" },
      take: user.role === "HAUSVERWALTER" ? 100 : 20
    }),
    prisma.notification.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    setupPromise
  ]);

  const openTickets = tickets.filter((ticket) => !["ABGESCHLOSSEN", "ABGELEHNT"].includes(ticket.status));
  const overdueTickets = tickets.filter((ticket) => isOverdue(ticket.dueDate) && ticket.status !== "ABGESCHLOSSEN");
  const todayAppointments = tickets.filter((ticket) => {
    if (!ticket.appointmentAt) return false;
    const time = ticket.appointmentAt.getTime();
    return time >= startOfDay.getTime() && time <= endOfDay.getTime();
  });
  const waitingQuestions = tickets.filter((ticket) => ticket.status === "RUECKFRAGE_AN_MIETER");
  const completed = tickets.filter((ticket) => ticket.status === "ABGESCHLOSSEN");
  const exceptions = tickets
    .map((ticket) => ({ ticket, exception: getOperationalException(ticket, now) }))
    .filter((entry): entry is { ticket: (typeof tickets)[number]; exception: OperationalException } => Boolean(entry.exception))
    .sort((left, right) => severityRank(left.exception.severity) - severityRank(right.exception.severity));
  const autopilotTickets = openTickets.filter((ticket) => !getOperationalException(ticket, now));
  const statusData = Object.entries(
    tickets.reduce<Record<string, number>>((acc, ticket) => {
      acc[STATUS_LABELS[ticket.status]] = (acc[STATUS_LABELS[ticket.status]] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));
  const categoryData = Object.entries(
    tickets.reduce<Record<string, number>>((acc, ticket) => {
      acc[CATEGORY_LABELS[ticket.category]] = (acc[CATEGORY_LABELS[ticket.category]] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));
  const onboarding = setup ? getOnboardingProgress({
    organizationName: setup[0].name,
    senderName: setup[0].settings?.senderName ?? "",
    senderEmail: setup[0].settings?.senderEmail ?? null,
    propertyCount: setup[0]._count.properties,
    unitCount: setup[1],
    tenantCount: setup[0]._count.users,
    providerCount: setup[0]._count.serviceProviders
  }) : null;

  if (user.role === "MIETER") {
    return (
      <DashboardFrame
        eyebrow="Mieter-Dashboard"
        title="Ihre Meldungen"
        action={
          <Button asChild variant="accent" size="lg">
            <Link href="/tickets/new">
              <Plus className="h-5 w-5" aria-hidden="true" />
              Schaden melden
            </Link>
          </Button>
        }
      >
        <Stats
          items={[
            { label: "Aktuelle Meldungen", value: openTickets.length, icon: TicketIcon },
            { label: "Nächster Termin", value: todayAppointments[0] ? formatDateTime(todayAppointments[0].appointmentAt) : "Keiner", icon: CalendarDays },
            { label: "Offene Rückfragen", value: waitingQuestions.length, icon: MessageSquareWarning },
            { label: "Ungelesen", value: notifications.length, icon: Inbox }
          ]}
        />
        <RecentTickets tickets={tickets} />
      </DashboardFrame>
    );
  }

  if (user.role === "DIENSTLEISTER") {
    const nextAppointment = openTickets
      .filter((ticket) => ticket.appointmentAt && ticket.appointmentAt >= now)
      .sort((left, right) => left.appointmentAt!.getTime() - right.appointmentAt!.getTime())[0];
    const nextAction = tickets.find((ticket) => ticket.status === "DIENSTLEISTER_ANGEFRAGT")
      ?? tickets.find((ticket) => ticket.status === "TERMINABSTIMMUNG");
    return (
      <DashboardFrame eyebrow="Dienstleister-Zentrale" title="Alle Auftraggeber. Ein Arbeitsbereich.">
        <Stats
          items={[
            { label: "Neue Anfragen", value: tickets.filter((ticket) => ticket.status === "DIENSTLEISTER_ANGEFRAGT").length, icon: Inbox },
            { label: "Heutige Termine", value: todayAppointments.length, icon: CalendarDays },
            { label: "Laufende Aufträge", value: openTickets.length, icon: TicketIcon },
            { label: "Überfällig", value: overdueTickets.length, icon: AlertTriangle }
          ]}
        />
        <ProviderFocus ticket={nextAppointment ?? nextAction ?? null} hasAppointment={Boolean(nextAppointment)} />
        <RecentTickets tickets={tickets} providerMode />
      </DashboardFrame>
    );
  }

  return (
    <DashboardFrame
      eyebrow="Hausverwalter-Dashboard"
      title="Operativer Überblick"
      action={
        <Button asChild variant="outline">
          <Link href="/tickets">Alle Tickets öffnen</Link>
        </Button>
      }
    >
      {onboarding && !onboarding.isComplete ? <SetupBanner completed={onboarding.completedCount} percent={onboarding.percent} /> : null}
      <Stats
        items={[
          { label: "Entscheidungen", value: exceptions.length, icon: ShieldAlert },
          { label: "Autopilot aktiv", value: autopilotTickets.length, icon: Bot },
          { label: "Termine heute", value: todayAppointments.length, icon: CalendarDays },
          { label: "Abgeschlossen", value: completed.length, icon: CheckCircle2 },
        ]}
      />
      <ExceptionCockpit entries={exceptions} />
      <DashboardCharts statusData={statusData} categoryData={categoryData} />
      <RecentTickets tickets={tickets} />
    </DashboardFrame>
  );
}

function SetupBanner({ completed, percent }: { completed: number; percent: number }) {
  return <section className="grid gap-4 border-l-4 border-accent bg-white p-5 shadow-soft md:grid-cols-[1fr_auto] md:items-center"><div className="flex min-w-0 items-start gap-3"><ClipboardCheck className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden="true" /><div className="min-w-0"><p className="font-bold text-primary">Stammdaten einrichten</p><p className="mt-1 text-sm text-slate-600">{completed} von 4 Bereichen sind bereit. Vervollständige die Grundlage für automatische Zuweisung und Kommunikation.</p><div className="mt-3 h-1.5 max-w-xl overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-accent" style={{ width: `${percent}%` }} /></div></div></div><Button asChild variant="accent"><Link href="/onboarding">Einrichtung fortsetzen<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></Button></section>;
}

function DashboardFrame({
  eyebrow,
  title,
  action,
  children
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-accent">{eyebrow}</p>
          <h1 className="text-3xl font-bold text-primary">{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stats({ items }: { items: Array<{ label: string; value: string | number; icon: typeof TicketIcon }> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-accent/10 text-accent">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ExceptionCockpit({
  entries
}: {
  entries: Array<{
    ticket: {
      id: string;
      number: string;
      title: string;
      priority: Parameters<typeof PriorityBadge>[0]["priority"];
      property: { name: string };
      tenant: { name: string };
    };
    exception: OperationalException;
  }>;
}) {
  if (!entries.length) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        <div><h2 className="font-bold text-primary">Keine Entscheidung offen</h2><p className="mt-1 text-sm text-slate-600">Alle aktiven Vorgänge laufen im Autopilot weiter. Sie werden erst bei einer echten Ausnahme wieder eingebunden.</p></div>
      </div>
    );
  }
  return (
    <section>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-accent">Ausnahme-Cockpit</p><h2 className="text-xl font-bold text-primary">Hier wird Ihre Entscheidung gebraucht</h2></div>
        <p className="text-sm text-slate-500">{entries.length} offene {entries.length === 1 ? "Ausnahme" : "Ausnahmen"}</p>
      </div>
      <div className="mt-4 grid gap-3">
        {entries.map(({ ticket, exception }) => (
          <Link key={ticket.id} href={`/tickets/${ticket.id}`} className={`grid gap-3 rounded-md border bg-white p-4 hover:shadow-soft sm:grid-cols-[1fr_auto] sm:items-center ${exception.severity === "critical" ? "border-red-300" : exception.severity === "high" ? "border-orange-200" : "border-slate-200"}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-primary">{exception.title}</p><PriorityBadge priority={ticket.priority} /></div>
              <p className="mt-1 font-semibold text-primary">{ticket.number} · {ticket.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{exception.reason}</p>
              <p className="mt-1 text-xs text-slate-500">{ticket.property.name} · {ticket.tenant.name}</p>
            </div>
            <span className="flex items-center gap-2 text-sm font-bold text-accent">{exception.action}<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function severityRank(severity: OperationalException["severity"]) {
  return severity === "critical" ? 0 : severity === "high" ? 1 : 2;
}

function RecentTickets({
  tickets,
  providerMode = false
}: {
  tickets: Array<{
    id: string;
    number: string;
    title: string;
    status: Parameters<typeof StatusBadge>[0]["status"];
    priority: Parameters<typeof PriorityBadge>[0]["priority"];
    updatedAt: Date;
    appointmentAt: Date | null;
    property: { name: string };
    tenant: { name: string };
    assignedProvider: { companyName: string; organization?: { name: string } } | null;
  }>;
  providerMode?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{providerMode ? "Laufende und abgeschlossene Aufträge" : "Zuletzt aktualisierte Vorgänge"}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {tickets.slice(0, 8).map((ticket) => (
            <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="rounded-md border border-slate-200 bg-slate-50 p-4 hover:bg-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-primary">
                    {ticket.number} · {ticket.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {providerMode
                      ? `${ticket.assignedProvider?.organization?.name ?? "Auftraggeber"} · ${ticket.property.name} · ${ticket.tenant.name}`
                      : `${ticket.property.name} · ${ticket.assignedProvider?.companyName ?? "Nicht zugewiesen"}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={ticket.status} />
                  <PriorityBadge priority={ticket.priority} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProviderFocus({
  ticket,
  hasAppointment
}: {
  ticket: {
    id: string;
    number: string;
    title: string;
    status: Parameters<typeof StatusBadge>[0]["status"];
    appointmentAt: Date | null;
    property: { name: string };
    tenant: { name: string };
    assignedProvider: { organization?: { name: string } } | null;
  } | null;
  hasAppointment: boolean;
}) {
  if (!ticket) return <div className="rounded-md border border-teal-200 bg-teal-50 p-5"><p className="font-bold text-primary">Aktuell keine Aktion erforderlich</p><p className="mt-1 text-sm text-slate-600">Neue Aufträge und bestätigte Einsätze erscheinen automatisch hier.</p></div>;
  const action = hasAppointment
    ? "Einsatz vorbereiten und zum Termin die Arbeit starten"
    : ticket.status === "DIENSTLEISTER_ANGEFRAGT"
      ? "Auftrag annehmen oder begründet ablehnen"
      : "Terminoptionen senden und Abstimmung starten";
  return <section className="grid gap-4 border-l-4 border-accent bg-white p-5 shadow-soft md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-xs font-semibold uppercase text-slate-500">Als Nächstes</p><p className="mt-2 text-xl font-bold text-primary">{ticket.number} · {ticket.title}</p><p className="mt-1 text-sm text-slate-600">{ticket.assignedProvider?.organization?.name ?? "Auftraggeber"} · {ticket.property.name} · {ticket.tenant.name}</p>{ticket.appointmentAt ? <p className="mt-2 font-semibold text-primary">{formatDateTime(ticket.appointmentAt)}</p> : null}<p className="mt-3 text-sm font-bold text-teal-700">{action}</p></div><Button asChild variant="accent"><Link href={`/tickets/${ticket.id}`}>Auftrag öffnen<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></Button></section>;
}
