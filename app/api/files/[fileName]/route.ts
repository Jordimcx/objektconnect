import { NextResponse } from "next/server";
import { readStoredFile } from "@/lib/uploads";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string }> }
) {
  try {
    const { fileName } = await params;
    const file = await readStoredFile(fileName);
    const body = new Uint8Array(file.bytes.byteLength);
    body.set(file.bytes);
    return new Response(body.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, max-age=3600"
      }
    });
  } catch {
    return NextResponse.json({ error: "Datei nicht gefunden." }, { status: 404 });
  }
}
