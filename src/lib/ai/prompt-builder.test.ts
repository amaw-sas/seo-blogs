import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Prisma mock ─────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  pipelineStep: { findUnique: vi.fn() },
  pipelineStepOverride: { findUnique: vi.fn() },
}));
vi.mock("../db/prisma", () => ({ prisma: mockPrisma }));

import { buildPrompt } from "./prompt-builder";

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no override
  mockPrisma.pipelineStepOverride.findUnique.mockResolvedValue(null);
});

// ── Helper factories ────────────────────────────────────────

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    id: "step-1",
    stepKey: "generate-outline",
    label: "Generate Outline",
    description: "Generates post outline",
    order: 1,
    active: true,
    hasPrompt: true,
    promptBase: "You are a SEO expert.",
    promptSections: {
      rules: { label: "Rules", content: "Write in Spanish.", active: true },
      format: { label: "Format", content: "Use H2 headings.", active: true },
    },
    extraInstructions: "Be concise.",
    responseFormat: "Respond in JSON.",
    model: "gpt-4.1",
    maxTokens: 2000,
    temperature: 0.7,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe("buildPrompt", () => {
  it("assembles prompt from global step with all sections active", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(makeStep());

    const result = await buildPrompt("generate-outline", null, {});

    // Verify order: promptBase → sections (alphabetically) → extraInstructions → responseFormat
    const parts = result.prompt.split("\n\n");
    expect(parts[0]).toBe("You are a SEO expert.");
    // "format" before "rules" alphabetically
    expect(parts[1]).toContain("FORMAT:\nUse H2 headings.");
    expect(parts[2]).toContain("RULES:\nWrite in Spanish.");
    expect(parts[3]).toBe("Be concise.");
    expect(parts[4]).toBe("Respond in JSON.");
  });

  it("excludes sections with active: false", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(
      makeStep({
        promptSections: {
          rules: { label: "Rules", content: "Write in Spanish.", active: true },
          format: { label: "Format", content: "Use H2 headings.", active: false },
        },
      }),
    );

    const result = await buildPrompt("generate-outline", null, {});

    expect(result.prompt).toContain("RULES:");
    expect(result.prompt).not.toContain("FORMAT:");
  });

  it("sorts sections alphabetically by key", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(
      makeStep({
        promptSections: {
          b_section: { label: "Beta", content: "Beta content.", active: true },
          a_section: { label: "Alpha", content: "Alpha content.", active: true },
        },
      }),
    );

    const result = await buildPrompt("generate-outline", null, {});

    const alphaIdx = result.prompt.indexOf("ALPHA:");
    const betaIdx = result.prompt.indexOf("BETA:");
    expect(alphaIdx).toBeLessThan(betaIdx);
  });

  it("applies site override sections", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(makeStep());
    mockPrisma.pipelineStepOverride.findUnique.mockResolvedValue({
      id: "ovr-1",
      siteId: "site-1",
      stepKey: "generate-outline",
      promptSections: {
        rules: { label: "Rules", content: "Write in English instead.", active: true },
      },
      extraInstructions: null,
      temperature: null,
      maxTokens: null,
      active: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await buildPrompt("generate-outline", "site-1", {});

    // Override replaced the "rules" key entirely
    expect(result.prompt).toContain("Write in English instead.");
    expect(result.prompt).not.toContain("Write in Spanish.");
    // "format" from global still present
    expect(result.prompt).toContain("FORMAT:\nUse H2 headings.");
  });

  it("merges override scalars", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(makeStep());
    mockPrisma.pipelineStepOverride.findUnique.mockResolvedValue({
      id: "ovr-1",
      siteId: "site-1",
      stepKey: "generate-outline",
      promptSections: null,
      extraInstructions: null,
      temperature: 0.9,
      maxTokens: 4000,
      active: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await buildPrompt("generate-outline", "site-1", {});

    expect(result.temperature).toBe(0.9);
    expect(result.maxTokens).toBe(4000);
  });

  it("appends both extra instructions", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(makeStep());
    mockPrisma.pipelineStepOverride.findUnique.mockResolvedValue({
      id: "ovr-1",
      siteId: "site-1",
      stepKey: "generate-outline",
      promptSections: null,
      extraInstructions: "Focus on car rental.",
      temperature: null,
      maxTokens: null,
      active: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await buildPrompt("generate-outline", "site-1", {});

    // Override extra instructions come first, then step's
    const overrideIdx = result.prompt.indexOf("Focus on car rental.");
    const stepIdx = result.prompt.indexOf("Be concise.");
    expect(overrideIdx).toBeGreaterThan(-1);
    expect(stepIdx).toBeGreaterThan(-1);
    expect(overrideIdx).toBeLessThan(stepIdx);
  });

  it("replaces {{variable}} placeholders", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(
      makeStep({ promptBase: "Write about {{keyword}} with {{wordCount}} words." }),
    );

    const result = await buildPrompt("generate-outline", null, {
      keyword: "alquiler de carros",
      wordCount: 2000,
    });

    expect(result.prompt).toContain("Write about alquiler de carros with 2000 words.");
    expect(result.prompt).not.toContain("{{keyword}}");
    expect(result.prompt).not.toContain("{{wordCount}}");
  });

  it("replaces unresolved placeholders with empty string", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockPrisma.pipelineStep.findUnique.mockResolvedValue(
      makeStep({ promptBase: "Topic: {{unknown}} end." }),
    );

    const result = await buildPrompt("generate-outline", null, {});

    expect(result.prompt).toContain("Topic:  end.");
    expect(result.prompt).not.toContain("{{unknown}}");
    expect(warnSpy).toHaveBeenCalledWith("Unresolved placeholder: {{unknown}}");

    warnSpy.mockRestore();
  });

  it("throws when step not found", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(null);

    await expect(buildPrompt("nonexistent", null, {})).rejects.toThrow(
      "Pipeline step not found: nonexistent",
    );
  });

  it("throws when step is disabled", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(makeStep({ active: false }));

    await expect(buildPrompt("generate-outline", null, {})).rejects.toThrow(
      "Pipeline step is disabled: generate-outline",
    );
  });

  it("throws when override disables step", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(makeStep({ active: true }));
    mockPrisma.pipelineStepOverride.findUnique.mockResolvedValue({
      id: "ovr-1",
      siteId: "site-1",
      stepKey: "generate-outline",
      promptSections: null,
      extraInstructions: null,
      temperature: null,
      maxTokens: null,
      active: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(buildPrompt("generate-outline", "site-1", {})).rejects.toThrow(
      "Pipeline step is disabled: generate-outline",
    );
  });

  it("returns empty prompt for non-AI steps", async () => {
    mockPrisma.pipelineStep.findUnique.mockResolvedValue(
      makeStep({ hasPrompt: false }),
    );

    const result = await buildPrompt("generate-outline", null, {});

    expect(result.prompt).toBe("");
    expect(result.maxTokens).toBe(2000);
    expect(result.model).toBe("gpt-4.1");
  });
});
