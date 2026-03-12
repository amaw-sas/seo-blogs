/**
 * Historical impact analysis.
 * Checks what content performed well around a given date in previous years.
 */

import { prisma } from "../db/prisma";

// ── Types ────────────────────────────────────────────────────

export interface HistoricalImpactResult {
  topPerformingPosts: {
    id: string;
    title: string;
    keyword: string;
    views: number;
    clicks: number;
    impressions: number;
    publishedAt: Date | null;
  }[];
  suggestedThemes: string[];
  relevantHolidays: {
    id: string;
    name: string;
    date: Date;
    type: string;
    country: string;
  }[];
}

// ── Analysis ─────────────────────────────────────────────────

/**
 * Analyze historical content performance around a target date across previous years.
 * Looks at a +/- 15 day window in each prior year to find top performers and holiday context.
 */
export async function analyzeHistoricalImpact(
  siteId: string,
  date: Date,
): Promise<HistoricalImpactResult> {
  const currentYear = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Build date ranges for previous years (up to 3 years back)
  const dateRanges: { start: Date; end: Date }[] = [];
  for (let yearOffset = 1; yearOffset <= 3; yearOffset++) {
    const year = currentYear - yearOffset;
    const center = new Date(year, month, day);
    const start = new Date(center);
    start.setDate(start.getDate() - 15);
    const end = new Date(center);
    end.setDate(end.getDate() + 15);
    dateRanges.push({ start, end });
  }

  // Also include current year window
  const currentCenter = new Date(currentYear, month, day);
  const currentStart = new Date(currentCenter);
  currentStart.setDate(currentStart.getDate() - 15);
  const currentEnd = new Date(currentCenter);
  currentEnd.setDate(currentEnd.getDate() + 15);

  // Fetch analytics for all date ranges
  const analyticsPromises = dateRanges.map((range) =>
    prisma.analytics.findMany({
      where: {
        siteId,
        date: { gte: range.start, lte: range.end },
      },
      include: {
        post: {
          select: {
            id: true,
            title: true,
            keyword: true,
            publishedAt: true,
          },
        },
      },
      orderBy: { clicks: "desc" },
    }),
  );

  const allAnalytics = (await Promise.all(analyticsPromises)).flat();

  // Aggregate by post
  const postAggregates = new Map<
    string,
    {
      id: string;
      title: string;
      keyword: string;
      publishedAt: Date | null;
      views: number;
      clicks: number;
      impressions: number;
    }
  >();

  for (const entry of allAnalytics) {
    const existing = postAggregates.get(entry.postId);
    if (existing) {
      existing.views += entry.views;
      existing.clicks += entry.clicks;
      existing.impressions += entry.impressions;
    } else {
      postAggregates.set(entry.postId, {
        id: entry.post.id,
        title: entry.post.title,
        keyword: entry.post.keyword,
        publishedAt: entry.post.publishedAt,
        views: entry.views,
        clicks: entry.clicks,
        impressions: entry.impressions,
      });
    }
  }

  // Sort by clicks descending, take top 10
  const topPerformingPosts = Array.from(postAggregates.values())
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  // Extract themes from top performing keywords
  const suggestedThemes = extractThemes(topPerformingPosts.map((p) => p.keyword));

  // Find holidays near the target date (+/- 15 days, any year mapped to this year)
  const holidayStart = new Date(currentYear, month, day - 15);
  const holidayEnd = new Date(currentYear, month, day + 15);

  const holidays = await prisma.holiday.findMany({
    where: {
      siteHolidays: { some: { siteId } },
    },
  });

  // Filter holidays whose month/day falls in the window
  const relevantHolidays = holidays.filter((h) => {
    const hDate = new Date(h.date);
    const normalized = new Date(currentYear, hDate.getMonth(), hDate.getDate());
    return normalized >= holidayStart && normalized <= holidayEnd;
  }).map((h) => ({
    id: h.id,
    name: h.name,
    date: h.date,
    type: h.type,
    country: h.country,
  }));

  return { topPerformingPosts, suggestedThemes, relevantHolidays };
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Extract broad content themes from a list of keywords.
 * Groups similar keywords and returns unique theme suggestions.
 */
function extractThemes(keywords: string[]): string[] {
  if (keywords.length === 0) return [];

  // Deduplicate and normalize
  const normalized = [...new Set(keywords.map((k) => k.toLowerCase().trim()))];

  // Group by common root words (simple approach: 2+ word overlap)
  const themes: string[] = [];
  const seen = new Set<string>();

  for (const kw of normalized) {
    const words = kw.split(/\s+/);
    // Use the full keyword as a theme if not too similar to existing
    const isDuplicate = themes.some((t) => {
      const tWords = t.split(/\s+/);
      const overlap = words.filter((w) => tWords.includes(w));
      return overlap.length >= Math.min(2, Math.min(words.length, tWords.length));
    });

    if (!isDuplicate && !seen.has(kw)) {
      themes.push(kw);
      seen.add(kw);
    }
  }

  return themes.slice(0, 10);
}
