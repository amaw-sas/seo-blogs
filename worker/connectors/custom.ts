/**
 * Custom blog API connector.
 * Publishes posts with dual content: HTML for humans, markdown for AI bots.
 */

// ── Types ────────────────────────────────────────────────────

export interface CustomPostData {
  title: string;
  slug: string;
  contentHtml: string;
  contentMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  status: "draft" | "published";
  keyword: string;
  tags?: string[];
  featuredImageUrl?: string;
  featuredImageAlt?: string;
}

export interface CustomSiteConfig {
  apiUrl: string;
  apiUser?: string;
  apiPassword?: string;
  domain: string;
}

interface CustomApiResponse {
  id: string;
  url: string;
  status: string;
  [key: string]: unknown;
}

// ── Constants ────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BACKOFF_INTERVALS_MS = [30_000, 60_000, 120_000];

// ── Public API ───────────────────────────────────────────────

/**
 * Publish to a custom blog API with dual-content delivery:
 * - HTML content for human visitors
 * - Markdown content for AI bots (served via content negotiation or separate endpoint)
 *
 * The custom blog API is expected to accept both formats and handle
 * serving the appropriate version based on the User-Agent.
 *
 * @returns The external post ID as a string.
 */
export async function publishToCustomBlog(
  post: CustomPostData,
  site: CustomSiteConfig,
): Promise<string> {
  const body: Record<string, unknown> = {
    title: post.title,
    slug: post.slug,
    content: {
      html: post.contentHtml,
      markdown: post.contentMarkdown,
    },
    meta: {
      title: post.metaTitle,
      description: post.metaDescription,
    },
    keyword: post.keyword,
    status: post.status,
    tags: post.tags ?? [],
  };

  if (post.featuredImageUrl) {
    body.featuredImage = {
      url: post.featuredImageUrl,
      alt: post.featuredImageAlt ?? post.title,
    };
  }

  const url = `${normalizeApiUrl(site.apiUrl)}/posts`;

  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: buildHeaders(site),
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as CustomApiResponse;
  return String(data.id);
}

/**
 * Update an existing post on the custom blog.
 *
 * @returns The external post ID as a string.
 */
export async function updateCustomBlogPost(
  externalId: string,
  post: CustomPostData,
  site: CustomSiteConfig,
): Promise<string> {
  const body: Record<string, unknown> = {
    title: post.title,
    slug: post.slug,
    content: {
      html: post.contentHtml,
      markdown: post.contentMarkdown,
    },
    meta: {
      title: post.metaTitle,
      description: post.metaDescription,
    },
    keyword: post.keyword,
    status: post.status,
    tags: post.tags ?? [],
  };

  if (post.featuredImageUrl) {
    body.featuredImage = {
      url: post.featuredImageUrl,
      alt: post.featuredImageAlt ?? post.title,
    };
  }

  const url = `${normalizeApiUrl(site.apiUrl)}/posts/${externalId}`;

  const response = await fetchWithRetry(url, {
    method: "PUT",
    headers: buildHeaders(site),
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as CustomApiResponse;
  return String(data.id);
}

/**
 * Upload an image to a custom blog via POST /posts/images.
 * Downloads the image from sourceUrl, then re-uploads as multipart form data.
 *
 * @returns The public URL of the uploaded image.
 */
export async function uploadImageToCustomBlog(
  imageUrl: string,
  type: "featured" | "content",
  altText: string,
  site: CustomSiteConfig,
): Promise<string> {
  // Download the image from Supabase
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status}`);
  }
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const contentType = imageResponse.headers.get("content-type") ?? "image/webp";

  // Extract filename from URL
  const urlParts = imageUrl.split("/");
  const filename = urlParts[urlParts.length - 1] || "image.webp";

  // Determine extension from content type
  const ext = contentType.split("/")[1] ?? "webp";
  const finalFilename = filename.includes(".") ? filename : `${filename}.${ext}`;

  // Build multipart form data
  const formData = new FormData();
  formData.append("file", new Blob([imageBuffer], { type: contentType }), finalFilename);
  formData.append("type", type);
  formData.append("alt", altText);

  const url = `${normalizeApiUrl(site.apiUrl)}/posts/images`;

  const headers: Record<string, string> = {};
  if (site.apiUser && site.apiPassword) {
    const credentials = Buffer.from(
      `${site.apiUser}:${site.apiPassword}`,
    ).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Custom blog image upload error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { url: string };
  return data.url;
}

/**
 * Delete a post from a custom blog via DELETE /posts/{externalId}.
 * Single attempt without retry.
 * Treats 404 as idempotent success (post already gone).
 */
export async function deleteFromCustomBlog(
  externalId: string,
  site: CustomSiteConfig,
): Promise<void> {
  const url = `${normalizeApiUrl(site.apiUrl)}/posts/${externalId}`;

  const headers: Record<string, string> = {};
  if (site.apiUser && site.apiPassword) {
    const credentials = Buffer.from(
      `${site.apiUser}:${site.apiPassword}`,
    ).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }

  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });

  // 404 = already deleted — treat as idempotent success
  if (response.status === 404) return;

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Custom blog API error ${response.status}: ${body}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}

function buildHeaders(site: CustomSiteConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (site.apiUser && site.apiPassword) {
    const credentials = Buffer.from(
      `${site.apiUser}:${site.apiPassword}`,
    ).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }

  return headers;
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
          `Custom blog API error ${response.status}: ${body}`,
        );
      }

      lastError = new Error(
        `Custom blog API returned ${response.status}`,
      );
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));

      // Don't retry non-retryable errors
      if (lastError.message.includes("Custom blog API error")) {
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
    `Custom blog publish failed after ${MAX_RETRIES} retries: ${lastError?.message}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
