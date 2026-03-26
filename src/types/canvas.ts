export type Point = {
  x: number;
  y: number;
};

export type Annotation = {
  id: string;
  pageId: string;
  name: string;
  toolType: string;
  points: Point[];
  measurement: number;
  unit: string;
  createdAt: string;
  updatedAt: string;
};

export type BlueprintFile = {
  id: string;
  userId: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type BlueprintPage = {
  id: string;
  fileId: string;
  pageNumber: number;
  width: number;
  height: number;
  previewPath: string | null;
  pixelsPerUnit: number | null;
  unit: string | null;
  calibrationPoints: [Point, Point] | null;
  createdAt: string;
  updatedAt: string;
};

export type StageTransform = {
  x: number;
  y: number;
  scale: number;
};
