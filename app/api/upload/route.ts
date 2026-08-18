import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/session";
import { storeUploads } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireSessionUser();
    const formData = await request.formData();
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);
    const uploads = await storeUploads(files);
    return NextResponse.json({ uploads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload konnte nicht gespeichert werden." },
      { status: 400 }
    );
  }
}
