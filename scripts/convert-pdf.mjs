import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCanvas } from "@napi-rs/canvas";

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

async function convertPdf() {
  const [inputPdfPath, outputDir] = process.argv.slice(2);
  if (!inputPdfPath || !outputDir) {
    throw new Error("Usage: node scripts/convert-pdf.mjs <input-pdf-path> <output-dir>");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfBytes = await readFile(inputPdfPath);
  const document = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes), disableWorker: true }).promise;
  emit({ type: "start", totalPages: document.numPages });

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    let extension = "webp";
    let imageBuffer;
    try {
      imageBuffer = canvas.toBuffer("image/webp");
    } catch {
      extension = "png";
      imageBuffer = canvas.toBuffer("image/png");
    }

    const fileName = `page-${String(pageNumber).padStart(4, "0")}.${extension}`;
    const pagePath = path.join(outputDir, fileName);
    await writeFile(pagePath, imageBuffer);

    emit({
      type: "page",
      pageNumber,
      totalPages: document.numPages,
      width,
      height,
      fileName,
    });
  }
  emit({ type: "done", totalPages: document.numPages });
}

convertPdf().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : "PDF conversion failed");
  process.exit(1);
});
