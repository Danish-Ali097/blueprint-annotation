import { NextResponse } from "next/server";

import { updateAnnotationSchema } from "@/lib/validation/annotation-update";
import { deleteAnnotation, updateAnnotation } from "@/services/annotation-service";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Annotation id is required" }, { status: 400 });
  }

  try {
    await deleteAnnotation(id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to delete annotation",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Annotation id is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = updateAnnotationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid annotation update payload",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const annotation = await updateAnnotation(id, parsed.data);
    return NextResponse.json({ ok: true, data: annotation });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to update annotation",
      },
      { status: 500 },
    );
  }
}
