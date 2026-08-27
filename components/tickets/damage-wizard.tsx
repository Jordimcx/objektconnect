"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, ArrowRight, Check, ImagePlus, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

type Option = { value: string; label: string };

const steps = [
  "Problem",
  "Ort",
  "Dringlichkeit",
  "Beschreibung",
  "Terminfenster",
  "Zusammenfassung"
];

const wizardSchema = z.object({
  title: z.string().min(4, "Bitte das Problem kurz benennen."),
  category: z.string().min(1),
  room: z.string().min(2, "Bitte einen Raum angeben."),
  priority: z.string().min(1),
  description: z.string().min(20, "Bitte beschreiben Sie den Schaden genauer."),
  preferredWindowOne: z.string().min(3, "Bitte ein Terminfenster angeben."),
  preferredWindowTwo: z.string().optional(),
  preferredWindowThree: z.string().optional()
});

type WizardValues = z.infer<typeof wizardSchema>;

export function DamageWizard({ categories, priorities }: { categories: Option[]; priorities: Option[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors }
  } = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      category: "SONSTIGES",
      priority: "NORMAL",
      preferredWindowOne: "Werktags 08:00-12:00"
    }
  });

  const values = watch();
  const selectedCategory = categories.find((item) => item.value === values.category)?.label;
  const selectedPriority = priorities.find((item) => item.value === values.priority)?.label;

  const fieldsByStep = useMemo<Array<Array<keyof WizardValues>>>(
    () => [
      ["title", "category"],
      ["room"],
      ["priority"],
      ["description"],
      ["preferredWindowOne"],
      []
    ],
    []
  );

  async function nextStep() {
    const valid = await trigger(fieldsByStep[step]);
    if (valid) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function onSubmit(data: WizardValues) {
    setSubmitting(true);
    const formData = new FormData();
    formData.set("title", data.title);
    formData.set("category", data.category);
    formData.set("room", data.room);
    formData.set("priority", data.priority);
    formData.set("description", data.description);
    [data.preferredWindowOne, data.preferredWindowTwo, data.preferredWindowThree]
      .filter(Boolean)
      .forEach((windowValue) => formData.append("preferredWindows", windowValue as string));
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/tickets", {
      method: "POST",
      body: formData
    });
    const result = (await response.json()) as { ticketId?: string; number?: string; error?: string };
    setSubmitting(false);

    if (!response.ok || !result.ticketId) {
      toast({ title: "Meldung konnte nicht erstellt werden", description: result.error, variant: "error" });
      return;
    }

    toast({ title: "Schadensmeldung erstellt", description: `${result.number} wurde angelegt.`, variant: "success" });
    router.push(`/tickets/${result.ticketId}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schaden melden</CardTitle>
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Schritt {step + 1} von {steps.length}</span>
            <span className="text-accent">{steps[step]}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500 ease-fluid"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="mt-3 hidden gap-1 sm:grid sm:grid-cols-6">
            {steps.map((label, index) => {
              const done = index < step;
              const active = index === step;
              return (
                <div
                  key={label}
                  className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors duration-200 ${
                    done || active ? "text-primary" : "text-slate-400"
                  }`}
                >
                  <span
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] transition-colors duration-200 ${
                      done ? "bg-accent text-white" : active ? "border-2 border-accent bg-white text-accent" : "border border-slate-200 bg-white text-slate-400"
                    }`}
                    aria-hidden="true"
                  >
                    {done ? <Check className="h-2.5 w-2.5" /> : index + 1}
                  </span>
                  <span className="truncate">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div key={step}>
          {step === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Was ist das Problem?</Label>
                <Input id="title" {...register("title")} placeholder="z. B. Wasserfleck an der Decke" />
                <FieldError message={errors.title?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Kategorie</Label>
                <NativeSelect id="category" {...register("category")}>
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-2">
              <Label htmlFor="room">Wo befindet sich der Schaden?</Label>
              <Input id="room" {...register("room")} placeholder="z. B. Bad, Küche, Schlafzimmer" />
              <FieldError message={errors.room?.message} />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <Label htmlFor="priority">Wie dringend ist es?</Label>
              <NativeSelect id="priority" {...register("priority")}>
                {priorities.map((priority) => (
                  <option key={priority.value} value={priority.value}>
                    {priority.label}
                  </option>
                ))}
              </NativeSelect>
              <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <AlertCircle className="mt-0.5 h-5 w-5 text-accent" aria-hidden="true" />
                Notfälle erscheinen sofort rot im Dashboard und lösen eine simulierte Warnung aus.
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Beschreibung</Label>
                <Textarea id="description" {...register("description")} placeholder="Bitte beschreiben Sie, was passiert ist." />
                <FieldError message={errors.description?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="files">Bilder oder Dokumente</Label>
                <Input
                  id="files"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  multiple
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                />
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  Maximal 5 MB pro Datei, JPG, PNG, WebP oder PDF.
                </p>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="preferredWindowOne">Terminfenster 1</Label>
                <Input id="preferredWindowOne" {...register("preferredWindowOne")} />
                <FieldError message={errors.preferredWindowOne?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferredWindowTwo">Terminfenster 2</Label>
                <Input id="preferredWindowTwo" {...register("preferredWindowTwo")} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferredWindowThree">Terminfenster 3</Label>
                <Input id="preferredWindowThree" {...register("preferredWindowThree")} placeholder="Optional" />
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-lg font-bold text-primary">Zusammenfassung</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <SummaryItem label="Problem" value={values.title} />
                <SummaryItem label="Kategorie" value={selectedCategory} />
                <SummaryItem label="Raum" value={values.room} />
                <SummaryItem label="Dringlichkeit" value={selectedPriority} />
                <SummaryItem label="Terminfenster" value={values.preferredWindowOne} />
                <SummaryItem label="Dateien" value={files.length ? `${files.length} Datei(en)` : "Keine Dateien"} />
              </dl>
              <p className="mt-4 text-sm text-slate-600">{values.description}</p>
            </div>
          ) : null}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0 || submitting}
              onClick={() => setStep((current) => Math.max(current - 1, 0))}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Zurück
            </Button>
            {step < steps.length - 1 ? (
              <Button type="button" onClick={nextStep}>
                Weiter
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button type="submit" variant="accent" disabled={submitting}>
                {submitting ? <Check className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {submitting ? "Wird gesendet..." : "Meldung absenden"}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm font-semibold text-red-700">{message}</p>;
}

function SummaryItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-primary">{value || "Nicht angegeben"}</dd>
    </div>
  );
}
