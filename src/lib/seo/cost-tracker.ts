/**
 * Cost tracking and ROI estimation for posts.
 * Sums token and image generation costs from publish logs.
 */

import { prisma } from "@/lib/db/prisma";

// ── Types ────────────────────────────────────────────────────

export interface PostCost {
  postId: string;
  tokenCost: number;
  imageCost: number;
  totalCost: number;
  logCount: number;
}

export interface DailyCost {
  date: string;
  tokenCost: number;
  imageCost: number;
  totalCost: number;
  postCount: number;
}

export interface MonthlyCost {
  month: string;
  tokenCost: number;
  imageCost: number;
  totalCost: number;
  postCount: number;
  dailyBreakdown: DailyCost[];
}

export interface RoiEstimate {
  postId: string;
  totalCost: number;
  totalClicks: number;
  totalImpressions: number;
  estimatedValue: number;
  roi: number;
  costPerClick: number;
}

// ── Cost per Post ────────────────────────────────────────────

/**
 * Sum all publish_logs costs (tokens + images) for a specific post,
 * including regeneration attempts.
 */
export async function calculatePostCost(postId: string): Promise<PostCost> {
  const logs = await prisma.publishLog.findMany({
    where: { postId },
  });

  let tokenCost = 0;
  let imageCost = 0;

  for (const log of logs) {
    tokenCost += log.costTokens ?? 0;
    imageCost += log.costImages ?? 0;
  }

  return {
    postId,
    tokenCost,
    imageCost,
    totalCost: tokenCost + imageCost,
    logCount: logs.length,
  };
}

// ── Daily Cost ───────────────────────────────────────────────

/**
 * Sum all costs for a site on a specific date.
 */
export async function calculateDailyCost(
  siteId: string,
  date: Date,
): Promise<DailyCost> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const logs = await prisma.publishLog.findMany({
    where: {
      siteId,
      createdAt: { gte: dayStart, lte: dayEnd },
    },
  });

  let tokenCost = 0;
  let imageCost = 0;
  const postIds = new Set<string>();

  for (const log of logs) {
    tokenCost += log.costTokens ?? 0;
    imageCost += log.costImages ?? 0;
    if (log.postId) postIds.add(log.postId);
  }

  return {
    date: dayStart.toISOString().split("T")[0],
    tokenCost,
    imageCost,
    totalCost: tokenCost + imageCost,
    postCount: postIds.size,
  };
}

// ── Monthly Cost ─────────────────────────────────────────────

/**
 * Sum all costs for a site in a specific month.
 */
export async function calculateMonthlyCost(
  siteId: string,
  month: Date,
): Promise<MonthlyCost> {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);

  const logs = await prisma.publishLog.findMany({
    where: {
      siteId,
      createdAt: { gte: monthStart, lte: monthEnd },
    },
    orderBy: { createdAt: "asc" },
  });

  let tokenCost = 0;
  let imageCost = 0;
  const postIds = new Set<string>();
  const dailyMap = new Map<string, { tokenCost: number; imageCost: number; postIds: Set<string> }>();

  for (const log of logs) {
    tokenCost += log.costTokens ?? 0;
    imageCost += log.costImages ?? 0;
    if (log.postId) postIds.add(log.postId);

    const dayKey = log.createdAt.toISOString().split("T")[0];
    const dayEntry = dailyMap.get(dayKey) ?? { tokenCost: 0, imageCost: 0, postIds: new Set<string>() };
    dayEntry.tokenCost += log.costTokens ?? 0;
    dayEntry.imageCost += log.costImages ?? 0;
    if (log.postId) dayEntry.postIds.add(log.postId);
    dailyMap.set(dayKey, dayEntry);
  }

  const dailyBreakdown: DailyCost[] = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      tokenCost: data.tokenCost,
      imageCost: data.imageCost,
      totalCost: data.tokenCost + data.imageCost,
      postCount: data.postIds.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
    tokenCost,
    imageCost,
    totalCost: tokenCost + imageCost,
    postCount: postIds.size,
    dailyBreakdown,
  };
}

// ── ROI Estimation ───────────────────────────────────────────

/**
 * Estimate ROI for a post based on analytics clicks vs generation cost.
 * Uses an estimated value per click (default $0.50 based on average CPC in LatAm markets).
 */
export async function estimateRoi(
  postId: string,
  valuePerClick: number = 0.5,
): Promise<RoiEstimate> {
  const cost = await calculatePostCost(postId);

  const analytics = await prisma.analytics.findMany({
    where: { postId },
  });

  const totalClicks = analytics.reduce((sum, a) => sum + a.clicks, 0);
  const totalImpressions = analytics.reduce((sum, a) => sum + a.impressions, 0);

  const estimatedValue = totalClicks * valuePerClick;
  const roi = cost.totalCost > 0
    ? ((estimatedValue - cost.totalCost) / cost.totalCost) * 100
    : 0;
  const costPerClick = totalClicks > 0 ? cost.totalCost / totalClicks : 0;

  return {
    postId,
    totalCost: cost.totalCost,
    totalClicks,
    totalImpressions,
    estimatedValue,
    roi,
    costPerClick,
  };
}
