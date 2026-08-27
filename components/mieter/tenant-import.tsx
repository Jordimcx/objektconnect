"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { parseTenantCsv, type TenantImportResult, type TenantImportRow } from "@/lib/tenant-import";
import { importTenantsAction } from "@/app/(app)/mieter/actions";

const SAMPLE_CSV = `name,email,telefon,objekt,einheit,beginn
Max Muster,max@example.com,01712345678,Kastanienhof,1.1,2026-01-01
Anna Beispiel,anna@example.com,01523456789,Spreeblick Carré,2.3,2026-02-15
`;

type Stage = "idle" | "preview" | "importing" | "done";

export function TenantImport() {
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [fileName, setFileName] = React.useState<string>();
  const [rows, setRows] = React.useState<TenantImportRow[]>([]);
  const [parseErrors, setParseErrors] = React.useState<Array<{ row: number; reason: string }>>([]);
  const [result, setResult] = React.useState<TenantImportResult>();
  const [dragActive, setDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setStage("idle");
    setFileName(undefined);
    setRows([]);
    setParseErrors([]);
    setResult(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Nur CSV-Dateien werden unterstützt.", variant: "error" });
      return;
    }
    const text = await file.text();
    const { rows: parsed, errors } = parseTenantCsv(text);
    setFileName(file.name);
    setRows(parsed);
    setParseErrors(errors);
    setStage("preview");
  }

  async function runImport() {
    if (!rows.length) return;
    setStage("importing");
    try {
      const importResult = await importTenantsAction(rows);
      setResult(importResult);
      setStage("done");
      if (importResult.created > 0) {
        toast({
          title: `${importResult.created} Mieter angelegt`,
          description: importResult.skipped.length ? `${importResult.skipped.length} Zeilen übersprungen.` : undefined,
          variant: "success"
        });
      } else {
        toast({ title: "Keine Mieter angelegt", description: "Alle Zeilen wurden übersprungen.", variant: "error" });
      }
    } catch (error) {
      setStage("preview");
      toast({ title: "Import fehlgeschlagen", description: error instanceof Error ? error.message : undefined, variant: "error" });
    }
  }

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mieter-vorlage.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
        Mieter importieren
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-primary/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <p className="text-eyebrow text-xs font-bold uppercase text-accent">Bulk-Import</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-primary">Mieter aus CSV importieren</h2>
                <p className="mt-1 text-sm text-slate-600">Bestehende Mieterlisten aus Excel migrieren — sekundenschnell statt manuell.</p>
              </div>
              <button
                type="button"
                onClick={() => { setOpen(false); reset(); }}
                className="focus-ring rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-primary"
                aria-label="Schließen"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {stage === "idle" ? (
                <div className="space-y-4">
                  <label
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFile(file);
                    }}
                    className={`flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${dragActive ? "border-accent bg-accent-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"}`}
                  >
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-accent-100 text-accent-700">
                      <Upload className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-bold text-primary">CSV-Datei hier ablegen</p>
                      <p className="mt-1 text-sm text-slate-500">oder klicken, um eine Datei auszuwählen</p>
                    </div>
                    <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFile(file); }} />
                  </label>
                  <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                    <div>
                      <p className="text-sm font-bold text-primary">Kein passendes Format?</p>
                      <p className="mt-0.5 text-xs text-slate-500">Lade die Vorlage mit den erwarteten Spalten herunter.</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Vorlage
                    </Button>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    Erkannte Spalten: <span className="font-mono">name</span>, <span className="font-mono">email</span>, <span className="font-mono">telefon</span>, <span className="font-mono">objekt</span>, <span className="font-mono">einheit</span>, <span className="font-mono">beginn</span>. Deutsche und englische Varianten werden automatisch erkannt.
                  </p>
                </div>
              ) : null}

              {stage === "preview" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden="true" />
                      <span className="font-bold text-primary">{fileName}</span>
                      <span className="text-slate-500">· {rows.length} Zeilen erkannt</span>
                    </div>
                    <button type="button" onClick={reset} className="text-xs font-semibold text-accent hover:underline">
                      Andere Datei
                    </button>
                  </div>

                  {parseErrors.length ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                        {parseErrors.length} Zeile{parseErrors.length !== 1 ? "n" : ""} können nicht importiert werden
                      </p>
                      <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-amber-900">
                        {parseErrors.slice(0, 10).map((error, index) => (
                          <li key={`${error.row}-${index}`}>Zeile {error.row}: {error.reason}</li>
                        ))}
                        {parseErrors.length > 10 ? <li>… und {parseErrors.length - 10} weitere.</li> : null}
                      </ul>
                    </div>
                  ) : null}

                  {rows.length ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Name</th>
                            <th className="px-3 py-2 text-left font-semibold">E-Mail</th>
                            <th className="px-3 py-2 text-left font-semibold">Objekt</th>
                            <th className="px-3 py-2 text-left font-semibold">Einheit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 8).map((row, index) => (
                            <tr key={index} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-semibold text-primary">{row.name}</td>
                              <td className="px-3 py-2 text-slate-600">{row.email}</td>
                              <td className="px-3 py-2 text-slate-600">{row.propertyName}</td>
                              <td className="px-3 py-2 text-slate-600">{row.unitLabel}</td>
                            </tr>
                          ))}
                          {rows.length > 8 ? (
                            <tr className="border-t border-slate-100 bg-slate-50">
                              <td colSpan={4} className="px-3 py-2 text-center text-xs font-semibold text-slate-500">… und {rows.length - 8} weitere Zeilen</td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Keine importierbaren Zeilen gefunden.</p>
                  )}

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <Button type="button" variant="outline" onClick={reset}>Abbrechen</Button>
                    <Button type="button" variant="accent" disabled={!rows.length} onClick={runImport}>
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      {rows.length} Mieter importieren
                    </Button>
                  </div>
                </div>
              ) : null}

              {stage === "importing" ? (
                <div className="grid place-items-center gap-3 p-10">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden="true" />
                  <p className="font-bold text-primary">Import läuft …</p>
                  <p className="text-sm text-slate-500">{rows.length} Mieter werden angelegt und Objekten zugeordnet.</p>
                </div>
              ) : null}

              {stage === "done" && result ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                      <div className="flex items-center gap-2 text-emerald-800">
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                        <p className="text-xs font-bold uppercase tracking-wide">Erfolgreich</p>
                      </div>
                      <p className="mt-2 text-3xl font-bold text-emerald-900">{result.created}</p>
                      <p className="text-xs text-emerald-800">Mieter angelegt</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-slate-700">
                        <AlertCircle className="h-5 w-5" aria-hidden="true" />
                        <p className="text-xs font-bold uppercase tracking-wide">Übersprungen</p>
                      </div>
                      <p className="mt-2 text-3xl font-bold text-slate-900">{result.skipped.length}</p>
                      <p className="text-xs text-slate-600">Zeilen mit Konflikten</p>
                    </div>
                  </div>

                  {result.skipped.length ? (
                    <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-bold text-slate-500">Details:</p>
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {result.skipped.map((entry, index) => (
                          <li key={`${entry.row}-${index}`}>Zeile {entry.row}: {entry.reason}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <Button type="button" variant="outline" onClick={reset}>Weitere Datei</Button>
                    <Button type="button" variant="accent" onClick={() => { setOpen(false); reset(); }}>Fertig</Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
