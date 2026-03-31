/**
 * Image compression utility for WebP conversion.
 */

import sharp from "sharp";

export interface CompressOptions {
  maxSizeKB: number;
  maxWidth: number;
  initialQuality: number;
}

const HERO_PRESET: CompressOptions = {
  maxSizeKB: 50,
  maxWidth: 1024,
  initialQuality: 40,
};

const CONTENT_PRESET: CompressOptions = {
  maxSizeKB: 40,
  maxWidth: 800,
  initialQuality: 35,
};

/**
 * Compress an image buffer to WebP format within a target file size.
 *
 * Strategy:
 * 1. Start at initialQuality, reduce by 5 per iteration
 * 2. Resize to maxWidth on each pass
 * 3. If still over budget, reduce to 60% of maxWidth at minimum quality
 */
export async function compressToWebP(
  buffer: Buffer,
  options: CompressOptions = HERO_PRESET,
): Promise<Buffer> {
  const maxBytes = options.maxSizeKB * 1024;
  let quality = options.initialQuality;

  while (quality >= 10) {
    const result = await sharp(buffer)
      .resize({ width: options.maxWidth, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    if (result.length <= maxBytes) {
      return result;
    }

    quality -= 5;
  }

  // Final attempt: smaller dimensions + minimum quality
  const fallbackWidth = Math.round(options.maxWidth * 0.6);
  return sharp(buffer)
    .resize({ width: fallbackWidth, withoutEnlargement: true })
    .webp({ quality: 5 })
    .toBuffer();
}

/** Compress a hero/featured image: 1024px, ≤50KB */
export function compressHero(buffer: Buffer): Promise<Buffer> {
  return compressToWebP(buffer, HERO_PRESET);
}

/** Compress a content/body image: 800px, ≤40KB */
export function compressContent(buffer: Buffer): Promise<Buffer> {
  return compressToWebP(buffer, CONTENT_PRESET);
}
