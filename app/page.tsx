import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BrainCircuit,
  CalendarCheck2,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Euro,
  History,
  Route,
  Send,
  ShieldCheck,
  Wrench
} from "lucide-react";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { Button } from "@/components/ui/button";

const workflow = [
  { icon: Send, title: "Meldung ohne Login", text: "Objektcode, Schaden, Fotos und Wunschzeiten genügen." },
  { icon: BrainCircuit, title: "Automatische Prüfung", text: "Dringlichkeit, Vollständigkeit und ähnliche Fälle werden erkannt." },
  { icon: Route, title: "Passender Handwerker", text: "Gewerk, Objektkenntnis, Reaktionszeit und Auslastung bestimmen das Matching." },
  { icon: CalendarCheck2, title: "Direkte Terminwahl", text: "Der Betrieb bietet konkrete Termine, der Mieter wählt direkt." },
  { icon: BellRing, title: "Erinnerungen", text: "Offene Antworten und bevorstehende Termine bleiben nicht liegen." },
  { icon: Wrench, title: "Durchführung", text: "Anfahrt, Arbeit und Materialstatus sind für alle nachvollziehbar." },
  { icon: Camera, title: "Foto und Bericht", text: "Leistung, Zeit, Kosten und Nachweise werden am Vorgang gesichert." },
  { icon: Euro, title: "Freigabe und Bestätigung", text: "Kostenabweichungen werden geprüft, der Mieter bestätigt den Abschluss." }
];

const advantages = [
  {
    icon: ShieldCheck,
    title: "Ausnahmen statt Ticketstapel",
    text: "Routinefälle bewegen sich automatisch weiter. Die Verwaltung sieht nur Notfälle, Fristen, Rückfragen und Kostenentscheidungen."
  },
  {
    icon: Route,
    title: "Nachvollziehbares Matching",
    text: "Nicht irgendein Betrieb, sondern der passende: nach Gewerk, Objektkenntnis, Bewertung, Reaktionszeit und aktueller Auslastung."
  },
  {
    icon: History,
    title: "Objektgedächtnis",
    text: "Frühere Schäden, Kosten, Nachweise und bewährte Betriebe bleiben mit Gebäude und Einheit verbunden."
  },
  {
    icon: ClipboardCheck,
    title: "Abschluss mit Beleg",
    text: "Ein Vorgang endet erst mit Bericht, Foto, geprüften Kosten und Bestätigung der betroffenen Person."
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <ObjektConnectLogo />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/datenschutz">Datenschutz</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Interner Login</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-muted">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -left-32 -top-40 h-[520px] w-[520px] rounded-full bg-accent-200/40 blur-3xl" />
          <div className="absolute -right-24 top-10 h-[420px] w-[420px] rounded-full bg-primary-200/50 blur-3xl" />
        </div>
        <div className="relative mx-auto grid min-h-[620px] max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-16">
          <div className="flex flex-col justify-center">
            <p className="text-eyebrow text-sm font-bold uppercase text-accent">objekt.connect</p>
            <h1 className="mt-4 max-w-3xl text-display text-5xl font-bold leading-[1.05] text-primary sm:text-6xl">
              Reparaturen, die sich bis zum Abschluss weiterbewegen.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-700">
              Vom ersten Schaden bis zur bestätigten Erledigung: automatisch, nachvollziehbar und ohne App-Zwang für Mieter.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link href="/schaden-melden">
                  Schaden ohne Login melden <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Zur Verwaltung</Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-slate-600">
              {["Kein Konto nötig", "Automatische Vorprüfung", "Lückenloser Nachweis"].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden="true" />{item}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center">
            <div className="w-full rounded-lg border border-slate-200 bg-white p-5 shadow-card-hover sm:p-6">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Durchgängiger Reparaturablauf</p>
                  <h2 className="mt-1 text-xl font-bold text-primary">Eine Meldung, ein klarer Abschluss</h2>
                </div>
                <span className="self-start rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
                  Autopilot aktiv
                </span>
              </div>
              <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                {workflow.map(({ icon: Icon, title, text }, index) => (
                  <div key={title} className="flex min-w-0 items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary text-white">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-accent">{String(index + 1).padStart(2, "0")}</p>
                      <p className="font-bold text-primary">{title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-eyebrow text-sm font-bold uppercase text-accent">Der Unterschied</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-primary">Kein weiteres Portal, sondern ein System, das Arbeit zu Ende bringt.</h2>
            <p className="mt-3 leading-7 text-slate-600">objekt.connect reduziert Koordination, ohne die Kontrolle aus der Hand zu geben. Menschen entscheiden dort, wo eine Entscheidung wirklich nötig ist.</p>
          </div>
          <div className="mt-10 grid border-y border-slate-200 md:grid-cols-2">
            {advantages.map(({ icon: Icon, title, text }, index) => (
              <div
                key={title}
                className={`group p-6 transition-colors duration-200 hover:bg-slate-50/80 ${index % 2 === 0 ? "md:border-r" : ""} ${index < 2 ? "border-b" : ""} border-slate-200`}
              >
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent-50 text-accent-700 transition-colors duration-200 group-hover:bg-accent-100">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-primary">{title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
