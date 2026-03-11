import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/analytics
 * Returns aggregated analytics from DB.
 * Query params: siteId (required), postId (optional), startDate, endDate
 * Returns views, clicks, impressions, avg position per post.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const postId = searchParams.get("postId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!siteId) {
      return NextResponse.json(
        { error: "Missing required param: siteId" },
        { status: 400 },
      );
    }

    // Build where clause
    const where: {
      siteId: string;
      postId?: string;
      date?: { gte?: Date; lte?: Date };
    } = { siteId };

    if (postId) where.postId = postId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    // Aggregate totals
    const totals = await prisma.analytics.aggregate({
      where,
      _sum: {
        views: true,
        clicks: true,
        impressions: true,
      },
      _avg: {
        position: true,
      },
    });

    // Per-post breakdown
    const perPost = await prisma.analytics.groupBy({
      by: ["postId"],
      where,
      _sum: {
        views: true,
        clicks: true,
        impressions: true,
      },
      _avg: {
        position: true,
      },
      orderBy: {
        _sum: {
          clicks: "desc",
        },
      },
    });

    // Enrich with post titles
    const postIds = perPost.map((p) => p.postId);
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds } },
      select: { id: true, title: true, slug: true, keyword: true },
    });

    const postMap = new Map(posts.map((p) => [p.id, p]));

    const perPostData = perPost.map((row) => {
      const post = postMap.get(row.postId);
      const clicks = row._sum.clicks ?? 0;
      const impressions = row._sum.impressions ?? 0;
      return {
        postId: row.postId,
        title: post?.title ?? "",
        slug: post?.slug ?? "",
        keyword: post?.keyword ?? "",
        views: row._sum.views ?? 0,
        clicks,
        impressions,
        avgPosition: row._avg.position ? Math.round(row._avg.position * 10) / 10 : null,
        ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      };
    });

    const totalClicks = totals._sum.clicks ?? 0;
    const totalImpressions = totals._sum.impressions ?? 0;

    return NextResponse.json({
      totals: {
        views: totals._sum.views ?? 0,
        clicks: totalClicks,
        impressions: totalImpressions,
        avgPosition: totals._avg.position
          ? Math.round(totals._avg.position * 10) / 10
          : null,
        ctr:
          totalImpressions > 0
            ? Math.round((totalClicks / totalImpressions) * 10000) / 100
            : 0,
      },
      perPost: perPostData,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
