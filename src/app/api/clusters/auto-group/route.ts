import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  generateEmbeddings,
  agglomerativeCluster,
  findSemanticDuplicates,
} from "@/lib/ai/keyword-embeddings";
import { chatCompletion } from "@/lib/ai/openai-client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId } = body as { siteId?: string };

    if (!siteId) {
      return NextResponse.json(
        { error: "Missing required field: siteId" },
        { status: 400 },
      );
    }

    const keywords = await prisma.keyword.findMany({
      where: { siteId, status: "pending", clusterId: null },
    });

    if (keywords.length < 3) {
      return NextResponse.json(
        { error: "Se necesitan al menos 3 keywords para agrupar" },
        { status: 400 },
      );
    }

    const phrases = keywords.map((k) => k.phrase);

    const embeddings = await generateEmbeddings(phrases);

    const groups = agglomerativeCluster(embeddings, phrases, 0.75);

    const duplicates = findSemanticDuplicates(embeddings, phrases, 0.9);

    // Generate cluster names via OpenAI
    const clusterList = groups
      .map(
        (g, i) =>
          `Cluster ${i + 1}: ${g.keywords.join(", ")}`,
      )
      .join("\n");

    const namingPrompt = `Genera un nombre corto y descriptivo (2-4 palabras, en español) para cada cluster de keywords SEO.

${clusterList}

Responde SOLO con un JSON array de strings, un nombre por cluster, en el mismo orden. Ejemplo: ["Alquiler de carros", "Marketing digital"]`;

    const namingResponse = await chatCompletion(namingPrompt, 500, 0.3);

    let clusterNames: string[];
    try {
      const cleaned = namingResponse.replace(/```json?\n?|```/g, "").trim();
      clusterNames = JSON.parse(cleaned);
    } catch {
      clusterNames = groups.map(
        (g) => g.keywords[0].split(" ").slice(0, 3).join(" "),
      );
    }

    // Create clusters and assign keywords
    const createdClusters: {
      id: string;
      name: string;
      keywordCount: number;
      keywords: string[];
    }[] = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const keywordIds = group.indices.map((idx) => keywords[idx].id);
      const keywordPhrases = group.keywords;
      const clusterName = clusterNames[i] ?? keywordPhrases[0];

      const created = await prisma.contentCluster.create({
        data: {
          siteId,
          name: clusterName,
          pillarKeyword: keywordPhrases[0],
        },
      });

      await prisma.keyword.updateMany({
        where: { id: { in: keywordIds } },
        data: { clusterId: created.id },
      });

      createdClusters.push({
        id: created.id,
        name: clusterName,
        keywordCount: keywordIds.length,
        keywords: keywordPhrases,
      });
    }

    return NextResponse.json({
      clusters: createdClusters,
      duplicates: duplicates.map((d) => ({
        phrase1: d.phrase1,
        phrase2: d.phrase2,
        similarity: d.similarity,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to auto-group keywords";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
