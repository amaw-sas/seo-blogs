import { describe, it, expect, vi } from "vitest";

// ── Mock OpenAI client ─────────────────────────────────────

vi.mock("./openai-client", () => ({
  chatCompletion: vi.fn().mockResolvedValue(
    JSON.stringify({
      userIntent: "Buscar opciones de alquiler de carro en Bogotá",
      recommendedAngle: "Comparativa de precios por zona de la ciudad",
      businessConnection: "Servicio directo de alquiler en Bogotá",
      suggestedWordRange: { min: 1500, max: 2500 },
      depth: "medium",
    }),
  ),
}));

vi.mock("./prompt-builder", () => ({
  buildPrompt: vi.fn().mockRejectedValue(new Error("No DB step")),
}));

import { interpretKeyword, type KeywordInterpretation } from "./keyword-interpreter";

describe("interpretKeyword", () => {
  it("returns a valid interpretation object", async () => {
    const result = await interpretKeyword("alquiler carro bogota", "alquilercarrobogota.com", "Empresa de alquiler de carros");

    expect(result).toHaveProperty("userIntent");
    expect(result).toHaveProperty("recommendedAngle");
    expect(result).toHaveProperty("businessConnection");
    expect(result).toHaveProperty("suggestedWordRange");
    expect(result).toHaveProperty("depth");
    expect(result.suggestedWordRange).toHaveProperty("min");
    expect(result.suggestedWordRange).toHaveProperty("max");
  });

  it("returns depth as one of light/medium/deep", async () => {
    const result = await interpretKeyword("alquiler carro bogota", "alquilercarrobogota.com");

    expect(["light", "medium", "deep"]).toContain(result.depth);
  });

  it("returns min <= max in suggestedWordRange", async () => {
    const result = await interpretKeyword("alquiler carro bogota", "alquilercarrobogota.com");

    expect(result.suggestedWordRange.min).toBeLessThanOrEqual(result.suggestedWordRange.max);
  });
});
