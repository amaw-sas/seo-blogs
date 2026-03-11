import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { checkCannibalization } from "@/lib/seo/similarity-checker";

const THRESHOLD = 0.4;

/**
 * POST /api/keywords/check-cannibalization
 * Check if a keyword cannibalizes existing keywords for a given site.
 *
 * Body: { keyword: string, siteId: string }
 * Returns: { isCannibalized, similarKeywords, threshold }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, siteId } = body;

    if (!keyword || !siteId) {
      return NextResponse.json(
        { error: "Missing required fields: keyword, siteId" },
        { status: 400 },
      );
    }

    // Fetch all used keywords for this site (from both keywords table and published posts)
    const [usedKeywords, posts] = await Promise.all([
      prisma.keyword.findMany({
        where: { siteId, status: "used" },
        select: { phrase: true },
      }),
      prisma.post.findMany({
        where: {
          siteId,
          status: { in: ["published", "review", "draft"] },
        },
        select: { keyword: true },
      }),
    ]);

    // Combine and deduplicate
    const allKeywords = [
      ...new Set([
        ...usedKeywords.map((k) => k.phrase),
        ...posts.map((p) => p.keyword),
      ]),
    ];

    const results = checkCannibalization(keyword, allKeywords);

    const similarKeywords = results.map((r) => ({
      phrase: r.keyword,
      similarity: r.similarity,
    }));

    return NextResponse.json({
      isCannibalized: similarKeywords.length > 0,
      similarKeywords,
      threshold: THRESHOLD,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check cannibalization";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
