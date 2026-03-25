/**
 * Resolve the display label for a site selector.
 *
 * Base UI's Select.Value can render the raw `value` (a CUID) instead of the
 * ItemText content when items are loaded asynchronously. This helper computes
 * the label explicitly from state so the trigger always shows a human-readable
 * name.
 */
export function resolveSiteLabel(
  sites: { id: string; name: string }[],
  filter: string,
  fallback?: string
): string | undefined {
  if (!filter || filter === "all") return fallback;
  return sites.find((s) => s.id === filter)?.name ?? fallback;
}
