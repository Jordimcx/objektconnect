import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { EmptyState } from "@/components/app-shell/empty-state";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NOTIFICATION_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { markAllReadAction, markOneReadAction } from "./actions";

export default async function NotificationsPage() {
  const user = await requireSessionUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    include: { ticket: true },
    orderBy: { createdAt: "desc" },
    take: 80
  });
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Benachrichtigungscenter"
        title="Benachrichtigungen"
        description="Alle simulierten Systemmeldungen, Erinnerungen und Statusänderungen an einem Ort."
        action={
          <form action={markAllReadAction}>
            <Button type="submit" variant="outline" disabled={!unreadCount}>
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Alle als gelesen markieren
            </Button>
          </form>
        }
      />
      {notifications.length ? (
        <div className="grid gap-3">
          {notifications.map((notification) => (
            <Card key={notification.id} className={!notification.readAt ? "border-accent" : ""}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Link href={notification.href} className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-accent">{NOTIFICATION_LABELS[notification.type]}</p>
                  <h2 className="mt-1 font-bold text-primary">{notification.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{formatDateTime(notification.createdAt)}</p>
                </Link>
                <form action={markOneReadAction}>
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <Button type="submit" variant="outline" disabled={Boolean(notification.readAt)}>
                    Als gelesen
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Bell} title="Keine Benachrichtigungen" description="Sobald sich ein Vorgang ändert, erscheint die Meldung hier." />
      )}
    </div>
  );
}
