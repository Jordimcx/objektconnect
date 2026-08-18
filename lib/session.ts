import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/permissions";

export async function requireSessionUser(): Promise<SessionUser & { name: string; email: string }> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}
