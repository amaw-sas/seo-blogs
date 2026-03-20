import { describe, it, expect } from "vitest";
import {
  generateSlug,
  generateFocusKeyphrase,
  generateMetaDescription,
  extractTags,
  truncate,
  insertImagesIntoHtml,
  insertLinksIntoHtml,
  buildLinks,
  reduceKeywordDensity,
} from "./pipeline";

// ── generateFocusKeyphrase ──────────────────────────────────

describe("generateFocusKeyphrase", () => {
  it("extracts max 4 content words from title before colon", () => {
    const result = generateFocusKeyphrase("Licencia de conducción extranjera: alquilar carro en Colombia");
    expect(result).toBe("licencia conducción extranjera");
  });

  it("preserves Spanish accents for Yoast exact matching", () => {
    const result = generateFocusKeyphrase("Renta de carros Bogotá: impacto ambiental positivo");
    expect(result).toContain("bogotá");
    expect(result).not.toContain("bogota");
  });

  it("strips stopwords (de, en, para, etc.)", () => {
    const result = generateFocusKeyphrase("Alquiler de carros en Barranquilla barato");
    expect(result).not.toContain(" de ");
    expect(result).not.toContain(" en ");
  });

  it("limits to 4 content words", () => {
    const result = generateFocusKeyphrase("Alquiler carro Cali barato: tips reales para ahorrar");
    const words = result.split(" ");
    expect(words.length).toBeLessThanOrEqual(4);
  });

  it("handles title without colon", () => {
    const result = generateFocusKeyphrase("Renta autos Cartagena guía completa");
    expect(result.split(" ").length).toBeLessThanOrEqual(4);
    expect(result).toContain("renta");
    expect(result).toContain("cartagena");
  });

  it("returns lowercase", () => {
    const result = generateFocusKeyphrase("Pico y Placa Solidario: guía para alquiler");
    expect(result).toBe(result.toLowerCase());
  });
});

// ── generateSlug ────────────────────────────────────────────

