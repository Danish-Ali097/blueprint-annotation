"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Line, Stage } from "react-konva";
import type Konva from "konva";
import { Loader2, MousePointer2, Trash2, Upload } from "lucide-react";

import { AnnotationShape } from "@/components/canvas/annotation-shape";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createAnnotation,
  createFile,
  deleteAnnotation,
  listAnnotations,
  listPages,
  renameAnnotation,
  upsertPage,
} from "@/lib/api";
import { useCanvasStore } from "@/stores/canvas-store";
import type { BlueprintPage, Point } from "@/types/canvas";

const STAGE_WIDTH = 1120;
const STAGE_HEIGHT = 680;
const EMPTY_ANNOTATION_IDS: string[] = [];
const PDF_WORKER_CDN = "https://unpkg.com/pdfjs-dist@5.5.207/legacy/build/pdf.worker.min.mjs";

type UploadedPage = {
  pageNumber: number;
  width: number;
  height: number;
  src: string;
};

type UploadedPdfPageMetadata = {
  pageNumber: number;
  width: number;
  height: number;
};

type UploadedPdfMetadata = {
  pdfData: ArrayBuffer;
  pages: UploadedPdfPageMetadata[];
};

function getPolylineLength(points: Point[]) {
  if (points.length < 2) {
    return 0;
  }

  return points.slice(1).reduce((length, point, index) => {
    const previous = points[index];
    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function toWorldPoint(stage: Konva.Stage, scale: number, x: number, y: number) {
  const pointer = stage.getPointerPosition();
  if (!pointer) {
    return null;
  }

  return {
    x: (pointer.x - x) / scale,
    y: (pointer.y - y) / scale,
  };
}

async function extractImagePage(file: File): Promise<UploadedPage> {
  const imageUrl = URL.createObjectURL(file);
  const image = new window.Image();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = imageUrl;
  });

  return {
    pageNumber: 1,
    width: image.width,
    height: image.height,
    src: imageUrl,
  };
}

async function extractPdfMetadata(file: File): Promise<UploadedPdfMetadata> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_CDN;

  const rawPdfData = await file.arrayBuffer();
  const metadataPdfData = rawPdfData.slice(0);
  const cachedPdfData = rawPdfData.slice(0);
  const pdf = await pdfjs.getDocument({ data: metadataPdfData }).promise;
  const pages: UploadedPdfPageMetadata[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });

    pages.push({
      pageNumber,
      width: Math.floor(viewport.width),
      height: Math.floor(viewport.height),
    });
  }

  return { pdfData: cachedPdfData, pages };
}

async function renderPdfPageToImage(pdfData: ArrayBuffer, pageNumber: number): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_CDN;

  // pdf.js can transfer ownership of ArrayBuffer internals; use a fresh copy per render.
  const renderData = pdfData.slice(0);
  const pdf = await pdfjs.getDocument({ data: renderData }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to initialize canvas context for PDF page rendering");
  }

  await page.render({ canvas, canvasContext: context, viewport, intent: "display" }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Failed to serialize rendered PDF page to image"));
        return;
      }
      resolve(result);
    }, "image/png");
  });

  return URL.createObjectURL(blob);
}

