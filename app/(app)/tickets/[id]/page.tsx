import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Archive,
  BrainCircuit,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  MessageSquare,
  NotebookPen,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Timer,
  Upload,
  Wrench,
  XCircle,
  Link2,
  RotateCcw,
  ReceiptText
} from "lucide-react";
import { CopyLink } from "@/components/app-shell/copy-link";
import { NoticeToast } from "@/components/app-shell/notice-toast";
import { PriorityBadge, StatusBadge } from "@/components/app-shell/status-badge";
import { ConfirmSubmitButton } from "@/components/app-shell/confirm-submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABELS, PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/constants";
import { createTicketSuggestion, nextBestAction, summarizeTicket } from "@/lib/ticket-intelligence";
import { rankProviders, type RankedProvider } from "@/lib/provider-matching";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { getTicketForUser } from "@/lib/ticket-service";
import { formatDate, formatDateTime } from "@/lib/utils";
import {
  addInternalNoteAction,
  approveFinalCostAction,
  assignTicketAction,
  cancelAppointmentAction,
  closeTicketAction,
  completeWorkAction,
  confirmAppointmentAction,
  confirmCompletionAction,
  createProviderAccessAction,
  providerAcceptAction,
  providerOfferAction,
  providerRejectAction,
  proposeAppointmentAction,
  quickStatusAction,
  reopenTicketAction,
  requestNewAppointmentsAction,
  reviewInvoiceAction,
  reviewProviderOfferAction,
  revokeProviderAccessAction,
  sendMessageAction,
  updateStatusAction
} from "./actions";
import { linkAssetToTicketAction } from "@/app/(app)/bauteile/actions";

export const runtime = "nodejs";

export default async function TicketDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; type?: "success" | "error" | "info"; providerLink?: string }>;
}) {
  const user = await requireSessionUser();
  const { id } = await params;
  const notice = await searchParams;
  const ticket = await getTicketForUser(id, user);
  if (!ticket) notFound();

  const [providers, similarTickets, assets] = await Promise.all([
    user.role === "HAUSVERWALTER"
      ? prisma.serviceProvider.findMany({
          where: {
            organizationId: user.organizationId,
            status: "ACTIVE"
          },
          include: {
            trades: { include: { trade: true } },
            properties: true,
            assignedTickets: {
              select: {
                propertyId: true,
                providerRequestedAt: true,
                providerAcceptedAt: true,
                completedAt: true,
                dueDate: true,
                finalCost: true,
                approvedCostLimit: true,
                reopenedCount: true,
                ratings: { select: { score: true } }
              },
              take: 50,
              orderBy: { createdAt: "desc" }
            },
            _count: { select: { assignedTickets: true } }
          },
          orderBy: [{ rating: "desc" }, { companyName: "asc" }]
        })
      : Promise.resolve([]),
    user.role === "HAUSVERWALTER"
      ? prisma.ticket.findMany({
          where: {
            id: { not: ticket.id },
            category: ticket.category,
            OR: [{ unitId: ticket.unitId }, { buildingId: ticket.buildingId }]
          },
          include: { assignedProvider: true },
          orderBy: { createdAt: "desc" },
          take: 5
        })
      : Promise.resolve([]),
    user.role === "HAUSVERWALTER"
      ? prisma.asset.findMany({
          where: { organizationId: user.organizationId, propertyId: ticket.propertyId, OR: [{ unitId: null }, { unitId: ticket.unitId }] },
          orderBy: { name: "asc" }
        })
      : Promise.resolve([])
  ]);

  const providerOptions = rankProviders(providers, ticket.category, ticket.propertyId);
  const matchingCount = providerOptions.filter((provider) => provider.tradeMatch).length;
  const suggestion = createTicketSuggestion({
    title: ticket.title,
    description: ticket.description,
    room: ticket.room,
    preferredWindows: ticket.preferredWindows
  });
  const summary = summarizeTicket({
    number: ticket.number,
    title: ticket.title,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    propertyName: ticket.property.name,
    tenantName: ticket.tenant.name
  });

  return (
    <div className="space-y-6">
      <NoticeToast message={notice.notice} type={notice.type} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/tickets" className="text-sm font-semibold text-accent">
            Zur Ticketübersicht
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-primary">{ticket.number}</h1>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <p className="mt-2 max-w-3xl text-lg font-semibold text-primary">{ticket.title}</p>
          <p className="mt-1 max-w-3xl text-slate-600">{ticket.description}</p>
          {ticket.reportedWithoutLogin ? <p className="mt-3 inline-flex text-sm font-semibold text-accent">Öffentlicher Fallback sicher protokolliert</p> : null}
        </div>
        <Card className="w-full lg:max-w-sm">
          <CardContent className="grid gap-3 p-5 text-sm">
            <InfoRow label="Objekt" value={`${ticket.property.name}, ${ticket.unit.label}`} />
            <InfoRow label="Mieter" value={ticket.tenant.name} />
            <InfoRow label="Dienstleister" value={ticket.assignedProvider?.companyName ?? "Nicht zugewiesen"} />
            <InfoRow label="Anfrage" value={ticket.providerRequestType === "QUOTE_REQUEST" ? "Angebot angefordert" : "Reparaturauftrag"} />
            <InfoRow label="Fällig" value={formatDate(ticket.dueDate)} />
            <InfoRow label="Termin" value={formatDateTime(ticket.appointmentAt)} />
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Systemempfehlung</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-800">
                {suggestion.recommendation}
              </p>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <InfoRow label="Vorgeschlagene Kategorie" value={CATEGORY_LABELS[suggestion.category]} />
                <InfoRow label="Vorgeschlagene Priorität" value={PRIORITY_LABELS[suggestion.priority]} />
                <InfoRow label="Nächste Aktion" value={nextBestAction(ticket)} />
              </div>
              <p className="text-sm text-slate-600">{summary}</p>
            </CardContent>
          </Card>

          {user.role === "HAUSVERWALTER" ? (
            <>
              <ManagerActions ticket={ticket} providers={providerOptions} matchingCount={matchingCount} providerLink={notice.providerLink} assets={assets} />
              <InvoiceReview ticket={ticket} />
              <ObjectMemory ticket={ticket} similarTickets={similarTickets} />
            </>
          ) : null}
          {user.role === "DIENSTLEISTER" ? <ProviderActions ticket={ticket} /> : null}
          {user.role === "MIETER" ? <TenantActions ticket={ticket} /> : null}

          <Communication ticket={ticket} userRole={user.role} />
        </div>

        <aside className="space-y-5">
          <Documents documents={ticket.documents} />
          <Appointments ticketId={ticket.id} appointments={ticket.appointments} canPropose={user.role !== "MIETER"} />
          <StatusHistory history={ticket.statusHistory} />
        </aside>
      </section>
    </div>
  );
}

