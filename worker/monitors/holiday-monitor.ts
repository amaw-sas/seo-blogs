/**
 * Holiday monitor.
 * Checks upcoming holidays for each active site and triggers the content
 * pipeline with a holiday-themed keyword when a holiday is within range.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { runPipeline } from "../pipeline";

const prisma = new PrismaClient();

/**
 * For each active site, check if any activated holiday is within daysInAdvance days.
 * If so, trigger the pipeline with a holiday-themed keyword.
 * Only generates if no holiday post already exists for that date+site.
 */
export async function checkUpcomingHolidays(): Promise<void> {
  const now = new Date();

  const activeSites = await prisma.site.findMany({
    where: { active: true },
    select: {
      id: true,
      domain: true,
      siteHolidays: {
        include: { holiday: true },
      },
    },
  });

  for (const site of activeSites) {
    for (const siteHoliday of site.siteHolidays) {
      const { holiday, daysInAdvance } = siteHoliday;
      const holidayDate = new Date(holiday.date);

      const diffMs = holidayDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Holiday must be upcoming and within the advance window
      if (diffDays < 0 || diffDays > daysInAdvance) continue;

      // Check if a post already exists for this holiday + site
      const existingPost = await prisma.post.findFirst({
        where: {
          siteId: site.id,
          keyword: { contains: holiday.name, mode: "insensitive" },
          createdAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      });

      if (existingPost) {
        await log(site.id, "holiday_check", "success", {
          holiday: holiday.name,
          skipped: true,
          reason: "Post already exists",
        });
        continue;
      }

      // Create a holiday-themed keyword
      const holidayKeyword = `${holiday.name} ${holidayDate.getFullYear()}`;

      try {
        // Ensure keyword exists in DB
        const keyword = await prisma.keyword.upsert({
          where: {
            siteId_phrase: { siteId: site.id, phrase: holidayKeyword },
          },
          update: {},
          create: {
            siteId: site.id,
            phrase: holidayKeyword,
            priority: 10, // High priority for holiday content
            status: "pending",
          },
        });

        if (keyword.status !== "pending") {
          continue;
        }

        await log(site.id, "holiday_trigger", "success", {
          holiday: holiday.name,
          keyword: holidayKeyword,
          daysUntil: diffDays,
        });

        await runPipeline(site.id, keyword.id);

        await log(site.id, "holiday_pipeline", "success", {
          holiday: holiday.name,
          keyword: holidayKeyword,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await log(site.id, "holiday_pipeline", "failed", {
          holiday: holiday.name,
          keyword: holidayKeyword,
          error: message,
        });
      }
    }
  }
}

async function log(
  siteId: string,
  eventType: string,
  status: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.publishLog.create({
      data: { siteId, eventType, status, metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  } catch {
    console.error(`[HolidayMonitor] Failed to log: ${eventType} - ${status}`);
  }
}
