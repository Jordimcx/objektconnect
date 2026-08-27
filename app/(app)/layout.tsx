import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [unreadCount, organization] = await Promise.all([
    prisma.notification.count({ where: { userId: session.user.id, readAt: null } }),
    prisma.organization.findUnique({ where: { id: session.user.organizationId }, include: { settings: true } })
  ]);
  if (!organization) redirect("/login");
  const shellOrganization = session.user.role === "DIENSTLEISTER"
    ? { name: "objekt.connect", claim: "Alle Auftraggeber. Ein Zugang.", settings: null }
    : organization;

  return (
    <AppShell user={session.user} unreadCount={unreadCount} organization={shellOrganization}>
      {children}
    </AppShell>
  );
}
