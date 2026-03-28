import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateThemeConfig } from "@/lib/ai/theme-generator";
import { sendThemeConfig } from "@/lib/blog/blog-config-client";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        domain: true,
        apiUrl: true,
        apiPassword: true,
        knowledgeBase: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: "Sitio no encontrado" }, { status: 404 });
    }

    if (!site.apiUrl || !site.apiPassword) {
      return NextResponse.json(
        { error: "El sitio necesita URL de API y contraseña API configuradas" },
        { status: 400 }
      );
    }

    // Generate theme based on niche (knowledgeBase or domain)
    const niche = site.knowledgeBase || site.name;
    const theme = await generateThemeConfig(niche, site.domain);

    // Send config to blog-base
    await sendThemeConfig({
      apiUrl: site.apiUrl,
      apiKey: site.apiPassword,
      siteConfig: {
        name: site.name,
        description: niche,
        url: `https://${site.domain}`,
        language: "es",
        author: { name: site.name },
      },
      theme,
    });

    return NextResponse.json({
      theme,
      message: "Tema configurado exitosamente",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al configurar tema";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
