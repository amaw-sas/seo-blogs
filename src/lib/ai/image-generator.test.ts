import { describe, it, expect } from "vitest";
import { generateAltText } from "./image-generator";

describe("generateAltText", () => {
  const keyword = "marketing digital";

  it("always returns Spanish alt text for hero regardless of revised prompt", () => {
    const revised =
      "A vibrant cityscape with digital billboards. The scene captures modern marketing.";
    const result = generateAltText(revised, keyword, true, 0);
    expect(result).toBe("Fotografia sobre marketing digital");
    expect(result).not.toContain("vibrant");
    expect(result).not.toContain("cityscape");
  });

  it("always returns Spanish alt text for non-hero regardless of revised prompt", () => {
    const revised =
      "ultra realistic photography, Article topic: \"marketing digital\". Title: \"Guia completa\". A cozy office workspace.";
    const result = generateAltText(revised, keyword, false, 1);
    expect(result).toBe("Detalle visual relacionado con marketing digital");
    expect(result).not.toContain("ultra realistic");
    expect(result).not.toContain("Article topic");
  });

  it("returns hero alt when revised prompt is empty", () => {
    const result = generateAltText("", keyword, true, 0);
    expect(result).toBe("Fotografia sobre marketing digital");
  });

  it("returns non-hero alt when revised prompt is empty", () => {
    const result = generateAltText("", keyword, false, 2);
    expect(result).toBe("Detalle visual relacionado con marketing digital");
  });

  it("includes the keyword in alt text for hero", () => {
    const result = generateAltText("anything", keyword, true, 0);
    expect(result).toContain("marketing digital");
    expect(result).toMatch(/^Fotografia sobre/);
  });

  it("includes the keyword in alt text for non-hero", () => {
    const result = generateAltText("anything", keyword, false, 1);
    expect(result).toContain("marketing digital");
    expect(result).toMatch(/^Detalle visual/);
  });

  it("never returns English content from DALL-E revised prompt", () => {
    const revised = "Realistic photo in documentary style taken with an equivalent of a 35mm lens at f/2.8";
    const result = generateAltText(revised, keyword, true, 0);
    expect(result).not.toContain("Realistic");
    expect(result).not.toContain("documentary");
    expect(result).not.toContain("lens");
    expect(result).toBe("Fotografia sobre marketing digital");
  });

  it("never returns DALL-E prompt patterns as alt text", () => {
    const revised = "close-up, documentary style image related to 'car rentals in Cartagena prices', shot with a simulated 85mm lens";
    const result = generateAltText(revised, "alquilar carro en cartagena", false, 1);
    expect(result).not.toContain("close-up");
    expect(result).not.toContain("documentary");
    expect(result).not.toContain("simulated");
    expect(result).toBe("Detalle visual relacionado con alquilar carro en cartagena");
  });

  it("alt text length is always reasonable", () => {
    const result = generateAltText("", "alquilar carro en cartagena precios", true, 0);
    expect(result.length).toBeLessThanOrEqual(125);
    expect(result.length).toBeGreaterThan(10);
  });
});
