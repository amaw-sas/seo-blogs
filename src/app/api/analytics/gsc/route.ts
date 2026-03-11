import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getGscData } from "@/lib/seo/gsc-client";

/**
 * GET /api/analytics/gsc
 * Fetches GSC data for a site and syncs it to the analytics table.
 * Query params: siteId, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!siteId || !startDate || !endDate) {
      return NextResponse.json(
        { error: "Missing required params: siteId, startDate, endDate" },
        { status: 400 },
      );
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { domain: true },
    });

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const siteUrl = `sc-domain:${site.domain}`;
    const gscRows = await getGscData(siteUrl, startDate, endDate);

    // Get all posts for this site to match pages to postIds
    const posts = await prisma.post.findMany({
      where: { siteId },
      select: { id: true, slug: true },
    });

    const slugToPostId = new Map(
      posts.map((p) => [`/${p.slug}`, p.id]),
    );

    // Aggregate clicks/impressions/position per page per day
    // GSC returns aggregated data for the date range, so we store it as the endDate
    const syncDate = new Date(endDate);
    let synced = 0;

    for (const row of gscRows) {
      // Extract slug from page URL
      const url = new URL(row.page);
      const pathname = url.pathname.replace(/\/$/, "");
      const postId = slugToPostId.get(pathname);

      if (!postId) continue;

      await prisma.analytics.upsert({
        where: {
          postId_date: {
            postId,
            date: syncDate,
          },
        },
        update: {
          clicks: { increment: row.clicks },
          impressions: { increment: row.impressions },
          position: row.position,
        },
        create: {
          siteId,
          postId,
          date: syncDate,
          clicks: row.clicks,
          impressions: row.impressions,
          position: row.position,
          views: 0,
        },
      });

      synced++;
    }

    return NextResponse.json({
      data: gscRows,
      synced,
      total: gscRows.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch GSC data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
