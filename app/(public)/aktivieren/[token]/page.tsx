import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "@/lib/auth";
import { getTenantActivationPreview } from "@/lib/tenant-access";

export const dynamic = "force-dynamic";

export default async function ActivationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const activation = await getTenantActivationPreview(token);
  if (!activation) notFound();

  async function activate() {
    "use server";
    await signIn("magic-link", { token, redirectTo: "/dashboard" });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-5">
          <Link href="/"><ObjektConnectLogo /></Link>
          <div>
            <CardTitle>Mieterzugang aktivieren</CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {activation.organization.name} hat den sicheren Zugang für {activation.user.name} vorbereitet.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3 rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-slate-700">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            Der Link ist einmalig, läuft automatisch ab und ist nur Ihrem Mietverhältnis zugeordnet.
          </div>
          <form action={activate}>
            <Button type="submit" size="lg" variant="accent" className="w-full">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
              Zugang jetzt aktivieren
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
