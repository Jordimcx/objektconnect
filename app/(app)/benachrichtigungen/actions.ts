"use server";

import { revalidatePath } from "next/cache";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/ticket-service";
import { requireSessionUser } from "@/lib/session";

export async function markAllReadAction() {
  const user = await requireSessionUser();
  await markAllNotificationsRead(user);
  revalidatePath("/dashboard");
}

export async function markOneReadAction(formData: FormData) {
  const user = await requireSessionUser();
  await markNotificationRead(user, String(formData.get("notificationId") ?? ""));
  revalidatePath("/dashboard");
}
