/**
 * Image compression utility for WebP conversion.
 */

import sharp from "sharp";

/**
 * Compress an image buffer to WebP format within a target file size.
 *
 * Strategy:
 * 1. Start at quality 50, reduce by 10 per iteration
 * 2. Resize to max 1200px width on first passes
 * 3. If still over budget, reduce to 800px at minimum quality
 */
export async function compressToWebP(
  buffer: Buffer,
  maxSizeKB: number = 150,
): Promise<Buffer> {
  const maxBytes = maxSizeKB * 1024;
  let quality = 50;

  while (quality >= 10) {
    const result = await sharp(buffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    if (result.length <= maxBytes) {
      return result;
    }

    quality -= 10;
  }

  // Final attempt: smaller dimensions + minimum quality
  return sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 5 })
    .toBuffer();
}