type TicketDetail = NonNullable<Awaited<ReturnType<typeof getTicketForUser>>>;

function ManagerActions({
  ticket,
  providers,
  matchingCount,
  providerLink,
  assets
}: {
  ticket: TicketDetail;
  providers: RankedProvider[];
  matchingCount: number;
  providerLink?: string;
  assets: Array<{ id: string; name: string; manufacturer: string | null; model: string | null }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hausverwaltung</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {providerLink ? (
          <div className="rounded-md border border-teal-200 bg-teal-50 p-4">
            <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-accent" aria-hidden="true" /><p className="font-bold text-primary">Registrierungsfreier Auftragslink</p></div>
            <p className="mt-1 text-sm text-slate-600">Der Link wird nur jetzt vollständig angezeigt, ist 14 Tage gültig und auf diesen Auftrag begrenzt.</p>
            <div className="mt-3"><CopyLink value={providerLink} label="Auftragslink kopieren" /></div>
          </div>
        ) : null}
        {ticket.reviewRequired ? (
          <div className="flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" aria-hidden="true" />
            <div>
              <p className="font-bold text-primary">Ausnahme benötigt eine Entscheidung</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{ticket.reviewReason ?? "Der Autopilot benötigt eine kontrollierte Freigabe."}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p className="font-bold text-primary">Autopilot aktiv</p>
              <p className="mt-1 text-sm text-slate-600">Der Vorgang läuft weiter, bis eine echte Entscheidung notwendig wird.</p>
            </div>
          </div>
        )}

        {ticket.offers.filter((offer) => offer.status === "SUBMITTED").map((offer) => (
          <section key={offer.id} className="grid gap-4 rounded-md border border-orange-200 bg-orange-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-orange-700" aria-hidden="true" /><p className="font-bold text-primary">Angebot von {offer.provider.companyName}</p></div><p className="mt-2 text-2xl font-bold text-primary">{Number(offer.amount).toFixed(2)} EUR</p><p className="mt-2 text-sm leading-6 text-slate-600">{offer.description}</p>{offer.validUntil ? <p className="mt-2 text-xs font-semibold text-slate-500">Gültig bis {formatDate(offer.validUntil)}</p> : null}</div>
              {offer.document ? <Button asChild variant="outline"><a href={offer.document.url} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" aria-hidden="true" />PDF öffnen</a></Button> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <form action={reviewProviderOfferAction} className="grid gap-2"><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="offerId" value={offer.id} /><input type="hidden" name="decision" value="reject" /><Input name="note" placeholder="Grund für Ablehnung" required /><ConfirmSubmitButton variant="outline" confirmText="Angebot ablehnen?">Angebot ablehnen</ConfirmSubmitButton></form>
              <form action={reviewProviderOfferAction} className="flex items-end"><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="offerId" value={offer.id} /><input type="hidden" name="decision" value="approve" /><ConfirmSubmitButton className="w-full" variant="accent" confirmText={`Angebot über ${Number(offer.amount).toFixed(2)} EUR freigeben und Auftrag senden?`}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Freigeben und beauftragen</ConfirmSubmitButton></form>
            </div>
          </section>
        ))}

        <form action={assignTicketAction} className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Wrench className="h-5 w-5 text-accent" aria-hidden="true" />
            {matchingCount ? "Passende Dienstleister nach Gewerk" : "Aktive Dienstleister"}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_170px_220px]">
            <div className="space-y-2">
              <Label htmlFor="providerId">Dienstleister</Label>
              <NativeSelect id="providerId" name="providerId" defaultValue={ticket.assignedProviderId ?? providers[0]?.id} required>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.companyName} · Match {provider.score} · {provider.rating.toFixed(1)} Sterne · Ø {provider.averageResponseHours} Std.
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="requestType">Versandart</Label>
              <NativeSelect id="requestType" name="requestType" defaultValue={ticket.providerRequestType}>
                <option value="WORK_ORDER">Direkter Auftrag</option>
                <option value="QUOTE_REQUEST">Angebot anfordern</option>
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priorität</Label>
              <NativeSelect id="priority" name="priority" defaultValue={ticket.priority}>
                {TICKET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {providers[0] ? (
            <div className="rounded-md border border-teal-200 bg-white p-3 text-sm">
              <p className="font-bold text-primary">Empfehlung: {providers[0].companyName}</p>
              <p className="mt-1 leading-6 text-slate-600">{providers[0].reasons.join(" · ")}</p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="approvedCostLimit">Kostenrahmen in EUR</Label>
              <Input id="approvedCostLimit" name="approvedCostLimit" type="number" min="0" step="10" defaultValue={ticket.approvedCostLimit ? Number(ticket.approvedCostLimit) : 250} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assign-note">Hinweis an den Dienstleister</Label>
              <Input id="assign-note" name="note" placeholder="Optional, z. B. Zutritt über Hausmeister" />
            </div>
          </div>
          <ConfirmSubmitButton disabled={!providers.length} confirmText="Anfrage jetzt an den Dienstleister senden?">
            Anfrage an Dienstleister senden
          </ConfirmSubmitButton>
        </form>

        {ticket.assignedProvider ? (
          <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="font-bold text-primary">Sicherer Dienstleisterzugang</p>
              <p className="mt-1 text-sm text-slate-600">
                {ticket.providerAccesses.filter((access) => !access.revokedAt && access.expiresAt > new Date()).length} aktiver Link · Aktionen sind auf diesen Vorgang beschränkt.
              </p>
            </div>
            <form action={createProviderAccessAction}><input type="hidden" name="ticketId" value={ticket.id} /><ConfirmSubmitButton variant="outline" className="w-full" confirmText="Bestehende Links widerrufen und neuen Link erstellen?"><Link2 className="h-4 w-4" aria-hidden="true" />Neuen Link erstellen</ConfirmSubmitButton></form>
            <form action={revokeProviderAccessAction}><input type="hidden" name="ticketId" value={ticket.id} /><ConfirmSubmitButton variant="outline" className="w-full" confirmText="Alle offenen Auftragslinks widerrufen?"><XCircle className="h-4 w-4" aria-hidden="true" />Links widerrufen</ConfirmSubmitButton></form>
          </div>
        ) : null}

        {assets.length ? (
          <form action={linkAssetToTicketAction} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div><Label htmlFor="assetId">Bauteil zuordnen</Label><NativeSelect id="assetId" name="assetId" defaultValue={ticket.assetId ?? ""} required><option value="">Bauteil auswählen</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}{asset.manufacturer ? ` · ${asset.manufacturer} ${asset.model ?? ""}` : ""}</option>)}</NativeSelect></div>
            <ConfirmSubmitButton variant="outline">Bauteil verknüpfen</ConfirmSubmitButton>
          </form>
        ) : null}

        {ticket.status === "WARTEN_AUF_FREIGABE" && ticket.finalCost ? (
          <form action={approveFinalCostAction} className="grid gap-4 rounded-md border border-orange-200 bg-orange-50 p-4">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div>
              <p className="font-bold text-primary">Abschlusskosten freigeben</p>
              <p className="mt-1 text-sm text-slate-600">Gemeldet: {Number(ticket.finalCost).toFixed(2)} EUR · bisheriger Rahmen: {ticket.approvedCostLimit ? `${Number(ticket.approvedCostLimit).toFixed(2)} EUR` : "kein Rahmen"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <Input name="approvedCostLimit" type="number" min={Number(ticket.finalCost)} step="0.01" defaultValue={Number(ticket.finalCost)} required aria-label="Neuer Kostenrahmen" />
              <Input name="note" placeholder="Freigabevermerk" aria-label="Freigabevermerk" />
            </div>
            <ConfirmSubmitButton variant="accent" confirmText="Abschlusskosten freigeben und Mieter informieren?">
              <FileText className="h-4 w-4" aria-hidden="true" />Kosten freigeben
            </ConfirmSubmitButton>
          </form>
        ) : null}

        {ticket.appointments.some((appointment) => appointment.status === "CONFIRMED") ? (
          <form action={cancelAppointmentAction} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="noShow" value="true" />
            <div><Label htmlFor="no-show-reason">Nichterscheinen dokumentieren</Label><Input id="no-show-reason" name="reason" placeholder="Kurzer Vermerk" required /></div>
            <ConfirmSubmitButton variant="outline" confirmText="Nichterscheinen erfassen und Terminabstimmung neu öffnen?">Nichterscheinen erfassen</ConfirmSubmitButton>
          </form>
        ) : null}

        <form action={updateStatusAction} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-[220px_1fr_auto] md:items-end">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <NativeSelect id="status" name="status" defaultValue={ticket.status}>
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status-note">Statusnotiz</Label>
            <Input id="status-note" name="note" placeholder="Kurze Begründung" />
          </div>
          <ConfirmSubmitButton variant="outline">Status speichern</ConfirmSubmitButton>
        </form>

        <form action={closeTicketAction}>
          <input type="hidden" name="ticketId" value={ticket.id} />
          <ConfirmSubmitButton
            variant="secondary"
            disabled={ticket.status !== "VOM_MIETER_BESTAETIGT"}
            confirmText="Ticket abschließen und archivieren?"
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            Ticket abschließen
          </ConfirmSubmitButton>
        </form>

        <form action={addInternalNoteAction} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <Label htmlFor="internal-note">Interne Notiz</Label>
          <Textarea id="internal-note" name="body" placeholder="Nur für die Hausverwaltung sichtbar" />
          <ConfirmSubmitButton variant="outline">
            <NotebookPen className="h-4 w-4" aria-hidden="true" />
            Notiz speichern
          </ConfirmSubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function InvoiceReview({ ticket }: { ticket: TicketDetail }) {
  if (!ticket.invoices.length) {
    return (
      <Card>
        <CardHeader><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-accent" aria-hidden="true" /><CardTitle>Rechnungsprüfung</CardTitle></div></CardHeader>
        <CardContent><p className="text-sm text-slate-600">Noch keine Rechnung eingegangen. Nach der Ausführung kann sie über den Auftragslink oder den Rechnungseingang zugeordnet werden.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><div className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-accent" aria-hidden="true" /><CardTitle>Auftrag ↔ Nachweis ↔ Rechnung</CardTitle></div></CardHeader>
      <CardContent className="space-y-5">
        {ticket.invoices.map((invoice) => {
          const checks = Array.isArray(invoice.checks)
            ? (invoice.checks as Array<{ key: string; label: string; status: "PASS" | "WARN" | "FAIL"; detail: string }>)
            : [];
          return (
            <section key={invoice.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="font-bold text-primary">{invoice.invoiceNumber ?? "Rechnung ohne erkannte Nummer"}</p><p className="mt-1 text-sm text-slate-600">{invoice.supplierName ?? "Aussteller offen"} · {invoice.amount == null ? "Betrag offen" : `${Number(invoice.amount).toFixed(2)} EUR`}</p></div>
                <span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-bold ${invoice.risk === "HIGH" ? "border-red-200 bg-red-50 text-red-700" : invoice.risk === "MEDIUM" ? "border-orange-200 bg-orange-50 text-orange-700" : "border-teal-200 bg-teal-50 text-teal-700"}`}>Risiko {invoice.risk === "HIGH" ? "hoch" : invoice.risk === "MEDIUM" ? "mittel" : "niedrig"}</span>
              </div>
              <p className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm font-semibold text-primary">{invoice.recommendation}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {checks.map((check) => <div key={check.key} className="flex items-start gap-2 rounded-md bg-white p-3 text-sm"><span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${check.status === "PASS" ? "bg-teal-500" : check.status === "WARN" ? "bg-orange-500" : "bg-red-500"}`} /><div><p className="font-bold text-primary">{check.label}</p><p className="mt-0.5 text-slate-600">{check.detail}</p></div></div>)}
              </div>
              {invoice.document ? <a href={invoice.document.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-accent">Rechnung öffnen</a> : null}
              {!(["APPROVED", "REJECTED"] as string[]).includes(invoice.status) ? (
                <form action={reviewInvoiceAction} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                  <input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="invoiceId" value={invoice.id} />
                  <div><Label htmlFor={`invoice-note-${invoice.id}`}>Prüfvermerk</Label><Input id={`invoice-note-${invoice.id}`} name="note" placeholder="Begründung oder Rückfrage" /></div>
                  <Button type="submit" name="decision" value="QUESTION" variant="outline">Rückfrage</Button>
                  <Button type="submit" name="decision" value="REJECTED" variant="outline">Ablehnen</Button>
                  <Button type="submit" name="decision" value="APPROVED" variant="accent">Freigeben</Button>
                </form>
              ) : <p className="mt-4 text-sm font-bold text-primary">Entscheidung: {invoice.status === "APPROVED" ? "Freigegeben" : "Abgelehnt"}{invoice.reviewedBy ? ` durch ${invoice.reviewedBy.name}` : ""}</p>}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ObjectMemory({
  ticket,
  similarTickets
}: {
  ticket: TicketDetail;
  similarTickets: Array<{
    id: string;
    number: string;
    title: string;
    status: TicketDetail["status"];
    createdAt: Date;
    finalCost: TicketDetail["finalCost"];
    completionReport: string | null;
    assignedProvider: { companyName: string } | null;
  }>;
}) {
  const completed = similarTickets.filter((item) => item.status === "ABGESCHLOSSEN");
  const averageCost = completed.length
    ? completed.reduce((sum, item) => sum + Number(item.finalCost ?? 0), 0) / completed.length
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-accent" aria-hidden="true" />
          <CardTitle>Objektgedächtnis</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Ähnliche Vorgänge" value={String(similarTickets.length)} />
          <Metric label="Davon abgeschlossen" value={String(completed.length)} />
          <Metric label="Ø Abschlusskosten" value={averageCost == null ? "Noch keine Daten" : `${averageCost.toFixed(2)} EUR`} />
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto"><a href={`/api/tickets/${ticket.id}/insurance-package`}><FileText className="h-4 w-4" aria-hidden="true" />Schaden- und Versicherungspaket</a></Button>
        {similarTickets.length ? (
          <div className="grid gap-2">
            {similarTickets.map((item) => (
              <Link key={item.id} href={`/tickets/${item.id}`} className="rounded-md border border-slate-200 bg-slate-50 p-3 hover:bg-white">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-primary">{item.number} · {item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.assignedProvider?.companyName ?? "Ohne Dienstleister"} · {formatDate(item.createdAt)}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                {item.completionReport ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.completionReport}</p> : null}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-slate-600">Für {CATEGORY_LABELS[ticket.category]} gibt es in dieser Einheit oder diesem Gebäude noch keinen vergleichbaren Verlauf. Der aktuelle Abschluss wird als erster Referenzfall gespeichert.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderActions({ ticket }: { ticket: TicketDetail }) {
  const canSchedule = ticket.providerRequestType === "WORK_ORDER" && ticket.status === "TERMINABSTIMMUNG";
  const canWork = ["TERMIN_BESTAETIGT", "IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL"].includes(ticket.status);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Auftragsbearbeitung</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {ticket.status === "DIENSTLEISTER_ANGEFRAGT" && ticket.providerRequestType === "WORK_ORDER" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={providerAcceptAction}>
              <input type="hidden" name="ticketId" value={ticket.id} />
              <ConfirmSubmitButton size="lg" className="h-14 w-full" variant="accent" confirmText="Auftrag annehmen?">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                Auftrag annehmen
              </ConfirmSubmitButton>
            </form>
            <form action={providerRejectAction} className="grid gap-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Input name="reason" placeholder="Ablehnungsgrund" required />
              <ConfirmSubmitButton size="lg" className="h-14 w-full" variant="outline" confirmText="Auftrag ablehnen?">
                <XCircle className="h-5 w-5" aria-hidden="true" />
                Auftrag ablehnen
              </ConfirmSubmitButton>
            </form>
          </div>
        ) : null}

        {ticket.status === "DIENSTLEISTER_ANGEFRAGT" ? (
          <form action={providerOfferAction} className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div><p className="font-bold text-primary">{ticket.providerRequestType === "QUOTE_REQUEST" ? "Angebot erstellen" : "Kostenrahmen reicht nicht aus"}</p><p className="mt-1 text-sm text-slate-600">{ticket.providerRequestType === "QUOTE_REQUEST" ? "Das Angebot geht direkt zur Freigabe an die Verwaltung." : "Senden Sie ein Gegenangebot, bevor ein Termin vereinbart wird."}</p></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="provider-offer-amount">Angebotsbetrag in EUR</Label><Input id="provider-offer-amount" name="amount" type="number" min="0.01" step="0.01" required /></div><div><Label htmlFor="provider-offer-valid">Gültig bis</Label><Input id="provider-offer-valid" name="validUntil" type="date" /></div></div>
            <div><Label htmlFor="provider-offer-description">Leistung und Umfang</Label><Textarea id="provider-offer-description" name="description" placeholder="Arbeitsleistung, Material und Annahmen" required /></div>
            <div><Label htmlFor="provider-offer-file">Angebot als PDF, optional</Label><Input id="provider-offer-file" name="offerFile" type="file" accept="application/pdf" /></div>
            <ConfirmSubmitButton variant={ticket.providerRequestType === "QUOTE_REQUEST" ? "accent" : "outline"} confirmText="Angebot an die Hausverwaltung senden?"><CircleDollarSign className="h-4 w-4" aria-hidden="true" />Angebot senden</ConfirmSubmitButton>
          </form>
        ) : null}

        {ticket.status === "DIENSTLEISTER_ANGEFRAGT" && ticket.providerRequestType === "QUOTE_REQUEST" ? (
          <form action={providerRejectAction} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div><Label htmlFor="provider-quote-reject">Angebotsanfrage nicht möglich</Label><Input id="provider-quote-reject" name="reason" placeholder="Kurzer Grund" required /></div>
            <ConfirmSubmitButton variant="outline" confirmText="Angebotsanfrage ablehnen?"><XCircle className="h-4 w-4" aria-hidden="true" />Anfrage ablehnen</ConfirmSubmitButton>
          </form>
        ) : null}

        {canSchedule ? <form action={proposeAppointmentAction} className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div>
            <p className="font-bold text-primary">Terminfenster zur direkten Auswahl</p>
            <p className="mt-1 text-sm text-slate-600">Bis zu drei Optionen einstellen. Der Mieter wählt selbst, alle übrigen verfallen automatisch.</p>
          </div>
          {[0, 1, 2].map((index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor={`startsAt${index}`}>Option {index + 1} von</Label><Input id={`startsAt${index}`} name={`startsAt${index}`} type="datetime-local" required={index === 0} /></div>
              <div className="space-y-2"><Label htmlFor={`endsAt${index}`}>Option {index + 1} bis</Label><Input id={`endsAt${index}`} name={`endsAt${index}`} type="datetime-local" required={index === 0} /></div>
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="appointment-note">Hinweis</Label>
            <Input id="appointment-note" name="note" placeholder="Optional" />
          </div>
          <ConfirmSubmitButton className="h-12" variant="outline">
            <CalendarPlus className="h-5 w-5" aria-hidden="true" />
            Terminoptionen senden
          </ConfirmSubmitButton>
        </form> : null}

        {canWork ? <div className="grid gap-3 sm:grid-cols-2">
          <QuickStatus ticketId={ticket.id} status="IN_BEARBEITUNG" note="Anfahrt gestartet." label="Anfahrt gestartet" icon={<Timer className="h-5 w-5" aria-hidden="true" />} />
          <QuickStatus ticketId={ticket.id} status="IN_BEARBEITUNG" note="Arbeit begonnen." label="Arbeit begonnen" icon={<Wrench className="h-5 w-5" aria-hidden="true" />} />
          <QuickStatus ticketId={ticket.id} status="WARTEN_AUF_MATERIAL" note="Warten auf Material." label="Warten auf Material" icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />} />
        </div> : null}

        {canWork ? <form action={completeWorkAction} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div><Label htmlFor="completionReport">Arbeitsbericht und Nachweis</Label><p className="mt-1 text-sm text-slate-500">Foto, Bericht und Rechnung werden gemeinsam zur Prüfung eingereicht.</p></div>
          <Textarea id="completionReport" name="completionReport" placeholder="Durchgeführte Arbeiten, Material, Hinweise" required />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input name="workHours" type="number" step="0.25" min="0" placeholder="Arbeitszeit" required />
            <Input name="finalCost" type="number" step="0.01" min="0" placeholder="Kosten EUR" />
            <Input name="files" type="file" multiple required accept="image/png,image/jpeg,image/webp,application/pdf" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input name="invoiceNumber" placeholder="Rechnungsnummer" />
            <Input name="supplierName" defaultValue={ticket.assignedProvider?.companyName ?? ""} placeholder="Rechnungssteller" />
            <Input name="invoice" type="file" required accept="application/pdf,application/xml,text/xml" />
          </div>
          <ConfirmSubmitButton size="lg" variant="accent" confirmText="Ausführung und Rechnung zur Prüfung einreichen?">
            <Upload className="h-5 w-5" aria-hidden="true" />
            Abschluss einreichen
          </ConfirmSubmitButton>
        </form> : null}
      </CardContent>
    </Card>
  );
}

function TenantActions({ ticket }: { ticket: TicketDetail }) {
  const proposedAppointments = ticket.appointments.filter((appointment) => appointment.status === "PROPOSED");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mieteraktionen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {proposedAppointments.length ? (
          <div className="grid gap-3">
            {proposedAppointments.map((appointment) => (
              <form key={appointment.id} action={confirmAppointmentAction} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <input type="hidden" name="appointmentId" value={appointment.id} />
                <p className="font-semibold text-primary">{formatDateTime(appointment.startsAt)} bis {formatDateTime(appointment.endsAt)}</p>
                {appointment.note ? <p className="mt-1 text-sm text-slate-600">{appointment.note}</p> : null}
                <ConfirmSubmitButton className="mt-3" variant="accent" confirmText="Diesen Termin bestätigen?">
                  <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
                  Termin bestätigen
                </ConfirmSubmitButton>
              </form>
            ))}
            <form action={requestNewAppointmentsAction} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <div><Label htmlFor="new-slots-reason">Kein Termin passt?</Label><Input id="new-slots-reason" name="reason" placeholder="Bitte mögliche Zeiten nennen" required /></div>
              <ConfirmSubmitButton variant="outline">Neue Optionen anfordern</ConfirmSubmitButton>
            </form>
          </div>
        ) : (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            Aktuell liegt kein offener Terminvorschlag vor.
          </p>
        )}

        {ticket.appointments.some((appointment) => appointment.status === "CONFIRMED") ? (
          <form action={cancelAppointmentAction} className="grid gap-3 rounded-md border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div><Label htmlFor="cancel-reason">Bestätigten Termin absagen</Label><Input id="cancel-reason" name="reason" placeholder="Grund und neue Verfügbarkeit" required /></div>
            <ConfirmSubmitButton variant="outline" confirmText="Termin absagen und neue Abstimmung starten?">Termin absagen</ConfirmSubmitButton>
          </form>
        ) : null}

        {ticket.status === "ERLEDIGT" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <form action={confirmCompletionAction} className="grid gap-3 rounded-md border border-teal-200 bg-teal-50 p-4">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Label htmlFor="score">Erledigung bestätigen</Label>
              <NativeSelect id="score" name="score" defaultValue="5"><option value="5">5 - Sehr zufrieden</option><option value="4">4 - Zufrieden</option><option value="3">3 - In Ordnung</option></NativeSelect>
              <Textarea name="comment" placeholder="Optionales Feedback" />
              <ConfirmSubmitButton variant="accent" confirmText="Erledigung bestätigen?"><ThumbsUp className="h-4 w-4" aria-hidden="true" />Bestätigen und abschließen</ConfirmSubmitButton>
            </form>
            <form action={reopenTicketAction} className="grid gap-3 rounded-md border border-orange-200 bg-orange-50 p-4">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Label htmlFor="reopen-reason">Problem besteht weiter</Label>
              <Textarea id="reopen-reason" name="reason" placeholder="Was ist noch nicht behoben?" required />
              <ConfirmSubmitButton variant="outline" confirmText="Vorgang als möglichen Gewährleistungsfall erneut öffnen?"><RotateCcw className="h-4 w-4" aria-hidden="true" />Erneut öffnen</ConfirmSubmitButton>
            </form>
          </div>
        ) : null}
        {(["VOM_MIETER_BESTAETIGT", "ABGESCHLOSSEN"] as string[]).includes(ticket.status) ? (
          <form action={reopenTicketAction} className="grid gap-3 rounded-md border border-orange-200 bg-orange-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div><Label htmlFor="late-reopen-reason">Reparatur nicht dauerhaft erfolgreich?</Label><Input id="late-reopen-reason" name="reason" placeholder="Wieder aufgetretener Schaden" required /></div>
            <ConfirmSubmitButton variant="outline" confirmText="Gewährleistungsprüfung starten?"><RotateCcw className="h-4 w-4" aria-hidden="true" />Gewährleistung prüfen</ConfirmSubmitButton>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Communication({ ticket, userRole }: { ticket: TicketDetail; userRole: TicketDetail["tenant"]["role"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kommunikation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {ticket.messages.map((message) => {
            const system = message.kind === "SYSTEM";
            return (
              <div
                key={message.id}
                className={`rounded-md border p-4 ${
                  system ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {system ? (
                    <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  )}
                  <span className="font-bold text-primary">
                    {system ? "System" : message.author?.name ?? "Unbekannt"}
                  </span>
                  {!system && message.author ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {ROLE_LABELS[message.author.role]}
                    </span>
                  ) : null}
                  <span className="text-slate-500">{formatDateTime(message.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{message.body}</p>
              </div>
            );
          })}
        </div>

        <form action={sendMessageAction} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <Label htmlFor="message">Nachricht schreiben</Label>
          <Textarea id="message" name="body" placeholder="Nachricht an die Beteiligten" required />
          <ConfirmSubmitButton>
            <Send className="h-4 w-4" aria-hidden="true" />
            Nachricht senden
          </ConfirmSubmitButton>
        </form>

        {userRole === "HAUSVERWALTER" && ticket.internalNotes.length ? (
          <div className="rounded-md border border-orange-200 bg-orange-50 p-4">
            <h3 className="font-bold text-primary">Interne Notizen</h3>
            <div className="mt-3 space-y-3">
              {ticket.internalNotes.map((note) => (
                <div key={note.id} className="rounded-md bg-white p-3 text-sm">
                  <p className="font-semibold text-primary">{note.author.name} · {formatDateTime(note.createdAt)}</p>
                  <p className="mt-1 text-slate-700">{note.body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Documents({ documents }: { documents: TicketDetail["documents"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dokumente und Bilder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.length ? (
          documents.map((document) => (
            <a
              key={document.id}
              href={document.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 hover:bg-white"
            >
              <FileText className="h-5 w-5 text-accent" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-primary">{document.originalName}</span>
                <span className="block text-xs text-slate-500">{document.contentType}</span>
              </span>
            </a>
          ))
        ) : (
          <p className="text-sm text-slate-600">Keine Dokumente hinterlegt.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Appointments({
  ticketId,
  appointments,
  canPropose
}: {
  ticketId: string;
  appointments: TicketDetail["appointments"];
  canPropose: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Termine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {appointments.length ? (
          appointments.map((appointment) => (
            <div key={appointment.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-bold text-primary">{formatDateTime(appointment.startsAt)} bis {formatDateTime(appointment.endsAt)}</p>
              <p className="mt-1 text-slate-600">
                {appointment.status === "CONFIRMED" ? "Bestätigt" : appointment.status === "DECLINED" ? "Abgelehnt" : "Vorgeschlagen"}
              </p>
              {appointment.status === "CONFIRMED" ? <a href={`/api/calendar/${appointment.id}`} className="mt-2 inline-flex text-xs font-bold text-accent">.ics-Kalendereinladung laden</a> : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">Noch kein Termin vorgeschlagen.</p>
        )}
        {canPropose ? (
          <form action={proposeAppointmentAction} className="grid gap-2 border-t border-slate-100 pt-3">
            <input type="hidden" name="ticketId" value={ticketId} />
            <Input name="startsAt" type="datetime-local" aria-label="Termin von" required />
            <Input name="endsAt" type="datetime-local" aria-label="Termin bis" required />
            <ConfirmSubmitButton variant="outline">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Termin vorschlagen
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusHistory({ history }: { history: TicketDetail["statusHistory"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Statushistorie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {history.map((entry) => (
          <div key={entry.id} className="border-l-2 border-accent pl-3 text-sm">
            <p className="font-bold text-primary">{STATUS_LABELS[entry.toStatus]}</p>
            <p className="text-slate-500">
              {formatDateTime(entry.createdAt)} · {entry.changedBy?.name ?? "System"}
            </p>
            {entry.note ? <p className="mt-1 text-slate-600">{entry.note}</p> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function QuickStatus({
  ticketId,
  status,
  note,
  label,
  icon
}: {
  ticketId: string;
  status: string;
  note: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <form action={quickStatusAction}>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="note" value={note} />
      <ConfirmSubmitButton size="lg" className="h-14 w-full" variant="outline">
        {icon}
        {label}
      </ConfirmSubmitButton>
    </form>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-primary">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-primary">{value}</p>
    </div>
  );
}
