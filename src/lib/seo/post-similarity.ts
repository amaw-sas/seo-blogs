/**
 * Post similarity detection.
 * Compares a post's keyword/title against all other posts on the same site
 * to detect potential content overlap or cannibalization.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────

export interface SimilarPost {
  id: string;
  title: string;
  slug: string;
  keyword: string;
  status: string;
  similarity: number;
}

// ── Public API ───────────────────────────────────────────────

/**
 * Find posts on the same site that are similar to the given post.
 * Compares keyword and title tokens using Jaccard similarity.
 *
 * @returns Array of similar posts sorted by similarity (descending).
 *          Only includes posts with similarity >= 0.2.
 */
export async function findSimilarPosts(
  postId: string,
  siteId: string,
): Promise<SimilarPost[]> {
  const targetPost = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, title: true, keyword: true },
  });

  if (!targetPost) {
    throw new Error(`Post ${postId} not found`);
  }

  const otherPosts = await prisma.post.findMany({
    where: {
      siteId,
      id: { not: postId },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      keyword: true,
      status: true,
    },
  });

  const targetTokens = tokenize(`${targetPost.keyword} ${targetPost.title}`);

  const results: SimilarPost[] = [];

  for (const post of otherPosts) {
    const postTokens = tokenize(`${post.keyword} ${post.title}`);
    const similarity = jaccardSimilarity(targetTokens, postTokens);

    if (similarity >= 0.2) {
      results.push({
        id: post.id,
        title: post.title,
        slug: post.slug,
        keyword: post.keyword,
        status: post.status,
        similarity: Math.round(similarity * 1000) / 1000,
      });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity);
}

// ── Helpers ──────────────────────────────────────────────────

const STOPWORDS = new Set([
  "de", "la", "el", "en", "y", "a", "los", "las", "del",
  "un", "una", "por", "con", "para", "es", "al", "lo",
  "como", "su", "se", "que",
]);

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-záéíóúüñ\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

  const tokens = new Set(words);

  // Add bigrams for better phrase matching
  for (let i = 0; i < words.length - 1; i++) {
    tokens.add(`${words[i]}_${words[i + 1]}`);
  }

  return tokens;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
