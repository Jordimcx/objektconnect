import { UserRound } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";

export default async function ProfilePage() {
  const sessionUser = await requireSessionUser();
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      organization: true,
      leases: { include: { unit: { include: { building: { include: { property: true } } } } } },
      serviceProvider: { include: { trades: { include: { trade: true } } } }
    }
  });

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Benutzerprofil" title={user.name} description="Rolle, Kontaktdaten und zugeordnete Stammdaten." />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-primary text-2xl font-bold text-white">
              <UserRound className="h-10 w-10" aria-hidden="true" />
            </div>
            <Info label="Name" value={user.name} />
            <Info label="E-Mail" value={user.email} />
            <Info label="Telefon" value={user.phone ?? "Nicht hinterlegt"} />
            <Info label="Rolle" value={ROLE_LABELS[user.role]} />
            <Info label="Organisation" value={user.organization.name} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Zugeordnete Daten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {user.leases.map((lease) => (
              <div key={lease.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="font-bold text-primary">{lease.unit.building.property.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {lease.unit.label} · {lease.unit.building.name}
                </p>
              </div>
            ))}
            {user.serviceProvider ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <p className="font-bold text-primary">{user.serviceProvider.companyName}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {user.serviceProvider.trades.map((trade) => trade.trade.name).join(", ")}
                </p>
              </div>
            ) : null}
            {!user.leases.length && !user.serviceProvider ? (
              <p className="text-sm text-slate-600">Für dieses Profil sind keine weiteren Stammdaten hinterlegt.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-primary">{value}</p>
    </div>
  );
}
