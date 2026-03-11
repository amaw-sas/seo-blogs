import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  generateSocialSnippets,
  type SocialSnippets,
} from "@/lib/ai/social-snippets";

type RouteContext = { params: Promise<{ id: string }> };

// In-memory cache for snippets (in production, use Redis or a DB table)
const snippetsCache = new Map<string, { snippets: SocialSnippets; generatedAt: Date }>();

/**
 * GET — returns cached snippets if available, or generates new ones.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check cache first
    const cached = snippetsCache.get(id);
    if (cached) {
      return NextResponse.json({
        data: cached.snippets,
        cached: true,
        generatedAt: cached.generatedAt,
      });
    }

    // Generate new snippets
    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        title: true,
        keyword: true,
        metaDescription: true,
        contentHtml: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const snippets = await generateSocialSnippets(post);
    const generatedAt = new Date();
    snippetsCache.set(id, { snippets, generatedAt });

    return NextResponse.json({ data: snippets, cached: false, generatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate social snippets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST — force regenerate snippets.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const post = await prisma.post.findUnique({
      where: { id },
      select: {
        title: true,
        keyword: true,
        metaDescription: true,
        contentHtml: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const snippets = await generateSocialSnippets(post);
    const generatedAt = new Date();

    // Update cache
    snippetsCache.set(id, { snippets, generatedAt });

    return NextResponse.json({ data: snippets, cached: false, generatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to regenerate social snippets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
