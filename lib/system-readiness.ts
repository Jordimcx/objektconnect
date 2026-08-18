import { prisma } from "@/lib/prisma";

export type SystemReadiness = {
  ok: boolean;
  message?: string;
};

export async function checkSystemReadiness(): Promise<SystemReadiness> {
  try {
    const managerExists = await prisma.user.findFirst({
      where: { role: "HAUSVERWALTER" },
      select: { id: true }
    });

    if (!managerExists) {
      return {
        ok: false,
        message: "Es ist noch kein Verwaltungskonto eingerichtet."
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Die Datenbank ist derzeit nicht erreichbar. Bitte versuchen Sie es später erneut."
    };
  }
}
