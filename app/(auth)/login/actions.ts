"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { checkSystemReadiness } from "@/lib/system-readiness";

export type LoginState = {
  error?: string;
};

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const readiness = await checkSystemReadiness();
  if (!readiness.ok) {
    return {
      error: readiness.message
    };
  }

  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard"
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          error.type === "CallbackRouteError"
            ? "Die Anmeldung konnte nicht abgeschlossen werden. Bitte prüfen Sie Ihre Zugangsdaten."
            : "Die Zugangsdaten konnten nicht gefunden werden. Bitte prüfen Sie E-Mail und Passwort."
      };
    }
    throw error;
  }

  return {};
}
