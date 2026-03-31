import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractJson } from "./content-generator";

// ── extractJson (pure, no mocks) ─────────────────────────────

describe("extractJson", () => {
  it("extracts plain JSON object", () => {
    const input = '{"key": "value"}';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("extracts JSON from markdown code fences", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("extracts JSON from code fences without language", () => {
    const input = '```\n{"key": "value"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("handles surrounding text before JSON", () => {
    const input = 'Here is the result:\n{"key": "value"}';
    expect(JSON.parse(extractJson(input))).toEqual({ key: "value" });
  });

  it("handles nested braces", () => {
    const input = '{"outer": {"inner": "value"}}';
    expect(JSON.parse(extractJson(input))).toEqual({ outer: { inner: "value" } });
  });

  it("handles braces inside string values (HTML/CSS)", () => {
    const input = '{"html": "<div style=\\"color: red\\">text</div>"}';
    const parsed = JSON.parse(extractJson(input));
    expect(parsed.html).toContain("<div");
  });

  it("throws on input with no JSON object", () => {
    expect(() => extractJson("no json here")).toThrow("No JSON object found");
  });

  it("throws on unbalanced braces", () => {
    expect(() => extractJson('{"key": "value"')).toThrow("Unbalanced JSON braces");
  });
});

// ── generateOutline & generateContent (mocked AI) ────────────

vi.mock("./openai-client", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "./openai-client";
import { generateOutline, generateContent } from "./content-generator";
import type { PostOutline, SiteConfig } from "./content-generator";

const mockChatCompletion = vi.mocked(chatCompletion);

const siteConfig: SiteConfig = {
  minWords: 1500,
  maxWords: 3000,
  conversionUrl: "https://example.com/buy",
  authoritativeSources: ["example.com"],
  domain: "example.com",
};

const validOutline: PostOutline = {
  h1: "Mejores zapatos para correr en 2025",
  metaTitle: "Mejores Zapatos para Correr 2025",
  sections: [
    { tag: "h2", text: "Qué buscar", children: [{ tag: "h3", text: "Amortiguación" }] },
    { tag: "h2", text: "Top 5 modelos", children: [] },
  ],
  faqQuestions: ["¿Cuánto duran?", "¿Qué marca es mejor?"],
  conclusion: "Conclusión final",
  tableOfContents: ["Qué buscar", "Top 5 modelos"],
};

describe("generateOutline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a valid AI JSON response into PostOutline", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validOutline));

    const result = await generateOutline("zapatos para correr", siteConfig);

    expect(result.h1).toBe("Mejores zapatos para correr en 2025");
    expect(result.sections).toHaveLength(2);
    expect(result.faqQuestions).toHaveLength(2);
  });

  it("passes keyword and word range to the prompt", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validOutline));

    await generateOutline("zapatos para correr", siteConfig);

    const prompt = mockChatCompletion.mock.calls[0]![0];
    expect(prompt).toContain("zapatos para correr");
    expect(prompt).toContain("keyword al inicio");
  });

  it("includes competition context when provided", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validOutline));

    await generateOutline("zapatos para correr", siteConfig, {
      avgWordCount: 2000,
      commonH2Topics: ["Precio", "Material"],
      contentGaps: ["Sostenibilidad"],
      suggestedAngle: "enfoque ecológico",
    });

    const prompt = mockChatCompletion.mock.calls[0]![0];
    expect(prompt).toContain("Precio");
    expect(prompt).toContain("Sostenibilidad");
    expect(prompt).toContain("enfoque ecológico");
  });

  it("handles JSON wrapped in markdown code fences", async () => {
    mockChatCompletion.mockResolvedValueOnce("```json\n" + JSON.stringify(validOutline) + "\n```");

    const result = await generateOutline("zapatos para correr", siteConfig);
    expect(result.h1).toBeDefined();
  });

  it("throws when AI returns missing required fields", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify({ h1: "Title" }));

    await expect(generateOutline("zapatos", siteConfig)).rejects.toThrow(
      "missing required fields",
    );
  });

  it("throws when AI returns invalid JSON", async () => {
    mockChatCompletion.mockResolvedValueOnce("not json at all");

    await expect(generateOutline("zapatos", siteConfig)).rejects.toThrow();
  });

  it("truncates H1 longer than 70 chars at word boundary", async () => {
    const longH1Outline = {
      ...validOutline,
      h1: "Esta es una guia extremadamente larga sobre los mejores zapatos deportivos para correr maratones",
    };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(longH1Outline));

    const result = await generateOutline("zapatos para correr", siteConfig);
    expect(result.h1.length).toBeLessThanOrEqual(60);
  });

  it("sets metaTitle from h1 when AI omits it", async () => {
    const noMetaOutline = { ...validOutline, metaTitle: undefined };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(noMetaOutline));

    const result = await generateOutline("zapatos para correr", siteConfig);
    expect(result.metaTitle).toBeDefined();
    expect(result.metaTitle.length).toBeLessThanOrEqual(60);
  });

  it("includes anti-pattern rules in content prompt", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validOutline));
    await generateOutline("zapatos para correr", siteConfig);

    const prompt = mockChatCompletion.mock.calls[0]![0];
    expect(prompt).toContain("MAXIMO 60 caracteres");
    expect(prompt).toContain("metaTitle");
  });
});