export default function Home() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const imageSrcByPageRef = useRef<Record<string, string>>({});
  const pdfDataByFileIdRef = useRef<Record<string, ArrayBuffer>>({});
  const renderingPageImageRef = useRef<Set<string>>(new Set());
  const failedPageImageRef = useRef<Set<string>>(new Set());
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [imageSrcByPage, setImageSrcByPage] = useState<Record<string, string>>({});
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfDataByFileId, setPdfDataByFileId] = useState<Record<string, ArrayBuffer>>({});
  const [isRenderingPageImageById, setIsRenderingPageImageById] = useState<Record<string, boolean>>({});

  const pages = useCanvasStore((state) => state.pages);
  const activePageId = useCanvasStore((state) => state.activePageId);
  const selectedAnnotationId = useCanvasStore((state) => state.selectedAnnotationId);
  const transform = useCanvasStore((state) => state.transform);
  const activePageAnnotationIds = useCanvasStore((state) => {
    if (!activePageId) {
      return EMPTY_ANNOTATION_IDS;
    }

    return state.annotationIdsByPage[activePageId] ?? EMPTY_ANNOTATION_IDS;
  });
  const annotationsById = useCanvasStore((state) => state.annotationsById);

  const setPages = useCanvasStore((state) => state.setPages);
  const setActivePageId = useCanvasStore((state) => state.setActivePageId);
  const setSelectedAnnotationId = useCanvasStore((state) => state.setSelectedAnnotationId);
  const setTransform = useCanvasStore((state) => state.setTransform);
  const setAnnotationsForPage = useCanvasStore((state) => state.setAnnotationsForPage);
  const upsertAnnotationInStore = useCanvasStore((state) => state.upsertAnnotation);
  const removeAnnotationInStore = useCanvasStore((state) => state.removeAnnotation);
  const renameAnnotationInStore = useCanvasStore((state) => state.renameAnnotation);

  const activePage = useMemo(
    () => pages.find((page) => page.id === activePageId) ?? null,
    [pages, activePageId],
  );

  const isRenderingActivePageImage = activePageId
    ? Boolean(isRenderingPageImageById[activePageId])
    : false;

  const fitStageToPage = useCallback(
    (pageWidth: number, pageHeight: number) => {
      const scale = Math.min(STAGE_WIDTH / pageWidth, STAGE_HEIGHT / pageHeight, 1);
      const x = (STAGE_WIDTH - pageWidth * scale) / 2;
      const y = (STAGE_HEIGHT - pageHeight * scale) / 2;
      setTransform({ x, y, scale });
    },
    [setTransform],
  );

  const loadPageAnnotations = useCallback(
    async (pageId: string) => {
      setIsLoadingAnnotations(true);
      try {
        const annotations = await listAnnotations(pageId);
        setAnnotationsForPage(pageId, annotations);
      } finally {
        setIsLoadingAnnotations(false);
      }
    },
    [setAnnotationsForPage],
  );

  const ensurePageImage = useCallback(
    async (page: BlueprintPage, fileId: string) => {
      if (imageSrcByPageRef.current[page.id]) {
        return;
      }

      if (failedPageImageRef.current.has(page.id) || renderingPageImageRef.current.has(page.id)) {
        return;
      }

      const pdfData = pdfDataByFileIdRef.current[fileId];
      if (!pdfData) {
        return;
      }

      renderingPageImageRef.current.add(page.id);
      setIsRenderingPageImageById((state) => ({ ...state, [page.id]: true }));
      try {
        const imageSrc = await renderPdfPageToImage(pdfData, page.pageNumber);
        setImageSrcByPage((state) => {
          if (state[page.id]) {
            URL.revokeObjectURL(imageSrc);
            return state;
          }

          return { ...state, [page.id]: imageSrc };
        });
      } catch (error) {
        failedPageImageRef.current.add(page.id);
        setUploadError(error instanceof Error ? error.message : "Failed to render PDF page");
      } finally {
        renderingPageImageRef.current.delete(page.id);
        setIsRenderingPageImageById((state) => ({ ...state, [page.id]: false }));
      }
    },
    [],
  );

  useEffect(() => {
    imageSrcByPageRef.current = imageSrcByPage;
  }, [imageSrcByPage]);

  useEffect(() => {
    pdfDataByFileIdRef.current = pdfDataByFileId;
  }, [pdfDataByFileId]);

  useEffect(() => {
    if (!activePageId) {
      setImageElement(null);
      return;
    }

    const src = imageSrcByPage[activePageId];
    if (!src) {
      setImageElement(null);
      return;
    }

    const image = new window.Image();
    image.onload = () => setImageElement(image);
    image.src = src;

    return () => {
      image.onload = null;
    };
  }, [activePageId, imageSrcByPage]);

  useEffect(() => {
    if (!activePageId) {
      return;
    }

    void loadPageAnnotations(activePageId);
  }, [activePageId, loadPageAnnotations]);

  useEffect(() => {
    if (!activePage || !activeFileId) {
      return;
    }

    if (!imageSrcByPage[activePage.id]) {
      void ensurePageImage(activePage, activeFileId);
    }
  }, [activeFileId, activePage, ensurePageImage, imageSrcByPage]);

  async function onUploadBlueprint(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadError(null);
    failedPageImageRef.current.clear();
    renderingPageImageRef.current.clear();
    setIsSaving(true);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const uploadedPages = isPdf ? [] : [await extractImagePage(file)];
      const pdfMetadata = isPdf ? await extractPdfMetadata(file) : null;
      const pageDefinitions = pdfMetadata
        ? pdfMetadata.pages
        : uploadedPages.map((uploadedPage) => ({
            pageNumber: uploadedPage.pageNumber,
            width: uploadedPage.width,
            height: uploadedPage.height,
          }));

      const savedFile = await createFile({
        name: file.name,
        path: `local://${file.name}-${Date.now()}`,
      });
      setActiveFileId(savedFile.id);

      for (const pageDefinition of pageDefinitions) {
        await upsertPage({
          fileId: savedFile.id,
          pageNumber: pageDefinition.pageNumber,
          width: pageDefinition.width,
          height: pageDefinition.height,
          previewPath: `local-preview://${file.name}-page-${pageDefinition.pageNumber}`,
        });
      }

      const dbPages = await listPages(savedFile.id);
      const firstPage = dbPages[0] ?? null;
      const uploadedSrcByPageNumber = Object.fromEntries(
        uploadedPages.map((uploadedPage) => [uploadedPage.pageNumber, uploadedPage.src]),
      );

      setPages(dbPages);
      setActivePageId(firstPage?.id ?? null);
      if (pdfMetadata) {
        setPdfDataByFileId((state) => ({ ...state, [savedFile.id]: pdfMetadata.pdfData }));
      }
      setImageSrcByPage((state) => ({
        ...state,
        ...Object.fromEntries(
          dbPages
            .filter((page) => Boolean(uploadedSrcByPageNumber[page.pageNumber]))
            .map((page) => [page.id, uploadedSrcByPageNumber[page.pageNumber]]),
        ),
      }));
      if (pdfMetadata && firstPage) {
        const firstPageImage = await renderPdfPageToImage(pdfMetadata.pdfData, firstPage.pageNumber);
        setImageSrcByPage((state) => ({ ...state, [firstPage.id]: firstPageImage }));
      }
      if (firstPage) {
        fitStageToPage(firstPage.width, firstPage.height);
      } else {
        setTransform({ x: 0, y: 0, scale: 1 });
      }
      setDraftPoints([]);
      setIsDrawing(false);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to process uploaded file");
    } finally {
      setIsSaving(false);
    }
  }

  function handleStageWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const oldScale = transform.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const scaleBy = 1.05;
    const nextScale = event.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const boundedScale = Math.min(6, Math.max(0.2, nextScale));

    const mousePointTo = {
      x: (pointer.x - transform.x) / oldScale,
      y: (pointer.y - transform.y) / oldScale,
    };

    setTransform({
      scale: boundedScale,
      x: pointer.x - mousePointTo.x * boundedScale,
      y: pointer.y - mousePointTo.y * boundedScale,
    });
  }

  function handleStageMouseDown(event: Konva.KonvaEventObject<MouseEvent>) {
    if (!isDrawing || !activePageId) {
      return;
    }

    const stage = event.target.getStage();
    if (!stage) {
      return;
    }

    if (event.target !== stage) {
      return;
    }

    const worldPoint = toWorldPoint(stage, transform.scale, transform.x, transform.y);
    if (!worldPoint) {
      return;
    }

    setDraftPoints((points) => [...points, worldPoint]);
  }

  const finishDraft = useCallback(async () => {
    if (!activePageId || draftPoints.length < 2) {
      setDraftPoints([]);
      return;
    }

    const measurement = getPolylineLength(draftPoints);
    const annotation = await createAnnotation({
      pageId: activePageId,
      name: `Line ${activePageAnnotationIds.length + 1}`,
      toolType: "polyline",
      points: draftPoints,
      measurement,
      unit: "px",
    });

    upsertAnnotationInStore(annotation);
    setDraftPoints([]);
    setIsDrawing(false);
  }, [activePageAnnotationIds.length, activePageId, draftPoints, upsertAnnotationInStore]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || !isDrawing) {
        return;
      }
      event.preventDefault();
      void finishDraft();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [finishDraft, isDrawing]);

  async function handleDeleteSelected() {
    if (!selectedAnnotationId || !activePageId) {
      return;
    }

    await deleteAnnotation(selectedAnnotationId);
    removeAnnotationInStore(selectedAnnotationId, activePageId);
  }

  async function handleRename(annotationId: string, nextName: string) {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      return;
    }

    renameAnnotationInStore(annotationId, trimmedName);
    await renameAnnotation(annotationId, trimmedName);
  }

  const draftFlatPoints = draftPoints.flatMap((point) => [point.x, point.y]);

  return (
    <main className="flex min-h-screen w-full gap-4 bg-zinc-50 p-4">
      <Card className="w-[320px] shrink-0">
        <CardHeader>
          <CardTitle>Blueprint Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Upload blueprint (image or PDF)
            <Input
              type="file"
              accept="image/png,image/jpeg,image/jpg,application/pdf,.pdf"
              onChange={onUploadBlueprint}
            />
          </label>
          {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={isDrawing ? "secondary" : "default"}
              size="sm"
              onClick={() => {
                setIsDrawing((value) => !value);
                if (isDrawing) {
                  setDraftPoints([]);
                }
              }}
              disabled={!activePageId}
            >
              <MousePointer2 className="h-4 w-4" />
              {isDrawing ? "Cancel Line" : "Draw Line"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void finishDraft()} disabled={draftPoints.length < 2}>
              Finish (Enter)
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pages</p>
            <div className="flex flex-wrap gap-2">
              {pages.map((page) => (
                <Button
                  key={page.id}
                  size="sm"
                  variant={page.id === activePageId ? "default" : "outline"}
                  onClick={() => {
                    setActivePageId(page.id);
                    fitStageToPage(page.width, page.height);
                  }}
                >
                  Page {page.pageNumber}
                </Button>
              ))}
              {pages.length === 0 && <p className="text-sm text-zinc-500">Upload blueprint to create page.</p>}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Selection</p>
            {selectedAnnotationId ? (
              <Button variant="destructive" size="sm" onClick={() => void handleDeleteSelected()}>
                <Trash2 className="h-4 w-4" />
                Delete annotation
              </Button>
            ) : (
              <p className="text-sm text-zinc-500">No annotation selected.</p>
            )}
          </div>

          <div className="space-y-1 rounded-md bg-zinc-100 p-3 text-sm">
            <p>
              <span className="font-medium">File:</span> {activeFileId ?? "not uploaded"}
            </p>
            <p>
              <span className="font-medium">Zoom:</span> {transform.scale.toFixed(2)}x
            </p>
            {activePage && (
              <p>
                <span className="font-medium">Page size:</span> {activePage.width} x {activePage.height}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-1 flex-col gap-4">
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Canvas</CardTitle>
            <div className="flex items-center gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
              {!activePageId ? (
                <Badge variant="secondary">
                  <Upload className="mr-1 h-3 w-3" />
                  Upload to start
                </Badge>
              ) : isRenderingActivePageImage ? (
                <Badge variant="secondary">Rendering page image...</Badge>
              ) : isLoadingAnnotations ? (
                <Badge variant="secondary">Loading annotations...</Badge>
              ) : (
                <Badge variant="outline">{activePageAnnotationIds.length} annotations</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
              <Stage
                ref={(value) => {
                  stageRef.current = value;
                }}
                width={STAGE_WIDTH}
                height={STAGE_HEIGHT}
                draggable={!isDrawing}
                x={transform.x}
                y={transform.y}
                scaleX={transform.scale}
                scaleY={transform.scale}
                onDragEnd={(event) => {
                  setTransform({
                    ...transform,
                    x: event.target.x(),
                    y: event.target.y(),
                  });
                }}
                onWheel={handleStageWheel}
                onMouseDown={handleStageMouseDown}
                onDblClick={() => {
                  if (isDrawing) {
                    void finishDraft();
                  }
                }}
              >
                <Layer>
                  {imageElement && <KonvaImage image={imageElement} listening={false} />}
                </Layer>
                <Layer>
                  {activePageAnnotationIds.map((annotationId) => (
                    <AnnotationShape
                      key={annotationId}
                      annotationId={annotationId}
                      isSelected={selectedAnnotationId === annotationId}
                      onSelect={setSelectedAnnotationId}
                    />
                  ))}
                  {draftFlatPoints.length > 1 && (
                    <Line
                      points={draftFlatPoints}
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      lineCap="round"
                      lineJoin="round"
                      dash={[6, 4]}
                    />
                  )}
                </Layer>
              </Stage>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Annotations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 space-y-2 overflow-auto">
              {activePageAnnotationIds.map((annotationId) => {
                const annotation = annotationsById[annotationId];
                if (!annotation) {
                  return null;
                }

                return (
                  <div
                    key={annotation.id}
                    className={`rounded-md border p-3 ${
                      selectedAnnotationId === annotation.id ? "border-blue-500 bg-blue-50" : "border-zinc-200"
                    }`}
                    onClick={() => setSelectedAnnotationId(annotation.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        setSelectedAnnotationId(annotation.id);
                      }
                    }}
                  >
                    <Input
                      defaultValue={annotation.name}
                      onBlur={(event) => void handleRename(annotation.id, event.target.value)}
                    />
                    <p className="mt-2 text-sm text-zinc-600">
                      {annotation.measurement.toFixed(2)} {annotation.unit}
                    </p>
                  </div>
                );
              })}
              {activePageAnnotationIds.length === 0 && (
                <p className="text-sm text-zinc-500">No annotations yet for this page.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
