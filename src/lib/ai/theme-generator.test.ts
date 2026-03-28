import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./openai-client", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "./openai-client";
import { generateThemeConfig, VALID_COLOR_SCHEMES, VALID_FONT_FAMILIES } from "./theme-generator";

const mockChatCompletion = chatCompletion as ReturnType<typeof vi.fn>;

describe("generateThemeConfig — LLM-based theme selection for blog niches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a valid ThemeConfig for a given niche", async () => {
    mockChatCompletion.mockResolvedValue(
      JSON.stringify({
        colorScheme: "ocean",
        fontFamily: "serif",
        contentWidth: "medium",
        fontSize: "default",
        spacing: "relaxed",
        borderRadius: "subtle",
      })
    );

    const result = await generateThemeConfig("alquiler de carros en Bogotá", "alquilatucarro.com");

    expect(result.colorScheme).toBe("ocean");
    expect(result.fontFamily).toBe("serif");
    expect(VALID_COLOR_SCHEMES).toContain(result.colorScheme);
    expect(VALID_FONT_FAMILIES).toContain(result.fontFamily);
  });

  it("falls back to defaults when LLM returns invalid colorScheme", async () => {
    mockChatCompletion.mockResolvedValue(
      JSON.stringify({
        colorScheme: "rainbow",
        fontFamily: "serif",
      })
    );

    const result = await generateThemeConfig("tech blog", "techblog.com");

    expect(result.colorScheme).toBe("slate");
    expect(result.fontFamily).toBe("serif");
  });

  it("falls back to defaults when LLM returns invalid fontFamily", async () => {
    mockChatCompletion.mockResolvedValue(
      JSON.stringify({
        colorScheme: "warm",
        fontFamily: "comic-sans",
      })
    );

    const result = await generateThemeConfig("cooking blog", "recetas.com");

    expect(result.colorScheme).toBe("warm");
    expect(result.fontFamily).toBe("system");
  });

  it("falls back to full defaults when LLM returns unparseable JSON", async () => {
    mockChatCompletion.mockResolvedValue("this is not json at all");

    const result = await generateThemeConfig("random niche", "example.com");

    expect(result.colorScheme).toBe("slate");
    expect(result.fontFamily).toBe("system");
  });

  it("strips unknown fields from LLM response", async () => {
    mockChatCompletion.mockResolvedValue(
      JSON.stringify({
        colorScheme: "forest",
        fontFamily: "humanist",
        unknownField: "should be stripped",
        cssInjection: "url(evil)",
      })
    );

    const result = await generateThemeConfig("nature blog", "nature.com");

    expect(result).not.toHaveProperty("unknownField");
    expect(result).not.toHaveProperty("cssInjection");
    expect(result.colorScheme).toBe("forest");
  });

  it("validates accentColor hex format", async () => {
    mockChatCompletion.mockResolvedValue(
      JSON.stringify({
        colorScheme: "slate",
        fontFamily: "system",
        accentColor: "not-a-hex",
      })
    );

    const result = await generateThemeConfig("blog", "blog.com");

    expect(result.accentColor).toBeUndefined();
  });

  it("accepts valid accentColor", async () => {
    mockChatCompletion.mockResolvedValue(
      JSON.stringify({
        colorScheme: "slate",
        fontFamily: "system",
        accentColor: "#ff5500",
      })
    );

    const result = await generateThemeConfig("blog", "blog.com");

    expect(result.accentColor).toBe("#ff5500");
  });

  it("prompt includes niche and domain", async () => {
    mockChatCompletion.mockResolvedValue(
      JSON.stringify({ colorScheme: "slate", fontFamily: "system" })
    );

    await generateThemeConfig("alquiler de carros", "alquilatucarro.com");

    const prompt = mockChatCompletion.mock.calls[0][0];
    expect(prompt).toContain("alquiler de carros");
    expect(prompt).toContain("alquilatucarro.com");
  });
});
