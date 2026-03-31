export function validatePromptSections(sections: unknown): string[] {
  const errors: string[] = [];
  if (typeof sections !== "object" || sections === null || Array.isArray(sections)) {
    return ["promptSections must be an object"];
  }
  for (const [key, value] of Object.entries(sections)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key))
      errors.push(`Invalid section key: "${key}"`);
    if (typeof value !== "object" || value === null) {
      errors.push(`Section "${key}" must be an object`);
      continue;
    }
    const v = value as Record<string, unknown>;
    if (typeof v.label !== "string" || !v.label.trim())
      errors.push(`Section "${key}": label is required`);
    if (typeof v.content !== "string")
      errors.push(`Section "${key}": content must be a string`);
    if (typeof v.active !== "boolean")
      errors.push(`Section "${key}": active must be a boolean`);
  }
  return errors;
}
