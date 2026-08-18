import Link from "next/link";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { Button } from "@/components/ui/button";

export default function ImpressumPage() {
  return (
    <main className="min-h-screen bg-muted px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <ObjektConnectLogo />
        <h1 className="mt-8 text-3xl font-bold text-primary">Impressum</h1>
        <p className="mt-4 text-slate-700">
          ObjektConnect SaaS-Anwendung. Verantwortliche Stelle, ladungsfähige Anschrift,
          Kontaktangaben und Registerdaten sind vor einem Produktivbetrieb einzutragen.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link href="/">Zur Startseite</Link>
        </Button>
      </div>
    </main>
  );
}
