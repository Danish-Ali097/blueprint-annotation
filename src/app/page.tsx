"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Image as KonvaImage, Layer, Line, Stage, Text } from "react-konva";
import type Konva from "konva";
import { FileImage, Loader2, MousePointer2, Ruler, Trash2, Upload } from "lucide-react";

import { AnnotationShape } from "@/components/canvas/annotation-shape";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createAnnotation,
  createFile,
  deleteAnnotation,
  getUploadConversionStatus,
  listFiles as listRecentFiles,
  listAnnotations,
  listPages,
  renameAnnotation,
  uploadAsset,
  upsertPage,
} from "@/lib/api";
import { useCanvasStore } from "@/stores/canvas-store";
import type { BlueprintFile, Point } from "@/types/canvas";

const DEFAULT_STAGE_WIDTH = 1120;
const MIN_STAGE_WIDTH = 560;
const DEFAULT_STAGE_HEIGHT = 680;
const MIN_STAGE_HEIGHT = 380;
const EMPTY_ANNOTATION_IDS: string[] = [];
const CALIBRATION_UNITS = ["mm", "cm", "m", "in", "ft", "yd"] as const;

type UploadedPage = {
  pageNumber: number;
  width: number;
  height: number;
  src: string;
};

type CalibrationLine = {
  points: [Point, Point];
  realDistance: number;
  unit: string;
};

type CursorPosition = {
  x: number;
  y: number;
};

type PdfConversionProgress = {
  current: number;
  total: number;
};

