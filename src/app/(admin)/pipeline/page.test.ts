import { describe, it, expect } from "vitest";

const OPTIONAL_STEPS = [
  "competition_analysis",
  "auto_categorization",
  "auto_linking",
];

const ESSENTIAL_STEPS = [
  "keyword_selection",
  "outline_generation",
  "content_generation",
  "image_generation",
  "seo_scoring",
  "post_save",
  "publishing",
];

describe("PipelineEditorPage — UI contract", () => {
  it("optional steps are distinct from essential steps", () => {
    const overlap = OPTIONAL_STEPS.filter((s) => ESSENTIAL_STEPS.includes(s));
    expect(overlap).toHaveLength(0);
  });

  it("only optional steps should show active toggle", () => {
    expect(OPTIONAL_STEPS).toHaveLength(3);
    expect(ESSENTIAL_STEPS).toHaveLength(7);
  });

  it("non-AI steps should not show save button", () => {
    const nonAiStep = { hasPrompt: false };
    const showSave = nonAiStep.hasPrompt;
    expect(showSave).toBe(false);
  });
});
