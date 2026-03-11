import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const cluster = await prisma.contentCluster.findUnique({
      where: { id },
      include: {
        clusterPosts: {
          include: {
            post: { select: { id: true, title: true, slug: true, status: true, keyword: true } },
          },
        },
        site: { select: { name: true, domain: true } },
      },
    });

    if (!cluster) {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }

    return NextResponse.json(cluster);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch cluster";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const { posts, ...updateData } = body;

    const cluster = await prisma.contentCluster.update({
      where: { id },
      data: updateData,
    });

    // If posts array provided, replace cluster posts
    if (Array.isArray(posts)) {
      await prisma.clusterPost.deleteMany({ where: { clusterId: id } });
      if (posts.length > 0) {
        await prisma.clusterPost.createMany({
          data: posts.map((p: { postId: string; isPillar?: boolean }) => ({
            clusterId: id,
            postId: p.postId,
            isPillar: p.isPillar ?? false,
          })),
        });
      }
    }

    const updated = await prisma.contentCluster.findUnique({
      where: { id },
      include: {
        clusterPosts: {
          include: {
            post: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to update cluster";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    await prisma.contentCluster.delete({ where: { id } });

    return NextResponse.json({ message: "Cluster deleted" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to delete cluster";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
