import { describe, it, expect } from "vitest";
import { generateAltText } from "./image-generator";

describe("generateAltText", () => {
  const keyword = "marketing digital";

  it("extracts first sentence from revised prompt when available", () => {
    const revised =
      "A vibrant cityscape with digital billboards. The scene captures modern marketing.";
    const result = generateAltText(revised, keyword, true, 0);
    expect(result).toBe("A vibrant cityscape with digital billboards");
  });

  it("strips DALL-E boilerplate from revised prompt", () => {
    const revised =
      "ultra realistic photography, Article topic: \"marketing digital\". Title: \"Guia completa\". A cozy office workspace with laptop and coffee. No text or watermarks.";
    const result = generateAltText(revised, keyword, true, 0);
    expect(result).not.toMatch(/ultra realistic/i);
    expect(result).not.toMatch(/Article topic/i);
    expect(result).not.toMatch(/No text/i);
    expect(result.length).toBeGreaterThan(10);
    expect(result.length).toBeLessThanOrEqual(125);
  });

  it("truncates to 125 chars max", () => {
    const longRevised =
      "A " + "very ".repeat(30) + "detailed photographic scene of a beautiful landscape with mountains and rivers flowing through green valleys.";
    const result = generateAltText(longRevised, keyword, true, 0);
    expect(result.length).toBeLessThanOrEqual(125);
  });

  it("falls back to hero alt when revised prompt is empty", () => {
    const result = generateAltText("", keyword, true, 0);
    expect(result).toBe("Fotografia sobre marketing digital");
  });

  it("falls back to non-hero alt when revised prompt is empty", () => {
    const result = generateAltText("", keyword, false, 2);
    expect(result).toBe("Detalle visual relacionado con marketing digital");
  });

  it("falls back when revised prompt is too short after cleaning", () => {
    const result = generateAltText("ultra realistic photography,", keyword, false, 1);
    expect(result).toBe("Detalle visual relacionado con marketing digital");
  });

  it("strips 16:9 aspect ratio suffix", () => {
    const revised = "A stunning mountain landscape with golden hour lighting, 16:9 aspect ratio";
    const result = generateAltText(revised, keyword, true, 0);
    expect(result).not.toMatch(/16:9/);
  });
});
