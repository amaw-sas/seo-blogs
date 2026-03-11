import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const versions = await prisma.postVersion.findMany({
      where: { postId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        contentHtml: true,
        changedBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json(versions);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch versions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { versionId } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: "Missing required field: versionId" },
        { status: 400 },
      );
    }

    const [post, version] = await Promise.all([
      prisma.post.findUnique({ where: { id } }),
      prisma.postVersion.findUnique({ where: { id: versionId } }),
    ]);

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (!version || version.postId !== id) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 },
      );
    }

    // Save current content as a new version, then apply the selected version
    await prisma.$transaction([
      prisma.postVersion.create({
        data: {
          postId: id,
          contentHtml: post.contentHtml,
          changedBy: "restore",
        },
      }),
      prisma.post.update({
        where: { id },
        data: { contentHtml: version.contentHtml },
      }),
    ]);

    return NextResponse.json({ message: "Version restored" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to restore version";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
