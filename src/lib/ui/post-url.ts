/**
 * Build the public URL for a published post.
 * Returns null if domain or slug is missing.
 */
export function buildPostUrl(
  domain: string,
  slug: string
): string | null {
  if (!domain || !slug) return null;

  const cleanDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const cleanSlug = slug.replace(/^\/+/, "");

  return `https://${cleanDomain}/${cleanSlug}`;
}
