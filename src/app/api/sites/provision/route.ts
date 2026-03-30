import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { provisionBlog } from "@/lib/blog/provisioner";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, domain, niche, repoName, postsPerDay, minWords, maxWords,
      windowStart, windowEnd, conversionUrl, knowledgeBase, skipTheme } = body;

    if (!name || !domain || !niche || !repoName) {
      return NextResponse.json(
        { error: "Se requiere: name, domain, niche, repoName" },
        { status: 400 }
      );
    }

    // Provision blog infrastructure
    const result = await provisionBlog({
      name,
      domain,
      niche: knowledgeBase || niche,
      repoName,
      skipTheme: skipTheme ?? false,
    });

    // Register site in DB with provisioned credentials
    const site = await prisma.site.create({
      data: {
        name,
        domain,
        platform: "blog-base",
        apiUrl: result.apiUrl,
        apiPassword: result.apiKey,
        postsPerDay: postsPerDay ?? 1,
        minWords: minWords ?? 1500,
        maxWords: maxWords ?? 2500,
        windowStart: windowStart ?? 7,
        windowEnd: windowEnd ?? 12,
        conversionUrl: conversionUrl ?? null,
        knowledgeBase: knowledgeBase ?? niche,
        active: true,
      },
    });

    return NextResponse.json({
      site: { id: site.id, name: site.name, domain: site.domain },
      provisioning: {
        repoFullName: result.repoFullName,
        vercelProjectId: result.vercelProjectId,
        deployUrl: result.deployUrl,
        theme: result.theme,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al provisionar blog";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
