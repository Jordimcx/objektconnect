import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, CalendarX2, CheckCircle2, Clock3, ReceiptText, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getOperationalKpis } from "@/lib/kpis";
import { requireSessionUser } from "@/lib/session";

export default async function StatisticsPage() {
  const user = await requireSessionUser();
  const kpis = await getOperationalKpis(user);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Steuerung"
        title="Prozess- und Objektanalyse"
        description="Kennzahlen aus Zeitstempeln, Nachweisen, Rechnungen und Rückmeldungen. Jede Ausnahme führt direkt zum betroffenen Vorgang."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Bot} label="Automatisch geprüft" value={percent(kpis.autoQualificationRate)} hint={`${percent(kpis.autoDispatchRate)} direkt beauftragt`} />
        <Metric icon={CheckCircle2} label="Erstlösungsquote" value={percent(kpis.firstSolveRate)} hint={`${percent(kpis.reopenRate)} wieder geöffnet`} />
        <Metric icon={ReceiptText} label="Rechnung zugeordnet" value={percent(kpis.invoiceMatchRate)} hint={`${signedPercent(kpis.averageCostDeviation)} Kostenabweichung`} />
        <Metric icon={AlertTriangle} label="Ausnahmequote" value={percent(kpis.exceptionRate)} hint={`${kpis.exceptions.length} aktuell sichtbar`} />
      </div>

      <section className="border-y border-slate-200 bg-white py-5">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <CompactMetric icon={RotateCcw} label="Wiederholung 90 Tage" value={percent(kpis.repeat90Rate)} />
          <CompactMetric icon={RotateCcw} label="Wiederholung 180 Tage" value={percent(kpis.repeat180Rate)} />
          <CompactMetric icon={CalendarX2} label="Terminabsagen" value={percent(kpis.cancellationRate)} />
          <CompactMetric icon={CalendarX2} label="Nicht erschienen" value={percent(kpis.noShowRate)} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-primary">Durchlaufzeiten</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
          {kpis.durations.map((duration) => (
            <div key={duration.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0">
              <span className="font-semibold text-primary">{duration.label}</span>
              <span className="text-slate-500">{duration.samples} Fälle</span>
              <span className="min-w-24 text-right font-bold text-primary">{formatDuration(duration.hours)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section>
          <h2 className="text-lg font-bold text-primary">Objektberichte</h2>
          <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Objekt</th><th className="px-4 py-3">Offen</th><th className="px-4 py-3">Ausnahmen</th><th className="px-4 py-3">Wiederholt</th><th className="px-4 py-3">Sammelfälle</th><th className="px-4 py-3 text-right">Kosten</th></tr></thead>
              <tbody>{kpis.properties.map((property) => <tr key={property.id} className="border-b border-slate-100 last:border-b-0"><td className="px-4 py-3 font-semibold text-primary">{property.name}</td><td className="px-4 py-3">{property.open}</td><td className="px-4 py-3">{property.exceptions}</td><td className="px-4 py-3">{property.repeatCases}</td><td className="px-4 py-3">{property.incidentCases}</td><td className="px-4 py-3 text-right font-semibold">{property.cost.toFixed(2)} EUR</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-primary">Entscheidungen erforderlich</h2>
          <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
            {kpis.exceptions.length ? kpis.exceptions.map((exception) => (
              <Link key={exception.id} href={`/tickets/${exception.id}`} className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50">
                <div><p className="font-bold text-primary">{exception.number} · {exception.title}</p><p className="mt-1 text-sm text-slate-500">{exception.property} · {exception.reason}</p></div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              </Link>
            )) : <p className="p-5 text-sm text-slate-600">Keine offenen Ausnahmen.</p>}
          </div>
        </section>
      </div>

      {user.role === "HAUSVERWALTER" && kpis.providers.length ? (
        <section>
          <h2 className="text-lg font-bold text-primary">Dienstleisterleistung</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {kpis.providers.map((provider) => (
              <div key={provider.id} className="rounded-md border border-slate-200 bg-white p-4">
                <p className="font-bold text-primary">{provider.name}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm"><Small label="Aufträge" value={String(provider.jobs)} /><Small label="Erstlösung" value={percent(provider.firstSolveRate)} /><Small label="Reaktion" value={formatDuration(provider.responseHours)} /></div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }: { icon: typeof Bot; label: string; value: string; hint: string }) {
  return <Card><CardContent className="p-5"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-500">{label}</p><Icon className="h-5 w-5 text-accent" aria-hidden="true" /></div><p className="mt-2 text-3xl font-bold text-primary">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></CardContent></Card>;
}

function CompactMetric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="flex items-center gap-3 px-2"><Icon className="h-5 w-5 text-accent" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="text-xl font-bold text-primary">{value}</p></div></div>;
}

function Small({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold text-primary">{value}</p></div>;
}

function percent(value: number) { return `${value.toFixed(0)} %`; }
function signedPercent(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(1)} %`; }
function formatDuration(hours: number) { return hours >= 24 ? `${(hours / 24).toFixed(1)} Tage` : `${hours.toFixed(1)} Std.`; }
