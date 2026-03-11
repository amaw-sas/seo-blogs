import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        name: true,
        domain: true,
        posts: {
          where: { status: "published" },
          orderBy: { publishedAt: "desc" },
          select: {
            title: true,
            slug: true,
            metaDescription: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const lines: string[] = [
      `# ${site.name}`,
      `> Source: https://${site.domain}`,
      "",
      "## Published Articles",
      "",
    ];

    for (const post of site.posts) {
      const url = `https://${site.domain}/${post.slug}`;
      const description = post.metaDescription ?? "No description available.";
      lines.push(`- [${post.title}](${url}): ${description}`);
    }

    if (site.posts.length === 0) {
      lines.push("No published articles yet.");
    }

    const content = lines.join("\n") + "\n";

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate llms.txt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
