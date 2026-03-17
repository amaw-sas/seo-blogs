/**
 * Nuxt Blog connector for publishing, uploading images, and deleting posts.
 * Targets Nuxt 4 blogs with REST API endpoints authenticated via X-Api-Key.
 * Reuses the wordpress-sync endpoint format (zero changes in rentacar).
 */

import { pingGoogle } from "../../src/lib/seo/sitemap";

// ── Types ────────────────────────────────────────────────────

export interface NuxtBlogSiteConfig {
  apiUrl: string;
  apiKey: string;
  domain?: string;
}

interface NuxtBlogSyncPayload {
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  slug: string;
  date: string;
  metaTitle?: string;
  _embedded?: {
    "wp:featuredmedia"?: [{ source_url: string; alt_text: string }];
  };
  faqItems?: { question: string; answer: string }[];
}

// ── Public API ───────────────────────────────────────────────

/**
 * Publish a post to a Nuxt blog via /api/blog/wordpress-sync.
 * Single attempt without retry.
 *
 * @returns The post slug as externalPostId.
 */
export async function publishToNuxtBlog(
  post: {
    title: string;
    slug: string;
    contentHtml: string;
    metaDescription: string;
    metaTitle?: string;
    featuredImageUrl?: string;
    featuredImageAlt?: string;
    faqItems?: { question: string; answer: string }[];
  },
  site: NuxtBlogSiteConfig,
): Promise<string> {
  const payload: NuxtBlogSyncPayload = {
    title: { rendered: post.title },
    content: { rendered: post.contentHtml },
    excerpt: { rendered: post.metaDescription },
    slug: post.slug,
    date: new Date().toISOString(),
    metaTitle: post.metaTitle,
    faqItems: post.faqItems,
  };

  if (post.featuredImageUrl) {
    payload._embedded = {
      "wp:featuredmedia": [
        {
          source_url: post.featuredImageUrl,
          alt_text: post.featuredImageAlt ?? post.title,
        },
      ],
    };
  }

  const url = `${normalizeUrl(site.apiUrl)}/api/blog/wordpress-sync`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": site.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Nuxt Blog API error ${response.status}: ${body}`);
  }

  // Post-publish: ping Google with the sitemap
  if (site.domain) {
    const sitemapUrl = `https://${site.domain}/sitemap.xml`;
    pingGoogle(sitemapUrl).catch((err) => {
      console.error(`[NuxtBlog] Sitemap ping failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  return post.slug;
}

/**
 * Upload an image to a Nuxt blog via /api/blog/upload-image.
 * Downloads the image from sourceUrl, then re-uploads as multipart form data.
 *
 * @returns The public Firebase Storage URL of the uploaded image.
 */
export async function uploadImageToNuxtBlog(
  imageUrl: string,
  type: "featured" | "content",
  altText: string,
  site: NuxtBlogSiteConfig,
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

  const url = `${normalizeUrl(site.apiUrl)}/api/blog/upload-image`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Api-Key": site.apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Nuxt Blog image upload error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { url: string };
  return data.url;
}

/**
 * Delete a post from a Nuxt blog via DELETE /api/blog/post/{slug}.
 * Single attempt without retry.
 * Treats 404 as idempotent success (post already gone).
 */
export async function deleteFromNuxtBlog(
  slug: string,
  site: NuxtBlogSiteConfig,
): Promise<void> {
  const url = `${normalizeUrl(site.apiUrl)}/api/blog/post/${slug}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "X-Api-Key": site.apiKey,
    },
  });

  // 404 = already deleted — treat as idempotent success
  if (response.status === 404) return;

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Nuxt Blog API error ${response.status}: ${body}`);
  }
}

// ── Helpers ──────────────────────────────────────────────────

function normalizeUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}
