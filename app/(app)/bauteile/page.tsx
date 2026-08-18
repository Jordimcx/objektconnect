import Link from "next/link";
import { AlertTriangle, CircuitBoard, Plus, ShieldCheck, TrendingUp } from "lucide-react";
import { NoticeToast } from "@/components/app-shell/notice-toast";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { createAssetAction } from "./actions";

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ notice?: string; type?: "success" | "error" }> }) {
  const user = await requireSessionUser();
  const query = await searchParams;
  if (user.role !== "HAUSVERWALTER") throw new Error("Diese Seite ist der Hausverwaltung vorbehalten.");
  const [assets, properties, units] = await Promise.all([
    prisma.asset.findMany({
      where: { organizationId: user.organizationId },
      include: {
        property: true,
        unit: true,
        tickets: { select: { id: true, number: true, title: true, status: true, createdAt: true, finalCost: true }, orderBy: { createdAt: "desc" } }
      },
      orderBy: [{ property: { name: "asc" } }, { name: "asc" }]
    }),
    prisma.property.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { building: { property: { organizationId: user.organizationId } } }, include: { building: { include: { property: true } } }, orderBy: { label: "asc" } })
  ]);

  return (
    <div className="space-y-6">
      <NoticeToast message={query.notice} type={query.type} />
      <PageHeader eyebrow="Objektgedächtnis" title="Bauteilakte" description="Hersteller, Alter, Wartung, Garantie, Reparaturverlauf und Kosten werden pro Bauteil zusammengeführt." />
      <Card>
        <CardHeader><CardTitle>Bauteil aufnehmen</CardTitle></CardHeader>
        <CardContent>
          <form action={createAssetAction} className="grid gap-4 lg:grid-cols-4">
            <Field label="Objekt"><NativeSelect name="propertyId" required><option value="">Objekt wählen</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</NativeSelect></Field>
            <Field label="Einheit optional"><NativeSelect name="unitId"><option value="">Allgemeines Bauteil</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.building.property.name} · {unit.label}</option>)}</NativeSelect></Field>
            <Field label="Bezeichnung"><Input name="name" placeholder="z. B. Heiztherme Wohnung 3" required /></Field>
            <Field label="Kategorie"><Input name="category" placeholder="Heizung, Aufzug, Dach ..." required /></Field>
            <Field label="Hersteller"><Input name="manufacturer" /></Field><Field label="Modell"><Input name="model" /></Field><Field label="Seriennummer"><Input name="serialNumber" /></Field>
            <Field label="Einbaudatum"><Input name="installedAt" type="date" /></Field><Field label="Garantie bis"><Input name="warrantyUntil" type="date" /></Field><Field label="Austauschschwelle in EUR"><Input name="replacementThreshold" type="number" min="0" step="10" /></Field>
            <div className="lg:col-span-3"><Label htmlFor="asset-notes">Notizen</Label><Textarea id="asset-notes" name="notes" placeholder="Wartungsintervall, Besonderheiten, Standort" /></div>
            <div className="flex items-end"><Button type="submit" variant="accent" className="w-full"><Plus className="h-4 w-4" aria-hidden="true" />Bauteil anlegen</Button></div>
          </form>
        </CardContent>
      </Card>

      {assets.length ? <div className="grid gap-5 lg:grid-cols-2">{assets.map((asset) => {
        const totalCost = asset.tickets.reduce((sum, ticket) => sum + Number(ticket.finalCost ?? 0), 0);
        const threshold = asset.replacementThreshold ? Number(asset.replacementThreshold) : null;
        const replacementRecommended = threshold != null && totalCost >= threshold;
        const warrantyActive = Boolean(asset.warrantyUntil && asset.warrantyUntil > new Date());
        return <Card key={asset.id} className={replacementRecommended ? "border-orange-200" : undefined}><CardHeader><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><CircuitBoard className="h-6 w-6 text-accent" aria-hidden="true" /><div><CardTitle>{asset.name}</CardTitle><p className="mt-1 text-sm text-slate-500">{asset.property.name}{asset.unit ? ` · ${asset.unit.label}` : ""}</p></div></div>{warrantyActive ? <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">Garantie aktiv</span> : null}</div></CardHeader><CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3"><Value label="Hersteller" value={[asset.manufacturer, asset.model].filter(Boolean).join(" ") || "-"} /><Value label="Einbau" value={formatDate(asset.installedAt)} /><Value label="Garantie" value={formatDate(asset.warrantyUntil)} /><Value label="Reparaturen" value={String(asset.tickets.length)} /><Value label="Reparaturkosten" value={`${totalCost.toFixed(2)} EUR`} /><Value label="Austauschschwelle" value={threshold == null ? "Nicht gesetzt" : `${threshold.toFixed(2)} EUR`} /></dl>
          {replacementRecommended ? <div className="flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm"><TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" aria-hidden="true" /><div><p className="font-bold text-primary">Austausch wirtschaftlich prüfen</p><p className="mt-1 text-slate-600">Die dokumentierten Reparaturkosten haben die konfigurierte Austauschschwelle erreicht.</p></div></div> : null}
          {asset.tickets.length ? <div className="space-y-2 border-t border-slate-100 pt-4">{asset.tickets.slice(0, 4).map((ticket) => <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm"><span className="font-bold text-primary">{ticket.number} · {ticket.title}</span><span className="text-slate-500">{ticket.finalCost ? `${Number(ticket.finalCost).toFixed(2)} EUR` : "offen"}</span></Link>)}</div> : <p className="text-sm text-slate-600">Noch kein Vorgang diesem Bauteil zugeordnet.</p>}
        </CardContent></Card>;
      })}</div> : <div className="rounded-md border border-slate-200 bg-white p-10 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-3 font-bold text-primary">Noch keine Bauteile erfasst</p><p className="mt-1 text-sm text-slate-600">Beginnen Sie mit wiederkehrend reparierten Anlagen oder kostenintensiven Bauteilen.</p></div>}

      <div className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-slate-700"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />Gewährleistungs- und Austauschhinweise beruhen ausschließlich auf Garantiezeit, verknüpften Vorgängen und dokumentierten Kosten.</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-2 text-sm font-semibold text-primary"><span>{label}</span>{children}</label>; }
function Value({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 font-bold text-primary">{value}</dd></div>; }
