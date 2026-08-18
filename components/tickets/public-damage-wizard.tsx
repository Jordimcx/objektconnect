"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Camera,
  Check,
  Contact,
  Send,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

type PublicReport = {
  reportingCode: string;
  reporterName: string;
  reporterEmail: string;
  reporterPhone: string;
  title: string;
  room: string;
  description: string;
  preferredWindowOne: string;
  preferredWindowTwo: string;
  preferredWindowThree: string;
};

const steps = [
  { label: "Objekt", icon: Building2 },
  { label: "Kontakt", icon: Contact },
  { label: "Schaden", icon: Camera },
  { label: "Zeiten", icon: CalendarClock },
  { label: "Prüfen", icon: ShieldCheck }
];

export function PublicDamageWizard({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [values, setValues] = useState<PublicReport>({
    reportingCode: initialCode,
    reporterName: "",
    reporterEmail: "",
    reporterPhone: "",
    title: "",
    room: "",
    description: "",
    preferredWindowOne: "Werktags 08:00-12:00",
    preferredWindowTwo: "",
    preferredWindowThree: ""
  });

  function update(field: keyof PublicReport, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setError(undefined);
  }

  function validateCurrentStep() {
    if (step === 0 && values.reportingCode.trim().length < 4) return "Bitte den Objektcode vom Aushang eingeben.";
    if (step === 1 && values.reporterName.trim().length < 2) return "Bitte Ihren Namen eingeben.";
    if (step === 1 && !values.reporterEmail.includes("@")) return "Bitte eine gültige E-Mail-Adresse eingeben.";
    if (step === 1 && values.reporterPhone.trim().length < 6) return "Bitte eine erreichbare Telefonnummer eingeben.";
    if (step === 2 && values.title.trim().length < 4) return "Bitte das Problem kurz benennen.";
    if (step === 2 && values.room.trim().length < 2) return "Bitte den betroffenen Ort angeben.";
    if (step === 2 && values.description.trim().length < 20) return "Bitte den Schaden etwas genauer beschreiben.";
    if (step === 3 && values.preferredWindowOne.trim().length < 3) return "Bitte mindestens ein erreichbares Zeitfenster angeben.";
    return null;
  }

  function next() {
    const message = validateCurrentStep();
    if (message) {
      setError(message);
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit() {
    setSubmitting(true);
    setError(undefined);
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (!key.startsWith("preferredWindow")) formData.set(key, value);
    });
    [values.preferredWindowOne, values.preferredWindowTwo, values.preferredWindowThree]
      .filter(Boolean)
      .forEach((windowValue) => formData.append("preferredWindows", windowValue));
    files.forEach((file) => formData.append("files", file));
    formData.set("source", initialCode ? "QR_CODE" : "PUBLIC_LINK");

    const response = await fetch("/api/public/tickets", { method: "POST", body: formData });
    const result = (await response.json()) as { token?: string; number?: string; error?: string; autoDispatched?: boolean };
    setSubmitting(false);
    if (!response.ok || !result.token) {
      setError(result.error ?? "Die Meldung konnte nicht gesendet werden.");
      return;
    }
    toast({
      title: "Meldung ist unterwegs",
      description: result.autoDispatched
        ? `${result.number} wurde geprüft und direkt an einen passenden Betrieb weitergeleitet.`
        : `${result.number} wurde geprüft und der Hausverwaltung zur Entscheidung vorgelegt.`,
      variant: "success"
    });
    router.push(`/vorgang/${result.token}?created=1`);
  }

  return (
    <Card className="overflow-hidden shadow-soft">
      <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50">
        {steps.map(({ label, icon: Icon }, index) => (
          <div key={label} className={`flex min-w-0 flex-col items-center gap-1 px-1 py-3 text-center text-xs font-semibold ${index <= step ? "text-accent" : "text-slate-400"}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="truncate sm:hidden">{index + 1}</span>
            <span className="hidden sm:block">{label}</span>
          </div>
        ))}
      </div>
      <CardContent className="p-5 sm:p-7">
        {step === 0 ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-primary">Schaden melden</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">Kein Konto und keine App nötig. Den Objektcode finden Sie am Aushang oder unter dem QR-Code.</p>
            </div>
            <Field label="Objektcode" value={values.reportingCode} onChange={(value) => update("reportingCode", value)} placeholder="Objektcode vom Aushang" autoFocus />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h2 className="text-xl font-bold text-primary">Wie erreichen wir Sie?</h2>
              <p className="mt-1 text-sm text-slate-600">Diese Angaben werden nur für diesen Vorgang genutzt.</p>
            </div>
            <Field label="Name" value={values.reporterName} onChange={(value) => update("reporterName", value)} placeholder="Vor- und Nachname" />
            <Field label="Telefon" value={values.reporterPhone} onChange={(value) => update("reporterPhone", value)} placeholder="Für die Terminabstimmung" type="tel" />
            <div className="sm:col-span-2">
              <Field label="E-Mail" value={values.reporterEmail} onChange={(value) => update("reporterEmail", value)} placeholder="name@beispiel.de" type="email" />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-primary">Was ist passiert?</h2>
              <p className="mt-1 text-sm text-slate-600">Das System erkennt Gewerk und Dringlichkeit aus Ihrer Beschreibung.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Problem" value={values.title} onChange={(value) => update("title", value)} placeholder="z. B. Wasser tropft aus der Decke" />
              <Field label="Ort" value={values.room} onChange={(value) => update("room", value)} placeholder="z. B. Bad oder Treppenhaus" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="public-description">Beschreibung</Label>
              <Textarea id="public-description" value={values.description} onChange={(event) => update("description", event.target.value)} placeholder="Was sehen oder hören Sie? Seit wann? Wird es schlimmer?" className="min-h-32" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="public-files">Fotos oder Dokumente</Label>
              <Input id="public-files" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
              <p className="text-xs text-slate-500">Bis 5 MB je Datei. Fotos beschleunigen die Prüfung.</p>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-primary">Wann sind Sie erreichbar?</h2>
              <p className="mt-1 text-sm text-slate-600">Der ausgewählte Betrieb bietet anschließend konkrete Termine zur direkten Auswahl an.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Zeitfenster 1" value={values.preferredWindowOne} onChange={(value) => update("preferredWindowOne", value)} />
              <Field label="Zeitfenster 2" value={values.preferredWindowTwo} onChange={(value) => update("preferredWindowTwo", value)} placeholder="Optional" />
              <Field label="Zeitfenster 3" value={values.preferredWindowThree} onChange={(value) => update("preferredWindowThree", value)} placeholder="Optional" />
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-4">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <div>
                <h2 className="font-bold text-primary">Automatische Prüfung nach dem Absenden</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">ObjektConnect prüft Dringlichkeit, Vollständigkeit, ähnliche Schäden und passende Betriebe. Routinefälle laufen direkt weiter; nur Ausnahmen brauchen eine Entscheidung.</p>
              </div>
            </div>
            <dl className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <Summary label="Objektcode" value={values.reportingCode} />
              <Summary label="Meldende Person" value={values.reporterName} />
              <Summary label="Problem" value={values.title} />
              <Summary label="Ort" value={values.room} />
              <Summary label="Erreichbarkeit" value={values.preferredWindowOne} />
              <Summary label="Anhänge" value={files.length ? `${files.length} Datei(en)` : "Keine"} />
            </dl>
          </div>
        ) : null}

        {error ? <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" disabled={step === 0 || submitting} onClick={() => { setError(undefined); setStep((current) => Math.max(0, current - 1)); }}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Zurück
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={next}>Weiter <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
          ) : (
            <Button type="button" variant="accent" disabled={submitting} onClick={submit}>
              {submitting ? <Check className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {submitting ? "Wird geprüft..." : "Meldung absenden"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; autoFocus?: boolean }) {
  const id = `public-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoFocus={autoFocus} /></div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-primary">{value}</dd></div>;
}
