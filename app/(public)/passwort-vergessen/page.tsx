import Link from "next/link";
import { ObjektConnectLogo } from "@/components/app-shell/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-muted px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <ObjektConnectLogo />
          <CardTitle className="pt-6 text-2xl">Passwort vergessen</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
          <Button asChild variant="ghost" className="mt-3 w-full">
            <Link href="/login">Zurück zum Login</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
