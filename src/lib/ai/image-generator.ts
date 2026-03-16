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
): Promise<GeneratedImage[]> {
  const client = getClient();
  const images: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    const isHero = i === 0;
    const prompt = buildImagePrompt(title, keyword, isHero);

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
  title: string,
  keyword: string,
  isHero: boolean,
): string {
  const noTextRule = "CRITICAL: The image must contain ZERO text, ZERO letters, ZERO numbers, ZERO words, ZERO signs, ZERO labels, ZERO captions anywhere in the image. No watermarks, no logos, no visible faces.";

  if (isHero) {
    return `Documentary photograph taken with a Canon EOS R5, 35mm lens, f/2.8, ISO 400. Subject: a real scene directly related to "${keyword}". Shot on location with available ambient light, slight grain, natural imperfections. No digital art, no illustrations, no 3D renders, no AI-generated look. ${noTextRule} 16:9 composition.`;
  }

  return `Editorial photograph shot with a Sony A7IV, 85mm lens, f/1.8. A close-up detail related to "${keyword}". Shallow depth of field, natural window light, muted warm tones, slight lens flare. Authentic documentary style, NOT stock photography, NOT digital art. ${noTextRule} 16:9 format.`;
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
