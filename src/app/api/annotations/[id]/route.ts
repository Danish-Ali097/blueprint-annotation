import { NextResponse } from "next/server";

import { deleteAnnotation } from "@/services/annotation-service";

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
