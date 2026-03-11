/**
 * Worker entry point.
 * Runs the scheduler on a cron interval (every 5 minutes),
 * cron-based monitors (broken links, outdated content, weekly report,
 * holidays, regulations), and can be triggered via API call.
 */

import { runScheduler } from "./scheduler";
import { runPipeline } from "./pipeline";
import { checkBrokenLinks } from "./monitors/broken-links";
import { checkOutdatedContent } from "./monitors/outdated-content";
import { checkUpcomingHolidays } from "./monitors/holiday-monitor";
import { checkRegulations } from "./monitors/regulations";
import { generateWeeklyReport } from "./reports/weekly-report";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ONE_MINUTE_MS = 60 * 1000;

/**
 * Start the worker loop. Checks the scheduler every 5 minutes
 * and triggers pipelines for due posts. Also runs cron-based monitors.
 */
export async function startWorker(): Promise<void> {
  console.log("[Worker] Starting content generation worker...");

  // Run immediately on start
  await runSchedulerCycle();

  // Scheduler: every 5 minutes
  setInterval(() => {
    runSchedulerCycle().catch((error) => {
      console.error("[Worker] Scheduler cycle failed:", error);
    });
  }, CHECK_INTERVAL_MS);

  // Cron check: every minute, evaluate if any cron task is due
  setInterval(() => {
    runCronTasks().catch((error) => {
      console.error("[Worker] Cron task failed:", error);
    });
  }, ONE_MINUTE_MS);
}

// ── Cron schedule tracking ──────────────────────────────────

interface CronTask {
  name: string;
  /** Check if this task should run now */
  isDue: (now: Date) => boolean;
  /** Execute the task */
  run: () => Promise<void>;
  /** Track last run to avoid double execution */
  lastRun?: string;
}

const cronTasks: CronTask[] = [
  {
    // Daily at 3:00 AM — broken link check
    name: "broken_links",
    isDue: (now) => now.getHours() === 3 && now.getMinutes() === 0,
    run: async () => {
      console.log("[Worker] Running daily broken link check...");
      const summary = await checkBrokenLinks();
      console.log(
        `[Worker] Broken links: ${summary.checked} checked, ${summary.broken} broken, ${summary.fixed} fixed`,
      );
    },
  },
  {
    // Sunday at 2:00 AM — outdated content check
    name: "outdated_content",
    isDue: (now) =>
      now.getDay() === 0 && now.getHours() === 2 && now.getMinutes() === 0,
    run: async () => {
      console.log("[Worker] Running weekly outdated content check...");
      const results = await checkOutdatedContent();
      console.log(
        `[Worker] Outdated content: ${results.length} items found`,
      );
    },
  },
  {
    // Monday at 8:00 AM — weekly report
    name: "weekly_report",
    isDue: (now) =>
      now.getDay() === 1 && now.getHours() === 8 && now.getMinutes() === 0,
    run: async () => {
      console.log("[Worker] Generating weekly report...");
      await generateWeeklyReport();
      console.log("[Worker] Weekly report sent.");
    },
  },
  {
    // Daily at 6:00 AM — holiday monitor
    name: "holiday_monitor",
    isDue: (now) => now.getHours() === 6 && now.getMinutes() === 0,
    run: async () => {
      console.log("[Worker] Checking upcoming holidays...");
      await checkUpcomingHolidays();
      console.log("[Worker] Holiday check complete.");
    },
  },
  {
    // Daily at 4:00 AM — regulation monitor
    name: "regulation_monitor",
    isDue: (now) => now.getHours() === 4 && now.getMinutes() === 0,
    run: async () => {
      console.log("[Worker] Checking regulations...");
      await checkRegulations();
      console.log("[Worker] Regulation check complete.");
    },
  },
];

/**
 * Evaluate all cron tasks and run those that are due.
 * Uses date-based dedup to avoid running the same task twice in one minute.
 */
async function runCronTasks(): Promise<void> {
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

  for (const task of cronTasks) {
    if (!task.isDue(now)) continue;
    if (task.lastRun === dateKey) continue;

    task.lastRun = dateKey;

    try {
      await task.run();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Cron task "${task.name}" failed: ${message}`);
    }
  }
}

/**
 * Run a single scheduler cycle: check for due posts and trigger pipelines.
 */
async function runSchedulerCycle(): Promise<void> {
  console.log(`[Worker] Running scheduler check at ${new Date().toISOString()}`);

  try {
    const dueItems = await runScheduler();

    if (dueItems.length === 0) {
      console.log("[Worker] No posts due for generation.");
      return;
    }

    console.log(`[Worker] Found ${dueItems.length} post(s) to generate.`);

    for (const item of dueItems) {
      try {
        console.log(
          `[Worker] Starting pipeline for site ${item.siteId}${item.keywordId ? `, keyword ${item.keywordId}` : ""}`,
        );

        const result = await runPipeline(item.siteId, item.keywordId);

        console.log(
          `[Worker] Pipeline complete: post ${result.postId}, SEO score ${result.seoScore}, ${result.wordCount} words, ${result.attempts} attempt(s)`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[Worker] Pipeline failed for site ${item.siteId}: ${message}`,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Worker] Scheduler error: ${message}`);
  }
}

/**
 * Trigger a single pipeline run directly (for API-triggered generation).
 */
export async function triggerPipeline(
  siteId: string,
  keywordId?: string,
): Promise<{ postId: string; seoScore: number; wordCount: number; attempts: number }> {
  return runPipeline(siteId, keywordId);
}

// Auto-start if run directly
if (require.main === module) {
  startWorker().catch((error) => {
    console.error("[Worker] Fatal error:", error);
    process.exit(1);
  });
}
