/**
 * Structured knowledge base parser and composer.
 * Converts between a plain-text knowledgeBase string and structured fields.
 */

export interface KnowledgeFields {
  businessName: string;
  services: string;
  locations: string;
  pricing: string;
  differentiators: string;
  contact: string;
  policies: string;
  tone: string;
  extra: string;
}

export const EMPTY_FIELDS: KnowledgeFields = {
  businessName: "",
  services: "",
  locations: "",
  pricing: "",
  differentiators: "",
  contact: "",
  policies: "",
  tone: "",
  extra: "",
};

const FIELD_LABELS: Record<keyof Omit<KnowledgeFields, "extra">, string> = {
  businessName: "Nombre del negocio",
  services: "Servicios u oferta",
  locations: "Ubicaciones o zonas",
  pricing: "Precios o rangos",
  differentiators: "Diferenciadores",
  contact: "Datos de contacto",
  policies: "Restricciones o políticas",
  tone: "Tono de comunicación",
};

export { FIELD_LABELS };

/**
 * Parse a plain-text knowledgeBase string into structured fields.
 * Recognizes lines starting with known labels (e.g., "Nombre del negocio: ...").
 * Anything not matching a known label goes to `extra`.
 */
export function parseKnowledgeBase(text: string | null): KnowledgeFields {
  if (!text?.trim()) return { ...EMPTY_FIELDS };

  const fields: KnowledgeFields = { ...EMPTY_FIELDS };
  const labelToKey = new Map<string, keyof Omit<KnowledgeFields, "extra">>();
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    labelToKey.set(label.toLowerCase(), key as keyof Omit<KnowledgeFields, "extra">);
  }

  const extraLines: string[] = [];
  let currentKey: keyof KnowledgeFields | null = null;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    // Try to match "Label: value"
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const possibleLabel = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const matchedKey = labelToKey.get(possibleLabel);
      if (matchedKey) {
        currentKey = matchedKey;
        const value = trimmed.slice(colonIdx + 1).trim();
        fields[matchedKey] = value;
        continue;
      }
    }

    // Unmatched line → extra
    if (trimmed) {
      currentKey = null;
      extraLines.push(trimmed);
    }
  }

  fields.extra = extraLines.join("\n");
  return fields;
}

/**
 * Compose structured fields into a plain-text knowledgeBase string.
 * Only includes fields that have content.
 */
export function composeKnowledgeBase(fields: KnowledgeFields): string {
  const parts: string[] = [];

  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const value = fields[key as keyof KnowledgeFields]?.trim();
    if (value) {
      parts.push(`${label}: ${value}`);
    }
  }

  if (fields.extra?.trim()) {
    parts.push(fields.extra.trim());
  }

  return parts.join("\n");
}

/**
 * Estimate token count from text (rough: ~0.75 tokens per word for Spanish).
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(words * 1.33);
}

/**
 * Count words in text.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
