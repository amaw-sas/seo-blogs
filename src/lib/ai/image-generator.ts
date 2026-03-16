/**
 * Image generation using DALL-E (OpenAI) with WebP compression via sharp.
 */

import OpenAI from "openai";
import sharp from "sharp";

export interface GeneratedImage {
  buffer: Buffer;
  altText: string;
  width: number;
  height: number;
  fileSize: number;
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

/**
 * Generate post images using DALL-E and compress to WebP <= maxSizeKB.
 */
export async function generatePostImages(
  title: string,
  keyword: string,
  count: number = 2,
  sectionContexts?: string[],
): Promise<GeneratedImage[]> {
  const client = getClient();
  const images: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    const isHero = i === 0;
    const context = isHero ? title : (sectionContexts?.[i - 1] ?? title);
    const prompt = buildImagePrompt(context, keyword, isHero);

    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1792x1024",
      response_format: "b64_json",
      quality: "standard",
    });

    const b64Data = response.data?.[0]?.b64_json;
    const revisedPrompt = response.data?.[0]?.revised_prompt ?? "";
    if (!b64Data) {
      throw new Error(`DALL-E returned no image data for image ${i + 1}`);
    }

    const rawBuffer = Buffer.from(b64Data, "base64");
    const compressed = await compressToWebP(rawBuffer, 150);

    const metadata = await sharp(compressed).metadata();

    const altText = generateAltText(revisedPrompt, keyword, isHero, i);

    images.push({
      buffer: compressed,
      altText,
      width: metadata.width ?? 1792,
      height: metadata.height ?? 1024,
      fileSize: compressed.length,
    });
  }

  return images;
}

// ── Helpers ──────────────────────────────────────────────────

function generateAltText(
  _revisedPrompt: string,
  keyword: string,
  isHero: boolean,
  _index: number,
): string {
  // DALL-E revised_prompt is always in English — never suitable for Spanish alt text.
  // Always use descriptive Spanish fallback based on keyword.
  return isHero
    ? `Fotografia sobre ${keyword}`
    : `Detalle visual relacionado con ${keyword}`;
}

function buildImagePrompt(
  context: string,
  keyword: string,
  isHero: boolean,
): string {
  if (isHero) {
    return `Wide-angle photograph, 35mm perspective, f/2.8 aperture. Scene: ${context}. Colombian setting, warm tropical sunlight, vivid natural colors, travel photography style. 16:9 composition. Only the landscape and environment, no people, no devices, no screens.`;
  }

  return `Close-up detail photograph, 85mm perspective, shallow depth of field. Subject: ${context}. Colombian setting, natural light, warm tones, editorial travel style. 16:9 format. Only the subject, no people, no devices, no screens.`;
}

/**
 * Compress an image buffer to WebP format within a target file size.
 * Starts at quality 50 and reduces if needed.
 */
async function compressToWebP(
  buffer: Buffer,
  maxSizeKB: number,
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

  // Final attempt at minimum quality with smaller dimensions
  return sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 5 })
    .toBuffer();
}

// ── Exports for testing ─────────────────────────────────────
export { generateAltText };
