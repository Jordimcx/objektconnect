import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  Mail,
  Plus,
  Save,
  UserRound,
  Wrench
} from "lucide-react";
import { CopyLink } from "@/components/app-shell/copy-link";
import { NoticeToast } from "@/components/app-shell/notice-toast";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CATEGORY_LABELS, TICKET_CATEGORIES } from "@/lib/constants";
import { getOnboardingProgress, type OnboardingStepKey } from "@/lib/onboarding";
import { getOrganizationSettings } from "@/lib/organization-settings";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import {
  createPropertyAction,
  createProviderAction,
  createTenantAction,
  createUnitAction,
  updateMasterDataAction
} from "./actions";

const steps: Array<{ key: OnboardingStepKey; label: string; href: string }> = [
  { key: "organization", label: "Verwaltung", href: "#verwaltung" },
  { key: "inventory", label: "Bestand", href: "#bestand" },
  { key: "tenants", label: "Mieter", href: "#mieter" },
  { key: "providers", label: "Dienstleister", href: "#dienstleister" }
];

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ notice?: string; type?: "success" | "error"; activationLink?: string; tenant?: string }>;
}) {
  const user = await requireSessionUser();
  if (user.role !== "HAUSVERWALTER") redirect("/dashboard");
  const query = await searchParams;
  const [organization, settings, properties, tenantCount, providerCount] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } }),
    getOrganizationSettings(user.organizationId),
    prisma.property.findMany({
      where: { organizationId: user.organizationId },
      include: {
        buildings: {
          include: { units: { include: { leases: { where: { endsAt: null }, select: { id: true } } } } },
          orderBy: { name: "asc" }
        }
      },
      orderBy: { name: "asc" }
    }),
    prisma.user.count({ where: { organizationId: user.organizationId, role: "MIETER" } }),
    prisma.serviceProvider.count({ where: { organizationId: user.organizationId } })
  ]);
  const buildings = properties.flatMap((property) => property.buildings.map((building) => ({ ...building, property })));
  const units = buildings.flatMap((building) => building.units.map((unit) => ({ ...unit, building })));
  const availableUnits = units.filter((unit) => unit.leases.length === 0);
  const progress = getOnboardingProgress({
    organizationName: organization.name,
    senderName: settings.senderName,
    senderEmail: settings.senderEmail,
    propertyCount: properties.length,
    unitCount: units.length,
    tenantCount,
    providerCount
  });

  return (
    <div className="space-y-6">
      <NoticeToast message={query.notice} type={query.type} />
      <PageHeader
        eyebrow="Stammdaten-Onboarding"
        title="Verwaltung startklar machen"
        description="Verwaltung, Bestand, Mietverhältnisse und Partnerbetriebe bilden die Grundlage für den automatisierten Reparaturablauf."
        action={progress.isComplete ? <Button asChild variant="accent"><Link href="/dashboard">Zum Dashboard<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button> : undefined}
      />

      <section className="border-y border-slate-200 bg-white px-4 py-5 sm:px-6" aria-label="Einrichtungsfortschritt">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold text-slate-500">Fortschritt</p><p className="mt-1 text-2xl font-bold text-primary">{progress.completedCount} von {progress.totalCount} Bereichen bereit</p></div>
          <p className="text-sm font-bold text-accent">{progress.percent} Prozent</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} /></div>
        <nav className="mt-4 grid gap-2 sm:grid-cols-4" aria-label="Onboarding-Schritte">
          {steps.map((step, index) => <a key={step.key} href={step.href} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${progress.completed[step.key] ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${progress.completed[step.key] ? "bg-accent text-white" : "bg-white text-slate-500"}`}>{progress.completed[step.key] ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}</span>{step.label}</a>)}
        </nav>
      </section>

      <SetupSection id="verwaltung" number="1" icon={ClipboardCheck} title="Verwaltung" complete={progress.completed.organization} status="Absender und Mandant">
        <form action={updateMasterDataAction} className="grid gap-4 md:grid-cols-2">
          <Field label="Name der Verwaltung"><Input name="name" defaultValue={organization.name} required /></Field>
          <Field label="Absendername"><Input name="senderName" defaultValue={settings.senderName} required /></Field>
          <Field label="Absender-E-Mail"><Input name="senderEmail" type="email" defaultValue={settings.senderEmail ?? ""} placeholder="service@verwaltung.de" required /></Field>
          <Field label="Kurzer Absendertext"><Input name="claim" defaultValue={organization.claim} required /></Field>
          <div className="md:col-span-2 flex justify-end"><Button type="submit"><Save className="h-4 w-4" aria-hidden="true" />Verwaltungsdaten speichern</Button></div>
        </form>
      </SetupSection>

      <SetupSection id="bestand" number="2" icon={Building2} title="Objekte und Wohneinheiten" complete={progress.completed.inventory} status={`${properties.length} Objekte · ${units.length} Einheiten`}>
        <div className="grid gap-8 xl:grid-cols-2">
          <form action={createPropertyAction} className="grid content-start gap-4">
            <FormTitle title="Objekt anlegen" description="Das erste Gebäude wird automatisch mit angelegt." />
            <Field label="Objektbezeichnung"><Input name="name" placeholder="Wohnanlage Parkstraße" required /></Field>
            <Field label="Vollständige Adresse"><Input name="address" placeholder="Parkstraße 12, 10115 Berlin" required /></Field>
            <Field label="Gebäudebezeichnung"><Input name="buildingName" defaultValue="Hauptgebäude" required /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Ansprechpartner"><Input name="contactName" defaultValue={user.name} required /></Field><Field label="Kontakt-E-Mail"><Input name="contactEmail" type="email" defaultValue={user.email} required /></Field></div>
            <div className="flex justify-end"><Button type="submit"><Plus className="h-4 w-4" aria-hidden="true" />Objekt anlegen</Button></div>
          </form>

          <form action={createUnitAction} className="grid content-start gap-4 border-t border-slate-200 pt-6 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
            <FormTitle title="Wohneinheit ergänzen" description={buildings.length ? "Weitere Einheiten lassen sich direkt nacheinander erfassen." : "Lege zuerst ein Objekt an."} />
            <fieldset disabled={!buildings.length} className="grid gap-4 disabled:opacity-50">
              <Field label="Gebäude"><NativeSelect name="buildingId" required defaultValue=""><option value="" disabled>Gebäude auswählen</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.property.name} · {building.name}</option>)}</NativeSelect></Field>
              <Field label="Bezeichnung"><Input name="label" placeholder="Wohnung 3 links" required /></Field>
              <div className="grid gap-4 sm:grid-cols-3"><Field label="Etage"><Input name="floor" placeholder="2. OG" required /></Field><Field label="Zimmer"><Input name="rooms" type="number" min="1" max="30" defaultValue="2" required /></Field><Field label="Wohnfläche m²"><Input name="squareMeter" type="number" min="1" max="10000" placeholder="72" required /></Field></div>
              <div className="flex justify-end"><Button type="submit"><Plus className="h-4 w-4" aria-hidden="true" />Einheit anlegen</Button></div>
            </fieldset>
          </form>
        </div>
        {properties.length ? <div className="mt-7 divide-y divide-slate-100 border-y border-slate-200">{properties.map((property) => {
          const propertyUnits = property.buildings.flatMap((building) => building.units);
          return <div key={property.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-bold text-primary">{property.name}</p><p className="mt-1 text-sm text-slate-500">{property.address}</p></div><p className="text-sm font-semibold text-slate-600">{property.buildings.length} Gebäude · {propertyUnits.length} Einheiten</p></div>;
        })}</div> : null}
      </SetupSection>

      <SetupSection id="mieter" number="3" icon={UserRound} title="Mieter und Mietverhältnis" complete={progress.completed.tenants} status={`${tenantCount} Mieter · ${availableUnits.length} freie Einheiten`}>
        {query.activationLink ? <div className="mb-6 border-l-4 border-accent bg-teal-50 p-4"><div className="flex items-start gap-3"><Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="font-bold text-primary">Aktivierungslink für {query.tenant ?? "Mieter"}</p><p className="mt-1 text-sm text-slate-600">Der Link ist einmalig und 48 Stunden gültig.</p><div className="mt-3"><CopyLink value={query.activationLink} label="Aktivierungslink kopieren" /></div></div></div></div> : null}
        <form action={createTenantAction}>
          <fieldset disabled={!availableUnits.length} className="grid gap-4 disabled:opacity-50 md:grid-cols-2">
            <Field label="Name"><Input name="name" placeholder="Vorname Nachname" required /></Field>
            <Field label="E-Mail"><Input name="email" type="email" placeholder="mieter@beispiel.de" required /></Field>
            <Field label="Telefon"><Input name="phone" type="tel" placeholder="+49 170 1234567" required /></Field>
            <Field label="Freie Wohneinheit"><NativeSelect name="unitId" required defaultValue=""><option value="" disabled>Wohneinheit auswählen</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.building.property.name} · {unit.building.name} · {unit.label}</option>)}</NativeSelect></Field>
            <Field label="Mietbeginn"><Input name="startsAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
            <div className="flex items-end justify-end"><Button type="submit"><KeyRound className="h-4 w-4" aria-hidden="true" />Mieter anlegen und Zugang erzeugen</Button></div>
          </fieldset>
        </form>
        {!availableUnits.length ? <p className="mt-4 text-sm font-semibold text-orange-700">Für einen neuen Mieter wird zuerst eine freie Wohneinheit benötigt.</p> : null}
      </SetupSection>

      <SetupSection id="dienstleister" number="4" icon={Wrench} title="Dienstleister" complete={progress.completed.providers} status={`${providerCount} Partnerbetriebe`}>
        <form action={createProviderAction} className="grid gap-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Firmenname"><Input name="companyName" placeholder="Muster Haustechnik GmbH" required /></Field>
            <Field label="Ansprechpartner"><Input name="contactName" placeholder="Vorname Nachname" required /></Field>
            <Field label="E-Mail"><Input name="email" type="email" placeholder="disposition@betrieb.de" required /></Field>
            <Field label="Telefon"><Input name="phone" type="tel" placeholder="+49 30 123456" required /></Field>
            <Field label="Geschäftsadresse"><Input name="address" placeholder="Handwerkerweg 5, 10115 Berlin" required /></Field>
            <Field label="Einsatzgebiet"><Input name="serviceArea" placeholder="Berlin, 30 km Umkreis" required /></Field>
            <Field label="Erreichbarkeit"><Input name="availability" defaultValue="Mo-Fr 08:00-17:00" required /></Field>
          </div>
          <fieldset><legend className="text-sm font-semibold text-primary">Gewerke</legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{TICKET_CATEGORIES.map((category) => <Checkbox key={category} name="categories" value={category} label={CATEGORY_LABELS[category]} />)}</div></fieldset>
          {properties.length ? <fieldset><legend className="text-sm font-semibold text-primary">Zuständige Objekte <span className="font-normal text-slate-500">(optional)</span></legend><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{properties.map((property) => <Checkbox key={property.id} name="propertyIds" value={property.id} label={property.name} />)}</div></fieldset> : null}
          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">Ohne Benutzerkonto: Aufträge und Terminvorschläge laufen über sichere Links per E-Mail.</p><Button type="submit"><Plus className="h-4 w-4" aria-hidden="true" />Dienstleister anlegen</Button></div>
        </form>
      </SetupSection>

      {progress.isComplete ? <div className="flex flex-col gap-4 border border-teal-200 bg-teal-50 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-accent" aria-hidden="true" /><div><p className="font-bold text-primary">Grundkonfiguration vollständig</p><p className="mt-1 text-sm text-slate-600">Weitere Datensätze können jederzeit hier ergänzt werden.</p></div></div><Button asChild variant="accent"><Link href="/dashboard">Automatisierung öffnen<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></Button></div> : null}
    </div>
  );
}

function SetupSection({ id, number, icon: Icon, title, complete, status, children }: { id: string; number: string; icon: typeof Building2; title: string; complete: boolean; status: string; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 border border-slate-200 bg-white"><header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${complete ? "bg-accent text-white" : "bg-primary text-white"}`}>{complete ? <Check className="h-5 w-5" aria-hidden="true" /> : <Icon className="h-5 w-5" aria-hidden="true" />}</span><div><p className="text-xs font-semibold uppercase text-slate-500">Schritt {number}</p><h2 className="text-lg font-bold text-primary">{title}</h2></div></div><div className="flex items-center gap-2 text-sm"><span className={`h-2.5 w-2.5 rounded-full ${complete ? "bg-accent" : "bg-slate-300"}`} /><span className="font-semibold text-slate-600">{status}</span></div></header><div className="p-4 sm:p-6">{children}</div></section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid content-start gap-2 text-sm font-semibold text-primary"><span>{label}</span>{children}</label>;
}

function FormTitle({ title, description }: { title: string; description: string }) {
  return <div><h3 className="font-bold text-primary">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div>;
}

function Checkbox({ name, value, label }: { name: string; value: string; label: string }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-primary has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50"><input type="checkbox" name={name} value={value} className="h-4 w-4 accent-teal-600" />{label}</label>;
}
