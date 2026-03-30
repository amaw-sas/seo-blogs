import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { saveToPool } from "@/lib/db/image-pool-queries";
import { generateSingleImage, buildImagePrompt } from "@/lib/ai/image-generator";
import { compressToWebP } from "../../../../../worker/utils/image-compressor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { siteId, categoryId, count } = body as {
      siteId?: string;
      categoryId?: string;
      count?: number;
    };

    if (!siteId) {
      return NextResponse.json({ error: "siteId is required" }, { status: 400 });
    }

    if (!count || count < 1 || count > 20) {
      return NextResponse.json(
        { error: "count must be between 1 and 20" },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch pending keywords for this site
    const keywords = await prisma.keyword.findMany({
      where: { siteId, status: "pending" },
      take: count,
    });

    if (keywords.length === 0) {
      return NextResponse.json(
        { error: "No pending keywords found for this site" },
        { status: 404 },
      );
    }

    let generated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < keywords.length; i++) {
      const keyword = keywords[i];
      try {
        const prompt = buildImagePrompt(keyword.phrase, keyword.phrase, true);
        const rawBuffer = await generateSingleImage(prompt);
        const compressed = await compressToWebP(rawBuffer, 150);
        const metadata = await sharp(compressed).metadata();

        const timestamp = Date.now();
        const filename = `${siteId}/pool-${timestamp}-${i}.webp`;

        const { error: uploadError } = await supabase.storage
          .from("post-images")
          .upload(filename, compressed, {
            contentType: "image/webp",
            upsert: false,
          });

        if (uploadError) {
          errors.push(`Keyword "${keyword.phrase}": ${uploadError.message}`);
          failed++;
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("post-images").getPublicUrl(filename);

        await saveToPool({
          siteId,
          categoryId,
          url: publicUrl,
          altTextBase: keyword.phrase,
          width: metadata.width ?? 1024,
          height: metadata.height ?? 1024,
          fileSize: compressed.length,
          source: "ai_pregenerated",
          status: "available",
          generatedFromKeyword: keyword.phrase,
        });

        generated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Keyword "${keyword.phrase}": ${msg}`);
        failed++;
      }
    }

    return NextResponse.json({
      generated,
      failed,
      total: keywords.length,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate pool images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