describe("generateContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validContent = {
    html: "<article><h1>Title</h1><p>Word one two three four five</p></article>",
    metaDescription: "Descubre los mejores zapatos para correr en 2025. Guia completa con precios.",
    faqItems: [{ question: "Q?", answer: "A." }],
  };

  it("returns html, markdown, wordCount, and faqItems", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validContent));

    const result = await generateContent(validOutline, "zapatos", siteConfig);

    expect(result.html).toContain("<article>");
    expect(result.markdown).toBeTruthy();
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.faqItems).toHaveLength(1);
  });

  it("calculates wordCount by stripping HTML tags", async () => {
    const content = {
      html: "<p>one</p><p>two three</p>",
      faqItems: [],
    };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(content));

    const result = await generateContent(validOutline, "kw", siteConfig);
    expect(result.wordCount).toBe(3);
  });

  it("throws when html is missing", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify({ faqItems: [] }));

    await expect(generateContent(validOutline, "kw", siteConfig)).rejects.toThrow(
      "missing html",
    );
  });

  it("defaults faqItems to empty array when missing", async () => {
    const content = { html: "<p>x</p>" };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(content));

    const result = await generateContent(validOutline, "kw", siteConfig);
    expect(result.faqItems).toEqual([]);
  });

  it("returns metaDescription from AI response", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validContent));

    const result = await generateContent(validOutline, "zapatos", siteConfig);
    expect(result.metaDescription).toContain("zapatos");
  });

  it("defaults metaDescription to empty string when missing", async () => {
    const content = { html: "<p>x</p>" };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(content));

    const result = await generateContent(validOutline, "kw", siteConfig);
    expect(result.metaDescription).toBe("");
  });

  it("includes anti-pattern rules in content prompt", async () => {
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(validContent));
    await generateContent(validOutline, "zapatos", siteConfig);

    const prompt = mockChatCompletion.mock.calls[0]![0];
    expect(prompt).toContain("PROHIBIDO");
    expect(prompt).toContain("En el mundo actual");
    expect(prompt).toContain("CUALQUIER texto en ingles");
    expect(prompt).toContain("metaDescription");
  });

  it("injects Conclusion H2 when content lacks one", async () => {
    const noConclusion = {
      html: "<article><h1>Title</h1><p>Intro paragraph with enough words to be substantial for the test to work properly here.</p></article>",
      faqItems: [],
    };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(noConclusion));

    const result = await generateContent(validOutline, "kw", siteConfig);
    expect(result.html).toContain('<h2 id="conclusion">Conclusión</h2>');
  });

  it("does not inject Conclusion when one already exists", async () => {
    const withConclusion = {
      html: '<article><h1>Title</h1><h2 id="conclusion">Conclusión</h2><p>Final thoughts here.</p></article>',
      faqItems: [],
    };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(withConclusion));

    const result = await generateContent(validOutline, "kw", siteConfig);
    const matches = result.html.match(/Conclusión/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("adds Preguntas Frecuentes heading when LLM generates details without H2", async () => {
    const faqNoHeading = {
      html: '<article><h1>T</h1><p>Content</p><section class="faq"><details><summary><strong>Q?</strong></summary><p>A.</p></details></section></article>',
      faqItems: [{ question: "Q?", answer: "A." }],
    };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(faqNoHeading));

    const result = await generateContent(validOutline, "kw", siteConfig);
    expect(result.html).toContain('<h2 id="faq">Preguntas Frecuentes</h2>');
    expect(result.html).toContain('<section class="faq">');
  });

  it("normalizes FAQ H2 to Preguntas Frecuentes when LLM writes FAQ heading", async () => {
    const faqEnglishHeading = {
      html: '<article><h1>T</h1><p>Content</p><h2 id="faq">FAQ</h2><section class="faq"><details><summary>Q?</summary><p>A.</p></details></section></article>',
      faqItems: [{ question: "Q?", answer: "A." }],
    };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(faqEnglishHeading));

    const result = await generateContent(validOutline, "kw", siteConfig);
    expect(result.html).toContain("Preguntas Frecuentes");
    expect(result.html).not.toMatch(/>FAQ<\/h2>/);
  });

  it("injects FAQ with bold questions when faqItems exist but no details tags", async () => {
    const withFaq = {
      html: '<article><h1>T</h1><h2>Preguntas frecuentes</h2><p>Some FAQ text</p></article>',
      faqItems: [{ question: "¿Qué es?", answer: "Es algo." }],
    };
    mockChatCompletion.mockResolvedValueOnce(JSON.stringify(withFaq));

    const result = await generateContent(validOutline, "kw", siteConfig);
    expect(result.html).toContain("<strong>¿Qué es?</strong>");
    expect(result.html).toContain("<details>");
    expect(result.html).toContain("<summary>");
  });
});
