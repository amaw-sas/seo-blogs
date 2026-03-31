import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { compressToWebP, compressHero, compressContent } from "./image-compressor";

// Generate a test image buffer (solid color, 2000x2000 PNG — larger than any preset)
async function createTestImage(width = 2000, height = 2000) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 64, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

// Generate a small image that's already under target sizes
async function createSmallImage() {
  return sharp({
    create: {
      width: 400,
      height: 400,
      channels: 3,
      background: { r: 100, g: 100, b: 100 },
    },
  })
    .png()
    .toBuffer();
}

describe("compressToWebP", () => {
  // S3.1 — Hero image: WebP, max 1024px width, target ≤50KB
  it("hero preset: output is ≤50KB and max 1024px wide", async () => {
    const input = await createTestImage();
    const result = await compressHero(input);
    const metadata = await sharp(result).metadata();

    expect(result.length).toBeLessThanOrEqual(50 * 1024);
    expect(metadata.width).toBeLessThanOrEqual(1024);
    expect(metadata.format).toBe("webp");
  });

  // S3.2 — Content image: WebP, max 800px width, target ≤40KB
  it("content preset: output is ≤40KB and max 800px wide", async () => {
    const input = await createTestImage();
    const result = await compressContent(input);
    const metadata = await sharp(result).metadata();

    expect(result.length).toBeLessThanOrEqual(40 * 1024);
    expect(metadata.width).toBeLessThanOrEqual(800);
    expect(metadata.format).toBe("webp");
  });

  // S3.3 — Small image: does not enlarge (withoutEnlargement)
  it("does not enlarge images smaller than max width", async () => {
    const input = await createSmallImage(); // 400x400
    const result = await compressHero(input);
    const metadata = await sharp(result).metadata();

    expect(metadata.width).toBeLessThanOrEqual(400);
    expect(metadata.format).toBe("webp");
  });

  it("custom options override defaults", async () => {
    const input = await createTestImage(1000, 1000);
    const result = await compressToWebP(input, {
      maxSizeKB: 30,
      maxWidth: 600,
      initialQuality: 30,
    });
    const metadata = await sharp(result).metadata();

    expect(result.length).toBeLessThanOrEqual(30 * 1024);
    expect(metadata.width).toBeLessThanOrEqual(600);
  });

  it("output is always WebP format", async () => {
    const input = await createTestImage();
    const hero = await compressHero(input);
    const content = await compressContent(input);

    const heroMeta = await sharp(hero).metadata();
    const contentMeta = await sharp(content).metadata();

    expect(heroMeta.format).toBe("webp");
    expect(contentMeta.format).toBe("webp");
  });
});
