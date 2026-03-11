import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  createAbTest,
  evaluateAbTest,
  generateTitleVariants,
  type AbTestVariant,
} from "@/lib/seo/ab-testing";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET — get current A/B test for a post.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const test = await prisma.siteAbTest.findFirst({
      where: { postId: id },
      orderBy: { createdAt: "desc" },
    });

    if (!test) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
      data: {
        ...test,
        variants: test.variants as unknown as AbTestVariant[],
        ctrByVariant: test.ctrByVariant as Record<string, number> | null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch A/B test";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST — create new A/B test (auto-generates variants using Claude).
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, title: true, keyword: true, siteId: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Generate alternative titles
    const alternativeTitles = await generateTitleVariants(post.title, post.keyword);

    // Build variants: original + generated alternatives
    const variants: AbTestVariant[] = [
      { id: "original", title: post.title },
      ...alternativeTitles.map((title, i) => ({
        id: `variant_${i + 1}`,
        title,
      })),
    ];

    const test = await createAbTest(post.id, post.siteId, variants);

    return NextResponse.json({ data: test }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create A/B test";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT — evaluate test winner and optionally apply winning title to post.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { testId, applyWinner } = body as { testId: string; applyWinner?: boolean };

    if (!testId) {
      return NextResponse.json({ error: "testId is required" }, { status: 400 });
    }

    // Verify the test belongs to this post
    const test = await prisma.siteAbTest.findUnique({ where: { id: testId } });
    if (!test || test.postId !== id) {
      return NextResponse.json({ error: "A/B test not found for this post" }, { status: 404 });
    }

    const evaluation = await evaluateAbTest(testId);

    // Apply winning title to the post if requested
    if (applyWinner) {
      await prisma.post.update({
        where: { id },
        data: { title: evaluation.winnerTitle },
      });
    }

    return NextResponse.json({ data: evaluation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to evaluate A/B test";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
