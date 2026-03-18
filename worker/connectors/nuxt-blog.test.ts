import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NuxtBlogSiteConfig } from "./nuxt-blog";

// ── Mocks ────────────────────────────────────────────────────

vi.mock("../../src/lib/seo/sitemap", () => ({
  pingGoogle: vi.fn().mockResolvedValue(true),
}));

const mockSite: NuxtBlogSiteConfig = {
  apiUrl: "https://alquilatucarro.com",
  apiKey: "test-api-key-123",
  domain: "alquilatucarro.com",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function imageResponse(): Response {
  return new Response(Buffer.from("fake-image-bytes"), {
    status: 200,
    headers: { "Content-Type": "image/webp" },
  });
}

// ── Tests ────────────────────────────────────────────────────

describe("nuxt-blog connector", () => {
  let publishToNuxtBlog: typeof import("./nuxt-blog").publishToNuxtBlog;
  let uploadImageToNuxtBlog: typeof import("./nuxt-blog").uploadImageToNuxtBlog;
  let deleteFromNuxtBlog: typeof import("./nuxt-blog").deleteFromNuxtBlog;
  let pingGoogle: typeof import("../../src/lib/seo/sitemap").pingGoogle;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());

    const mod = await import("./nuxt-blog");
    publishToNuxtBlog = mod.publishToNuxtBlog;
    uploadImageToNuxtBlog = mod.uploadImageToNuxtBlog;
    deleteFromNuxtBlog = mod.deleteFromNuxtBlog;

    const sitemapMod = await import("../../src/lib/seo/sitemap");
    pingGoogle = sitemapMod.pingGoogle;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── publishToNuxtBlog ──────────────────────────────────

  describe("publishToNuxtBlog", () => {
    const mockPost = {
      title: "Tipos de Carros para Alquilar",
      slug: "tipos-de-carros-para-alquilar",
      contentHtml: "<p>Contenido del post</p>",
      metaDescription: "Descripción meta del post",
    };

    it("sends POST to /api/blog/wordpress-sync with WP-format payload and X-Api-Key", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      const slug = await publishToNuxtBlog(mockPost, mockSite);

      expect(slug).toBe("tipos-de-carros-para-alquilar");
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://alquilatucarro.com/api/blog/wordpress-sync");
      expect(opts?.method).toBe("POST");

      const headers = opts?.headers as Record<string, string>;
      expect(headers["X-Api-Key"]).toBe("test-api-key-123");
      expect(headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(opts?.body as string);
      expect(body.title.rendered).toBe("Tipos de Carros para Alquilar");
      expect(body.content.rendered).toBe("<p>Contenido del post</p>");
      expect(body.excerpt.rendered).toBe("Descripción meta del post");
      expect(body.slug).toBe("tipos-de-carros-para-alquilar");
      expect(body.date).toBeDefined();
    });

    it("includes metaTitle in payload when provided", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

      await publishToNuxtBlog(
        { ...mockPost, metaTitle: "Carros para Alquilar | Blog" },
        mockSite,
      );

      const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body as string);
      expect(body.metaTitle).toBe("Carros para Alquilar | Blog");
    });

    it("includes tags in payload when provided", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

      await publishToNuxtBlog(
        { ...mockPost, tags: ["medellín", "alquiler", "automático"] },
        mockSite,
      );

      const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body as string);
      expect(body.tags).toEqual(["medellín", "alquiler", "automático"]);
    });

    it("omits metaTitle from payload when not provided", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

      await publishToNuxtBlog(mockPost, mockSite);

      const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body as string);
      expect(body.metaTitle).toBeUndefined();
    });

    it("includes featured image in _embedded when provided", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

      await publishToNuxtBlog(
        {
          ...mockPost,
          featuredImageUrl: "https://firebase.storage/hero.webp",
          featuredImageAlt: "Hero image alt",
        },
        mockSite,
      );

      const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body as string);
      expect(body._embedded["wp:featuredmedia"][0].source_url).toBe("https://firebase.storage/hero.webp");
      expect(body._embedded["wp:featuredmedia"][0].alt_text).toBe("Hero image alt");
    });

    it("omits _embedded when no featured image", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

      await publishToNuxtBlog(mockPost, mockSite);

      const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0]![1]?.body as string);
      expect(body._embedded).toBeUndefined();
    });

    it("pings Google sitemap after successful publish when domain is set", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));
      await publishToNuxtBlog(mockPost, mockSite);

      expect(pingGoogle).toHaveBeenCalledWith("https://alquilatucarro.com/sitemap.xml");
    });

    it("does NOT ping Google when domain is absent", async () => {
      vi.mocked(pingGoogle).mockClear();
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));
      await publishToNuxtBlog(mockPost, { ...mockSite, domain: undefined });

      expect(pingGoogle).not.toHaveBeenCalled();
    });

    it("throws on 401 unauthorized", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 }),
      );

      await expect(publishToNuxtBlog(mockPost, mockSite)).rejects.toThrow(
        "Nuxt Blog API error 401",
      );
    });

    it("throws on 500 server error", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      await expect(publishToNuxtBlog(mockPost, mockSite)).rejects.toThrow(
        "Nuxt Blog API error 500",
      );
      // Single attempt — no retry
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
    });

    it("normalizes trailing slashes in apiUrl", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));
      await publishToNuxtBlog(mockPost, { ...mockSite, apiUrl: "https://alquilatucarro.com///" });

      const url = vi.mocked(globalThis.fetch).mock.calls[0]![0];
      expect(url).toBe("https://alquilatucarro.com/api/blog/wordpress-sync");
    });
  });

  // ── uploadImageToNuxtBlog ──────────────────────────────

  describe("uploadImageToNuxtBlog", () => {
    it("downloads image then uploads multipart to /api/blog/upload-image", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      // 1st call: download image from Supabase
      mockFetch.mockResolvedValueOnce(imageResponse());
      // 2nd call: upload to Nuxt blog
      mockFetch.mockResolvedValueOnce(jsonResponse({ url: "https://firebase.storage/uploaded.webp" }));

      const resultUrl = await uploadImageToNuxtBlog(
        "https://supabase.storage/post-images/hero.webp",
        "featured",
        "Alt text for hero",
        mockSite,
      );

      expect(resultUrl).toBe("https://firebase.storage/uploaded.webp");
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify upload call
      const [url, opts] = mockFetch.mock.calls[1]!;
      expect(url).toBe("https://alquilatucarro.com/api/blog/upload-image");
      expect(opts?.method).toBe("POST");

      const headers = opts?.headers as Record<string, string>;
      expect(headers["X-Api-Key"]).toBe("test-api-key-123");

      // Body is FormData
      expect(opts?.body).toBeInstanceOf(FormData);
      const formData = opts?.body as FormData;
      expect(formData.get("type")).toBe("featured");
      expect(formData.get("alt")).toBe("Alt text for hero");
      expect(formData.get("file")).toBeInstanceOf(Blob);
    });

    it("sends content type for content images", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(imageResponse());
      mockFetch.mockResolvedValueOnce(jsonResponse({ url: "https://firebase.storage/content.webp" }));

      await uploadImageToNuxtBlog(
        "https://supabase.storage/post-images/content-1.webp",
        "content",
        "Content image",
        mockSite,
      );

      const formData = mockFetch.mock.calls[1]![1]?.body as FormData;
      expect(formData.get("type")).toBe("content");
    });

    it("throws when image download fails", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );

      await expect(
        uploadImageToNuxtBlog("https://bad.url/img.png", "featured", "alt", mockSite),
      ).rejects.toThrow("Failed to download image: 404");
    });

    it("throws when upload endpoint returns error", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(imageResponse());
      mockFetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

      await expect(
        uploadImageToNuxtBlog("https://supabase.storage/img.webp", "featured", "alt", mockSite),
      ).rejects.toThrow("Nuxt Blog image upload error 403");
    });
  });

  // ── deleteFromNuxtBlog ─────────────────────────────────

  describe("deleteFromNuxtBlog", () => {
    it("sends DELETE to /api/blog/post/{slug} with X-Api-Key", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await deleteFromNuxtBlog("tipos-de-carros", mockSite);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://alquilatucarro.com/api/blog/post/tipos-de-carros");
      expect(opts?.method).toBe("DELETE");

      const headers = opts?.headers as Record<string, string>;
      expect(headers["X-Api-Key"]).toBe("test-api-key-123");
    });

    it("treats 404 as idempotent success", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );

      // Should NOT throw
      await deleteFromNuxtBlog("already-gone", mockSite);
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
    });

    it("throws on 403 forbidden", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("Forbidden", { status: 403 }),
      );

      await expect(deleteFromNuxtBlog("some-slug", mockSite)).rejects.toThrow(
        "Nuxt Blog API error 403",
      );
    });

    it("throws on 500 without retrying", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("Server Error", { status: 500 }),
      );

      await expect(deleteFromNuxtBlog("some-slug", mockSite)).rejects.toThrow(
        "Nuxt Blog API error 500",
      );
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
    });

    it("normalizes trailing slashes in apiUrl", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(jsonResponse({}));

      await deleteFromNuxtBlog("my-post", { ...mockSite, apiUrl: "https://alquilatucarro.com///" });

      const url = vi.mocked(globalThis.fetch).mock.calls[0]![0];
      expect(url).toBe("https://alquilatucarro.com/api/blog/post/my-post");
    });
  });
});
