import type { Annotation, BlueprintFile, BlueprintPage, Point } from "@/types/canvas";

type ApiResponse<T> = {
  ok: boolean;
  data: T;
  error?: string;
};

type UploadedAsset = {
  name: string;
  path: string;
  mimeType: string;
};

async function parseJson<T>(response: Response): Promise<ApiResponse<T>> {
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.ok) {
    throw new Error(json.error ?? "Request failed");
  }
  return json;
}

export async function createFile(payload: { name: string; path: string; userName?: string }) {
  const response = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await parseJson<BlueprintFile>(response);
  return data.data;
}

export async function uploadAsset(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    method: "POST",
    body: formData,
  });

  const data = await parseJson<UploadedAsset>(response);
  return data.data;
}

export async function listFiles() {
  const response = await fetch("/api/files");
  const data = await parseJson<BlueprintFile[]>(response);
  return data.data;
}

export async function upsertPage(payload: {
  fileId: string;
  pageNumber: number;
  width: number;
  height: number;
  previewPath?: string;
  pixelsPerUnit?: number;
  unit?: string;
  calibrationPoints?: [Point, Point];
}) {
  const response = await fetch("/api/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await parseJson<BlueprintPage>(response);
  return data.data;
}

export async function listPages(fileId: string) {
  const response = await fetch(`/api/pages?fileId=${encodeURIComponent(fileId)}`);
  const data = await parseJson<BlueprintPage[]>(response);
  return data.data;
}

export async function listAnnotations(pageId: string) {
  const response = await fetch(`/api/annotations?pageId=${encodeURIComponent(pageId)}`);
  const data = await parseJson<Annotation[]>(response);
  return data.data;
}

export async function createAnnotation(payload: {
  pageId: string;
  name: string;
  toolType: string;
  points: Point[];
  measurement: number;
  unit: string;
}) {
  const response = await fetch("/api/annotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await parseJson<Annotation>(response);
  return data.data;
}

export async function renameAnnotation(annotationId: string, name: string) {
  const response = await fetch(`/api/annotations/${annotationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const data = await parseJson<Annotation>(response);
  return data.data;
}

export async function deleteAnnotation(annotationId: string) {
  const response = await fetch(`/api/annotations/${annotationId}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const json = (await response.json()) as { error?: string };
    throw new Error(json.error ?? "Failed to delete annotation");
  }
}
