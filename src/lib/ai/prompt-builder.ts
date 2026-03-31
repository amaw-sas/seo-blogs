import { prisma } from "../db/prisma";

interface PromptSection {
  label: string;
  content: string;
  active?: boolean;
}

export interface BuildPromptResult {
  prompt: string;
  maxTokens: number;
  temperature: number | undefined;
  model: string;
}

export async function buildPrompt(
  stepKey: string,
  siteId: string | null,
  variables: Record<string, string | number | undefined>,
): Promise<BuildPromptResult> {
  // 1. Load step from DB
  const step = await prisma.pipelineStep.findUnique({
    where: { stepKey },
  });

  if (!step) {
    throw new Error(`Pipeline step not found: ${stepKey}`);
  }

  // 2. Load override if siteId provided
  const override =
    siteId
      ? await prisma.pipelineStepOverride.findUnique({
          where: { siteId_stepKey: { siteId, stepKey } },
        })
      : null;

  // 3. Merge scalars
  const mergedActive = override?.active ?? step.active;
  const mergedMaxTokens = override?.maxTokens ?? step.maxTokens;
  const mergedTemperature = override?.temperature ?? step.temperature;

  if (!mergedActive) {
    throw new Error(`Pipeline step is disabled: ${stepKey}`);
  }

  // 4. Early return for non-AI steps
  if (!step.hasPrompt) {
    return {
      prompt: "",
      maxTokens: mergedMaxTokens,
      temperature: mergedTemperature ?? undefined,
      model: step.model,
    };
  }

  // 3 (continued). Merge sections — key-level replacement
  const globalSections = (step.promptSections as Record<string, unknown> ?? {}) as Record<string, PromptSection>;
  const overrideSections = (override?.promptSections as Record<string, unknown> ?? {}) as Record<string, PromptSection>;
  const mergedSections: Record<string, PromptSection> = {
    ...globalSections,
    ...overrideSections,
  };

  // 5. Concatenate prompt pieces
  const parts: string[] = [];

  // promptBase
  if (step.promptBase) {
    parts.push(step.promptBase);
  }

  // Active sections sorted alphabetically by key
  const sortedKeys = Object.keys(mergedSections).sort();
  const sectionParts: string[] = [];
  for (const key of sortedKeys) {
    const section = mergedSections[key]!;
    if (section.active === false) continue;
    sectionParts.push(`${section.label.toUpperCase()}:\n${section.content}`);
  }
  if (sectionParts.length > 0) {
    parts.push(sectionParts.join("\n\n"));
  }

  // Extra instructions: override first, then step (append both if both exist)
  const extraParts: string[] = [];
  if (override?.extraInstructions) {
    extraParts.push(override.extraInstructions);
  }
  if (step.extraInstructions) {
    extraParts.push(step.extraInstructions);
  }
  if (extraParts.length > 0) {
    parts.push(extraParts.join("\n\n"));
  }

  // responseFormat
  if (step.responseFormat) {
    parts.push(step.responseFormat);
  }

  let prompt = parts.join("\n\n");

  // 6. Replace {{variable}} placeholders
  prompt = prompt.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === undefined) {
      console.warn(`Unresolved placeholder: {{${key}}}`);
      return "";
    }
    return String(value);
  });

  return {
    prompt,
    maxTokens: mergedMaxTokens,
    temperature: mergedTemperature ?? undefined,
    model: step.model,
  };
}
