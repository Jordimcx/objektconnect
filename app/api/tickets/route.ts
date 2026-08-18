import { NextResponse } from "next/server";
import { ticketCreateSchema } from "@/lib/validators";
import { createTicketForTenant, listTicketsForUser } from "@/lib/ticket-service";
import { storeUploads } from "@/lib/uploads";
import { requireSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  const { searchParams } = new URL(request.url);
  const tickets = await listTicketsForUser(user, {
    query: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") as never,
    sort: searchParams.get("sort") ?? undefined
  });
  return NextResponse.json({ tickets });
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const formData = await request.formData();
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);
    const input = {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      room: String(formData.get("room") ?? ""),
      category: String(formData.get("category") ?? ""),
      priority: String(formData.get("priority") ?? ""),
      preferredWindows: formData.getAll("preferredWindows").map(String).filter(Boolean)
    };

    const parsed = ticketCreateSchema.safeParse(input);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Die Angaben sind unvollständig." }, { status: 400 });
    }

    const uploads = await storeUploads(files);
    const ticket = await createTicketForTenant({ user, input: parsed.data, uploads });
    return NextResponse.json({ ticketId: ticket.id, number: ticket.number });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Das Ticket konnte nicht erstellt werden.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