function isPdfAsset(name: string, mimeType?: string) {
  return mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

function getPolylineLength(points: Point[]) {
  if (points.length < 2) {
    return 0;
  }

  return points.slice(1).reduce((length, point, index) => {
    const previous = points[index];
    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function getPolygonArea(points: Point[]) {
  if (points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) / 2;
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

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
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

export default function Home() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [imageSrcByPage, setImageSrcByPage] = useState<Record<string, string>>({});
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingArea, setIsDrawingArea] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [areaDraftPoints, setAreaDraftPoints] = useState<Point[]>([]);
  const [calibrationDraftPoints, setCalibrationDraftPoints] = useState<Point[]>([]);
  const [calibrationRealDistance, setCalibrationRealDistance] = useState("1");
  const [calibrationUnit, setCalibrationUnit] = useState("m");
  const [calibrationLineByPage, setCalibrationLineByPage] = useState<Record<string, CalibrationLine>>(
    {},
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfConversionProgress, setPdfConversionProgress] = useState<PdfConversionProgress | null>(null);
  const [recentFiles, setRecentFiles] = useState<BlueprintFile[]>([]);
  const [isLoadingRecentFiles, setIsLoadingRecentFiles] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);
  const [stageWidth, setStageWidth] = useState(DEFAULT_STAGE_WIDTH);
  const [stageHeight, setStageHeight] = useState(DEFAULT_STAGE_HEIGHT);

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
  const calibrationUnitOptions = useMemo(() => {
    if (!calibrationUnit) {
      return [...CALIBRATION_UNITS];
    }
    return CALIBRATION_UNITS.includes(calibrationUnit as (typeof CALIBRATION_UNITS)[number])
      ? [...CALIBRATION_UNITS]
      : [...CALIBRATION_UNITS, calibrationUnit];
  }, [calibrationUnit]);

  const fitStageToPage = useCallback(
    (pageWidth: number, pageHeight: number) => {
      const scale = Math.min(stageWidth / pageWidth, stageHeight / pageHeight, 1);
      const x = (stageWidth - pageWidth * scale) / 2;
      const y = (stageHeight - pageHeight * scale) / 2;
      setTransform({ x, y, scale });
    },
    [setTransform, stageWidth, stageHeight],
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

  const loadRecentUploads = useCallback(async () => {
    setIsLoadingRecentFiles(true);
    try {
      const files = await listRecentFiles();
      setRecentFiles(files);
    } finally {
      setIsLoadingRecentFiles(false);
    }
  }, []);

  const waitForPdfConversion = useCallback(async (jobId: string): Promise<UploadedPage[]> => {
    const pollIntervalMs = 450;

    while (true) {
      const status = await getUploadConversionStatus(jobId);
      setPdfConversionProgress({
        current: status.convertedPages,
        total: status.totalPages,
      });

      if (status.status === "failed") {
        throw new Error(status.error ?? "Failed to convert PDF");
      }

      if (status.status === "done") {
        return status.pages.map((page) => ({
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          src: page.path,
        }));
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }, []);

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
    if (!activePage) {
      return;
    }

    if (activePage.unit) {
      setCalibrationUnit(activePage.unit);
    }
    if (activePage.calibrationPoints && activePage.calibrationPoints.length === 2) {
      const [start, end] = activePage.calibrationPoints;
      const realDistance = activePage.pixelsPerUnit
        ? Math.hypot(end.x - start.x, end.y - start.y) / activePage.pixelsPerUnit
        : 1;

      setCalibrationLineByPage((state) => ({
        ...state,
        [activePage.id]: {
          points: [start, end],
          realDistance,
          unit: activePage.unit ?? "unit",
        },
      }));
    }
  }, [activePage]);

  useEffect(() => {
    if (!activePage) {
      return;
    }
    fitStageToPage(activePage.width, activePage.height);
  }, [activePage, fitStageToPage, stageHeight, stageWidth]);

  useEffect(() => {
    void loadRecentUploads();
  }, [loadRecentUploads]);

  useEffect(() => {
    const updateStageSize = () => {
      const viewportWidth = window.innerWidth;
      const isThreeColumnLayout = viewportWidth >= 1280;
      if (!isThreeColumnLayout) {
        setStageWidth(Math.min(DEFAULT_STAGE_WIDTH, Math.max(MIN_STAGE_WIDTH, viewportWidth - 48)));
      } else {
        const sideColumnsWidth = 320 * 2;
        const horizontalGap = 16 * 2;
        const pagePadding = 16 * 2;
        const availableCenterWidth = viewportWidth - sideColumnsWidth - horizontalGap - pagePadding;
        setStageWidth(Math.min(DEFAULT_STAGE_WIDTH, Math.max(MIN_STAGE_WIDTH, availableCenterWidth)));
      }

      const availableHeight = window.innerHeight - 210;
      setStageHeight(Math.min(DEFAULT_STAGE_HEIGHT, Math.max(MIN_STAGE_HEIGHT, availableHeight)));
    };

    updateStageSize();
    window.addEventListener("resize", updateStageSize);
    return () => window.removeEventListener("resize", updateStageSize);
  }, []);

  async function onUploadBlueprint(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadError(null);
    setPdfConversionProgress(null);
    setIsSaving(true);
    try {
      const uploadedAsset = await uploadAsset(file);
      const isPdf = isPdfAsset(uploadedAsset.name, uploadedAsset.mimeType);
      if (isPdf && !uploadedAsset.conversionJobId) {
        throw new Error("PDF conversion job was not created");
      }
      const uploadedPages: UploadedPage[] = isPdf
        ? uploadedAsset.conversionJobId
          ? await waitForPdfConversion(uploadedAsset.conversionJobId)
          : []
        : [
            {
              ...(await extractImagePage(file)),
              src: uploadedAsset.path,
            },
          ];

      if (uploadedPages.length === 0) {
        throw new Error("No pages were produced from this upload");
      }

      const savedFile = await createFile({
        name: uploadedAsset.name,
        path: uploadedAsset.path,
      });
      setActiveFileId(savedFile.id);

      for (const uploadedPage of uploadedPages) {
        await upsertPage({
          fileId: savedFile.id,
          pageNumber: uploadedPage.pageNumber,
          width: uploadedPage.width,
          height: uploadedPage.height,
          previewPath: uploadedPage.src,
        });
      }

      const dbPages = await listPages(savedFile.id);
      const firstPage = dbPages[0] ?? null;
      const uploadedSrcByPageNumber = Object.fromEntries(
        uploadedPages.map((uploadedPage) => [uploadedPage.pageNumber, uploadedPage.src]),
      );

      setPages(dbPages);
      setActivePageId(firstPage?.id ?? null);
      setImageSrcByPage((state) => ({
        ...state,
        ...Object.fromEntries(
          dbPages
            .filter((page) => Boolean(uploadedSrcByPageNumber[page.pageNumber]))
            .map((page) => [page.id, uploadedSrcByPageNumber[page.pageNumber]]),
        ),
      }));
      if (firstPage) {
        fitStageToPage(firstPage.width, firstPage.height);
      } else {
        setTransform({ x: 0, y: 0, scale: 1 });
      }
      setDraftPoints([]);
      setAreaDraftPoints([]);
      setCalibrationDraftPoints([]);
      setIsDrawing(false);
      setIsDrawingArea(false);
      setIsCalibrating(false);
      await loadRecentUploads();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to process uploaded file");
    } finally {
      setPdfConversionProgress(null);
      setIsSaving(false);
    }
  }

  async function loadFileFromRecentUpload(file: BlueprintFile) {
    setUploadError(null);
    setActiveFileId(file.id);
    const dbPages = await listPages(file.id);
    setPages(dbPages);
    const firstPage = dbPages[0] ?? null;
    setActivePageId(firstPage?.id ?? null);
    if (firstPage) {
      fitStageToPage(firstPage.width, firstPage.height);
    } else {
      setTransform({ x: 0, y: 0, scale: 1 });
    }
    setDraftPoints([]);
    setAreaDraftPoints([]);
    setCalibrationDraftPoints([]);
    setIsDrawing(false);
    setIsDrawingArea(false);
    setIsCalibrating(false);

    if (dbPages.length === 0) {
      return;
    }

    setImageSrcByPage((state) => ({
      ...state,
      ...Object.fromEntries(dbPages.map((page) => [page.id, page.previewPath ?? file.path])),
    }));
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
    if ((!isDrawing && !isDrawingArea && !isCalibrating) || !activePageId) {
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

    if (isCalibrating) {
      setCalibrationDraftPoints((points) => {
        if (points.length >= 2) {
          return [worldPoint];
        }
        return [...points, worldPoint];
      });
      return;
    }

    if (isDrawingArea) {
      setAreaDraftPoints((points) => [...points, worldPoint]);
      return;
    }

    setDraftPoints((points) => [...points, worldPoint]);
  }

  function handleStageMouseMove(event: Konva.KonvaEventObject<MouseEvent>) {
    const stage = event.target.getStage();
    if (!stage) {
      return;
    }

    const worldPoint = toWorldPoint(stage, transform.scale, transform.x, transform.y);
    if (!worldPoint) {
      return;
    }

    setCursorPosition(worldPoint);
  }

  const finishDraft = useCallback(async () => {
    if (!activePageId || draftPoints.length < 2) {
      setDraftPoints([]);
      return;
    }

    const pixelLength = getPolylineLength(draftPoints);
    const measurement =
      activePage?.pixelsPerUnit && activePage.pixelsPerUnit > 0
        ? pixelLength / activePage.pixelsPerUnit
        : pixelLength;
    const measurementUnit = activePage?.pixelsPerUnit ? (activePage.unit ?? "unit") : "px";
    const annotation = await createAnnotation({
      pageId: activePageId,
      name: `Line ${activePageAnnotationIds.length + 1}`,
      toolType: "polyline",
      points: draftPoints,
      measurement,
      unit: measurementUnit,
    });

    upsertAnnotationInStore(annotation);
    setDraftPoints([]);
    setIsDrawing(false);
  }, [activePage, activePageAnnotationIds.length, activePageId, draftPoints, upsertAnnotationInStore]);

  const finishAreaDraft = useCallback(async () => {
    if (!activePageId || areaDraftPoints.length < 3) {
      setAreaDraftPoints([]);
      return;
    }

    const pixelArea = getPolygonArea(areaDraftPoints);
    const measurement =
      activePage?.pixelsPerUnit && activePage.pixelsPerUnit > 0
        ? pixelArea / (activePage.pixelsPerUnit * activePage.pixelsPerUnit)
        : pixelArea;
    const measurementUnit = activePage?.pixelsPerUnit ? `${activePage.unit ?? "unit"}²` : "px²";

    const annotation = await createAnnotation({
      pageId: activePageId,
      name: `Area ${activePageAnnotationIds.length + 1}`,
      toolType: "area",
      points: areaDraftPoints,
      measurement,
      unit: measurementUnit,
    });

    upsertAnnotationInStore(annotation);
    setAreaDraftPoints([]);
    setIsDrawingArea(false);
  }, [activePage, activePageAnnotationIds.length, activePageId, areaDraftPoints, upsertAnnotationInStore]);

  const toggleLineMode = useCallback(() => {
    setIsDrawingArea(false);
    setAreaDraftPoints([]);
    setIsCalibrating(false);
    setCalibrationDraftPoints([]);
    setIsDrawing((value) => {
      if (value) {
        setDraftPoints([]);
      }
      return !value;
    });
  }, []);

  const toggleAreaMode = useCallback(() => {
    setIsDrawing(false);
    setDraftPoints([]);
    setIsCalibrating(false);
    setCalibrationDraftPoints([]);
    setIsDrawingArea((value) => {
      if (value) {
        setAreaDraftPoints([]);
      }
      return !value;
    });
  }, []);

  const toggleCalibrateMode = useCallback(() => {
    setIsDrawing(false);
    setDraftPoints([]);
    setIsDrawingArea(false);
    setAreaDraftPoints([]);
    setIsCalibrating((value) => {
      if (value) {
        setCalibrationDraftPoints([]);
      }
      return !value;
    });
  }, []);

  const saveCalibration = useCallback(async () => {
    if (!activePage || calibrationDraftPoints.length !== 2) {
      return;
    }

    const realDistance = Number(calibrationRealDistance);
    if (!Number.isFinite(realDistance) || realDistance <= 0) {
      setUploadError("Calibration distance must be greater than 0");
      return;
    }

    const [start, end] = calibrationDraftPoints as [Point, Point];
    const pixelDistance = Math.hypot(end.x - start.x, end.y - start.y);
    if (pixelDistance <= 0) {
      setUploadError("Calibration points must form a non-zero distance");
      return;
    }

    const pixelsPerUnit = pixelDistance / realDistance;
    const nextUnit = calibrationUnit.trim() || "unit";

    const updatedPage = await upsertPage({
      fileId: activePage.fileId,
      pageNumber: activePage.pageNumber,
      width: activePage.width,
      height: activePage.height,
      previewPath: activePage.previewPath ?? undefined,
      pixelsPerUnit,
      unit: nextUnit,
      calibrationPoints: [start, end],
    });

    setPages(pages.map((page) => (page.id === updatedPage.id ? updatedPage : page)));
    setCalibrationLineByPage((state) => ({
      ...state,
      [activePage.id]: {
        points: [start, end],
        realDistance,
        unit: nextUnit,
      },
    }));
    setCalibrationDraftPoints([]);
    setIsCalibrating(false);
    setUploadError(null);
  }, [activePage, calibrationDraftPoints, calibrationRealDistance, calibrationUnit, pages, setPages]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifierPressed = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const isShortcut =
        (modifierPressed && event.shiftKey && ["l", "a", "c"].includes(key)) ||
        (event.altKey && ["l", "a", "c"].includes(key));

      if (isShortcut && !isTextEntryTarget(event.target)) {
        event.preventDefault();

        if (key === "l") {
          toggleLineMode();
          return;
        }

        if (key === "a") {
          toggleAreaMode();
          return;
        }

        if (key === "c") {
          toggleCalibrateMode();
          return;
        }
      }

      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      if (isCalibrating) {
        void saveCalibration();
        return;
      }
      if (isDrawingArea) {
        void finishAreaDraft();
        return;
      }
      if (isDrawing) {
        void finishDraft();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    finishAreaDraft,
    finishDraft,
    isCalibrating,
    isDrawing,
    isDrawingArea,
    saveCalibration,
    toggleAreaMode,
    toggleCalibrateMode,
    toggleLineMode,
  ]);

  async function handleDeleteAnnotation(annotationId: string) {
    if (!activePageId) {
      return;
    }

    await deleteAnnotation(annotationId);
    removeAnnotationInStore(annotationId, activePageId);
  }

  async function handleRename(annotationId: string, nextName: string) {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      return;
    }

    renameAnnotationInStore(annotationId, trimmedName);
    await renameAnnotation(annotationId, trimmedName);
  }

  const calibrationDraftFlatPoints = calibrationDraftPoints.flatMap((point) => [point.x, point.y]);
  const linePreviewPoints =
    isDrawing && draftPoints.length > 0 && cursorPosition ? [...draftPoints, cursorPosition] : draftPoints;
  const linePreviewFlatPoints = linePreviewPoints.flatMap((point) => [point.x, point.y]);
  const areaPreviewPoints =
    isDrawingArea && areaDraftPoints.length > 0 && cursorPosition
      ? [...areaDraftPoints, cursorPosition]
      : areaDraftPoints;
  const areaPreviewFlatPoints = areaPreviewPoints.flatMap((point) => [point.x, point.y]);
  const savedCalibrationLine =
    activePageId && calibrationLineByPage[activePageId] ? calibrationLineByPage[activePageId] : null;

  return (
    <main className="flex min-h-screen w-full flex-col gap-4 overflow-x-hidden bg-zinc-50 p-4 xl:h-screen xl:flex-row xl:overflow-hidden">
      <Card className="w-full xl:h-[calc(100vh-2rem)] xl:w-[320px] xl:shrink-0 xl:overflow-hidden xl:flex xl:flex-col">
        <CardHeader>
          <CardTitle>Blueprint Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Upload blueprint (image or PDF)
            <Input
              type="file"
              accept="image/png,image/jpeg,image/jpg,application/pdf,.pdf"
              onChange={onUploadBlueprint}
              disabled={isSaving}
            />
          </label>
          {uploadError ? <p className="text-sm text-red-600">{uploadError}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={isDrawing ? "secondary" : "default"}
              size="sm"
              onClick={toggleLineMode}
              disabled={!activePageId}
              title="Shortcut: Cmd/Ctrl+Shift+L or Alt+L"
            >
              <MousePointer2 className="h-4 w-4" />
              {isDrawing ? "Cancel Line (⌘/Ctrl+Shift+L)" : "Draw Line (⌘/Ctrl+Shift+L)"}
            </Button>
            <Button
              variant={isDrawingArea ? "secondary" : "outline"}
              size="sm"
              onClick={toggleAreaMode}
              disabled={!activePageId}
              title="Shortcut: Cmd/Ctrl+Shift+A or Alt+A"
            >
              <FileImage className="h-4 w-4" />
              {isDrawingArea ? "Cancel Area (⌘/Ctrl+Shift+A)" : "Draw Area (⌘/Ctrl+Shift+A)"}
            </Button>
            <Button
              variant={isCalibrating ? "secondary" : "outline"}
              size="sm"
              onClick={toggleCalibrateMode}
              disabled={!activePageId}
              title="Shortcut: Cmd/Ctrl+Shift+C or Alt+C"
            >
              <Ruler className="h-4 w-4" />
              {isCalibrating ? "Cancel Calibrate (⌘/Ctrl+Shift+C)" : "Calibrate (⌘/Ctrl+Shift+C)"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (isDrawingArea) {
                  void finishAreaDraft();
                } else {
                  void finishDraft();
                }
              }}
              disabled={
                (isDrawing && draftPoints.length < 2) ||
                (isDrawingArea && areaDraftPoints.length < 3) ||
                (!isDrawing && !isDrawingArea)
              }
            >
              {isDrawingArea ? "Finish Area (Enter)" : "Finish (Enter)"}
            </Button>
          </div>

          <div className="space-y-2 rounded-md border border-zinc-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Page Calibration</p>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <Input
                value={calibrationRealDistance}
                onChange={(event) => setCalibrationRealDistance(event.target.value)}
                placeholder="Known distance"
                inputMode="decimal"
              />
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                value={calibrationUnit}
                onChange={(event) => setCalibrationUnit(event.target.value)}
              >
                {calibrationUnitOptions.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!isCalibrating || calibrationDraftPoints.length !== 2}
                onClick={() => void saveCalibration()}
              >
                Save Calibration
              </Button>
              <p className="text-xs text-zinc-500">
                {activePage?.pixelsPerUnit
                  ? `1 ${activePage.unit ?? "unit"} = ${activePage.pixelsPerUnit.toFixed(2)} px`
                  : "Not calibrated"}
              </p>
            </div>
            {isCalibrating ? (
              <p className="text-xs text-zinc-500">Click two points on canvas, then save (or press Enter).</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Recent Uploads</p>
            <div className="max-h-40 space-y-2 overflow-auto rounded-md border border-zinc-200 p-2">
              {recentFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  className={`w-full rounded-md border px-2 py-2 text-left text-xs transition-colors ${
                    activeFileId === file.id
                      ? "border-blue-500 bg-blue-50 text-blue-900"
                      : "border-zinc-200 hover:bg-zinc-50"
                  }`}
                  onClick={() => void loadFileFromRecentUpload(file)}
                >
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="mt-1 text-zinc-500">{new Date(file.updatedAt).toLocaleString()}</p>
                </button>
              ))}
              {!isLoadingRecentFiles && recentFiles.length === 0 ? (
                <p className="px-1 py-2 text-xs text-zinc-500">No uploads yet.</p>
              ) : null}
              {isLoadingRecentFiles ? <p className="px-1 py-2 text-xs text-zinc-500">Loading uploads...</p> : null}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pages</p>
            <div className="max-h-64 overflow-auto rounded-md border border-zinc-200 p-2">
              <div className="flex flex-wrap gap-2">
                {pages.map((page) => {
                  const thumbnailSrc = imageSrcByPage[page.id];
                  const isActive = page.id === activePageId;

                  return (
                    <button
                      key={page.id}
                      type="button"
                      className={`flex w-[88px] flex-col items-center gap-2 rounded-md border p-2 text-xs transition-colors ${
                        isActive
                          ? "border-blue-500 bg-blue-50 text-blue-900"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      }`}
                      onClick={() => {
                        setActivePageId(page.id);
                        fitStageToPage(page.width, page.height);
                        setDraftPoints([]);
                        setAreaDraftPoints([]);
                        setCalibrationDraftPoints([]);
                        setIsDrawing(false);
                        setIsDrawingArea(false);
                        setIsCalibrating(false);
                      }}
                    >
                      <div className="flex h-14 w-full items-center justify-center overflow-hidden rounded-sm border border-zinc-200 bg-zinc-100">
                        {thumbnailSrc ? (
                          <Image
                            src={thumbnailSrc}
                            alt={`Page ${page.pageNumber} thumbnail`}
                            width={88}
                            height={56}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <FileImage className="h-5 w-5 text-zinc-500" />
                        )}
                      </div>
                      <span className="font-medium">Page {page.pageNumber}</span>
                    </button>
                  );
                })}
              </div>
              {pages.length === 0 && <p className="px-1 py-2 text-sm text-zinc-500">Upload blueprint to create page.</p>}
            </div>
          </div>

          <div className="space-y-1 rounded-md bg-zinc-100 p-3 text-sm">
            <p>
              <span className="font-medium">File:</span> {activeFileId ?? "not uploaded"}
            </p>
            {activePage && (
              <p>
                <span className="font-medium">Page size:</span> {activePage.width} x {activePage.height}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 w-full xl:flex-1">
        <Card className="overflow-hidden xl:h-[calc(100vh-2rem)] xl:flex xl:flex-col">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Canvas</CardTitle>
            <div className="flex items-center gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />}
              <Badge variant="outline">Zoom {transform.scale.toFixed(2)}x</Badge>
              {isSaving && pdfConversionProgress ? (
                <Badge variant="secondary">
                  {pdfConversionProgress.total > 0
                    ? `Converting ${pdfConversionProgress.current} of ${pdfConversionProgress.total} pages...`
                    : "Preparing PDF conversion..."}
                </Badge>
              ) : !activePageId ? (
                <Badge variant="secondary">
                  <Upload className="mr-1 h-3 w-3" />
                  Upload to start
                </Badge>
              ) : isLoadingAnnotations ? (
                <Badge variant="secondary">Loading annotations...</Badge>
              ) : (
                <Badge variant="outline">{activePageAnnotationIds.length} annotations</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="xl:min-h-0 xl:flex-1">
            <div className="relative overflow-auto rounded-md border border-zinc-200 bg-white">
              <div className="absolute right-2 top-2 z-10 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
                {cursorPosition
                  ? `X: ${cursorPosition.x.toFixed(1)}  Y: ${cursorPosition.y.toFixed(1)}`
                  : "X: -  Y: -"}
              </div>
              <Stage
                ref={(value) => {
                  stageRef.current = value;
                }}
                width={stageWidth}
                height={stageHeight}
                draggable={!isDrawing && !isDrawingArea && !isCalibrating}
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
                onMouseMove={handleStageMouseMove}
                onMouseLeave={() => setCursorPosition(null)}
                onMouseDown={handleStageMouseDown}
                onDblClick={() => {
                  if (isCalibrating) {
                    void saveCalibration();
                  } else if (isDrawingArea) {
                    void finishAreaDraft();
                  } else if (isDrawing) {
                    void finishDraft();
                  }
                }}
              >
                <Layer>
                  {imageElement && <KonvaImage image={imageElement} listening={false} />}
                </Layer>
                <Layer>
                  {activePageAnnotationIds.map((annotationId) => (
                    <AnnotationShape key={annotationId} annotationId={annotationId} />
                  ))}
                  {linePreviewFlatPoints.length > 1 && (
                    <Line
                      points={linePreviewFlatPoints}
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      lineCap="round"
                      lineJoin="round"
                      dash={[6, 4]}
                    />
                  )}
                  {areaPreviewFlatPoints.length > 1 && (
                    <Line
                      points={areaPreviewFlatPoints}
                      stroke="#0f766e"
                      strokeWidth={2}
                      lineCap="round"
                      lineJoin="round"
                      dash={[6, 4]}
                      closed={areaDraftPoints.length >= 3}
                      fill={areaDraftPoints.length >= 3 ? "rgba(15, 118, 110, 0.14)" : undefined}
                    />
                  )}
                  {calibrationDraftFlatPoints.length > 1 && (
                    <Line
                      points={calibrationDraftFlatPoints}
                      stroke="#16a34a"
                      strokeWidth={2}
                      lineCap="round"
                      lineJoin="round"
                      dash={[6, 4]}
                    />
                  )}
                  {savedCalibrationLine && (
                    <>
                      <Line
                        points={savedCalibrationLine.points.flatMap((point) => [point.x, point.y])}
                        stroke="#16a34a"
                        strokeWidth={2}
                        lineCap="round"
                        lineJoin="round"
                      />
                      <Text
                        x={(savedCalibrationLine.points[0].x + savedCalibrationLine.points[1].x) / 2}
                        y={(savedCalibrationLine.points[0].y + savedCalibrationLine.points[1].y) / 2 - 16}
                        text={`${savedCalibrationLine.realDistance} ${savedCalibrationLine.unit}`}
                        fontSize={12}
                        fill="#166534"
                      />
                    </>
                  )}
                </Layer>
              </Stage>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="w-full xl:h-[calc(100vh-2rem)] xl:w-[320px] xl:shrink-0 xl:overflow-hidden xl:flex xl:flex-col">
        <CardHeader>
          <CardTitle className="text-sm">Annotations</CardTitle>
        </CardHeader>
        <CardContent className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
          <div className="space-y-2">
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
                  <div className="flex items-center gap-2">
                    <Input
                      defaultValue={annotation.name}
                      onBlur={(event) => void handleRename(annotation.id, event.target.value)}
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteAnnotation(annotation.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
    </main>
  );
}
