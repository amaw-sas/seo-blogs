/**
 * Scheduling engine for automated post generation.
 * Generates random publish times within the site's configured window
 * and triggers the pipeline for due posts.
 */

import { PrismaClient } from "@prisma/client";
import { updateKeywordTrends } from "./trends/google-trends";

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────

interface SiteScheduleConfig {
  id: string;
  postsPerDay: number;
  windowStart: number; // hour 0-23
  windowEnd: number;
  domain: string;
}

interface ScheduledTime {
  hour: number;
  minute: number;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Generate random publish times for a site within its configured window.
 * Ensures minimum 2-hour separation between posts.
 */
export function calculateDailySchedule(
  site: SiteScheduleConfig,
): ScheduledTime[] {
  const { postsPerDay, windowStart, windowEnd } = site;

  // Handle window spanning midnight (e.g., 22-6)
  const windowHours =
    windowEnd > windowStart
      ? windowEnd - windowStart
      : 24 - windowStart + windowEnd;

  const minSeparationHours = 2;
  const maxPosts = Math.floor(windowHours / minSeparationHours);
  const actualPosts = Math.min(postsPerDay, maxPosts);

  if (actualPosts <= 0) return [];

  const times: ScheduledTime[] = [];
  const usedMinutes: number[] = [];

  for (let i = 0; i < actualPosts; i++) {
    let attempts = 0;
    let minute: number;

    do {
      // Random minute within the window
      const totalWindowMinutes = windowHours * 60;
      const randomMinute = Math.floor(Math.random() * totalWindowMinutes);
      minute = (windowStart * 60 + randomMinute) % (24 * 60);
      attempts++;
    } while (
      attempts < 100 &&
      usedMinutes.some(
        (used) => Math.abs(used - minute) < minSeparationHours * 60,
      )
    );

    usedMinutes.push(minute);
    times.push({
      hour: Math.floor(minute / 60) % 24,
      minute: minute % 60,
    });
  }

  return times.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

/**
 * Check all active sites and schedule posts that are due.
 * Returns an array of { siteId, keywordId } pairs ready for pipeline execution.
 */
export async function runScheduler(): Promise<
  { siteId: string; keywordId?: string }[]
> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // Get all active sites
  const sites = await prisma.site.findMany({
    where: { active: true },
    select: {
      id: true,
      postsPerDay: true,
      windowStart: true,
      windowEnd: true,
      domain: true,
    },
  });

  const dueItems: { siteId: string; keywordId?: string }[] = [];

  for (const site of sites) {
    // Count posts already created/scheduled today for this site
    const todayPostCount = await prisma.post.count({
      where: {
        siteId: site.id,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });

    if (todayPostCount >= site.postsPerDay) continue;

    // Refresh trend scores for pending keywords before selection
    try {
      await updateKeywordTrends(site.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[Scheduler] Failed to update trends for site ${site.id}: ${message}`,
      );
      // Non-fatal: continue with existing scores
    }

    // Check if there are posts scheduled but not yet processed
    const scheduledPosts = await prisma.post.count({
      where: {
        siteId: site.id,
        status: "draft",
        scheduledAt: { gte: todayStart, lte: todayEnd },
      },
    });

    const remaining = site.postsPerDay - todayPostCount;
    if (remaining <= 0 || scheduledPosts >= remaining) continue;

    // Check if current time falls within a scheduled slot
    const schedule = calculateDailySchedule(site);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const slot of schedule) {
      const slotMinutes = slot.hour * 60 + slot.minute;
      // Trigger if we're within 5 minutes of a scheduled slot
      if (
        Math.abs(currentMinutes - slotMinutes) <= 5 &&
        todayPostCount + dueItems.filter((d) => d.siteId === site.id).length <
          site.postsPerDay
      ) {
        // Pick the next pending keyword, sorted by trend score descending
        const nextKeyword = await prisma.keyword.findFirst({
          where: { siteId: site.id, status: "pending" },
          orderBy: [
            { trendScore: { sort: "desc", nulls: "last" } },
            { priority: "desc" },
            { createdAt: "asc" },
          ],
          select: { id: true },
        });

        dueItems.push({
          siteId: site.id,
          keywordId: nextKeyword?.id,
        });
      }
    }
  }

  return dueItems;
}
