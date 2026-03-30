import nextEnv from "@next/env";
import { z } from "zod";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) =>
        value.startsWith("postgresql://") ||
        value.startsWith("postgres://") ||
        value.startsWith("prisma+postgres://"),
      "DATABASE_URL must be a valid Postgres connection string",
    ),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Environment validation failed:");
  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

console.log("Environment validation passed.");
