import { Bot, Cable, ClipboardCheck, FileSearch, MailCheck, Palette, Save, Send, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { NoticeToast } from "@/components/app-shell/notice-toast";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { jsonRecord, getOrganizationSettings } from "@/lib/organization-settings";
import { getMailConfigurationStatus } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { sendTestMailAction, testConnectorAction, toggleAutomationRuleAction, updateOrganizationSettingsAction } from "./actions";

const connectorLabels = {
  MICROSOFT_365: "Microsoft 365",
  GOOGLE_WORKSPACE: "Google Workspace",
  FORWARDING: "Rechnungs-Weiterleitung",
  IMAP: "IMAP-Fallback"
};

const dispatchStrategies = [
  { value: "AUTO_ORDER", title: "Direkt beauftragen", description: "Routinefälle gehen sofort mit Kostenrahmen an den passenden Betrieb.", icon: Bot },
  { value: "REVIEW_FIRST", title: "Vor Versand prüfen", description: "Das System bereitet alles vor. Die Verwaltung löst den Versand mit einem Klick aus.", icon: ClipboardCheck },
  { value: "QUOTE_FIRST", title: "Immer zuerst Angebot", description: "Der passende Betrieb erhält automatisch eine Angebotsanfrage.", icon: FileSearch }
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; type?: "success" | "error" }> }) {
  const user = await requireSessionUser();
  const query = await searchParams;
  if (user.role !== "HAUSVERWALTER") throw new Error("Diese Seite ist der Hausverwaltung vorbehalten.");
  const [settings, rules, connectors, organization] = await Promise.all([
    getOrganizationSettings(user.organizationId),
    prisma.automationRule.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ priority: "asc" }, { name: "asc" }] }),
    prisma.inboundConnector.findMany({ where: { organizationId: user.organizationId }, orderBy: { type: "asc" } }),
    prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } })
  ]);
  const modules = jsonRecord(settings.enabledModules);
  const requiredFields = jsonRecord(settings.requiredFields);
  const channels = jsonRecord(settings.communicationChannels);
  const mail = getMailConfigurationStatus();

  return (
    <div className="space-y-6">
      <NoticeToast message={query.notice} type={query.type} />
      <PageHeader eyebrow="Mandantenkonfiguration" title={`${organization.name} konfigurieren`} description="Branding, Module und Regeln gelten datengetrieben für diesen Mandanten. Die gemeinsame Plattform bleibt unverändert." />

      <form action={updateOrganizationSettingsAction} className="space-y-6">
        <Card>
          <CardHeader><div className="flex items-center gap-2"><Palette className="h-5 w-5 text-accent" aria-hidden="true" /><CardTitle>Marke und Absender</CardTitle></div></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Primärfarbe"><Input name="brandPrimary" type="color" defaultValue={settings.brandPrimary} className="h-11 w-full p-1" aria-label="Primärfarbe auswählen" /></Field>
            <Field label="Akzentfarbe"><Input name="brandAccent" type="color" defaultValue={settings.brandAccent} className="h-11 w-full p-1" aria-label="Akzentfarbe auswählen" /></Field>
            <Field label="Logo-URL"><Input name="logoUrl" defaultValue={settings.logoUrl ?? ""} placeholder="/logo.svg" /></Field>
            <Field label="Eigene Domain"><Input name="customDomain" defaultValue={settings.customDomain ?? ""} placeholder="service.verwaltung.de" /></Field>
            <Field label="Absendername"><Input name="senderName" defaultValue={settings.senderName} required /></Field>
            <Field label="Absender-E-Mail"><Input name="senderEmail" type="email" defaultValue={settings.senderEmail ?? ""} placeholder="service@verwaltung.de" /></Field>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader><div className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5 text-accent" aria-hidden="true" /><CardTitle>Module und Pflichtangaben</CardTitle></div></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Toggle name="moduleAppointments" label="Terminabstimmung" checked={modules.appointments !== false} />
              <Toggle name="moduleDocuments" label="Dokumente" checked={modules.documents !== false} />
              <Toggle name="moduleInvoices" label="Rechnungsprüfung" checked={modules.invoices !== false} />
              <Toggle name="moduleAssets" label="Technische Ausstattung" checked={modules.assets !== false} />
              <Toggle name="moduleAnalytics" label="Objektanalysen" checked={modules.analytics !== false} />
              <Toggle name="requiredPreferredWindows" label="Terminfenster erforderlich" checked={requiredFields.preferredWindows !== false} />
              <Toggle name="requiredDamagePhoto" label="Schadensfoto erforderlich" checked={requiredFields.damagePhoto === true} />
              <Toggle name="channelEmail" label="E-Mail-Benachrichtigungen" checked={channels.email !== false} />
              <Toggle name="channelPush" label="Push vorbereitet" checked={channels.push === true} />
              <Toggle name="channelSms" label="SMS vorbereitet" checked={channels.sms === true} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-accent" aria-hidden="true" /><CardTitle>Freigaben und Eskalation</CardTitle></div></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <fieldset className="grid gap-3 sm:col-span-2">
                <legend className="text-sm font-semibold text-primary">Was passiert nach der automatischen Prüfung?</legend>
                <div className="grid gap-2">
                  {dispatchStrategies.map((strategy) => {
                    const Icon = strategy.icon;
                    return <label key={strategy.value} className="grid cursor-pointer grid-cols-[20px_1fr] gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50"><input type="radio" name="dispatchStrategy" value={strategy.value} defaultChecked={settings.dispatchStrategy === strategy.value} className="mt-1 h-4 w-4 accent-teal-600" /><span><span className="flex items-center gap-2 font-bold text-primary"><Icon className="h-4 w-4 text-accent" aria-hidden="true" />{strategy.title}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{strategy.description}</span></span></label>;
                  })}
                </div>
              </fieldset>
              <Field label="Standard-Kostenrahmen"><Input name="defaultCostLimit" type="number" step="10" min="0" defaultValue={Number(settings.defaultCostLimit)} /></Field>
              <Field label="Hohe Kosten ab"><Input name="highCostThreshold" type="number" step="10" min="0" defaultValue={Number(settings.highCostThreshold)} /></Field>
              <Field label="Reaktionsfrist in Stunden"><Input name="providerResponseHours" type="number" min="1" max="168" defaultValue={settings.providerResponseHours} /></Field>
              <Field label="Terminerinnerung vorher"><Input name="appointmentReminderHours" type="number" min="1" max="168" defaultValue={settings.appointmentReminderHours} /></Field>
              <Toggle name="autopilotEnabled" label="Autopilot aktiv" checked={settings.autopilotEnabled} />
              <Toggle name="requireProviderOtpCompletion" label="Einmalcode beim Abschluss" checked={settings.requireProviderOtpCompletion} />
            </CardContent>
          </Card>
        </div>
        <div className="flex justify-end"><Button type="submit" size="lg" variant="accent"><Save className="h-5 w-5" aria-hidden="true" />Mandantenkonfiguration speichern</Button></div>
      </form>

      <Card>
        <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Send className="h-5 w-5 text-accent" aria-hidden="true" /><CardTitle>E-Mail-Versand</CardTitle></div><Badge variant={mail.configured ? "success" : "warning"}>{mail.configured ? "Verbunden" : "App-Passwort fehlt"}</Badge></div></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div><p className="font-bold text-primary">{mail.user || settings.senderEmail || "Keine SMTP-Adresse"}</p><p className="mt-1 text-sm text-slate-600">{mail.host}:{mail.port} · TLS · Absender {settings.senderEmail ?? "noch nicht festgelegt"}</p><p className="mt-2 text-xs text-slate-500">Zugangsdaten werden ausschließlich über die lokale Serverkonfiguration geladen und nicht in der Oberfläche angezeigt.</p></div>
          <form action={sendTestMailAction}><Button type="submit" variant="outline"><MailCheck className="h-4 w-4" aria-hidden="true" />Testmail senden</Button></form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" /><CardTitle>Autopilot-Regeln</CardTitle></div></CardHeader>
        <CardContent className="divide-y divide-slate-100">
          {rules.map((rule) => <div key={rule.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-primary">{rule.name}</p><p className="mt-1 text-sm text-slate-600">{rule.trigger} → {rule.action}</p></div><form action={toggleAutomationRuleAction}><input type="hidden" name="ruleId" value={rule.id} /><Button type="submit" variant="outline">{rule.enabled ? "Deaktivieren" : "Aktivieren"}<Badge variant={rule.enabled ? "success" : "default"}>{rule.enabled ? "Aktiv" : "Aus"}</Badge></Button></form></div>)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex items-center gap-2"><Cable className="h-5 w-5 text-accent" aria-hidden="true" /><CardTitle>E-Mail- und Rechnungseingänge</CardTitle></div></CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {connectors.map((connector) => <div key={connector.id} className="flex items-start justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 p-4"><div><div className="flex items-center gap-2"><MailCheck className="h-4 w-4 text-accent" aria-hidden="true" /><p className="font-bold text-primary">{connectorLabels[connector.type]}</p></div><p className="mt-1 text-sm text-slate-600">{connector.inboundAddress ?? "Externe Zugangsdaten noch nicht hinterlegt"}</p><p className="mt-1 text-xs text-slate-500">Letzter Test: {formatDateTime(connector.lastSyncAt)}</p></div><form action={testConnectorAction}><input type="hidden" name="connectorId" value={connector.id} /><Button type="submit" variant="outline">Testen</Button></form></div>)}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-semibold text-primary"><span>{label}</span>{children}</label>;
}

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return <label className="flex min-h-12 items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-primary"><input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4 accent-teal-600" />{label}</label>;
}
