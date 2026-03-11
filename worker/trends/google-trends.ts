/**
 * Google Trends integration.
 * Fetches trend scores for keywords and updates them in the database.
 */

import googleTrends from "google-trends-api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────

export interface TrendResult {
  keyword: string;
  score: number; // 0-100 interest score
  direction: "rising" | "falling" | "stable";
}

interface TimelineDataPoint {
  value: number[];
}

interface InterestOverTimeResult {
  default: {
    timelineData: TimelineDataPoint[];
  };
}

// ── Public API ───────────────────────────────────────────────

/**
 * Fetch trend data for a single keyword.
 * Returns interest score 0-100 and trend direction.
 */
export async function getTrendScore(
  keyword: string,
  geo: string = "CO",
): Promise<TrendResult> {
  const results = await googleTrends.interestOverTime({
    keyword,
    geo,
    startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // last 90 days
  });

  const parsed = JSON.parse(results) as InterestOverTimeResult;
  const timeline = parsed.default.timelineData;

  if (timeline.length === 0) {
    return { keyword, score: 0, direction: "stable" };
  }

  // Current score = last data point
  const lastPoint = timeline[timeline.length - 1];
  const score = lastPoint.value[0] ?? 0;

  // Direction: compare last 30% of data to first 30%
  const splitIdx = Math.floor(timeline.length * 0.3);
  const earlySlice = timeline.slice(0, splitIdx);
  const lateSlice = timeline.slice(-splitIdx);

  const earlyAvg =
    earlySlice.reduce((sum, p) => sum + (p.value[0] ?? 0), 0) /
    (earlySlice.length || 1);
  const lateAvg =
    lateSlice.reduce((sum, p) => sum + (p.value[0] ?? 0), 0) /
    (lateSlice.length || 1);

  const changeRatio = earlyAvg > 0 ? (lateAvg - earlyAvg) / earlyAvg : 0;

  let direction: "rising" | "falling" | "stable";
  if (changeRatio > 0.15) {
    direction = "rising";
  } else if (changeRatio < -0.15) {
    direction = "falling";
  } else {
    direction = "stable";
  }

  return { keyword, score, direction };
}

/**
 * Update trend_score for all pending keywords of a site.
 * Processes keywords sequentially to avoid rate limiting.
 */
export async function updateKeywordTrends(siteId: string): Promise<number> {
  const keywords = await prisma.keyword.findMany({
    where: { siteId, status: "pending" },
    select: { id: true, phrase: true },
  });

  let updated = 0;

  for (const kw of keywords) {
    try {
      const trend = await getTrendScore(kw.phrase);

      await prisma.keyword.update({
        where: { id: kw.id },
        data: { trendScore: trend.score },
      });

      updated++;

      // Rate limiting: wait 1 second between requests
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[Trends] Failed to fetch trend for "${kw.phrase}": ${message}`,
      );
      // Non-fatal: continue with next keyword
    }
  }

  return updated;
}
