import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { TicketList } from "@/components/tickets/ticket-list";
import { listTicketsForUser } from "@/lib/ticket-service";
import { requireSessionUser } from "@/lib/session";

export default async function TicketsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string }>;
}) {
  const user = await requireSessionUser();
  const params = await searchParams;
  const tickets = await listTicketsForUser(user, {
    query: params.q,
    status: params.status as never,
    sort: params.sort
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-accent">{user.role === "DIENSTLEISTER" ? "Auftragsübersicht" : "Ticketverwaltung"}</p>
        <h1 className="text-3xl font-bold text-primary">{user.role === "MIETER" ? "Meine Meldungen" : user.role === "DIENSTLEISTER" ? "Meine Aufträge" : "Tickets"}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Suche, Filter, Status, Priorität und Kanban-Ansicht greifen auf dieselben Vorgänge zu.
        </p>
      </div>
      {tickets.length ? (
        <TicketList tickets={tickets} query={params.q} status={params.status} sort={params.sort} canCreate={user.role === "MIETER"} />
      ) : (
        <EmptyState
          icon={Inbox}
          title="Keine Tickets gefunden"
          description="Für die aktuelle Auswahl gibt es keine Vorgänge."
          action={user.role === "MIETER" ? { label: "Schaden melden", href: "/tickets/new" } : undefined}
        />
      )}
    </div>
  );
}
