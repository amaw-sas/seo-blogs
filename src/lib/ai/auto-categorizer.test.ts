import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./openai-client", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "./openai-client";
import { categorizePost } from "./auto-categorizer";

const mockChatCompletion = vi.mocked(chatCompletion);

const existingCategories = [
  { slug: "tecnologia", name: "Tecnología" },
  { slug: "salud", name: "Salud" },
  { slug: "finanzas-personales", name: "Finanzas Personales" },
];

describe("categorizePost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing category when AI matches one", async () => {
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ categorySlug: "tecnologia", categoryName: "Tecnología", isNew: false }),
    );

    const result = await categorizePost("Mejores laptops 2025", "laptops baratas", existingCategories);

    expect(result.categorySlug).toBe("tecnologia");
    expect(result.isNew).toBe(false);
  });

  it("returns new category when AI suggests one", async () => {
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ categorySlug: "mascotas", categoryName: "Mascotas", isNew: true }),
    );

    const result = await categorizePost("Mejores alimentos para perros", "comida perros", existingCategories);

    expect(result.isNew).toBe(true);
    expect(result.categorySlug).toBe("mascotas");
  });

  it("corrects hallucinated slug by matching name", async () => {
    // AI returns isNew: false with a non-existent slug but correct name
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ categorySlug: "tech", categoryName: "Tecnología", isNew: false }),
    );

    const result = await categorizePost("Nuevo iPhone", "iphone 16", existingCategories);

    expect(result.categorySlug).toBe("tecnologia");
    expect(result.categoryName).toBe("Tecnología");
    expect(result.isNew).toBe(false);
  });

  it("marks as new when AI claims existing but both slug and name are wrong", async () => {
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ categorySlug: "deportes", categoryName: "Deportes", isNew: false }),
    );

    const result = await categorizePost("Mejores pelotas", "pelotas", existingCategories);

    expect(result.isNew).toBe(true);
    expect(result.categorySlug).toBe("deportes");
  });

  it("generates proper slug for new categories (no accents, lowercase, hyphens)", async () => {
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ categorySlug: "whatever", categoryName: "Educación Financiera", isNew: true }),
    );

    const result = await categorizePost("Cómo ahorrar", "ahorro", existingCategories);

    expect(result.categorySlug).toBe("educacion-financiera");
    expect(result.isNew).toBe(true);
  });

  it("falls back to first category when AI returns no JSON", async () => {
    mockChatCompletion.mockResolvedValueOnce("No puedo categorizar esto.");

    const result = await categorizePost("Algo raro", "random", existingCategories);

    expect(result.categorySlug).toBe("tecnologia");
    expect(result.isNew).toBe(false);
  });

  it("suggests new category when existingCategories is empty (no AI call for matching)", async () => {
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ categorySlug: "viajes", categoryName: "Viajes" }),
    );

    const result = await categorizePost("Mejores destinos", "viajes baratos", []);

    expect(result.isNew).toBe(true);
    expect(result.categorySlug).toBe("viajes");
  });

  it("uses hardcoded fallback when empty categories AND no JSON from AI", async () => {
    mockChatCompletion.mockResolvedValueOnce("invalid");

    const result = await categorizePost("Test", "test keyword", []);

    expect(result.isNew).toBe(true);
    // Falls back to keyword-based slug
    expect(result.categorySlug).toBe("test-keyword");
  });

  it("passes existing categories list in the prompt", async () => {
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ categorySlug: "salud", categoryName: "Salud", isNew: false }),
    );

    await categorizePost("Dieta keto", "dieta keto", existingCategories);

    const prompt = mockChatCompletion.mock.calls[0]![0];
    expect(prompt).toContain("Tecnología");
    expect(prompt).toContain("Salud");
    expect(prompt).toContain("Finanzas Personales");
  });

  it("truncates slug to 60 chars max", async () => {
    const longName = "A".repeat(80);
    mockChatCompletion.mockResolvedValueOnce(
      JSON.stringify({ categorySlug: "x", categoryName: longName, isNew: true }),
    );

    const result = await categorizePost("Test", "kw", existingCategories);
    expect(result.categorySlug.length).toBeLessThanOrEqual(60);
  });
});
