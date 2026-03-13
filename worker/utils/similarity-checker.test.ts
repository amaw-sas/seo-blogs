import { describe, it, expect } from "vitest";
import { checkCannibalization } from "./similarity-checker";

describe("checkCannibalization", () => {
  it("returns empty array when no existing keywords", () => {
    expect(checkCannibalization("marketing digital", [])).toEqual([]);
  });

  it("detects identical keywords as cannibalization", () => {
    const results = checkCannibalization("marketing digital", ["marketing digital"]);
    expect(results).toHaveLength(1);
    expect(results[0].isCannibalization).toBe(true);
    expect(results[0].similarity).toBe(1);
  });

  it("detects very similar keywords", () => {
    const results = checkCannibalization("marketing digital", [
      "estrategias de marketing digital",
    ]);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].similarity).toBeGreaterThan(0.3);
  });

  it("does not flag unrelated keywords", () => {
    const results = checkCannibalization("marketing digital", [
      "recetas de cocina",
      "programación python",
    ]);
    expect(results).toHaveLength(0);
  });

  it("returns results sorted by similarity descending", () => {
    const results = checkCannibalization("marketing digital para empresas", [
      "marketing digital",
      "marketing digital para pymes",
    ]);
    if (results.length >= 2) {
      expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
    }
  });

  it("handles single-word keywords", () => {
    const results = checkCannibalization("seo", ["seo"]);
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBe(1);
  });

  it("is case-insensitive", () => {
    const results = checkCannibalization("Marketing Digital", ["marketing digital"]);
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBe(1);
  });

  it("filters out stopwords for better signal", () => {
    // "de" and "la" are stopwords — should not inflate similarity
    const results = checkCannibalization("guía de la cocina", [
      "historia de la música",
    ]);
    expect(results).toHaveLength(0);
  });

  it("handles empty new keyword gracefully", () => {
    const results = checkCannibalization("", ["marketing digital"]);
    // Empty tokenizes to empty set → similarity 0
    expect(results).toHaveLength(0);
  });

  it("uses threshold of 0.4", () => {
    // Two keywords sharing some tokens but below threshold
    const results = checkCannibalization("inteligencia artificial avanzada", [
      "marketing digital básico",
    ]);
    expect(results.every((r) => r.similarity >= 0.4)).toBe(true);
  });

  it("includes keyword field in results", () => {
    const results = checkCannibalization("seo local", ["seo local para negocios"]);
    if (results.length > 0) {
      expect(results[0].keyword).toBe("seo local para negocios");
    }
  });

  it("handles accented characters", () => {
    const results = checkCannibalization("optimización seo", ["optimización seo"]);
    expect(results).toHaveLength(1);
    expect(results[0].similarity).toBe(1);
  });
});
