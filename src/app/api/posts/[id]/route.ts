import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { deleteFromWordPress } from "../../../../../worker/connectors/wordpress";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        links: true,
        postTags: { include: { tag: true } },
        category: true,
        site: { select: { name: true, domain: true, platform: true } },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Auto-create PostVersion with old content before updating
    await prisma.postVersion.create({
      data: {
        postId: id,
        contentHtml: existing.contentHtml,
        changedBy: body.changedBy ?? null,
      },
    });

    const { changedBy, ...updateData } = body;
    if (updateData.scheduledAt) updateData.scheduledAt = new Date(updateData.scheduledAt);
    if (updateData.publishedAt) updateData.publishedAt = new Date(updateData.publishedAt);

    const post = await prisma.post.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(post);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to update post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleteExternal = request.nextUrl.searchParams.get("deleteExternal") === "true";

    const post = await prisma.post.findUnique({
      where: { id },
      include: { site: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Delete from DB first — reversible state is safer than
    // irreversible WP delete followed by a potential DB failure
    await prisma.post.delete({ where: { id } });

    let externalDeleted: boolean | null = null;
    let externalError: string | undefined;

    if (deleteExternal && post.externalPostId) {
      const { site } = post;

      if (site.platform === "wordpress" && site.apiUrl && site.apiUser && site.apiPassword) {
        try {
          await deleteFromWordPress(post.externalPostId, {
            apiUrl: site.apiUrl,
            apiUser: site.apiUser,
            apiPassword: site.apiPassword,
          });
          externalDeleted = true;

          await prisma.publishLog.create({
            data: {
              siteId: site.id,
              postId: null,
              eventType: "external_delete",
              status: "success",
            },
          });
        } catch (err) {
          externalDeleted = false;
          externalError = err instanceof Error ? err.message : String(err);

          await prisma.publishLog.create({
            data: {
              siteId: site.id,
              postId: null,
              eventType: "external_delete",
              status: "failed",
              errorMessage: externalError,
            },
          });
        }
      } else {
        // Platform without connector (e.g. "custom")
        externalDeleted = false;

        await prisma.publishLog.create({
          data: {
            siteId: site.id,
            postId: null,
            eventType: "external_delete",
            status: "skipped",
          },
        });
      }
    }

    return NextResponse.json({ deleted: true, externalDeleted, externalError });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to delete post";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
