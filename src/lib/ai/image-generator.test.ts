import { describe, it, expect } from "vitest";
import { generateAltText } from "./image-generator";

describe("generateAltText", () => {
  const keyword = "marketing digital";
  const heroContext = "Estrategias de marketing digital para empresas colombianas";
  const contentContext = "Herramientas esenciales para campañas digitales efectivas";

  it("uses context for hero image alt text", () => {
    const result = generateAltText("", keyword, true, 0, heroContext);
    expect(result).toBe(heroContext);
    expect(result).not.toContain("Fotografia");
  });

  it("uses context for non-hero image alt text", () => {
    const result = generateAltText("", keyword, false, 1, contentContext);
    expect(result).toBe(contentContext);
    expect(result).not.toContain("Detalle visual");
  });

  it("falls back to keyword-based alt text when context is empty (hero)", () => {
    const result = generateAltText("", keyword, true, 0, "");
    expect(result).toBe("Fotografia sobre marketing digital");
  });

  it("falls back to keyword-based alt text when context is empty (non-hero)", () => {
    const result = generateAltText("", keyword, false, 1, "");
    expect(result).toBe("Detalle visual relacionado con marketing digital");
  });

  it("falls back to keyword-based alt when context is whitespace-only (hero)", () => {
    const result = generateAltText("", keyword, true, 0, "   ");
    expect(result).toBe("Fotografia sobre marketing digital");
  });

  it("ignores DALL-E revised prompt — uses context instead", () => {
    const revised = "A vibrant cityscape with digital billboards. The scene captures modern marketing.";
    const result = generateAltText(revised, keyword, true, 0, heroContext);
    expect(result).not.toContain("vibrant");
    expect(result).not.toContain("cityscape");
    expect(result).toBe(heroContext);
  });

  it("ignores DALL-E prompt patterns — uses context instead", () => {
    const revised = "close-up, documentary style image related to 'car rentals in Cartagena prices', shot with a simulated 85mm lens";
    const result = generateAltText(revised, "alquilar carro en cartagena", false, 1, contentContext);
    expect(result).not.toContain("close-up");
    expect(result).not.toContain("documentary");
    expect(result).not.toContain("simulated");
    expect(result).toBe(contentContext);
  });

  it("falls back and still ignores DALL-E English content when context is empty", () => {
    const revised = "Realistic photo in documentary style taken with an equivalent of a 35mm lens at f/2.8";
    const result = generateAltText(revised, keyword, true, 0, "");
    expect(result).not.toContain("Realistic");
    expect(result).not.toContain("documentary");
    expect(result).not.toContain("lens");
    expect(result).toBe("Fotografia sobre marketing digital");
  });

  it("truncates context longer than 100 chars", () => {
    const longContext = "Esta es una sección muy detallada sobre las mejores estrategias y herramientas para implementar en tu empresa de marketing digital colombiana durante 2026";
    const result = generateAltText("", keyword, true, 0, longContext);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.length).toBeGreaterThan(0);
  });

  it("alt text length is always reasonable", () => {
    const result = generateAltText("", "alquilar carro en cartagena precios", true, 0, heroContext);
    expect(result.length).toBeLessThanOrEqual(125);
    expect(result.length).toBeGreaterThan(10);
  });

  it("different sections produce different alt texts", () => {
    const altHero = generateAltText("", keyword, true, 0, heroContext);
    const altContent = generateAltText("", keyword, false, 1, contentContext);
    expect(altHero).not.toBe(altContent);
    expect(altHero).toBe(heroContext);
    expect(altContent).toBe(contentContext);
  });
});
