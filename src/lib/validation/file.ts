import { z } from "zod";

export const createFileSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  path: z.string().trim().min(1, "path is required").max(500),
  userName: z.string().trim().min(1).max(120).default("Demo User"),
});

export type CreateFileInput = z.infer<typeof createFileSchema>;
