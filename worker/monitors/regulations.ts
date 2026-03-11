/**
 * Regulation monitor.
 * Checks source URLs for regulation changes and triggers new content
 * generation when updates are detected.
 */

import { PrismaClient } from "@prisma/client";
import { runPipeline } from "../pipeline";

const prisma = new PrismaClient();

/**
 * For each site with auto_monitor regulations:
 * 1. Fetch the source URL
 * 2. Compare with stored data
 * 3. If changed, generate a new post about the update
 * 4. Mark previous regulation post with "Información no vigente" + link to new post
 */
export async function checkRegulations(): Promise<void> {
  const regulations = await prisma.regulation.findMany({
    where: { autoMonitor: true },
    include: { site: { select: { id: true, domain: true, active: true } } },
  });

  for (const regulation of regulations) {
    if (!regulation.site.active) continue;
    if (!regulation.sourceUrl) {
      await log(regulation.siteId, "regulation_check", "failed", {
        regulationId: regulation.id,
        error: "No source URL configured",
      });
      continue;
    }

    try {
      // Step 1: Fetch source URL
      const response = await fetch(regulation.sourceUrl, {
        headers: { "User-Agent": "SEO-Blogs-Monitor/1.0" },
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        await log(regulation.siteId, "regulation_fetch", "failed", {
          regulationId: regulation.id,
          status: response.status,
          url: regulation.sourceUrl,
        });
        continue;
      }

      const sourceContent = await response.text();

      // Step 2: Compare with stored data — hash-based comparison
      const currentHash = simpleHash(sourceContent);
      const storedData = regulation.data as Record<string, unknown>;
      const storedHash = storedData._contentHash as string | undefined;

      if (storedHash === currentHash) {
        await log(regulation.siteId, "regulation_check", "success", {
          regulationId: regulation.id,
          changed: false,
        });
        continue;
      }

      await log(regulation.siteId, "regulation_change_detected", "success", {
        regulationId: regulation.id,
        type: regulation.type,
      });

      // Step 3: Generate new post about the regulation update
      const updateKeyword = `${regulation.type} actualización ${new Date().toISOString().slice(0, 10)}`;

      const keyword = await prisma.keyword.upsert({
        where: {
          siteId_phrase: { siteId: regulation.siteId, phrase: updateKeyword },
        },
        update: {},
        create: {
          siteId: regulation.siteId,
          phrase: updateKeyword,
          priority: 15, // Very high priority for regulation updates
          status: "pending",
        },
      });

      let newPostId: string | null = null;

      if (keyword.status === "pending") {
        const result = await runPipeline(regulation.siteId, keyword.id);
        newPostId = result.postId;

        await log(regulation.siteId, "regulation_post_generated", "success", {
          regulationId: regulation.id,
          postId: newPostId,
        });
      }

      // Step 4: Mark previous regulation posts as outdated
      if (newPostId) {
        const previousPosts = await prisma.post.findMany({
          where: {
            siteId: regulation.siteId,
            keyword: { contains: regulation.type, mode: "insensitive" },
            id: { not: newPostId },
            status: "published",
          },
        });

        const newPost = await prisma.post.findUnique({
          where: { id: newPostId },
          select: { slug: true },
        });

        for (const oldPost of previousPosts) {
          const disclaimer = `<div class="regulation-outdated" style="background:#fff3cd;border:1px solid #ffc107;padding:1rem;margin-bottom:1.5rem;border-radius:4px;"><strong>⚠ Información no vigente.</strong> Consulta la <a href="https://${regulation.site.domain}/${newPost?.slug ?? ""}">versión actualizada</a>.</div>`;

          await prisma.post.update({
            where: { id: oldPost.id },
            data: {
              contentHtml: disclaimer + oldPost.contentHtml,
            },
          });

          await log(regulation.siteId, "regulation_post_outdated", "success", {
            oldPostId: oldPost.id,
            newPostId,
          });
        }
      }

      // Update stored regulation data with new hash
      await prisma.regulation.update({
        where: { id: regulation.id },
        data: {
          data: { ...storedData, _contentHash: currentHash, _lastChecked: new Date().toISOString() },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await log(regulation.siteId, "regulation_check", "failed", {
        regulationId: regulation.id,
        error: message,
      });
    }
  }
}

/**
 * Simple hash function for content comparison.
 * Not cryptographic — used only for change detection.
 */
function simpleHash(str: string): string {
  let hash = 0;
  const normalized = str.replace(/\s+/g, " ").trim();
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

async function log(
  siteId: string,
  eventType: string,
  status: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.publishLog.create({
      data: { siteId, eventType, status, metadata: metadata ?? undefined },
    });
  } catch {
    console.error(`[RegulationMonitor] Failed to log: ${eventType} - ${status}`);
  }
}
