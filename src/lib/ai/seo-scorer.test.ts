import { describe, it, expect } from "vitest";
import { calculateSeoScore, type ScorerInput } from "./seo-scorer";

function makeInput(overrides: Partial<ScorerInput> = {}): ScorerInput {
  // Default: keyword in first 100 words, in H2, FAQ section, images, links, good meta, schema, conclusion
  const keyword = "marketing digital";
  const words = Array(90).fill("texto").join(" ");
  const html = `<article>
    <h1>Guía de ${keyword}</h1>
    <p>${keyword} es importante. ${words}</p>
    <h2>Beneficios del ${keyword}</h2>
    <p>Los beneficios son muchos.</p>
    <section class="faq"><details><summary>¿Qué es?</summary><p>Respuesta</p></details></section>
    <h2 id="conclusion">Conclusión</h2>
    <p>En resumen, ${keyword} es clave.</p>
  </article>`;

  return {
    contentHtml: html,
    keyword,
    metaTitle: `Guía de ${keyword}`,
    metaDescription: `Aprende todo sobre ${keyword} en esta guía completa.`,
    slug: "guia-marketing-digital",
    images: [{ altText: "Imagen de marketing" }],
    links: [
      { type: "internal" },
      { type: "external" },
      { type: "conversion" },
    ],
    schemaJsonLd: { "@context": "https://schema.org" },
    existingPostCount: 5,
    ...overrides,
  };
}

describe("calculateSeoScore", () => {
  it("returns totalScore between 0 and 100", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("gives max score for fully optimized content", () => {
    const result = calculateSeoScore(makeInput());
    // Should pass most checks → high score
    expect(result.totalScore).toBeGreaterThanOrEqual(70);
  });

  it("detects keyword in first 100 words", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.breakdown.keywordInFirst100Words.pass).toBe(true);
    expect(result.keywordDistribution.firstHundredWords).toBe(true);
  });

  it("fails keyword in first 100 words when absent", () => {
    const html = `<article><p>${Array(110).fill("texto").join(" ")}</p><p>marketing digital al final</p></article>`;
    const result = calculateSeoScore(makeInput({ contentHtml: html }));
    expect(result.breakdown.keywordInFirst100Words.pass).toBe(false);
  });

  it("detects keyword in H2s", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.breakdown.keywordInH2s.pass).toBe(true);
  });

  it("detects FAQ section", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.breakdown.faqPresent.pass).toBe(true);
  });

  it("fails FAQ when no FAQ markers exist", () => {
    const html = "<article><p>marketing digital texto simple</p></article>";
    const result = calculateSeoScore(makeInput({ contentHtml: html }));
    expect(result.breakdown.faqPresent.pass).toBe(false);
  });

  it("checks images with alt text", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.breakdown.imagesWithAlt.pass).toBe(true);
  });

  it("fails images when altText is empty", () => {
    const result = calculateSeoScore(makeInput({ images: [{ altText: "" }] }));
    // Falls back to checking img tags in HTML
    expect(result.breakdown.imagesWithAlt.pass).toBe(false);
  });

  it("checks internal, external, and conversion links", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.breakdown.internalLinks.pass).toBe(true);
    expect(result.breakdown.externalLinks.pass).toBe(true);
    expect(result.breakdown.conversionLink.pass).toBe(true);
  });

  it("fails links when none provided", () => {
    const result = calculateSeoScore(makeInput({ links: [] }));
    expect(result.breakdown.internalLinks.pass).toBe(false);
    expect(result.breakdown.externalLinks.pass).toBe(false);
    expect(result.breakdown.conversionLink.pass).toBe(false);
  });

  it("validates meta title length and keyword presence", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.breakdown.metaTitleOptimal.pass).toBe(true);
  });

  it("fails meta title when too long", () => {
    const longTitle = "a".repeat(61);
    const result = calculateSeoScore(makeInput({ metaTitle: longTitle }));
    expect(result.breakdown.metaTitleOptimal.pass).toBe(false);
  });

  it("validates meta description length and keyword", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.breakdown.metaDescriptionOptimal.pass).toBe(true);
  });

  it("fails meta description when keyword missing", () => {
    const result = calculateSeoScore(
      makeInput({ metaDescription: "Una descripción sin la palabra clave" }),
    );
    expect(result.breakdown.metaDescriptionOptimal.pass).toBe(false);
  });

  it("returns word count and char count", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.charCount).toBeGreaterThan(0);
  });

  it("returns reading time >= 1", () => {
    const result = calculateSeoScore(makeInput());
    expect(result.readingTimeMinutes).toBeGreaterThanOrEqual(1);
  });

  it("fails meta description longer than 155 chars", () => {
    const desc156 = "marketing digital " + "a".repeat(138); // 156 chars
    const result = calculateSeoScore(makeInput({ metaDescription: desc156 }));
    expect(result.breakdown.metaDescriptionOptimal.pass).toBe(false);
  });

  it("passes meta description at exactly 155 chars", () => {
    const desc = "marketing digital " + "a".repeat(137); // 155 chars
    const result = calculateSeoScore(makeInput({ metaDescription: desc }));
    expect(result.breakdown.metaDescriptionOptimal.pass).toBe(true);
  });
});
