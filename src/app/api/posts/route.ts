import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { PostStatus, Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const status = searchParams.get("status") as PostStatus | null;
    const keyword = searchParams.get("keyword");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PostWhereInput = {};
    if (siteId) where.siteId = siteId;
    if (status) where.status = status;
    if (keyword) where.keyword = { contains: keyword, mode: "insensitive" };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [data, total] = await Promise.all([
      prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { site: { select: { name: true, domain: true } } },
      }),
      prisma.post.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch posts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { siteId, title, slug, contentHtml, contentMarkdown, metaTitle, metaDescription,
      keyword, status, scheduledAt, categoryId, ...rest } = body;

    if (!siteId || !title || !slug || !contentHtml || !keyword) {
      return NextResponse.json(
        { error: "Missing required fields: siteId, title, slug, contentHtml, keyword" },
        { status: 400 },
      );
    }

    const post = await prisma.post.create({
      data: {
        siteId,
        title,
        slug,
        contentHtml,
        contentMarkdown: contentMarkdown ?? null,
        metaTitle: metaTitle ?? null,
        metaDescription: metaDescription ?? null,
        keyword,
        status: status ?? "draft",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        categoryId: categoryId ?? null,
        keywordDensity: rest.keywordDensity ?? null,
        keywordFrequency: rest.keywordFrequency ?? null,
        readabilityScore: rest.readabilityScore ?? null,
        seoScore: rest.seoScore ?? null,
        wordCount: rest.wordCount ?? null,
        charCount: rest.charCount ?? null,
        readingTimeMinutes: rest.readingTimeMinutes ?? null,
        generationCost: rest.generationCost ?? null,
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A post with this slug already exists for the site" }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Failed to create post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
