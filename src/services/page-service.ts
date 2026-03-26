import { prisma } from "@/lib/prisma";
import type { CreatePageInput } from "@/lib/validation/page";

export async function listPages(fileId?: string) {
  return prisma.page.findMany({
    where: fileId ? { fileId } : undefined,
    orderBy: [{ fileId: "asc" }, { pageNumber: "asc" }],
  });
}

export async function upsertPage(input: CreatePageInput) {
  const { fileId, pageNumber, ...rest } = input;

  return prisma.page.upsert({
    where: { fileId_pageNumber: { fileId, pageNumber } },
    update: rest,
    create: input,
  });
}
