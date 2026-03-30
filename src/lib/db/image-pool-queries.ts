/**
 * Image pool database queries.
 * All pipeline queries filter by siteId only (category is assigned after image generation).
 */

import { prisma } from "./prisma";
import type { ImagePool, ImagePoolSource, ImagePoolStatus } from "@prisma/client";

// ── Pipeline queries (siteId only) ─────────────────────────

export async function getAvailablePoolImages(
  siteId: string,
  count: number,
): Promise<ImagePool[]> {
  return prisma.imagePool.findMany({
    where: {
      siteId,
      source: "ai_pregenerated",
      status: "available",
    },
    orderBy: { createdAt: "asc" },
    take: count,
  });
}

export async function markPoolImagesAsUsed(
  imageIds: string[],
  postId: string,
): Promise<void> {
  if (imageIds.length === 0) return;
  await prisma.imagePool.updateMany({
    where: { id: { in: imageIds } },
    data: { status: "used", postId },
  });
}

export async function getManualPoolImages(
  siteId: string,
  count: number,
): Promise<ImagePool[]> {
  return prisma.imagePool.findMany({
    where: {
      siteId,
      source: "manual",
      status: "available",
    },
    orderBy: { createdAt: "asc" },
    take: count,
  });
}

export async function getReusablePoolImages(
  siteId: string,
  count: number,
): Promise<ImagePool[]> {
  return prisma.imagePool.findMany({
    where: {
      siteId,
      source: "ai_pregenerated",
      status: "used",
    },
    orderBy: [{ reuseCount: "asc" }, { createdAt: "asc" }],
    take: count,
  });
}

export async function incrementReuseCount(
  imageIds: string[],
): Promise<void> {
  if (imageIds.length === 0) return;
  await prisma.$transaction(
    imageIds.map((id) =>
      prisma.imagePool.update({
        where: { id },
        data: { reuseCount: { increment: 1 } },
      }),
    ),
  );
}

// ── Save to pool ────────────────────────────────────────────

interface SaveToPoolData {
  siteId: string;
  categoryId?: string | null;
  url: string;
  altTextBase: string;
  width: number;
  height: number;
  fileSize: number;
  source: ImagePoolSource;
  status?: ImagePoolStatus;
  postId?: string | null;
  generatedFromKeyword?: string | null;
}

export async function saveToPool(data: SaveToPoolData): Promise<ImagePool> {
  return prisma.imagePool.create({
    data: {
      siteId: data.siteId,
      categoryId: data.categoryId ?? undefined,
      url: data.url,
      altTextBase: data.altTextBase,
      width: data.width,
      height: data.height,
      fileSize: data.fileSize,
      source: data.source,
      status: data.status ?? "available",
      postId: data.postId ?? undefined,
      generatedFromKeyword: data.generatedFromKeyword ?? undefined,
    },
  });
}

// ── Admin queries ───────────────────────────────────────────

interface PoolStatsResult {
  available: number;
  used: number;
  manual: number;
}

export async function getPoolStats(siteId?: string): Promise<PoolStatsResult> {
  const where = siteId ? { siteId } : {};

  const [available, used, manual] = await Promise.all([
    prisma.imagePool.count({ where: { ...where, status: "available", source: "ai_pregenerated" } }),
    prisma.imagePool.count({ where: { ...where, status: "used" } }),
    prisma.imagePool.count({ where: { ...where, source: "manual" } }),
  ]);

  return { available, used, manual };
}

interface PoolListFilters {
  siteId?: string;
  categoryId?: string;
  source?: ImagePoolSource;
  status?: ImagePoolStatus;
  page: number;
  limit: number;
}

export async function getPoolImages(
  filters: PoolListFilters,
): Promise<{ data: ImagePool[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (filters.siteId) where.siteId = filters.siteId;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.source) where.source = filters.source;
  if (filters.status) where.status = filters.status;

  const skip = (filters.page - 1) * filters.limit;

  const [data, total] = await Promise.all([
    prisma.imagePool.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.limit,
      include: {
        site: { select: { name: true, domain: true } },
        category: { select: { name: true } },
        post: { select: { title: true, slug: true } },
      },
    }),
    prisma.imagePool.count({ where }),
  ]);

  return { data, total };
}
