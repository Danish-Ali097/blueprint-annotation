import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

const envFile = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
loadEnv({ path: envFile });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
