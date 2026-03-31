import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CustomSiteConfig, CustomPostData } from "./custom";

// ── Mocks ────────────────────────────────────────────────────

const mockSite: CustomSiteConfig = {
  apiUrl: "https://estrategias.us",
  apiUser: "admin",
  apiPassword: "secret",
  domain: "estrategias.us",
};

const mockSiteNoAuth: CustomSiteConfig = {
  apiUrl: "https://estrategias.us",
  domain: "estrategias.us",
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

describe("custom blog connector", () => {
  let publishToCustomBlog: typeof import("./custom").publishToCustomBlog;
  let uploadImageToCustomBlog: typeof import("./custom").uploadImageToCustomBlog;
  let deleteFromCustomBlog: typeof import("./custom").deleteFromCustomBlog;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());

    const mod = await import("./custom");
    publishToCustomBlog = mod.publishToCustomBlog;
    uploadImageToCustomBlog = mod.uploadImageToCustomBlog;
    deleteFromCustomBlog = mod.deleteFromCustomBlog;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── uploadImageToCustomBlog ───────────────────────────────

  describe("uploadImageToCustomBlog", () => {
    it("downloads image then uploads multipart to /posts/images", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      // 1st call: download image from Supabase
      mockFetch.mockResolvedValueOnce(imageResponse());
      // 2nd call: upload to custom blog
      mockFetch.mockResolvedValueOnce(jsonResponse({ url: "https://cdn.estrategias.us/uploaded.webp" }));

      const resultUrl = await uploadImageToCustomBlog(
        "https://supabase.storage/post-images/hero.webp",
        "featured",
        "Alt text for hero",
        mockSite,
      );

      expect(resultUrl).toBe("https://cdn.estrategias.us/uploaded.webp");
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify upload call
      const [url, opts] = mockFetch.mock.calls[1]!;
      expect(url).toBe("https://estrategias.us/posts/images");
      expect(opts?.method).toBe("POST");

      const headers = opts?.headers as Record<string, string>;
      const expectedCredentials = Buffer.from("admin:secret").toString("base64");
      expect(headers.Authorization).toBe(`Basic ${expectedCredentials}`);

      // Body is FormData
      expect(opts?.body).toBeInstanceOf(FormData);
      const formData = opts?.body as FormData;
      expect(formData.get("type")).toBe("featured");
      expect(formData.get("alt")).toBe("Alt text for hero");
      expect(formData.get("file")).toBeInstanceOf(Blob);
    });

    it("omits auth header when no credentials", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(imageResponse());
      mockFetch.mockResolvedValueOnce(jsonResponse({ url: "https://cdn.estrategias.us/img.webp" }));

      await uploadImageToCustomBlog(
        "https://supabase.storage/post-images/content.webp",
        "content",
        "Content image",
        mockSiteNoAuth,
      );

      const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });

    it("throws when image download fails", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("", { status: 404 }),
      );

      await expect(
        uploadImageToCustomBlog("https://bad.url/img.png", "featured", "alt", mockSite),
      ).rejects.toThrow("Failed to download image: 404");
    });

    it("throws when upload endpoint returns error", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(imageResponse());
      mockFetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

      await expect(
        uploadImageToCustomBlog("https://supabase.storage/img.webp", "featured", "alt", mockSite),
      ).rejects.toThrow("Custom blog image upload error 403");
    });
  });

  // ── deleteFromCustomBlog ──────────────────────────────────

  describe("deleteFromCustomBlog", () => {
    it("sends DELETE to /posts/{externalId} with Basic auth", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await deleteFromCustomBlog("abc-123", mockSite);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://estrategias.us/posts/abc-123");
      expect(opts?.method).toBe("DELETE");

      const headers = opts?.headers as Record<string, string>;
      const expectedCredentials = Buffer.from("admin:secret").toString("base64");
      expect(headers.Authorization).toBe(`Basic ${expectedCredentials}`);
    });

    it("treats 404 as idempotent success", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("Not Found", { status: 404 }),
      );

      // Should NOT throw
      await deleteFromCustomBlog("already-gone", mockSite);
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
    });

    it("throws on other error status codes", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      await expect(deleteFromCustomBlog("some-id", mockSite)).rejects.toThrow(
        "Custom blog API error 500",
      );
    });
  });

  // ── publishToCustomBlog with featuredImage ────────────────

  describe("publishToCustomBlog", () => {
    const basePost: CustomPostData = {
      title: "Test Post",
      slug: "test-post",
      contentHtml: "<p>HTML</p>",
      contentMarkdown: "# Markdown",
      metaTitle: "Meta Title",
      metaDescription: "Meta desc",
      status: "published",
      keyword: "test keyword",
      tags: ["tag1"],
    };

    it("includes featuredImage in body when featuredImageUrl is provided", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "post-1", url: "/test-post", status: "published" }));

      await publishToCustomBlog(
        {
          ...basePost,
          featuredImageUrl: "https://cdn.example.com/hero.webp",
          featuredImageAlt: "Hero alt text",
        },
        mockSite,
      );

      const body = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string);
      expect(body.featuredImage).toEqual({
        url: "https://cdn.example.com/hero.webp",
        alt: "Hero alt text",
      });
    });

    it("omits featuredImage from body when featuredImageUrl is not provided", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: "post-2", url: "/test-post", status: "published" }));

      await publishToCustomBlog(basePost, mockSite);

      const body = JSON.parse(mockFetch.mock.calls[0]![1]?.body as string);
      expect(body.featuredImage).toBeUndefined();
    });
  });
});
