import { NextRequest, NextResponse } from "next/server";

import { createPageSchema } from "@/lib/validation/page";
import { listPages, upsertPage } from "@/services/page-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const fileId = request.nextUrl.searchParams.get("fileId") ?? undefined;
    const pages = await listPages(fileId);

    return NextResponse.json({ ok: true, data: pages });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch pages",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createPageSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid page payload",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const page = await upsertPage(parsed.data);

    return NextResponse.json({ ok: true, data: page }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save page",
      },
      { status: 500 },
    );
  }
}
