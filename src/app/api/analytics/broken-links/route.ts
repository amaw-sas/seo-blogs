import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkBrokenLinks } from "../../../../../worker/monitors/broken-links";

/**
 * GET /api/analytics/broken-links
 * Returns broken links grouped by site.
 * Query params: siteId (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");

    const where: { status: "broken"; post?: { siteId: string } } = {
      status: "broken",
    };
    if (siteId) {
      where.post = { siteId };
    }

    const brokenLinks = await prisma.postLink.findMany({
      where,
      include: {
        post: {
          select: {
            id: true,
            title: true,
            slug: true,
            siteId: true,
            site: { select: { name: true, domain: true } },
          },
        },
      },
      orderBy: { post: { siteId: "asc" } },
    });

    // Group by site
    const grouped: Record<
      string,
      {
        siteId: string;
        siteName: string;
        domain: string;
        links: {
          id: string;
          url: string;
          anchorText: string;
          postId: string;
          postTitle: string;
          postSlug: string;
        }[];
      }
    > = {};

    for (const link of brokenLinks) {
      const sid = link.post.siteId;
      if (!grouped[sid]) {
        grouped[sid] = {
          siteId: sid,
          siteName: link.post.site.name,
          domain: link.post.site.domain,
          links: [],
        };
      }
      grouped[sid].links.push({
        id: link.id,
        url: link.url,
        anchorText: link.anchorText,
        postId: link.post.id,
        postTitle: link.post.title,
        postSlug: link.post.slug,
      });
    }

    return NextResponse.json({
      totalBroken: brokenLinks.length,
      bySite: Object.values(grouped),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch broken links";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/analytics/broken-links
 * Trigger a broken link check.
 * Body: { siteId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      siteId?: string;
    };

    const summary = await checkBrokenLinks(body.siteId);

    return NextResponse.json({
      message: "Broken link check completed",
      summary,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run broken link check";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
