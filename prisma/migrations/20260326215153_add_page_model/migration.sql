/*
  Warnings:

  - You are about to drop the column `fileId` on the `Annotation` table. All the data in the column will be lost.
  - Added the required column `pageId` to the `Annotation` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_fileId_fkey";

-- AlterTable
ALTER TABLE "Annotation" DROP COLUMN "fileId",
ADD COLUMN     "pageId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "previewPath" TEXT,
    "pixelsPerUnit" DOUBLE PRECISION,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Page_fileId_idx" ON "Page"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_fileId_pageNumber_key" ON "Page"("fileId", "pageNumber");

-- CreateIndex
CREATE INDEX "Annotation_pageId_idx" ON "Annotation"("pageId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
