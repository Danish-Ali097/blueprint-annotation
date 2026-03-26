import { z } from "zod";

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const createAnnotationSchema = z.object({
  pageId: z.string().min(1, "pageId is required"),
  name: z.string().trim().min(1, "name is required").max(120),
  toolType: z.string().trim().min(1, "toolType is required").max(40),
  points: z.array(pointSchema).min(1, "at least one point is required"),
  measurement: z.number().finite().nonnegative(),
  unit: z.string().trim().min(1, "unit is required").max(20),
});

export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
