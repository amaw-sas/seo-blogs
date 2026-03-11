/**
 * Auto-linking: retroactive internal links and conversion links.
 * After publishing a new post, inserts contextual links to it in related existing posts.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────

interface RelatedPost {
  id: string;
  title: string;
  slug: string;
  keyword: string;
  contentHtml: string;
}

interface AutoLinkResult {
  updatedPostIds: string[];
  linksInserted: number;
}

// ── Public API ───────────────────────────────────────────────

/**
 * After publishing a new post, find 2-5 related existing posts on the same site
 * and insert a contextual internal link to the new post in each.
 */
export async function addRetroactiveLinks(
  newPost: { id: string; title: string; slug: string; keyword: string },
  siteId: string,
): Promise<AutoLinkResult> {
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: siteId },
    select: { domain: true },
  });

  const existingPosts = await prisma.post.findMany({
    where: {
      siteId,
      id: { not: newPost.id },
      status: { in: ["published", "review"] },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      keyword: true,
      contentHtml: true,
    },
  });

  const related = findRelatedPosts(newPost, existingPosts).slice(0, 5);

  if (related.length < 2) {
    return { updatedPostIds: [], linksInserted: 0 };
  }

  const newPostUrl = `https://${site.domain}/${newPost.slug}`;

  const updatedIds = await updateExistingPostsWithLink(
    related.map((p) => p.id),
    newPostUrl,
    newPost.title,
    siteId,
  );

  return {
    updatedPostIds: updatedIds,
    linksInserted: updatedIds.length,
  };
}

/**
 * Insert a conversion link with contextual anchor text into post HTML content.
 * Places the link in the middle third of the article for natural reading flow.
 */
export function addConversionLink(
  contentHtml: string,
  conversionUrl: string,
  keyword: string,
): string {
  if (!conversionUrl) return contentHtml;

  const paragraphs = contentHtml.match(/<p>[^<]+<\/p>/g);
  if (!paragraphs || paragraphs.length === 0) return contentHtml;

  // Target a paragraph in the middle third of the content
  const middleStart = Math.floor(paragraphs.length / 3);
  const middleEnd = Math.floor((paragraphs.length * 2) / 3);
  const targetIdx = Math.min(
    middleStart + Math.floor((middleEnd - middleStart) / 2),
    paragraphs.length - 1,
  );

  const targetParagraph = paragraphs[targetIdx];
  if (!targetParagraph) return contentHtml;

  const anchorText = buildConversionAnchor(keyword);
  const linkTag = ` <a href="${conversionUrl}" class="conversion-link">${anchorText}</a>`;

  const enriched = targetParagraph.replace(/<\/p>$/, `${linkTag}</p>`);

  return contentHtml.replace(targetParagraph, enriched);
}

/**
 * Update existing posts in DB by inserting an internal link to the new post.
 * Creates a PostLink record and updates the HTML content.
 */
export async function updateExistingPostsWithLink(
  postIds: string[],
  newPostUrl: string,
  newPostTitle: string,
  siteId: string,
): Promise<string[]> {
  const updatedIds: string[] = [];

  for (const postId of postIds) {
    try {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { id: true, contentHtml: true },
      });

      if (!post) continue;

      // Check if link already exists in this post
      if (post.contentHtml.includes(newPostUrl)) continue;

      const updatedHtml = insertInternalLink(
        post.contentHtml,
        newPostUrl,
        newPostTitle,
      );

      // Skip if insertion failed (no suitable paragraph found)
      if (updatedHtml === post.contentHtml) continue;

      await prisma.$transaction([
        prisma.post.update({
          where: { id: postId },
          data: { contentHtml: updatedHtml },
        }),
        prisma.postLink.create({
          data: {
            postId,
            url: newPostUrl,
            anchorText: newPostTitle,
            type: "internal",
          },
        }),
        prisma.postVersion.create({
          data: {
            postId,
            contentHtml: updatedHtml,
            changedBy: "auto-linker",
          },
        }),
      ]);

      updatedIds.push(postId);
    } catch {
      // Individual post failure should not block others
      console.error(`Failed to update post ${postId} with retroactive link`);
    }
  }

  return updatedIds;
}

// ── Internal Helpers ─────────────────────────────────────────

/**
 * Score and rank existing posts by keyword/title relevance to the new post.
 * Uses word overlap as a lightweight similarity signal.
 */
function findRelatedPosts(
  newPost: { keyword: string; title: string },
  candidates: RelatedPost[],
): RelatedPost[] {
  const newTokens = tokenize(`${newPost.keyword} ${newPost.title}`);

  const scored = candidates.map((post) => {
    const postTokens = tokenize(`${post.keyword} ${post.title}`);
    let overlap = 0;
    for (const token of newTokens) {
      if (postTokens.has(token)) overlap++;
    }
    const score = newTokens.size > 0 ? overlap / newTokens.size : 0;
    return { post, score };
  });

  return scored
    .filter((s) => s.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.post);
}

function tokenize(text: string): Set<string> {
  const stopwords = new Set([
    "de", "la", "el", "en", "y", "a", "los", "las", "del",
    "un", "una", "por", "con", "para", "es", "al", "lo",
    "como", "su", "se", "que",
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-záéíóúüñ\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !stopwords.has(w)),
  );
}

function buildConversionAnchor(keyword: string): string {
  const templates = [
    `Descubre más sobre ${keyword}`,
    `Conoce las mejores opciones de ${keyword}`,
    `Encuentra lo que necesitas sobre ${keyword}`,
  ];
  return templates[Math.floor(Math.random() * templates.length)]!;
}

/**
 * Insert an internal link into a post's HTML content.
 * Targets a paragraph in the last third of the article.
 */
function insertInternalLink(
  html: string,
  url: string,
  anchorText: string,
): string {
  const paragraphs = html.match(/<p>[^<]+<\/p>/g);
  if (!paragraphs || paragraphs.length === 0) return html;

  // Insert in the last third for contextual relevance
  const targetIdx = Math.min(
    Math.floor((paragraphs.length * 2) / 3),
    paragraphs.length - 1,
  );

  const targetParagraph = paragraphs[targetIdx];
  if (!targetParagraph) return html;

  const linkTag = ` <a href="${url}">${anchorText}</a>`;
  const enriched = targetParagraph.replace(/<\/p>$/, `${linkTag}</p>`);

  return html.replace(targetParagraph, enriched);
}
