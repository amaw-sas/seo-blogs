/**
 * Image generation using Freepik Mystic (primary) with DALL-E fallback.
 * All images compressed to WebP via sharp.
 */

import OpenAI from "openai";
import sharp from "sharp";
import { generateImageWithFreepik } from "./freepik-client";

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
  knowledgeBase?: string | null,
): Promise<GeneratedImage[]> {
  const images: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    const isHero = i === 0;
    const context = isHero ? title : (sectionContexts?.[i - 1] ?? title);
    const prompt = buildImagePrompt(context, keyword, isHero, knowledgeBase);

    const rawBuffer = await generateRawImage(prompt);
    const compressed = await compressToWebP(rawBuffer, 150);
    const metadata = await sharp(compressed).metadata();
    const altText = generateAltText("", keyword, isHero, i, context);

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

/**
 * Generate a raw image buffer. Tries Freepik Mystic first, falls back to DALL-E.
 */
async function generateRawImage(prompt: string): Promise<Buffer> {
  // Try Freepik Mystic first
  if (process.env.FREEPIK_API_KEY) {
    try {
      return await generateImageWithFreepik(prompt, "widescreen_16_9");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[ImageGen] Freepik failed, falling back to DALL-E: ${msg}`);
    }
  }

  // Fallback: DALL-E 3
  const client = getClient();
  const response = await client.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1792x1024",
    response_format: "b64_json",
    quality: "standard",
  });

  const b64Data = response.data?.[0]?.b64_json;
  if (!b64Data) {
    throw new Error("DALL-E returned no image data");
  }
  return Buffer.from(b64Data, "base64");
}

// ── Helpers ──────────────────────────────────────────────────

function generateAltText(
  _revisedPrompt: string,
  keyword: string,
  isHero: boolean,
  _index: number,
  context: string,
): string {
  // Alt text must include the keyword naturally for SEO plugin compliance.
  // Good pattern: "renta autos cartagena ciudad amurallada" (keyword + descriptive context)
  // Bad pattern: full title repeated as alt text (keyword stuffing)
  const trimmedContext = context.trim();
  const keywordLower = keyword.toLowerCase();

  if (trimmedContext) {
    // Check if context already contains the keyword
    const contextLower = trimmedContext.toLowerCase();
    if (contextLower.includes(keywordLower)) {
      // Context already has keyword — use as-is, truncated
      return trimmedContext.length > 100 ? trimmedContext.slice(0, 100).trimEnd() : trimmedContext;
    }
    // Prepend keyword naturally: "keyword — context description"
    const combined = `${keyword} — ${trimmedContext}`;
    return combined.length > 100 ? combined.slice(0, 100).trimEnd() : combined;
  }

  return isHero
    ? `Fotografia sobre ${keyword}`
    : `Detalle visual relacionado con ${keyword}`;
}

function buildImagePrompt(
  context: string,
  keyword: string,
  isHero: boolean,
  knowledgeBase?: string | null,
): string {
  const noOverlays = "Absolutely nothing written, printed, or displayed in the image. No signs, banners, screens, posters, people, hands, or cameras.";
  // knowledgeBase is NOT injected into image prompts — it often contains brand names
  // (Kia, Chevrolet, Toyota, etc.) that DALL-E rejects as trademark violations.
  const kbContext = "";

  if (isHero) {
    return `A photograph that visually represents: "${context}". The image should directly illustrate this specific topic — not a generic landscape.${kbContext} Warm natural light, vivid colors, travel magazine quality. 16:9 panoramic composition. ${noOverlays}`;
  }

  return `A detailed photograph that illustrates: "${context}". The image should show a specific scene, object, or environment directly related to this topic.${kbContext} Natural light, warm tones, shallow focus, editorial quality. 16:9 close composition. ${noOverlays}`;
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
