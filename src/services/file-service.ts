import { prisma } from "@/lib/prisma";
import type { CreateFileInput } from "@/lib/validation/file";

export async function listFiles() {
  return prisma.file.findMany({
    orderBy: { updatedAt: "desc" },
  });
}

export async function getOrCreateFile(input: CreateFileInput) {
  const existingFile = await prisma.file.findFirst({
    where: { path: input.path },
  });

  if (existingFile) {
    return existingFile;
  }

  let user = await prisma.user.findFirst({
    where: { name: input.userName },
    orderBy: { createdAt: "asc" },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { name: input.userName },
    });
  }

  return prisma.file.create({
    data: {
      userId: user.id,
      name: input.name,
      path: input.path,
    },
  });
}
