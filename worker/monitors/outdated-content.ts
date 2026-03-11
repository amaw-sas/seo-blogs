/**
 * Outdated content monitor.
 * Identifies posts that may need updating based on age, declining metrics,
 * time-sensitive content, and broken links.
 */

import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";

const prisma = new PrismaClient();

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

interface OutdatedItem {
  postId: string;
  reason: string;
  priority: "high" | "medium" | "low";
  suggestedAction: string;
}

/**
 * Identify posts that may be outdated for a specific site or all sites.
 * Checks:
 *  1. Posts older than 6 months with declining impressions/clicks
 *  2. Posts with time-sensitive content (dates, prices, regulations)
 *  3. Posts with broken links
 * Uses Claude to analyze if content needs updating.
 * Creates notifications for admin.
 */
export async function checkOutdatedContent(
  siteId?: string,
): Promise<OutdatedItem[]> {
  const outdated: OutdatedItem[] = [];

  const siteFilter = siteId ? { siteId } : {};
  const sixMonthsAgo = new Date(Date.now() - SIX_MONTHS_MS);

  // 1. Posts older than 6 months with declining metrics
  const oldPosts = await prisma.post.findMany({
    where: {
      ...siteFilter,
      status: "published",
      publishedAt: { lte: sixMonthsAgo },
    },
    select: {
      id: true,
      title: true,
      keyword: true,
      siteId: true,
      publishedAt: true,
      contentMarkdown: true,
      contentHtml: true,
    },
  });

  for (const post of oldPosts) {
    const declining = await hasDecligningMetrics(post.id);
    if (declining) {
      outdated.push({
        postId: post.id,
        reason: `Post publicado hace más de 6 meses con métricas en descenso`,
        priority: "medium",
        suggestedAction: "Actualizar contenido y re-optimizar SEO",
      });
    }
  }

  // 2. Posts with time-sensitive content (analyzed by Claude)
  const recentPublished = await prisma.post.findMany({
    where: {
      ...siteFilter,
      status: "published",
      publishedAt: { lte: sixMonthsAgo },
    },
    select: {
      id: true,
      title: true,
      keyword: true,
      siteId: true,
      contentMarkdown: true,
      contentHtml: true,
    },
    take: 50, // Limit to avoid excessive API calls
  });

  const timeSensitive = await analyzeTimeSensitiveContent(recentPublished);
  outdated.push(...timeSensitive);

  // 3. Posts with broken links
  const postsWithBrokenLinks = await prisma.postLink.findMany({
    where: {
      status: "broken",
      post: siteId ? { siteId } : undefined,
    },
    select: {
      postId: true,
      url: true,
      post: { select: { title: true, siteId: true } },
    },
    distinct: ["postId"],
  });

  for (const link of postsWithBrokenLinks) {
    // Avoid duplicates
    if (!outdated.some((o) => o.postId === link.postId)) {
      outdated.push({
        postId: link.postId,
        reason: `Post contiene enlaces rotos`,
        priority: "high",
        suggestedAction: "Reemplazar enlaces rotos con fuentes actualizadas",
      });
    }
  }

  // Create notifications for admin
  for (const item of outdated) {
    const post = oldPosts.find((p: { id: string }) => p.id === item.postId) ??
      recentPublished.find((p: { id: string }) => p.id === item.postId);

    const notifSiteId = post?.siteId ?? siteId;

    if (notifSiteId) {
      await prisma.notification.create({
        data: {
          siteId: notifSiteId,
          type: "outdated_content",
          message: `[${item.priority.toUpperCase()}] ${post?.title ?? item.postId}: ${item.reason}. Acción sugerida: ${item.suggestedAction}`,
          channel: "email",
          sent: false,
        },
      });
    }
  }

  // Log results
  const logSiteId = siteId ?? oldPosts[0]?.siteId ?? recentPublished[0]?.siteId;
  if (logSiteId) {
    await log(logSiteId, "outdated_content_check", "success", {
      totalOutdated: outdated.length,
      byPriority: {
        high: outdated.filter((o) => o.priority === "high").length,
        medium: outdated.filter((o) => o.priority === "medium").length,
        low: outdated.filter((o) => o.priority === "low").length,
      },
    });
  }

  console.log(
    `[OutdatedContent] Check complete: ${outdated.length} outdated posts found`,
  );

  return outdated;
}

