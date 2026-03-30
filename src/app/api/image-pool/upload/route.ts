import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { saveToPool } from "@/lib/db/image-pool-queries";
import { compressToWebP } from "../../../../../worker/utils/image-compressor";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const siteId = formData.get("siteId") as string | null;
    const categoryId = (formData.get("categoryId") as string) || undefined;
    const altTextBase = (formData.get("altTextBase") as string) || "Pool image";

    if (!siteId) {
      return NextResponse.json({ error: "siteId is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Collect all files from FormData
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    let uploaded = 0;
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        const rawBuffer = Buffer.from(await file.arrayBuffer());
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
          errors.push(`File ${i}: ${uploadError.message}`);
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("post-images").getPublicUrl(filename);

        await saveToPool({
          siteId,
          categoryId,
          url: publicUrl,
          altTextBase,
          width: metadata.width ?? 1024,
          height: metadata.height ?? 1024,
          fileSize: compressed.length,
          source: "manual",
          status: "available",
        });

        uploaded++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`File ${i}: ${msg}`);
      }
    }

    return NextResponse.json({ uploaded, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
