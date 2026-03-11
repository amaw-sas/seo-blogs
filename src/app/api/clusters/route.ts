import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");

    const where = siteId ? { siteId } : {};

    const clusters = await prisma.contentCluster.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        clusterPosts: {
          include: {
            post: { select: { id: true, title: true, slug: true, status: true } },
          },
        },
        site: { select: { name: true, domain: true } },
      },
    });

    return NextResponse.json({ data: clusters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch clusters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { siteId, name, pillarKeyword, posts } = body;

    if (!siteId || !name || !pillarKeyword) {
      return NextResponse.json(
        { error: "Missing required fields: siteId, name, pillarKeyword" },
        { status: 400 },
      );
    }

    const cluster = await prisma.contentCluster.create({
      data: {
        siteId,
        name,
        pillarKeyword,
        ...(Array.isArray(posts) && posts.length > 0 && {
          clusterPosts: {
            create: posts.map((p: { postId: string; isPillar?: boolean }) => ({
              postId: p.postId,
              isPillar: p.isPillar ?? false,
            })),
          },
        }),
      },
      include: {
        clusterPosts: {
          include: {
            post: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });

    return NextResponse.json(cluster, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create cluster";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
