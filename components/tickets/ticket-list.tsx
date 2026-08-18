import Link from "next/link";
import { Search, SlidersHorizontal, Ticket as TicketIcon } from "lucide-react";
import { TicketStatus } from "@prisma/client";
import { PriorityBadge, StatusBadge } from "@/components/app-shell/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CATEGORY_LABELS, STATUS_LABELS, TICKET_STATUSES } from "@/lib/constants";
import { formatDate, isOverdue } from "@/lib/utils";

type TicketListItem = {
  id: string;
  number: string;
  title: string;
  category: keyof typeof CATEGORY_LABELS;
  priority: Parameters<typeof PriorityBadge>[0]["priority"];
  status: TicketStatus;
  dueDate: Date;
  updatedAt: Date;
  property: { name: string };
  unit: { label: string };
  tenant: { name: string };
  assignedProvider: { companyName: string } | null;
};

export function TicketList({
  tickets,
  query,
  status,
  sort,
  canCreate
}: {
  tickets: TicketListItem[];
  query?: string;
  status?: string;
  sort?: string;
  canCreate: boolean;
}) {
  const grouped = TICKET_STATUSES.map((ticketStatus) => ({
    status: ticketStatus,
    tickets: tickets.filter((ticket) => ticket.status === ticketStatus)
  })).filter((group) => group.tickets.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="grid flex-1 gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[1fr_190px_160px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true" />
            <Input name="q" defaultValue={query} placeholder="Suchen nach Ticket, Objekt, Mieter" className="pl-10" />
          </div>
          <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Status filtern">
            <option value="">Alle Status</option>
            {TICKET_STATUSES.map((ticketStatus) => (
              <option key={ticketStatus} value={ticketStatus}>
                {STATUS_LABELS[ticketStatus]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect name="sort" defaultValue={sort ?? "updated"} aria-label="Sortierung">
            <option value="updated">Aktualisiert</option>
            <option value="due">Fälligkeit</option>
            <option value="priority">Priorität</option>
          </NativeSelect>
          <Button type="submit" variant="outline">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Anwenden
          </Button>
        </form>
        {canCreate ? (
          <Button asChild variant="accent" size="lg">
            <Link href="/tickets/new">Schaden melden</Link>
          </Button>
        ) : null}
      </div>

      <section className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Ticket</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priorität</th>
              <th className="px-4 py-3">Objekt</th>
              <th className="px-4 py-3">Mieter</th>
              <th className="px-4 py-3">Dienstleister</th>
              <th className="px-4 py-3">Fällig</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-slate-50">
                <td className="px-4 py-4">
                  <Link className="font-bold text-primary hover:text-accent" href={`/tickets/${ticket.id}`}>
                    {ticket.number}
                  </Link>
                  <p className="mt-1 max-w-xs truncate text-slate-600">{ticket.title}</p>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={ticket.status} />
                </td>
                <td className="px-4 py-4">
                  <PriorityBadge priority={ticket.priority} />
                </td>
                <td className="px-4 py-4 text-slate-700">
                  {ticket.property.name}
                  <p className="text-xs text-slate-500">{ticket.unit.label}</p>
                </td>
                <td className="px-4 py-4 text-slate-700">{ticket.tenant.name}</td>
                <td className="px-4 py-4 text-slate-700">{ticket.assignedProvider?.companyName ?? "Nicht zugewiesen"}</td>
                <td className={`px-4 py-4 font-semibold ${isOverdue(ticket.dueDate) ? "text-red-700" : "text-slate-700"}`}>
                  {formatDate(ticket.dueDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 md:hidden">
        {tickets.map((ticket) => (
          <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-primary">{ticket.number}</p>
                <p className="mt-1 text-sm text-slate-600">{ticket.title}</p>
              </div>
              <PriorityBadge priority={ticket.priority} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={ticket.status} />
              <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {ticket.property.name}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">Fällig: {formatDate(ticket.dueDate)}</p>
          </Link>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <TicketIcon className="h-5 w-5 text-accent" aria-hidden="true" />
          <h2 className="text-lg font-bold text-primary">Kanban nach Status</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {grouped.map((group) => (
            <div key={group.status} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={group.status} />
                <span className="text-sm font-bold text-slate-500">{group.tickets.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {group.tickets.slice(0, 5).map((ticket) => (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="block rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-bold text-primary">{ticket.number}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{ticket.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
