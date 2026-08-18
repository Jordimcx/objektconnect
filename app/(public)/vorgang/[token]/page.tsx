import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  RotateCcw,
  Wrench
} from "lucide-react";
import { NoticeToast } from "@/components/app-shell/notice-toast";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { PriorityBadge, StatusBadge } from "@/components/app-shell/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS } from "@/lib/constants";
import { getPublicTicketByToken } from "@/lib/ticket-service";
import { formatDateTime } from "@/lib/utils";
import { confirmPublicAppointmentAction, confirmPublicCompletionAction, reopenPublicTicketAction } from "./actions";

const processSteps = ["Gemeldet", "Geprüft", "Betrieb", "Termin", "Ausführung", "Bestätigt"];

export const dynamic = "force-dynamic";

export default async function PublicTicketPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ created?: string; notice?: string; type?: "success" | "error" }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const ticket = await getPublicTicketByToken(token);
  if (!ticket || !ticket.reportedWithoutLogin) notFound();

  const progress = progressForStatus(ticket.status);
  const proposedAppointments = ticket.appointments.filter((appointment) => appointment.status === "PROPOSED");
  const evidenceImages = ticket.documents.filter((document) => document.contentType.startsWith("image/"));

  return (
    <main className="min-h-screen bg-muted">
      <NoticeToast message={query.notice} type={query.type} />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/"><ObjektConnectLogo /></Link>
          <Button asChild variant="outline"><Link href="/schaden-melden">Weitere Meldung</Link></Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {query.created ? (
          <div className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <div><p className="font-bold text-primary">Die Meldung wurde automatisch geprüft.</p><p className="mt-1 text-sm text-slate-600">Dieser sichere Link bleibt Ihre zentrale Ansicht für Status, Termin und Abschluss.</p></div>
          </div>
        ) : null}

        <section className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold text-primary">{ticket.number}</h1><StatusBadge status={ticket.status} /><PriorityBadge priority={ticket.priority} /></div>
            <p className="mt-3 text-xl font-bold text-primary">{ticket.title}</p>
            <p className="mt-2 max-w-3xl leading-7 text-slate-600">{ticket.description}</p>
          </div>
          <dl className="grid min-w-full gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2 lg:min-w-80 lg:grid-cols-1">
            <Detail icon={Building2} label="Objekt" value={`${ticket.property.name}, Einheit ${ticket.unit.label}`} />
            <Detail icon={MapPin} label="Betroffener Ort" value={ticket.room} />
            <Detail icon={Clock3} label="Nächster Termin" value={formatDateTime(ticket.appointmentAt)} />
          </dl>
        </section>

        <ProcessProgress current={progress} />

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {ticket.status === "PRUEFUNG_ERFORDERLICH" || ticket.status === "RUECKFRAGE_AN_MIETER" ? (
              <Notice icon={ShieldCheck} title="Die Hausverwaltung prüft eine Ausnahme" text={ticket.reviewReason ?? "Das System hat den Vorgang vorqualifiziert und zur kontrollierten Entscheidung vorgelegt."} />
            ) : null}

            {ticket.status === "WARTEN_AUF_FREIGABE" ? (
              <Notice icon={FileCheck2} title="Kosten werden geprüft" text="Die Ausführung ist dokumentiert. Die gemeldeten Kosten benötigen vor der Mieterbestätigung noch eine Freigabe der Hausverwaltung." tone="orange" />
            ) : null}

            {ticket.assignedProvider ? (
              <Card>
                <CardHeader><CardTitle>Ausführender Betrieb</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div><p className="text-lg font-bold text-primary">{ticket.assignedProvider.companyName}</p><p className="mt-1 text-sm text-slate-600">{ticket.assignedProvider.contactName} · {ticket.assignedProvider.rating.toFixed(1)} Sterne</p></div>
                  <a href={`tel:${ticket.assignedProvider.phone}`} className="flex items-center gap-2 self-center text-sm font-semibold text-accent"><Phone className="h-4 w-4" aria-hidden="true" />{ticket.assignedProvider.phone}</a>
                </CardContent>
              </Card>
            ) : null}

            {proposedAppointments.length ? (
              <Card>
                <CardHeader><CardTitle>Termin direkt auswählen</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {proposedAppointments.map((appointment) => (
                    <form key={appointment.id} action={confirmPublicAppointmentAction} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <input type="hidden" name="token" value={token} /><input type="hidden" name="appointmentId" value={appointment.id} />
                      <p className="font-bold text-primary">{formatDateTime(appointment.startsAt)}</p><p className="mt-1 text-sm text-slate-600">bis {formatDateTime(appointment.endsAt)}</p>
                      {appointment.note ? <p className="mt-2 text-sm text-slate-600">{appointment.note}</p> : null}
                      <Button type="submit" variant="accent" className="mt-4 w-full"><CalendarCheck2 className="h-4 w-4" aria-hidden="true" />Diesen Termin wählen</Button>
                    </form>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {ticket.completionReport ? (
              <Card>
                <CardHeader><CardTitle>Ausführungsnachweis</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="leading-7 text-slate-700">{ticket.completionReport}</p>
                  <div className="grid gap-3 text-sm sm:grid-cols-3"><Metric label="Arbeitszeit" value={ticket.workHours ? `${Number(ticket.workHours)} Std.` : "-"} /><Metric label="Abschlusskosten" value={ticket.finalCost ? `${Number(ticket.finalCost).toFixed(2)} EUR` : "-"} /><Metric label="Nachweise" value={`${ticket.documents.length} Datei(en)`} /></div>
                  {evidenceImages.length ? <div className="grid gap-3 sm:grid-cols-2">{evidenceImages.map((document) => <a key={document.id} href={document.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border border-slate-200 bg-slate-50"><Image src={document.url} alt={document.originalName} width={800} height={600} unoptimized className="aspect-[4/3] w-full object-cover" /><span className="block p-3 text-sm font-semibold text-primary">{document.originalName}</span></a>)}</div> : null}
                </CardContent>
              </Card>
            ) : null}

            {ticket.status === "ERLEDIGT" ? (
              <section className="grid gap-4 lg:grid-cols-2">
                <Card className="border-teal-200">
                  <CardHeader><CardTitle>Schaden behoben</CardTitle></CardHeader>
                  <CardContent><form action={confirmPublicCompletionAction} className="grid gap-4"><input type="hidden" name="token" value={token} /><NativeSelect name="score" defaultValue="5" aria-label="Bewertung"><option value="5">5 - Vollständig behoben</option><option value="4">4 - Behoben</option><option value="3">3 - Mit Einschränkungen</option></NativeSelect><Textarea name="comment" placeholder="Optionales Feedback zur Ausführung" /><Button type="submit" size="lg" variant="accent"><CheckCircle2 className="h-5 w-5" aria-hidden="true" />Bestätigen und abschließen</Button></form></CardContent>
                </Card>
                <Card className="border-orange-200">
                  <CardHeader><CardTitle>Problem besteht weiter</CardTitle></CardHeader>
                  <CardContent><form action={reopenPublicTicketAction} className="grid gap-4"><input type="hidden" name="token" value={token} /><Textarea name="reason" minLength={10} placeholder="Was wurde nicht oder nicht dauerhaft behoben?" required /><Button type="submit" size="lg" variant="outline"><RotateCcw className="h-5 w-5" aria-hidden="true" />Gewährleistung prüfen</Button></form></CardContent>
                </Card>
              </section>
            ) : null}

            {ticket.status === "ABGESCHLOSSEN" ? <><Notice icon={CheckCircle2} title="Vorgang vollständig abgeschlossen" text="Die Erledigung wurde bestätigt. Nachweise, Kosten und Verlauf sind im Objektgedächtnis archiviert." /><form action={reopenPublicTicketAction} className="grid gap-3 rounded-md border border-orange-200 bg-orange-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end"><input type="hidden" name="token" value={token} /><div><p className="font-bold text-primary">Schaden erneut aufgetreten?</p><Textarea className="mt-2" name="reason" minLength={10} placeholder="Wieder aufgetretener Schaden" required /></div><Button type="submit" variant="outline"><RotateCcw className="h-4 w-4" aria-hidden="true" />Erneut öffnen</Button></form></> : null}
          </div>

          <aside className="space-y-6">
            <Card><CardHeader><CardTitle>Verlauf</CardTitle></CardHeader><CardContent className="space-y-4">{ticket.statusHistory.map((entry) => <div key={entry.id} className="border-l-2 border-accent pl-3 text-sm"><p className="font-bold text-primary">{STATUS_LABELS[entry.toStatus]}</p><p className="mt-0.5 text-slate-500">{formatDateTime(entry.createdAt)}</p>{entry.note ? <p className="mt-1 text-slate-600">{entry.note}</p> : null}</div>)}</CardContent></Card>
            <div className="rounded-md border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"><ShieldCheck className="mb-2 h-5 w-5 text-accent" aria-hidden="true" />Statusänderungen, Termine und Nachweise werden automatisch dokumentiert. Sie müssen keine App installieren.</div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function progressForStatus(status: string) {
  if (["VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"].includes(status)) return 5;
  if (["IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL", "WARTEN_AUF_FREIGABE", "ERLEDIGT"].includes(status)) return 4;
  if (status === "TERMIN_BESTAETIGT") return 3;
  if (["DIENSTLEISTER_ANGEFRAGT", "TERMINABSTIMMUNG"].includes(status)) return 2;
  if (status === "FREIGEGEBEN") return 1;
  return 0;
}

function ProcessProgress({ current }: { current: number }) {
  return <section aria-label="Bearbeitungsfortschritt" className="grid grid-cols-6 overflow-hidden rounded-md border border-slate-200 bg-white">{processSteps.map((step, index) => <div key={step} className={`min-w-0 border-r border-slate-200 px-1 py-3 text-center last:border-r-0 ${index <= current ? "bg-teal-50" : "bg-white"}`}><span className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${index < current ? "bg-accent text-white" : index === current ? "border-2 border-accent text-accent" : "bg-slate-100 text-slate-400"}`}>{index < current ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}</span><p className={`mt-1 truncate text-[10px] font-semibold sm:text-xs ${index <= current ? "text-primary" : "text-slate-400"}`}>{step}</p></div>)}</section>;
}

function Detail({ icon: Icon, label, value }: { icon: typeof Wrench; label: string; value: string }) {
  return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" /><div><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-0.5 font-semibold text-primary">{value}</dd></div></div>;
}

function Notice({ icon: Icon, title, text, tone = "teal" }: { icon: typeof Wrench; title: string; text: string; tone?: "teal" | "orange" }) {
  const classes = tone === "orange" ? "border-orange-200 bg-orange-50" : "border-teal-200 bg-teal-50";
  return <div className={`flex items-start gap-3 rounded-md border p-4 ${classes}`}><Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "orange" ? "text-orange-700" : "text-accent"}`} aria-hidden="true" /><div><p className="font-bold text-primary">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 font-bold text-primary">{value}</p></div>;
}
