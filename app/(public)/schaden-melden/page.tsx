import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { PublicDamageWizard } from "@/components/tickets/public-damage-wizard";

export default async function PublicDamageReportPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <main className="min-h-screen bg-muted">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/"><ObjektConnectLogo /></Link>
          <Link href="/login" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary"><LockKeyhole className="h-4 w-4" aria-hidden="true" /> Interner Login</Link>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <PublicDamageWizard initialCode={code ?? ""} />
        <p className="mt-4 text-center text-xs leading-5 text-slate-500">Ihre Angaben werden ausschließlich zur Bearbeitung dieses Vorgangs verwendet. Bei akuter Gefahr wählen Sie bitte 112 beziehungsweise den örtlichen Notdienst.</p>
      </section>
    </main>
  );
}
