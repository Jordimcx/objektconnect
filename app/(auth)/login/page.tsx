import Link from "next/link";
import { ClipboardPlus } from "lucide-react";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkSystemReadiness } from "@/lib/system-readiness";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const readiness = await checkSystemReadiness();

  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <ObjektConnectLogo />
          <CardTitle className="pt-6 text-2xl">Login</CardTitle>
          <CardDescription>Melden Sie sich mit Ihrem persönlichen ObjektConnect-Zugang an.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="accent" className="mb-5 w-full">
            <Link href="/schaden-melden">
              <ClipboardPlus className="h-4 w-4" aria-hidden="true" />
              Schaden ohne Login melden
            </Link>
          </Button>
          <div className="mb-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase text-slate-400">Interner Bereich</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          {!readiness.ok ? (
            <div className="mb-5 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">
              {readiness.message}
            </div>
          ) : null}
          <LoginForm />
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link className="font-semibold text-accent" href="/passwort-vergessen">
              Passwort vergessen
            </Link>
            <Link className="font-semibold text-slate-600 hover:text-primary" href="/">
              Zur Startseite
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
