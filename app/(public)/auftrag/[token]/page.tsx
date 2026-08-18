import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  KeyRound,
  MessageSquare,
  Navigation,
  PackageOpen,
  Send,
  ShieldCheck,
  Upload,
  XCircle
} from "lucide-react";
import { NoticeToast } from "@/components/app-shell/notice-toast";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { StatusBadge } from "@/components/app-shell/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getProviderOrder } from "@/lib/provider-access";
import { formatDateTime } from "@/lib/utils";
import {
  providerLinkAppointmentsAction,
  providerLinkCompleteAction,
  providerLinkDecisionAction,
  providerLinkMessageAction,
  providerLinkOfferAction,
  providerLinkOtpAction,
  providerLinkStatusAction
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ProviderOrderPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ notice?: string; type?: "success" | "error"; otp?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const access = await getProviderOrder(token);
  if (!access) notFound();
  const ticket = access.ticket;
  const proposed = ticket.appointments.filter((entry) => entry.status === "PROPOSED");
  const confirmed = ticket.appointments.find((entry) => entry.status === "CONFIRMED");
  const canSchedule = ticket.providerRequestType === "WORK_ORDER" && ticket.status === "TERMINABSTIMMUNG";
  const canWork = ["TERMIN_BESTAETIGT", "IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL"].includes(ticket.status);

  return (
    <main className="min-h-screen bg-muted">
      <NoticeToast message={query.notice} type={query.type} />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/"><ObjektConnectLogo /></Link>
          <div className="text-right"><p className="text-sm font-bold text-primary">{access.provider.companyName}</p><p className="text-xs text-slate-500">Sicherer Auftragszugang</p></div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <section className="border-b border-slate-200 pb-6">
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold text-primary">{ticket.number}</h1><StatusBadge status={ticket.status} /></div>
          <p className="mt-3 text-xl font-bold text-primary">{ticket.title}</p>
          <p className="mt-2 text-sm font-bold text-teal-700">{ticket.providerRequestType === "QUOTE_REQUEST" ? "Angebotsanfrage" : "Freigegebener Reparaturauftrag"}</p>
          <p className="mt-2 max-w-3xl leading-7 text-slate-600">{ticket.description}</p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <Detail label="Einsatzort" value={`${ticket.property.address}, ${ticket.unit.label} · ${ticket.room}`} />
            <Detail label="Mieterkontakt" value={`${ticket.tenant.name} · ${ticket.tenant.phone ?? ticket.tenant.email}`} />
            <Detail label={ticket.providerRequestType === "QUOTE_REQUEST" ? "Orientierungsrahmen" : "Kostenrahmen"} value={ticket.approvedCostLimit ? `${Number(ticket.approvedCostLimit).toFixed(2)} EUR` : "Freigabe erforderlich"} />
          </dl>
        </section>

        {query.otp ? (
          <div className="rounded-md border border-teal-200 bg-teal-50 p-4">
            <p className="font-bold text-primary">Einmalcode: <span className="font-mono text-xl">{query.otp}</span></p>
            <p className="mt-1 text-sm text-slate-600">Lokaler Testmodus: Der Code ist 15 Minuten gültig und wird produktiv per E-Mail oder SMS versendet.</p>
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {ticket.status === "DIENSTLEISTER_ANGEFRAGT" && ticket.providerRequestType === "WORK_ORDER" ? (
              <Card>
                <CardHeader><CardTitle>Passt der Kostenrahmen?</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <form action={providerLinkDecisionAction}><input type="hidden" name="token" value={token} /><input type="hidden" name="decision" value="accept" /><Button type="submit" size="lg" variant="accent" className="h-14 w-full"><CheckCircle2 className="h-5 w-5" aria-hidden="true" />Auftrag annehmen</Button></form>
                  <form action={providerLinkDecisionAction} className="grid gap-2"><input type="hidden" name="token" value={token} /><input type="hidden" name="decision" value="reject" /><Input name="reason" placeholder="Ablehnungsgrund" required /><Button type="submit" size="lg" variant="outline" className="h-14 w-full"><XCircle className="h-5 w-5" aria-hidden="true" />Ablehnen</Button></form>
                </CardContent>
              </Card>
            ) : null}

            {ticket.status === "DIENSTLEISTER_ANGEFRAGT" ? (
              <Card>
                <CardHeader><CardTitle>{ticket.providerRequestType === "QUOTE_REQUEST" ? "Angebot senden" : "Kostenrahmen reicht nicht aus"}</CardTitle></CardHeader>
                <CardContent>
                  <form action={providerLinkOfferAction} className="grid gap-4">
                    <input type="hidden" name="token" value={token} />
                    <p className="text-sm leading-6 text-slate-600">{ticket.providerRequestType === "QUOTE_REQUEST" ? "Beschreiben Sie Leistungsumfang und Preis. Die Verwaltung kann das Angebot direkt freigeben." : "Senden Sie der Verwaltung ein Gegenangebot. Bis zur Entscheidung wird noch kein Termin mit dem Mieter vereinbart."}</p>
                    <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="offerAmount">Angebotsbetrag in EUR</Label><Input id="offerAmount" name="amount" type="number" min="0.01" step="0.01" required /></div><div><Label htmlFor="validUntil">Gültig bis</Label><Input id="validUntil" name="validUntil" type="date" /></div></div>
                    <div><Label htmlFor="offerDescription">Leistung und Umfang</Label><Textarea id="offerDescription" name="description" placeholder="Arbeitsleistung, Material und Annahmen" required /></div>
                    <div><Label htmlFor="offerFile">Angebot als PDF, optional</Label><Input id="offerFile" name="offerFile" type="file" accept="application/pdf" /></div>
                    <Button type="submit" variant={ticket.providerRequestType === "QUOTE_REQUEST" ? "accent" : "outline"}><CircleDollarSign className="h-5 w-5" aria-hidden="true" />Angebot an Verwaltung senden</Button>
                  </form>
                  {ticket.providerRequestType === "QUOTE_REQUEST" ? <form action={providerLinkDecisionAction} className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto] sm:items-end"><input type="hidden" name="token" value={token} /><input type="hidden" name="decision" value="reject" /><div><Label htmlFor="quoteRejectReason">Anfrage nicht möglich</Label><Input id="quoteRejectReason" name="reason" placeholder="Kurzer Grund" required /></div><Button type="submit" variant="outline"><XCircle className="h-4 w-4" aria-hidden="true" />Anfrage ablehnen</Button></form> : null}
                </CardContent>
              </Card>
            ) : null}

            {canSchedule ? (
              <Card>
                <CardHeader><CardTitle>Termine vorschlagen</CardTitle></CardHeader>
                <CardContent>
                  <form action={providerLinkAppointmentsAction} className="grid gap-4">
                    <input type="hidden" name="token" value={token} />
                    {[0, 1, 2].map((index) => <div key={index} className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor={`startsAt${index}`}>Option {index + 1} von</Label><Input id={`startsAt${index}`} name={`startsAt${index}`} type="datetime-local" required={index === 0} /></div><div><Label htmlFor={`endsAt${index}`}>Option {index + 1} bis</Label><Input id={`endsAt${index}`} name={`endsAt${index}`} type="datetime-local" required={index === 0} /></div></div>)}
                    <Input name="note" placeholder="Hinweis zum Zutritt oder Termin" />
                    <Button type="submit" variant="accent"><CalendarPlus className="h-5 w-5" aria-hidden="true" />Terminoptionen senden</Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            {canWork ? (
              <Card>
                <CardHeader><CardTitle>Ausführung</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatusForm token={token} status="IN_BEARBEITUNG" note="Anfahrt und Arbeit wurden gestartet." label="Anfahrt / Arbeit starten" icon="navigation" />
                    <StatusForm token={token} status="WARTEN_AUF_MATERIAL" note="Ausführung wartet auf Material." label="Warten auf Material" icon="package" />
                  </div>
                  {access.organization.settings?.requireProviderOtpCompletion ? <form action={providerLinkOtpAction}><input type="hidden" name="token" value={token} /><Button type="submit" variant="outline"><KeyRound className="h-4 w-4" aria-hidden="true" />Einmalcode anfordern</Button></form> : null}
                  <form action={providerLinkCompleteAction} className="grid gap-4 border-t border-slate-100 pt-5">
                    <input type="hidden" name="token" value={token} />
                    <div><Label htmlFor="completionReport">Arbeitsbericht</Label><Textarea id="completionReport" name="completionReport" placeholder="Arbeiten, Befund und Ergebnis" required /></div>
                    <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="beforeFiles">Vorher-Fotos</Label><Input id="beforeFiles" name="beforeFiles" type="file" multiple accept="image/jpeg,image/png,image/webp" /></div><div><Label htmlFor="afterFiles">Nachher-Fotos</Label><Input id="afterFiles" name="afterFiles" type="file" multiple required accept="image/jpeg,image/png,image/webp" /></div></div>
                    <div className="grid gap-3 sm:grid-cols-3"><Input name="workHours" type="number" step="0.25" min="0" placeholder="Arbeitszeit" required /><Input name="finalCost" type="number" step="0.01" min="0" placeholder="Abschlusskosten" required /><Input name="otp" inputMode="numeric" placeholder="Einmalcode, falls aktiv" /></div>
                    <div className="grid gap-3 sm:grid-cols-3"><Input name="materialDescription" placeholder="Material" /><Input name="materialQuantity" type="number" step="0.01" min="0" placeholder="Menge" /><Input name="materialUnitCost" type="number" step="0.01" min="0" placeholder="Einzelpreis" /></div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-4"><p className="font-bold text-primary">Rechnung</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input name="invoiceFile" type="file" required accept="application/pdf,application/xml,text/xml" /><Input name="invoiceNumber" placeholder="Rechnungsnummer" required /><Input name="supplierName" defaultValue={access.provider.companyName} placeholder="Rechnungssteller" required /><Input name="invoiceAmount" type="number" step="0.01" min="0" placeholder="Rechnungsbetrag" required /></div></div>
                    <Button type="submit" size="lg" variant="accent"><Upload className="h-5 w-5" aria-hidden="true" />Ausführung und Rechnung einreichen</Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader><CardTitle>Rückfrage stellen</CardTitle></CardHeader>
              <CardContent><form action={providerLinkMessageAction} className="grid gap-3"><input type="hidden" name="token" value={token} /><Textarea name="body" placeholder="Nachricht an Mieter und Hausverwaltung" required /><Button type="submit"><Send className="h-4 w-4" aria-hidden="true" />Nachricht senden</Button></form></CardContent>
            </Card>
          </div>

          <aside className="space-y-5">
            {confirmed ? <Card><CardHeader><CardTitle>Bestätigter Termin</CardTitle></CardHeader><CardContent><p className="font-bold text-primary">{formatDateTime(confirmed.startsAt)}</p><p className="mt-1 text-sm text-slate-600">bis {formatDateTime(confirmed.endsAt)}</p><Button asChild variant="outline" className="mt-4 w-full"><a href={`/api/calendar/${confirmed.id}?providerToken=${encodeURIComponent(token)}`}><FileCheck2 className="h-4 w-4" aria-hidden="true" />Kalendereinladung</a></Button></CardContent></Card> : null}
            {proposed.length ? <Card><CardHeader><CardTitle>Offene Terminoptionen</CardTitle></CardHeader><CardContent className="space-y-3">{proposed.map((entry) => <div key={entry.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"><Clock3 className="mb-2 h-4 w-4 text-accent" aria-hidden="true" /><p className="font-bold text-primary">{formatDateTime(entry.startsAt)}</p><p className="text-slate-500">Wartet auf Mieterauswahl</p></div>)}</CardContent></Card> : null}
            {ticket.invoices.length ? <Card><CardHeader><CardTitle>Rechnungsprüfung</CardTitle></CardHeader><CardContent className="space-y-3">{ticket.invoices.map((invoice) => <div key={invoice.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"><p className="font-bold text-primary">{invoice.invoiceNumber ?? "Rechnung"} · {invoice.amount ? `${Number(invoice.amount).toFixed(2)} EUR` : "Betrag offen"}</p><p className="mt-1 text-slate-600">{invoice.recommendation}</p></div>)}</CardContent></Card> : null}
            {ticket.offers.length ? <Card><CardHeader><CardTitle>Angebot</CardTitle></CardHeader><CardContent className="space-y-3">{ticket.offers.slice(0, 1).map((offer) => <div key={offer.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"><p className="font-bold text-primary">{Number(offer.amount).toFixed(2)} EUR</p><p className="mt-1 text-slate-600">{offer.status === "SUBMITTED" ? "Wartet auf Entscheidung der Verwaltung" : offer.status === "APPROVED" ? "Freigegeben" : "Nicht freigegeben"}</p>{offer.document ? <a href={offer.document.url} className="mt-2 inline-flex font-semibold text-accent">PDF öffnen</a> : null}</div>)}</CardContent></Card> : null}
            <Card><CardHeader><CardTitle>Kommunikation</CardTitle></CardHeader><CardContent className="space-y-3">{ticket.messages.map((entry) => <div key={entry.id} className="border-l-2 border-accent pl-3 text-sm"><div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-slate-400" aria-hidden="true" /><p className="font-bold text-primary">{entry.kind === "SYSTEM" ? "System" : "Nachricht"}</p></div><p className="mt-1 text-slate-600">{entry.body}</p></div>)}</CardContent></Card>
            <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />Dieser Link ist nur für diesen Auftrag gültig, zeitlich begrenzt und kann jederzeit widerrufen werden.</div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function StatusForm({ token, status, note, label, icon }: { token: string; status: string; note: string; label: string; icon: "navigation" | "package" }) {
  const Icon = icon === "navigation" ? Navigation : PackageOpen;
  return <form action={providerLinkStatusAction}><input type="hidden" name="token" value={token} /><input type="hidden" name="status" value={status} /><input type="hidden" name="note" value={note} /><Button type="submit" size="lg" variant="outline" className="h-14 w-full"><Icon className="h-5 w-5" aria-hidden="true" />{label}</Button></form>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-primary">{value}</dd></div>;
}