/**
 * Check if a post has declining impressions/clicks over the last 3 months.
 */
async function hasDecligningMetrics(postId: string): Promise<boolean> {
  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Compare last 3 months vs previous 3 months
  const [recent, previous] = await Promise.all([
    prisma.analytics.aggregate({
      where: {
        postId,
        date: { gte: threeMonthsAgo, lte: now },
      },
      _sum: { clicks: true, impressions: true },
    }),
    prisma.analytics.aggregate({
      where: {
        postId,
        date: { gte: sixMonthsAgo, lt: threeMonthsAgo },
      },
      _sum: { clicks: true, impressions: true },
    }),
  ]);

  const recentClicks = recent._sum.clicks ?? 0;
  const previousClicks = previous._sum.clicks ?? 0;
  const recentImpressions = recent._sum.impressions ?? 0;
  const previousImpressions = previous._sum.impressions ?? 0;

  // If no previous data, can't determine decline
  if (previousClicks === 0 && previousImpressions === 0) return false;

  // Declining if recent is less than 70% of previous
  const clicksDecline =
    previousClicks > 0 ? recentClicks / previousClicks < 0.7 : false;
  const impressionsDecline =
    previousImpressions > 0
      ? recentImpressions / previousImpressions < 0.7
      : false;

  return clicksDecline || impressionsDecline;
}

/**
 * Use Claude to analyze if posts contain time-sensitive information.
 */
async function analyzeTimeSensitiveContent(
  posts: {
    id: string;
    title: string;
    keyword: string;
    contentMarkdown: string | null;
    contentHtml: string;
  }[],
): Promise<OutdatedItem[]> {
  if (posts.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "[OutdatedContent] ANTHROPIC_API_KEY not set — skipping AI analysis",
    );
    return [];
  }

  const anthropic = new Anthropic({ apiKey });
  const results: OutdatedItem[] = [];

  // Process in small batches to limit token usage
  const BATCH_SIZE = 5;
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);

    const postSummaries = batch
      .map((p, idx) => {
        const content = p.contentMarkdown ?? p.contentHtml;
        // Truncate to avoid huge prompts
        const truncated =
          content.length > 2000 ? content.slice(0, 2000) + "..." : content;
        return `[Post ${idx + 1}] ID: ${p.id}\nTitle: ${p.title}\nKeyword: ${p.keyword}\nContent:\n${truncated}`;
      })
      .join("\n\n---\n\n");

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Analyze these blog posts and identify which ones contain time-sensitive information that may be outdated (dates, prices, regulations, version numbers, statistics with years, etc.).

For each post that needs updating, respond with a JSON array of objects with these fields:
- postId: the post ID
- reason: brief explanation of what's time-sensitive (in Spanish)
- priority: "high" if contains regulations/prices/dates, "medium" if contains statistics/versions, "low" otherwise
- suggestedAction: what to update (in Spanish)

If no posts need updating, return an empty array [].
Respond ONLY with the JSON array, no markdown formatting.

${postSummaries}`,
          },
        ],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "[]";
      const cleaned = text.replace(/```json?\n?/g, "").replace(/```/g, "").trim();

      const parsed = JSON.parse(cleaned) as OutdatedItem[];
      results.push(...parsed);
    } catch (error) {
      console.error(
        "[OutdatedContent] AI analysis failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return results;
}

async function log(
  siteId: string,
  eventType: string,
  status: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.publishLog.create({
      data: { siteId, eventType, status, metadata: (metadata as unknown) ?? undefined },
    });
  } catch {
    console.error(
      `[OutdatedContent] Failed to log: ${eventType} - ${status}`,
    );
  }
}
