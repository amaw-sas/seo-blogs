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
  revisedPrompt: string,
  keyword: string,
  isHero: boolean,
  index: number,
): string {
  if (revisedPrompt) {
    // Extract first descriptive sentence from DALL-E's revised prompt
    const cleaned = revisedPrompt
      .replace(/^Create an?\s+/i, "")
      .replace(/ultra[- ]?realistic?\s+(photography|photograph|photo|image),?\s*/gi, "")
      .replace(/Article topic:.*?Title:.*?\./i, "")
      .replace(/No text.*$/i, "")
      .replace(/,\s*16:9.*$/i, "")
      .replace(/,?\s*highly detailed.*$/i, "")
      .trim();

    // Take first meaningful chunk, max 125 chars
    const firstSentence = cleaned.split(/[.!]/).filter(Boolean)[0]?.trim() ?? "";

    // Only use if result is meaningful (>10 chars) and in Spanish, otherwise fallback
    if (firstSentence.length > 10) {
      // Detect English content — if mostly English, use Spanish fallback instead
      const englishIndicators = /\b(the|with|and|for|that|this|from|scene|captures?|showing)\b/gi;
      const matches = firstSentence.match(englishIndicators) ?? [];
      if (matches.length >= 2) {
        // English content detected — use Spanish fallback
        return isHero
          ? `Fotografia sobre ${keyword}`
          : `Detalle visual relacionado con ${keyword}`;
      }
      return firstSentence.slice(0, 125);
    }
  }

  // Fallback: descriptive alt based on keyword and position
  return isHero
    ? `Fotografia sobre ${keyword}`
    : `Detalle visual relacionado con ${keyword}`;
}

function buildImagePrompt(
  title: string,
  keyword: string,
  isHero: boolean,
): string {
  const context = `Article topic: "${keyword}". Title: "${title}".`;

  if (isHero) {
    return `ultra realistic photography, ${context} Capture a scene that visually represents the topic. Warm natural sunlight, vibrant natural colors, scenic composition, cinematic framing, depth of field, professional photography, 16:9 aspect ratio, highly detailed, natural atmosphere. No text, no watermarks, no logos, no people's faces.`;
  }

  return `ultra realistic photography, ${context} A detail shot or close-up scene related to the article topic. Natural lighting, soft bokeh background, warm color tones, editorial photography style, 16:9, highly detailed. No text, no watermarks, no logos, no people's faces.`;
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
