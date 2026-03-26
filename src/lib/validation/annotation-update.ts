import { z } from "zod";

export const updateAnnotationSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120).optional(),
});

export type UpdateAnnotationInput = z.infer<typeof updateAnnotationSchema>;
