"use client";

import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export function ForgotPasswordForm() {
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        toast({
          title: "E-Mail-Versand simuliert",
          description: "Im MVP wurde kein externes E-Mail-System angebunden.",
          variant: "info"
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="email">E-Mail-Adresse</Label>
        <Input id="email" name="email" type="email" placeholder="name@example.de" required />
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        Der E-Mail-Versand ist im MVP vorbereitet und wird lokal simuliert.
      </div>
      <Button type="submit" className="w-full">
        <Mail className="h-4 w-4" aria-hidden="true" />
        Link vorbereiten
      </Button>
    </form>
  );
}
