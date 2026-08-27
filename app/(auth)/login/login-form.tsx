"use client";

import { useActionState, useState } from "react";
import { LogIn } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <AnimatePresence>
        {state.error ? (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
          >
            {state.error}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        <LogIn className="h-5 w-5" aria-hidden="true" />
        {pending ? "Anmeldung läuft..." : "Einloggen"}
      </Button>
    </form>
  );
}
