import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { PageHeader } from "@/components/app-shell/page-header";
import { StatusBadge } from "@/components/app-shell/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { ticketWhereForUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

export default async function MessagesPage() {
  const user = await requireSessionUser();
  const tickets = await prisma.ticket.findMany({
    where: ticketWhereForUser(user),
    include: {
      messages: { include: { author: true }, orderBy: { createdAt: "desc" }, take: 1 },
      property: true
    },
    orderBy: { updatedAt: "desc" },
    take: 50
  });
  const conversations = tickets.filter((ticket) => ticket.messages.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Kommunikation"
        title="Nachrichten"
        description="Jeder Nachrichtenverlauf ist direkt mit einem Ticket verknüpft."
      />
      {conversations.length ? (
        <div className="grid gap-3">
          {conversations.map((ticket) => {
            const message = ticket.messages[0];
            return (
              <Link key={ticket.id} href={`/tickets/${ticket.id}`}>
                <Card className="hover:border-accent">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-accent">{ticket.number} · {ticket.property.name}</p>
                      <h2 className="mt-1 font-bold text-primary">{ticket.title}</h2>
                      <p className="mt-1 text-sm text-slate-600">{message?.body}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {message?.author?.name ?? "System"} · {formatDateTime(message?.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={MessageSquare} title="Keine Nachrichten" description="Neue Ticketnachrichten erscheinen automatisch hier." />
      )}
    </div>
  );
}
