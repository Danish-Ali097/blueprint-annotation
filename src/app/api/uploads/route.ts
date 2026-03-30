import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type PdfPageAsset = {
  pageNumber: number;
  width: number;
  height: number;
  path: string;
};

type ConversionJob = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  totalPages: number;
  convertedPages: number;
  pages: PdfPageAsset[];
  error: string | null;
  createdAt: number;
};

type ConverterEvent =
  | { type: "start"; totalPages: number }
  | { type: "page"; pageNumber: number; totalPages: number; width: number; height: number; fileName: string }
  | { type: "done"; totalPages: number };

const conversionJobs = new Map<string, ConversionJob>();

function startPdfConversionJob(jobId: string, inputPdfPath: string, outputDir: string) {
  const scriptPath = path.join(process.cwd(), "scripts", "convert-pdf.mjs");
  const child = spawn(process.execPath, [scriptPath, inputPdfPath, outputDir], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const outputFolder = path.basename(outputDir);
  const stderrChunks: string[] = [];

  const stdoutReader = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });
  stdoutReader.on("line", (line) => {
    if (!line.trim()) {
      return;
    }

    const job = conversionJobs.get(jobId);
    if (!job) {
      return;
    }

    try {
      const event = JSON.parse(line) as ConverterEvent;
      if (event.type === "start") {
        job.status = "running";
        job.totalPages = event.totalPages;
        return;
      }

      if (event.type === "page") {
        job.totalPages = event.totalPages;
        job.convertedPages = event.pageNumber;
        job.pages.push({
          pageNumber: event.pageNumber,
          width: event.width,
          height: event.height,
          path: `/uploads/${outputFolder}/${event.fileName}`,
        });
        return;
      }

      if (event.type === "done") {
        job.totalPages = event.totalPages;
        job.convertedPages = event.totalPages;
      }
    } catch {
      // Ignore malformed progress lines to keep conversion resilient.
    }
  });

  child.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk.toString());
  });

  child.on("close", (code) => {
    const job = conversionJobs.get(jobId);
    if (!job) {
      return;
    }

    if (code === 0) {
      job.status = "done";
      return;
    }

    job.status = "failed";
    job.error = stderrChunks.join("").trim() || "PDF conversion failed";
  });

  child.on("error", (error) => {
    const job = conversionJobs.get(jobId);
    if (!job) {
      return;
    }
    job.status = "failed";
    job.error = error.message;
  });
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "Missing jobId query parameter" }, { status: 400 });
  }

  const job = conversionJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Conversion job not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: job.id,
      status: job.status,
      totalPages: job.totalPages,
      convertedPages: job.convertedPages,
      pages: [...job.pages].sort((a, b) => a.pageNumber - b.pageNumber),
      error: job.error,
    },
  });
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
    const fileId = `${baseName}-${Date.now()}-${randomUUID()}`;
    const filename = `${fileId}${extension}`;
    const absolutePath = path.join(UPLOADS_DIR, filename);
    const relativePath = `/uploads/${filename}`;

    await mkdir(UPLOADS_DIR, { recursive: true });
    const bytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(bytes);
    await writeFile(absolutePath, fileBuffer);

    const isPdf = file.type === "application/pdf" || originalName.toLowerCase().endsWith(".pdf");
    let pages: PdfPageAsset[] | undefined;
    let conversionJobId: string | undefined;

    if (isPdf) {
      const pagesDir = path.join(UPLOADS_DIR, fileId);
      await mkdir(pagesDir, { recursive: true });
      conversionJobId = randomUUID();
      conversionJobs.set(conversionJobId, {
        id: conversionJobId,
        status: "queued",
        totalPages: 0,
        convertedPages: 0,
        pages: [],
        error: null,
        createdAt: Date.now(),
      });
      startPdfConversionJob(conversionJobId, absolutePath, pagesDir);
    }

    return NextResponse.json({
      ok: true,
      data: {
        name: file.name,
        path: relativePath,
        mimeType: file.type || "application/octet-stream",
        pages,
        conversionJobId,
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