describe("generateSlug", () => {
  it("converts text to lowercase slug filtering stopwords", () => {
    expect(generateSlug("Guía de SEO")).toBe("guia-seo");
  });

  it("removes diacritics", () => {
    expect(generateSlug("Información útil")).toBe("informacion-util");
  });

  it("removes special characters and filters stopwords", () => {
    expect(generateSlug("¿Qué es SEO?")).toBe("seo");
  });

  it("collapses whitespace into single hyphens", () => {
    expect(generateSlug("uno  -  dos")).toBe("uno-dos");
  });

  it("trims leading/trailing whitespace", () => {
    expect(generateSlug("  hola mundo  ")).toBe("hola-mundo");
  });

  it("limits to 5 words and 60 characters", () => {
    const input = "primero segundo tercero cuarto quinto sexto septimo";
    const slug = generateSlug(input);
    expect(slug.split("-").length).toBeLessThanOrEqual(5);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("truncates to 60 characters", () => {
    const longWord = "a".repeat(200);
    expect(generateSlug(longWord).length).toBeLessThanOrEqual(60);
  });

  it("handles empty string", () => {
    expect(generateSlug("")).toBe("");
  });

  it("filters all Spanish stopwords", () => {
    expect(generateSlug("el mejor hosting para blogs")).toBe("mejor-hosting-blogs");
  });
});

// ── generateMetaDescription ─────────────────────────────────

describe("generateMetaDescription", () => {
  it("returns sentence containing keyword when short enough", () => {
    const html = "<p>El marketing digital es esencial. Otra frase aquí.</p>";
    const result = generateMetaDescription(html, "marketing digital");
    expect(result).toContain("marketing digital");
    expect(result.endsWith(".")).toBe(true);
  });

  it("falls back to first 157 chars + ellipsis when no keyword sentence fits", () => {
    const longText = "a".repeat(300);
    const html = `<p>${longText}</p>`;
    const result = generateMetaDescription(html, "inexistente");
    expect(result.length).toBe(160);
    expect(result.endsWith("...")).toBe(true);
  });

  it("strips HTML from content", () => {
    const html = "<p><strong>SEO</strong> es importante.</p>";
    const result = generateMetaDescription(html, "seo");
    expect(result).not.toContain("<");
  });
});

// ── extractTags ─────────────────────────────────────────────

describe("extractTags", () => {
  it("always includes the keyword", () => {
    const outline = { h1: "Título", sections: [{ text: "Sección uno" }] };
    const tags = extractTags(outline, "SEO Local");
    expect(tags).toContain("seo local");
  });

  it("extracts words > 4 chars from H2s", () => {
    const outline = {
      h1: "Título",
      sections: [
        { text: "Estrategias de marketing" },
        { text: "Beneficios principales" },
      ],
    };
    const tags = extractTags(outline, "marketing");
    expect(tags.some((t) => t === "estrategias")).toBe(true);
  });

  it("limits to 8 tags maximum", () => {
    const sections = Array.from({ length: 10 }, (_, i) => ({
      text: `palabra${i}largas sección${i}grandes`,
    }));
    const tags = extractTags({ h1: "T", sections }, "keyword");
    expect(tags.length).toBeLessThanOrEqual(8);
  });

  it("only uses first 3 sections", () => {
    const sections = Array.from({ length: 6 }, (_, i) => ({
      text: `seccion${i}unica`,
    }));
    const tags = extractTags({ h1: "T", sections }, "kw");
    // Words from sections 3-5 should not appear
    expect(tags).not.toContain("seccion3unica");
  });
});

// ── truncate ────────────────────────────────────────────────

describe("truncate", () => {
  it("returns text unchanged if within limit", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("truncates and adds ellipsis", () => {
    expect(truncate("this is a long text", 10)).toBe("this is...");
  });

  it("handles exact length", () => {
    expect(truncate("exact", 5)).toBe("exact");
  });

  it("handles very short maxLength", () => {
    const result = truncate("hello world", 4);
    expect(result).toBe("h...");
  });
});

// ── insertImagesIntoHtml ────────────────────────────────────

describe("insertImagesIntoHtml", () => {
  const img = {
    url: "https://img.com/1.webp",
    altText: "Alt text",
    width: 800,
    height: 600,
    fileSize: 50000,
  };

  it("returns html unchanged when no images", () => {
    const html = "<article><h1>Title</h1></article>";
    expect(insertImagesIntoHtml(html, [])).toBe(html);
  });

  it("inserts hero image after h1", () => {
    const html = "<article><h1>Title</h1><p>Content</p></article>";
    const result = insertImagesIntoHtml(html, [img]);
    expect(result).toContain('loading="eager"');
    expect(result.indexOf("</h1>")).toBeLessThan(result.indexOf("<figure>"));
  });

  it("inserts additional images before FAQ section", () => {
    const html = '<article><h1>T</h1><p>Body</p><section class="faq"><details>FAQ</details></section></article>';
    const img2 = { ...img, url: "https://img.com/2.webp" };
    const result = insertImagesIntoHtml(html, [img, img2]);
    expect(result).toContain('loading="lazy"');
  });

  it("does not render figcaption to avoid exposing alt text as visible text", () => {
    const html = "<article><h1>T</h1></article>";
    const result = insertImagesIntoHtml(html, [img]);
    expect(result).not.toContain("<figcaption>");
    expect(result).toContain('alt="Alt text"');
  });
});

// ── insertLinksIntoHtml ─────────────────────────────────────

describe("insertLinksIntoHtml", () => {
  it("returns html unchanged when no links", () => {
    const html = "<p>Texto</p>";
    expect(insertLinksIntoHtml(html, [])).toBe(html);
  });

  it("inserts internal link without rel attribute", () => {
    const html = "<p>Texto simple</p>";
    const links = [{ url: "https://example.com/post", anchorText: "Post", type: "internal" as const }];
    const result = insertLinksIntoHtml(html, links);
    expect(result).toContain('<a href="https://example.com/post">Post</a>');
    expect(result).not.toContain("noopener");
  });

  it("inserts external link with rel noopener noreferrer", () => {
    const html = "<p>Texto simple</p>";
    const links = [{ url: "https://external.com", anchorText: "External", type: "external" as const }];
    const result = insertLinksIntoHtml(html, links);
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it("distributes multiple links across paragraphs", () => {
    const html = "<p>Primero</p><p>Segundo</p><p>Tercero</p><p>Cuarto</p><p>Quinto</p>";
    const links = [
      { url: "https://a.com", anchorText: "A", type: "internal" as const },
      { url: "https://b.com", anchorText: "B", type: "internal" as const },
    ];
    const result = insertLinksIntoHtml(html, links);
    expect(result).toContain("A</a>");
    expect(result).toContain("B</a>");
  });

  it("handles html with no paragraphs", () => {
    const html = "<div>No paragraphs here</div>";
    const links = [{ url: "https://a.com", anchorText: "A", type: "internal" as const }];
    expect(insertLinksIntoHtml(html, links)).toBe(html);
  });
});

// ── buildLinks ──────────────────────────────────────────────

describe("buildLinks", () => {
  const siteConfig = {
    domain: "example.com",
    minWords: 1000,
    maxWords: 2000,
    conversionUrl: "https://example.com/contacto",
    authoritativeSources: ["https://moz.com", "https://ahrefs.com", "https://semrush.com"],
  };

  it("creates internal links from existing posts (max 3)", () => {
    const posts = [
      { slug: "post-1", title: "Post 1", keyword: "kw1" },
      { slug: "post-2", title: "Post 2", keyword: "kw2" },
      { slug: "post-3", title: "Post 3", keyword: "kw3" },
      { slug: "post-4", title: "Post 4", keyword: "kw4" },
    ];
    const links = buildLinks(posts, siteConfig, "new keyword");
    const internal = links.filter((l) => l.type === "internal");
    expect(internal).toHaveLength(3);
    expect(internal[0].url).toBe("/blog/post-1");
  });

  it("excludes posts with the same keyword", () => {
    const posts = [
      { slug: "post-1", title: "Post 1", keyword: "seo" },
      { slug: "post-2", title: "Post 2", keyword: "marketing" },
    ];
    const links = buildLinks(posts, siteConfig, "seo");
    const internal = links.filter((l) => l.type === "internal");
    expect(internal).toHaveLength(1);
    expect(internal[0].url).toContain("post-2");
  });

  it("creates max 2 external links from authoritative sources", () => {
    const links = buildLinks([], siteConfig, "kw");
    const external = links.filter((l) => l.type === "external");
    expect(external).toHaveLength(2);
  });

  it("creates conversion link when conversionUrl exists", () => {
    const links = buildLinks([], siteConfig, "kw");
    const conversion = links.filter((l) => l.type === "conversion");
    expect(conversion).toHaveLength(1);
    expect(conversion[0].url).toBe("https://example.com/contacto");
  });

  it("omits conversion link when conversionUrl is null", () => {
    const config = { ...siteConfig, conversionUrl: null };
    const links = buildLinks([], config, "kw");
    const conversion = links.filter((l) => l.type === "conversion");
    expect(conversion).toHaveLength(0);
  });

  it("returns empty internal links when no existing posts", () => {
    const links = buildLinks([], siteConfig, "kw");
    const internal = links.filter((l) => l.type === "internal");
    expect(internal).toHaveLength(0);
  });
});

// ── reduceKeywordDensity ───────────────────────────────────

describe("reduceKeywordDensity", () => {
  const kw = "seguro para carro alquilado en colombia";

  function makeHtml(occurrences: number): string {
    // ~200 words of filler + keyword repeated N times
    const filler = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";
    const paragraphs = Array.from({ length: 5 }, () => `<p>${filler.repeat(3)}</p>`);
    // Insert keyword occurrences spread across paragraphs
    for (let i = 0; i < occurrences; i++) {
      const pIdx = i % paragraphs.length;
      paragraphs[pIdx] += `<p>Información sobre ${kw} relevante.</p>`;
    }
    return `<article>${paragraphs.join("\n")}</article>`;
  }

  it("returns html unchanged when density is below threshold", () => {
    const html = makeHtml(2);
    expect(reduceKeywordDensity(html, kw)).toBe(html);
  });

  it("returns html unchanged when 3 or fewer occurrences", () => {
    const html = makeHtml(3);
    expect(reduceKeywordDensity(html, kw)).toBe(html);
  });

  it("reduces occurrences when density exceeds 2.5%", () => {
    const html = makeHtml(15);
    const original = (html.match(new RegExp(kw, "gi")) || []).length;
    const result = reduceKeywordDensity(html, kw);
    const reduced = (result.match(new RegExp(kw, "gi")) || []).length;
    expect(reduced).toBeLessThan(original);
    expect(reduced).toBeGreaterThanOrEqual(3);
  });

  it("preserves first and last keyword occurrence", () => {
    const html = makeHtml(15);
    const result = reduceKeywordDensity(html, kw);
    const firstIdx = result.toLowerCase().indexOf(kw.toLowerCase());
    const lastIdx = result.toLowerCase().lastIndexOf(kw.toLowerCase());
    expect(firstIdx).toBeGreaterThan(-1);
    expect(lastIdx).toBeGreaterThan(firstIdx);
  });

  it("replaces with shortened variant (drops location)", () => {
    const html = makeHtml(15);
    const result = reduceKeywordDensity(html, kw);
    // Should contain shortened form without "en colombia"
    expect(result.toLowerCase()).toContain("seguro para carro alquilado");
    // Should have fewer full matches than original
    const fullMatches = (result.match(new RegExp(kw, "gi")) || []).length;
    const shortMatches = (result.match(/seguro para carro alquilado/gi) || []).length;
    expect(shortMatches).toBeGreaterThan(fullMatches);
  });

  it("is case insensitive", () => {
    const html = `<p>El ${kw.toUpperCase()} es importante. Más sobre ${kw} aquí. También ${kw} allá.</p>` +
      `<p>${"palabra ".repeat(50)}</p>`.repeat(3) +
      Array.from({ length: 10 }, () => `<p>Sobre ${kw} más info.</p>`).join("");
    const result = reduceKeywordDensity(html, kw);
    const matches = (result.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    expect(matches).toBeLessThan(13);
  });
});
