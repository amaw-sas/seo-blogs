import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendThemeConfig } from "./blog-config-client";

describe("sendThemeConfig — PUT /api/config to blog-base", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends PUT request with theme and site config", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ name: "Test Blog" }), { status: 200 }));

    await sendThemeConfig({
      apiUrl: "https://alquilatucarro.com",
      apiKey: "test-key-123",
      siteConfig: {
        name: "Alquila Tu Carro",
        description: "Blog de alquiler de carros",
        url: "https://alquilatucarro.com",
        language: "es",
        author: { name: "AMAW" },
      },
      theme: {
        colorScheme: "ocean",
        fontFamily: "serif",
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://alquilatucarro.com/api/config");
    expect(options.method).toBe("PUT");
    expect(options.headers["X-Api-Key"]).toBe("test-key-123");

    const body = JSON.parse(options.body);
    expect(body.theme.colorScheme).toBe("ocean");
    expect(body.name).toBe("Alquila Tu Carro");
  });

  it("throws on non-ok response", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid theme" }), { status: 400 })
    );

    await expect(
      sendThemeConfig({
        apiUrl: "https://example.com",
        apiKey: "key",
        siteConfig: {
          name: "Test",
          description: "Test",
          url: "https://example.com",
          language: "es",
          author: { name: "Test" },
        },
        theme: { colorScheme: "slate", fontFamily: "system" },
      })
    ).rejects.toThrow("Blog config API error 400");
  });

  it("normalizes apiUrl trailing slash", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(new Response("{}", { status: 200 }));

    await sendThemeConfig({
      apiUrl: "https://example.com/",
      apiKey: "key",
      siteConfig: {
        name: "Test",
        description: "Test",
        url: "https://example.com",
        language: "es",
        author: { name: "Test" },
      },
      theme: { colorScheme: "slate", fontFamily: "system" },
    });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://example.com/api/config");
  });
});
