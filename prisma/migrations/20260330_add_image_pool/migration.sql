-- CreateEnum
CREATE TYPE "image_pool_source" AS ENUM ('ai_pregenerated', 'manual');

-- CreateEnum
CREATE TYPE "image_pool_status" AS ENUM ('available', 'used');

-- CreateTable
CREATE TABLE "image_pool" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "category_id" TEXT,
    "url" TEXT NOT NULL,
    "alt_text_base" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "file_size" INTEGER NOT NULL,
    "source" "image_pool_source" NOT NULL,
    "status" "image_pool_status" NOT NULL DEFAULT 'available',
    "post_id" TEXT,
    "generated_from_keyword" TEXT,
    "reuse_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_pool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "image_pool_site_id_source_status_idx" ON "image_pool"("site_id", "source", "status");

-- CreateIndex
CREATE INDEX "image_pool_site_id_category_id_status_idx" ON "image_pool"("site_id", "category_id", "status");

-- CreateIndex
CREATE INDEX "image_pool_site_id_status_reuse_count_idx" ON "image_pool"("site_id", "status", "reuse_count");

-- AddForeignKey
ALTER TABLE "image_pool" ADD CONSTRAINT "image_pool_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_pool" ADD CONSTRAINT "image_pool_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_pool" ADD CONSTRAINT "image_pool_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
