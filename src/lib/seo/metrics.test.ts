import { describe, it, expect } from "vitest";
import {
  calculateKeywordDensity,
  calculateKeywordFrequency,
  calculateReadingTime,
  calculateReadabilityScore,
} from "./metrics";

// ── calculateKeywordFrequency ───────────────────────────────

describe("calculateKeywordFrequency", () => {
  it("counts single-word keyword occurrences", () => {
    expect(calculateKeywordFrequency("el gato come gato", "gato")).toBe(2);
  });

  it("is case-insensitive", () => {
    expect(calculateKeywordFrequency("SEO optimización SEO", "seo")).toBe(2);
  });

  it("counts multi-word keyword phrases", () => {
    expect(
      calculateKeywordFrequency(
        "marketing digital es clave para el marketing digital moderno",
        "marketing digital",
      ),
    ).toBe(2);
  });

  it("returns 0 for empty keyword", () => {
    expect(calculateKeywordFrequency("algo de texto", "")).toBe(0);
  });

  it("returns 0 when keyword is absent", () => {
    expect(calculateKeywordFrequency("texto sin la palabra", "ausente")).toBe(0);
  });

  it("strips HTML before counting", () => {
    expect(
      calculateKeywordFrequency("<p>hola <strong>seo</strong> mundo seo</p>", "seo"),
    ).toBe(2);
  });

  it("handles overlapping matches by non-overlapping scan", () => {
    expect(calculateKeywordFrequency("aaa", "aa")).toBe(1);
  });
});

// ── calculateKeywordDensity ─────────────────────────────────

describe("calculateKeywordDensity", () => {
  it("calculates density as percentage of total words", () => {
    // 10 words, keyword appears 1 time (1 word) → 10%
    const text = "uno dos tres cuatro cinco seis siete ocho nueve seo";
    const density = calculateKeywordDensity(text, "seo");
    expect(density).toBeCloseTo(10, 0);
  });

  it("accounts for multi-word keywords in density", () => {
    // "marketing digital" = 2 words, appears 1 time in 10-word text → 20%
    const text = "uno dos tres cuatro cinco seis siete ocho marketing digital";
    const density = calculateKeywordDensity(text, "marketing digital");
    expect(density).toBeCloseTo(20, 0);
  });

  it("returns 0 for empty text", () => {
    expect(calculateKeywordDensity("", "seo")).toBe(0);
  });

  it("returns 0 when keyword is absent", () => {
    expect(calculateKeywordDensity("texto normal sin nada", "ausente")).toBe(0);
  });

  it("strips HTML before calculating", () => {
    const html = "<p>palabra</p> <div>otra</div> <span>seo</span> mas texto aqui bien largo siete ocho";
    const density = calculateKeywordDensity(html, "seo");
    expect(density).toBeGreaterThan(0);
  });
});

// ── calculateReadingTime ────────────────────────────────────

describe("calculateReadingTime", () => {
  it("returns 1 minute for very short content", () => {
    expect(calculateReadingTime(50)).toBe(1);
  });

  it("returns 1 minute for exactly 200 words", () => {
    expect(calculateReadingTime(200)).toBe(1);
  });

  it("returns 5 minutes for 1000 words", () => {
    expect(calculateReadingTime(1000)).toBe(5);
  });

  it("rounds to nearest minute", () => {
    expect(calculateReadingTime(350)).toBe(2);
  });

  it("never returns less than 1", () => {
    expect(calculateReadingTime(0)).toBe(1);
  });
});

// ── calculateReadabilityScore ───────────────────────────────

describe("calculateReadabilityScore", () => {
  it("returns 0 for empty text", () => {
    expect(calculateReadabilityScore("")).toBe(0);
  });

  it("returns a score between 0 and 100", () => {
    const text = "El gato come pescado. La casa es grande. El sol brilla fuerte.";
    const score = calculateReadabilityScore(text);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores simple sentences higher than complex ones", () => {
    const simple = "El sol sale. La luna brilla. El agua corre.";
    const complex =
      "La implementación de estrategias de marketing digital contemporáneas requiere una comprensión profunda de las dinámicas socioeconómicas.";
    expect(calculateReadabilityScore(simple)).toBeGreaterThan(
      calculateReadabilityScore(complex),
    );
  });

  it("strips HTML before computing", () => {
    const html = "<p>El gato come.</p><p>La casa es grande.</p>";
    const plain = "El gato come. La casa es grande.";
    // Should produce similar scores
    expect(
      Math.abs(calculateReadabilityScore(html) - calculateReadabilityScore(plain)),
    ).toBeLessThan(10);
  });

  it("handles text with no sentence-ending punctuation", () => {
    const text = "palabras sin punto final";
    const score = calculateReadabilityScore(text);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
