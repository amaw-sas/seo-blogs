import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrismaClient } from "@prisma/client";

interface PostImage {
  id: string;
  url: string;
}

interface ImagePoolEntry {
  id: string;
  url: string;
}

/**
 * Extract the storage path from a Supabase Storage public URL.
 * URL format: https://<project>.supabase.co/storage/v1/object/public/post-images/<path>
 */
export function extractStoragePath(url: string): string | null {
  const marker = "post-images/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

/**
 * Clean up images when a post is deleted.
 *
 * - Non-pool images: deleted from Supabase Storage
 * - Pool images: recycled (status → "available", postId → null)
 *
 * Best-effort: errors are logged but never thrown.
 */
export async function cleanupPostImages(
  postId: string,
  images: PostImage[],
  imagePool: ImagePoolEntry[],
  supabase: SupabaseClient,
  prisma: PrismaClient,
): Promise<void> {
  try {
    const poolUrls = new Set(imagePool.map((p) => p.url));

    // Collect non-pool image storage paths for deletion
    const pathsToDelete: string[] = [];
    for (const img of images) {
      if (poolUrls.has(img.url)) continue; // pool image — skip storage delete
      const path = extractStoragePath(img.url);
      if (path) pathsToDelete.push(path);
    }

    // Delete non-pool images from storage
    if (pathsToDelete.length > 0) {
      const { error } = await supabase.storage
        .from("post-images")
        .remove(pathsToDelete);
      if (error) {
        console.error("[image-cleanup] Storage delete error:", error.message);
      }
    }

    // Recycle pool images back to available
    if (imagePool.length > 0) {
      await prisma.imagePool.updateMany({
        where: { postId },
        data: { status: "available" as const, postId: null },
      });
    }
  } catch (err) {
    console.error(
      "[image-cleanup] Cleanup failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
