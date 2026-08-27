import Link from "next/link";
import { ClipboardPlus, Sparkles } from "lucide-react";
import { LogoMark, ObjektConnectLogo } from "@/components/app-shell/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkSystemReadiness } from "@/lib/system-readiness";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

const highlights = [
  { label: "Autopilot", value: "Routine läuft automatisch" },
  { label: "Ausnahme-Cockpit", value: "Nur echte Entscheidungen" },
  { label: "Objektgedächtnis", value: "Verlauf pro Einheit" }
];

export default async function LoginPage() {
  const readiness = await checkSystemReadiness();

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-primary px-14 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          aria-hidden="true"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full bg-accent/10 blur-3xl" />
          <div className="absolute -bottom-40 right-[-100px] h-[460px] w-[460px] rounded-full bg-primary-400/10 blur-3xl" />
        </div>

        <div className="relative flex items-center gap-4">
          <LogoMark className="h-16 w-16 rounded-2xl shadow-lg shadow-black/40" />
          <div className="leading-tight">
            <p className="text-2xl font-bold tracking-tight">objekt.connect</p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-accent-200">Instandhaltung auf Autopilot.</p>
          </div>
        </div>

        <div className="relative flex flex-col gap-10">
          <div className="max-w-md">
            <p className="text-eyebrow text-sm font-bold uppercase text-accent-200">Interner Bereich</p>
            <h2 className="mt-4 text-[2.75rem] font-bold leading-[1.05] tracking-tight">
              Reparaturen, die sich von selbst weiterbewegen.
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-6 text-white/70">
              Der Autopilot qualifiziert Routinefälle automatisch — Ihr Team sieht nur, wo eine echte Entscheidung nötig ist.
            </p>
          </div>

          <div className="max-w-md">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/30">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-accent-200">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Live-Vorgang
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm font-semibold tracking-wide text-white/60">OC-2026-0021</p>
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-200">
                  Prüfung erforderlich
                </span>
              </div>
              <p className="mt-3 text-lg font-bold text-white">Wasserleck an der Decke im Badezimmer</p>
              <p className="mt-1 text-sm text-white/50">Kastanienhof · Mia Schneider</p>
              <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
                {highlights.map((item) => (
                  <div key={item.label} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-semibold text-white/50">{item.label}</span>
                    <span className="font-semibold text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative text-xs text-white/40">
          &copy; {new Date().getFullYear()} ObjektConnect Hausverwaltung GmbH
        </div>
      </div>

      <div className="grid place-items-center bg-muted px-4 py-10">
        <div className="w-full max-w-lg">
          <Card>
            <CardHeader>
              <ObjektConnectLogo className="lg:hidden" />
              <CardTitle className="pt-2 text-2xl lg:pt-0">Login</CardTitle>
              <CardDescription>Melden Sie sich mit Ihrem persönlichen objekt.connect-Zugang an.</CardDescription>
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
        </div>
      </div>
    </main>
  );
}
