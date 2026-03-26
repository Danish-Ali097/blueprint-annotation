import { NextRequest, NextResponse } from "next/server";

import { createFileSchema } from "@/lib/validation/file";
import { getOrCreateFile, listFiles } from "@/services/file-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const files = await listFiles();
    return NextResponse.json({ ok: true, data: files });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch files",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createFileSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid file payload",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const file = await getOrCreateFile(parsed.data);
    return NextResponse.json({ ok: true, data: file }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create file",
      },
      { status: 500 },
    );
  }
}
