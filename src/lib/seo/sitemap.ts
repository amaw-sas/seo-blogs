/**
 * Sitemap generation and Google ping utilities.
 */

import { prisma } from "../db/prisma";

/**
 * Generate an XML sitemap from all published posts for a site.
 */
export async function generateSitemap(siteId: string): Promise<string> {
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: siteId },
    select: {
      domain: true,
      posts: {
        where: { status: "published" },
        orderBy: { publishedAt: "desc" },
        select: {
          slug: true,
          publishedAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const urls = site.posts.map((post) => {
    const lastmod = (post.updatedAt ?? post.publishedAt ?? new Date())
      .toISOString()
      .split("T")[0];

    return `  <url>
    <loc>https://${site.domain}/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  // Add homepage
  const homepageEntry = `  <url>
    <loc>https://${site.domain}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${homepageEntry}
${urls.join("\n")}
</urlset>`;
}

/**
 * Ping Google with the sitemap URL so it gets crawled faster.
 * Uses Google's ping endpoint: https://www.google.com/ping?sitemap=URL
 */
export async function pingGoogle(sitemapUrl: string): Promise<boolean> {
  try {
    const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;

    const response = await fetch(pingUrl, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });

    return response.ok;
  } catch (error) {
    console.error(
      `[Sitemap] Failed to ping Google:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
