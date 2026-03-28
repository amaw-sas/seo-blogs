/**
 * Generate a ThemeConfig for a blog niche using LLM.
 * Uses bounded categorical selection — the LLM picks from finite lists,
 * not free-form CSS values. ~100% success rate on structured output.
 */

import { chatCompletion } from "./openai-client";

export interface ThemeConfig {
  colorScheme: string;
  fontFamily: string;
  contentWidth?: string;
  fontSize?: string;
  spacing?: string;
  borderRadius?: string;
  accentColor?: string;
}

export const VALID_COLOR_SCHEMES = [
  "slate", "warm", "cool", "earth", "ocean", "forest", "sunset", "monochrome",
] as const;

export const VALID_FONT_FAMILIES = [
  "system", "serif", "geometric", "humanist", "mono",
] as const;

const VALID_CONTENT_WIDTHS = ["narrow", "medium", "wide"] as const;
const VALID_FONT_SIZES = ["compact", "default", "large"] as const;
const VALID_SPACINGS = ["tight", "default", "relaxed"] as const;
const VALID_BORDER_RADII = ["none", "subtle", "rounded"] as const;

const DEFAULT_THEME: ThemeConfig = {
  colorScheme: "slate",
  fontFamily: "system",
};

/**
 * Ask GPT-4o to select theme parameters for a blog niche.
 * Always returns a valid ThemeConfig — falls back to defaults on any error.
 */
export async function generateThemeConfig(
  niche: string,
  domain: string,
): Promise<ThemeConfig> {
  const prompt = `Eres un diseñador web experto. Dado un blog sobre "${niche}" (dominio: ${domain}), selecciona parámetros de diseño que transmitan la identidad visual correcta para ese nicho.

Selecciona de estas opciones:
- colorScheme: uno de [${VALID_COLOR_SCHEMES.join(", ")}]
- fontFamily: uno de [${VALID_FONT_FAMILIES.join(", ")}]
- contentWidth: uno de [${VALID_CONTENT_WIDTHS.join(", ")}]
- fontSize: uno de [${VALID_FONT_SIZES.join(", ")}]
- spacing: uno de [${VALID_SPACINGS.join(", ")}]
- borderRadius: uno de [${VALID_BORDER_RADII.join(", ")}]

Responde SOLO con JSON válido, sin markdown code fences:
{ "colorScheme": "...", "fontFamily": "...", "contentWidth": "...", "fontSize": "...", "spacing": "...", "borderRadius": "..." }`;

  try {
    const text = await chatCompletion(prompt, 300, 0.7);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return DEFAULT_THEME;

    const raw = JSON.parse(jsonMatch[0]);
    return sanitizeTheme(raw);
  } catch {
    return DEFAULT_THEME;
  }
}

function sanitizeTheme(raw: Record<string, unknown>): ThemeConfig {
  const theme: ThemeConfig = {
    colorScheme: isValidOption(raw.colorScheme, VALID_COLOR_SCHEMES) ? raw.colorScheme as string : "slate",
    fontFamily: isValidOption(raw.fontFamily, VALID_FONT_FAMILIES) ? raw.fontFamily as string : "system",
  };

  if (isValidOption(raw.contentWidth, VALID_CONTENT_WIDTHS)) theme.contentWidth = raw.contentWidth as string;
  if (isValidOption(raw.fontSize, VALID_FONT_SIZES)) theme.fontSize = raw.fontSize as string;
  if (isValidOption(raw.spacing, VALID_SPACINGS)) theme.spacing = raw.spacing as string;
  if (isValidOption(raw.borderRadius, VALID_BORDER_RADII)) theme.borderRadius = raw.borderRadius as string;

  if (typeof raw.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.accentColor)) {
    theme.accentColor = raw.accentColor;
  }

  return theme;
}

function isValidOption(value: unknown, options: readonly string[]): boolean {
  return typeof value === "string" && options.includes(value);
}
