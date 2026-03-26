import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file in form data" }, { status: 400 });
    }

    const originalName = sanitizeFilename(file.name || "upload.bin");
    const extension = path.extname(originalName) || ".bin";
    const baseName = path.basename(originalName, extension);
    const filename = `${baseName}-${Date.now()}-${randomUUID()}${extension}`;
    const absolutePath = path.join(UPLOADS_DIR, filename);
    const relativePath = `/uploads/${filename}`;

    await mkdir(UPLOADS_DIR, { recursive: true });
    const bytes = await file.arrayBuffer();
    await writeFile(absolutePath, Buffer.from(bytes));

    return NextResponse.json({
      ok: true,
      data: {
        name: file.name,
        path: relativePath,
        mimeType: file.type || "application/octet-stream",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save upload",
      },
      { status: 500 },
    );
  }
}
