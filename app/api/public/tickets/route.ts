import { NextResponse } from "next/server";
import { createPublicTicket } from "@/lib/ticket-service";
import { storeUploads } from "@/lib/uploads";
import { publicTicketCreateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const input = {
      reportingCode: String(formData.get("reportingCode") ?? ""),
      reporterName: String(formData.get("reporterName") ?? ""),
      reporterEmail: String(formData.get("reporterEmail") ?? ""),
      reporterPhone: String(formData.get("reporterPhone") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      room: String(formData.get("room") ?? ""),
      preferredWindows: formData.getAll("preferredWindows").map(String).filter(Boolean)
    };
    const parsed = publicTicketCreateSchema.safeParse(input);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Die Angaben sind unvollständig." }, { status: 400 });
    }

    const files = formData.getAll("files").filter((file): file is File => file instanceof File);
    const uploads = await storeUploads(files);
    const result = await createPublicTicket({
      input: parsed.data,
      uploads,
      channel: String(formData.get("source")) === "QR_CODE" ? "QR_CODE" : "PUBLIC_LINK"
    });
    return NextResponse.json({
      token: result.publicToken,
      number: result.ticket.number,
      autoDispatched: result.automation.eligible
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Die Meldung konnte nicht angelegt werden." },
      { status: 400 }
    );
  }
}
