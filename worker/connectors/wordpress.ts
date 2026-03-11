/**
 * WordPress REST API connector for publishing and updating posts.
 * After successful publish, pings Google with the site's sitemap URL.
 */

import { pingGoogle } from "../../src/lib/seo/sitemap";

// ── Types ────────────────────────────────────────────────────

export interface WpPostData {
  title: string;
  slug: string;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  status: "draft" | "publish" | "pending";
  categories?: number[];
  tags?: number[];
  featuredMediaId?: number;
}

export interface WpSiteConfig {
  apiUrl: string;
  apiUser: string;
  apiPassword: string;
  domain?: string;
}

interface WpApiResponse {
  id: number;
  link: string;
  status: string;
  [key: string]: unknown;
}

// ── Constants ────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BACKOFF_INTERVALS_MS = [30_000, 60_000, 120_000];

// ── Public API ───────────────────────────────────────────────

/**
 * Publish a new post to WordPress via REST API.
 * Retries up to 3 times with exponential backoff (30s, 60s, 120s).
 *
 * @returns The external WordPress post ID as a string.
 */
export async function publishToWordPress(
  post: WpPostData,
  site: WpSiteConfig,
): Promise<string> {
  const body = buildWpBody(post);
  const url = `${normalizeApiUrl(site.apiUrl)}/wp/v2/posts`;

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: buildHeaders(site),
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as WpApiResponse;
  const externalId = String(data.id);

  // Post-publish: ping Google with the sitemap
  if (site.domain) {
    const sitemapUrl = `https://${site.domain}/sitemap.xml`;
    pingGoogle(sitemapUrl).catch((err) => {
      console.error(`[WordPress] Sitemap ping failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  return externalId;
}

/**
 * Update an existing WordPress post.
 * Retries up to 3 times with exponential backoff.
 *
 * @returns The external WordPress post ID as a string.
 */
export async function updateWordPressPost(
  externalId: string,
  post: WpPostData,
  site: WpSiteConfig,
): Promise<string> {
  const body = buildWpBody(post);
  const url = `${normalizeApiUrl(site.apiUrl)}/wp/v2/posts/${externalId}`;

  const response = await fetchWithRetry(url, {
    method: "PUT",
    headers: buildHeaders(site),
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as WpApiResponse;
  return String(data.id);
}

// ── Helpers ──────────────────────────────────────────────────

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}

function buildHeaders(site: WpSiteConfig): Record<string, string> {
  const credentials = Buffer.from(
    `${site.apiUser}:${site.apiPassword}`,
  ).toString("base64");

  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${credentials}`,
  };
}

function buildWpBody(
  post: WpPostData,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: post.title,
    slug: post.slug,
    content: post.contentHtml,
    status: post.status,
    meta: {
      _yoast_wpseo_title: post.metaTitle,
      _yoast_wpseo_metadesc: post.metaDescription,
    },
  };

  if (post.categories?.length) body.categories = post.categories;
  if (post.tags?.length) body.tags = post.tags;
  if (post.featuredMediaId) body.featured_media = post.featuredMediaId;

  return body;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) return response;

      // Don't retry client errors (4xx) except 429
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const body = await response.text();
        throw new Error(
          `WordPress API error ${response.status}: ${body}`,
        );
      }

      lastError = new Error(
        `WordPress API returned ${response.status}`,
      );
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));

      // Don't retry non-retryable errors
      if (lastError.message.includes("WordPress API error")) {
        throw lastError;
      }
    }

    // Wait before retry (skip wait on last attempt)
    if (attempt < MAX_RETRIES) {
      const delay = BACKOFF_INTERVALS_MS[attempt] ?? 120_000;
      await sleep(delay);
    }
  }

  throw new Error(
    `WordPress publish failed after ${MAX_RETRIES} retries: ${lastError?.message}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
