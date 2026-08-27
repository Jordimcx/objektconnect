import { Session } from "next-auth";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth";
import { navigationByRole, ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/utils";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { NavLink } from "@/components/app-shell/nav-link";
import { Button } from "@/components/ui/button";

export function AppShell({
  children,
  user,
  unreadCount,
  organization
}: {
  children: React.ReactNode;
  user: Session["user"];
  unreadCount: number;
  organization: { name: string; claim: string; settings: { brandPrimary: string; brandAccent: string; logoUrl: string | null } | null };
}) {
  const navigation = navigationByRole[user.role];

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div
      className="min-h-screen bg-muted lg:grid lg:grid-cols-[280px_1fr]"
      style={{ "--brand-primary": organization.settings?.brandPrimary ?? "#14233C", "--brand-accent": organization.settings?.brandAccent ?? "#18B7A0" } as React.CSSProperties}
    >
      <aside className="hidden border-r border-slate-200 bg-muted px-4 py-5 lg:block">
        <ObjektConnectLogo name={organization.name} claim={organization.claim} logoUrl={organization.settings?.logoUrl} />
        <nav className="mt-8 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              scope="desktop"
              badge={item.href === "/benachrichtigungen" ? unreadCount : undefined}
            />
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/75 backdrop-blur-md">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <ObjektConnectLogo compact name={organization.name} claim={organization.claim} logoUrl={organization.settings?.logoUrl} />
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="text-sm font-semibold text-slate-500">{ROLE_LABELS[user.role]}</p>
              <h1 className="truncate text-lg font-bold text-primary">Willkommen, {user.name}</h1>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="/profil"
                className="focus-ring hidden items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 sm:flex"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-bold text-white">
                  {initials(user.name)}
                </span>
                <span className="text-left">
                  <span className="block text-sm font-semibold text-primary">{user.name}</span>
                  <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
                </span>
              </a>
              <form action={signOutAction}>
                <Button type="submit" variant="outline" size="icon" aria-label="Abmelden">
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                </Button>
              </form>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                scope="mobile"
                badge={item.href === "/benachrichtigungen" ? unreadCount : undefined}
              />
            ))}
          </nav>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
