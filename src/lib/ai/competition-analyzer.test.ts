import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./openai-client", () => ({
  chatCompletion: vi.fn(),
}));

vi.mock("./prompt-builder", () => ({
  buildPrompt: vi.fn().mockRejectedValue(new Error("Not seeded")),
}));

import { chatCompletion } from "./openai-client";
import { analyzeCompetition } from "./competition-analyzer";

const mockChatCompletion = vi.mocked(chatCompletion);

const validAnalysis = {
  avgWordCount: 2200,
  commonH2Topics: ["Beneficios", "Tipos", "Precios", "Comparativa", "Opiniones"],
  contentGaps: ["Sostenibilidad", "Accesorios complementarios", "Mantenimiento"],
  suggestedAngle: "Guía práctica con enfoque en durabilidad",
};

describe("analyzeCompetition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses valid AI response into CompetitionAnalysis", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validAnalysis));

    const result = await analyzeCompetition("zapatos running");

    expect(result.avgWordCount).toBe(2200);
    expect(result.commonH2Topics).toHaveLength(5);
    expect(result.contentGaps).toHaveLength(3);
    expect(result.suggestedAngle).toContain("durabilidad");
  });

  it("passes keyword in the prompt", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validAnalysis));

    await analyzeCompetition("mejores laptops 2025");

    const prompt = mockChatCompletion.mock.calls[0]![0];
    expect(prompt).toContain("mejores laptops 2025");
  });

  it("extracts JSON when surrounded by text", async () => {
    mockChatCompletion.mockResolvedValueOnce(
      "Aquí tienes el análisis:\n" + JSON.stringify(validAnalysis) + "\nEspero que te sirva.",
    );

    const result = await analyzeCompetition("kw");
    expect(result.avgWordCount).toBe(2200);
  });

  it("throws when AI returns no JSON", async () => {
    mockChatCompletion.mockResolvedValueOnce("No puedo analizar esa keyword.");

    await expect(analyzeCompetition("kw")).rejects.toThrow(
      "Failed to parse competition analysis JSON",
    );
  });

  it("throws when required fields are missing", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify({ avgWordCount: 1000 }));

    await expect(analyzeCompetition("kw")).rejects.toThrow(
      "missing required fields",
    );
  });

  it("throws when avgWordCount is 0", async () => {
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ ...validAnalysis, avgWordCount: 0 }),
    );

    await expect(analyzeCompetition("kw")).rejects.toThrow(
      "missing required fields",
    );
  });
});
