import { z } from "zod";

const calibrationPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const createPageSchema = z.object({
  fileId: z.string().min(1, "fileId is required"),
  pageNumber: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  previewPath: z.string().trim().min(1).optional(),
  pixelsPerUnit: z.number().positive().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  calibrationPoints: z.tuple([calibrationPointSchema, calibrationPointSchema]).optional(),
});

export type CreatePageInput = z.infer<typeof createPageSchema>;
