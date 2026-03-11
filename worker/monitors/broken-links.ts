/**
 * Broken links monitor.
 * Checks all active links in post_links table via HEAD requests
 * and marks broken ones in the database.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REQUEST_TIMEOUT_MS = 10_000;
const CONCURRENCY_LIMIT = 10;

interface BrokenLinkSummary {
  checked: number;
  broken: number;
  fixed: number;
}

/**
 * Check all active links for a specific site or across all sites.
 * Makes HEAD requests with a 10s timeout.
 * Returns summary of checked, broken, and fixed links.
 */
export async function checkBrokenLinks(
  siteId?: string,
): Promise<BrokenLinkSummary> {
  const where: { post?: { siteId: string } } = {};
  if (siteId) {
    where.post = { siteId };
  }

  const links = await prisma.postLink.findMany({
    where,
    select: {
      id: true,
      url: true,
      status: true,
      post: { select: { siteId: true } },
    },
  });

  let checked = 0;
  let broken = 0;
  let fixed = 0;

  // Process in batches to avoid overwhelming targets
  for (let i = 0; i < links.length; i += CONCURRENCY_LIMIT) {
    const batch = links.slice(i, i + CONCURRENCY_LIMIT);

    const results = await Promise.allSettled(
      batch.map(async (link) => {
        checked++;

        const isBroken = await isLinkBroken(link.url);

        if (isBroken && link.status === "active") {
          await prisma.postLink.update({
            where: { id: link.id },
            data: { status: "broken" },
          });
          broken++;
        } else if (!isBroken && link.status === "broken") {
          await prisma.postLink.update({
            where: { id: link.id },
            data: { status: "active" },
          });
          fixed++;
        }

        return { linkId: link.id, isBroken };
      }),
    );

    // Count failures from settled promises as broken
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[BrokenLinks] Batch item failed:", result.reason);
      }
    }
  }

  // Determine the siteId for logging
  const logSiteId = siteId ?? links[0]?.post?.siteId;

  if (logSiteId) {
    await log(logSiteId, "broken_link_check", "success", {
      checked,
      broken,
      fixed,
    });
  }

  // If checking all sites, log a global entry using the first available site
  if (!siteId && links.length > 0) {
    const siteIds = [...new Set(links.map((l) => l.post.siteId))];
    for (const sid of siteIds) {
      const siteLinks = links.filter((l) => l.post.siteId === sid);
      const siteBroken = siteLinks.filter(
        (l) => l.status === "active",
      ).length; // approximate — already updated
      await log(sid, "broken_link_check", "success", {
        checked: siteLinks.length,
        brokenApprox: siteBroken,
      });
    }
  }

  console.log(
    `[BrokenLinks] Check complete: ${checked} checked, ${broken} broken, ${fixed} fixed`,
  );

  return { checked, broken, fixed };
}

/**
 * Check if a single URL is broken.
 * Uses HEAD request with fallback to GET on 405.
 */
async function isLinkBroken(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "SEO-Blogs-LinkChecker/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // Some servers don't support HEAD — retry with GET
    if (response.status === 405) {
      const getResponse = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "SEO-Blogs-LinkChecker/1.0",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return getResponse.status >= 400;
    }

    return response.status >= 400;
  } catch {
    // Timeout or network error — treat as broken
    return true;
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
      data: {
        siteId,
        eventType,
        status,
        metadata: (metadata ?? undefined) as undefined | Record<string, string | number | boolean | null>,
      },
    });
  } catch {
    console.error(
      `[BrokenLinks] Failed to log: ${eventType} - ${status}`,
    );
  }
}
