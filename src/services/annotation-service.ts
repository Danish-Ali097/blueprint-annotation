import { prisma } from "@/lib/prisma";
import type { CreateAnnotationInput } from "@/lib/validation/annotation";

type AnnotationFilters = {
  pageId?: string;
  fileId?: string;
};

export async function listAnnotations(filters: AnnotationFilters) {
  const { pageId, fileId } = filters;

  return prisma.annotation.findMany({
    where: pageId ? { pageId } : fileId ? { page: { fileId } } : undefined,
    orderBy: { updatedAt: "desc" },
  });
}

export async function createAnnotation(input: CreateAnnotationInput) {
  return prisma.annotation.create({
    data: input,
  });
}

export async function deleteAnnotation(id: string) {
  return prisma.annotation.delete({
    where: { id },
  });
}
