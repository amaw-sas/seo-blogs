import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createClient } from "@supabase/supabase-js";
import { getPoolImages, getPoolStats } from "@/lib/db/image-pool-queries";
import type { ImagePoolSource, ImagePoolStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId") || undefined;
    const categoryId = searchParams.get("categoryId") || undefined;
    const source = (searchParams.get("source") as ImagePoolSource) || undefined;
    const status = (searchParams.get("status") as ImagePoolStatus) || undefined;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));

    const [{ data, total }, stats] = await Promise.all([
      getPoolImages({ siteId, categoryId, source, status, page, limit }),
      getPoolStats(siteId),
    ]);

    return NextResponse.json({ data, total, page, limit, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch pool images";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id?: string };

    if (!id) {
      return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
    }

    // Fetch the image to get its URL before deleting
    const image = await prisma.imagePool.findUnique({ where: { id } });
    if (!image) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    // Delete from database
    await prisma.imagePool.delete({ where: { id } });

    // Delete from Supabase Storage
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        // Extract storage path from public URL
        // URL format: https://<project>.supabase.co/storage/v1/object/public/post-images/<path>
        const marker = "/storage/v1/object/public/post-images/";
        const markerIndex = image.url.indexOf(marker);
        if (markerIndex !== -1) {
          const storagePath = image.url.substring(markerIndex + marker.length);
          await supabase.storage.from("post-images").remove([storagePath]);
        }
      }
    } catch {
      // Storage deletion is best-effort; DB record already removed
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete pool image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
