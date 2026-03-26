import { NextRequest, NextResponse } from "next/server";

import { createAnnotationSchema } from "@/lib/validation/annotation";
import { createAnnotation, listAnnotations } from "@/services/annotation-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const pageId = request.nextUrl.searchParams.get("pageId") ?? undefined;
    const fileId = request.nextUrl.searchParams.get("fileId");

    const annotations = await listAnnotations({
      pageId,
      fileId: fileId ?? undefined,
    });

    return NextResponse.json({ ok: true, data: annotations });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to fetch annotations",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createAnnotationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid annotation payload",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const annotation = await createAnnotation(parsed.data);

    return NextResponse.json({ ok: true, data: annotation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create annotation",
      },
      { status: 500 },
    );
  }
}
