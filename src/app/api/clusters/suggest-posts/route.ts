import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const keyword = searchParams.get("keyword");
    const siteId = searchParams.get("siteId");
    const excludePostIds = searchParams.get("excludePostIds");

    if (!keyword || !siteId) {
      return NextResponse.json(
        { error: "Missing required params: keyword, siteId" },
        { status: 400 },
      );
    }

    const excludeIds = excludePostIds
      ? excludePostIds.split(",").filter(Boolean)
      : [];

    const posts = await prisma.post.findMany({
      where: {
        siteId,
        ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { keyword: { contains: keyword, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        keyword: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ data: posts });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to suggest posts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
