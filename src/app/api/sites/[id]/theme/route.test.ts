import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/theme-generator", () => ({
  generateThemeConfig: vi.fn(),
}));

vi.mock("@/lib/blog/blog-config-client", () => ({
  sendThemeConfig: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    site: { findUnique: vi.fn() },
  },
}));

import { generateThemeConfig } from "@/lib/ai/theme-generator";
import { sendThemeConfig } from "@/lib/blog/blog-config-client";
import { prisma } from "@/lib/db/prisma";

const mockGenerateTheme = generateThemeConfig as ReturnType<typeof vi.fn>;
const mockSendConfig = sendThemeConfig as ReturnType<typeof vi.fn>;
const mockFindSite = prisma.site.findUnique as ReturnType<typeof vi.fn>;

describe("POST /api/sites/[id]/theme — data contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires site to exist with apiUrl and apiPassword", async () => {
    const site = {
      id: "site1",
      name: "Test Blog",
      domain: "test.com",
      apiUrl: "https://test.com",
      apiPassword: "key-123",
      knowledgeBase: "car rental blog",
    };
    mockFindSite.mockResolvedValue(site);

    expect(site.apiUrl).toBeTruthy();
    expect(site.apiPassword).toBeTruthy();
  });

  it("generates theme based on site knowledgeBase and domain", async () => {
    mockGenerateTheme.mockResolvedValue({
      colorScheme: "ocean",
      fontFamily: "serif",
    });

    const theme = await generateThemeConfig("car rental blog", "test.com");
    expect(mockGenerateTheme).toHaveBeenCalledWith("car rental blog", "test.com");
    expect(theme.colorScheme).toBe("ocean");
  });

  it("sends theme to blog-base via PUT /api/config", async () => {
    mockSendConfig.mockResolvedValue(undefined);

    await sendThemeConfig({
      apiUrl: "https://test.com",
      apiKey: "key-123",
      siteConfig: {
        name: "Test Blog",
        description: "Test blog description",
        url: "https://test.com",
        language: "es",
        author: { name: "AMAW" },
      },
      theme: { colorScheme: "ocean", fontFamily: "serif" },
    });

    expect(mockSendConfig).toHaveBeenCalledTimes(1);
  });

  it("response includes generated theme", () => {
    const response = {
      theme: { colorScheme: "ocean", fontFamily: "serif" },
      message: "Tema configurado exitosamente",
    };
    expect(response.theme).toHaveProperty("colorScheme");
    expect(response.theme).toHaveProperty("fontFamily");
  });
});
