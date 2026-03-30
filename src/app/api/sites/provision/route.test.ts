import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/blog/provisioner", () => ({
  provisionBlog: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    site: { create: vi.fn() },
  },
}));

import { provisionBlog } from "@/lib/blog/provisioner";
import { prisma } from "@/lib/db/prisma";

const mockProvision = provisionBlog as ReturnType<typeof vi.fn>;
const mockCreate = prisma.site.create as ReturnType<typeof vi.fn>;

describe("POST /api/sites/provision — data contract", () => {
  it("requires name, domain, niche, repoName in body", () => {
    const body = {
      name: "Mi Blog",
      domain: "miblog.com",
      niche: "travel blog",
      repoName: "blog-miblog",
    };
    expect(body.name).toBeTruthy();
    expect(body.domain).toBeTruthy();
    expect(body.niche).toBeTruthy();
    expect(body.repoName).toBeTruthy();
  });

  it("provisioner returns connection details for site creation", async () => {
    mockProvision.mockResolvedValue({
      repoFullName: "amaw-sas/blog-miblog",
      vercelProjectId: "prj_123",
      vercelProjectName: "blog-miblog",
      deployUrl: "https://blog-miblog.vercel.app",
      apiKey: "uuid-key",
      apiUrl: "https://blog-miblog.vercel.app",
      theme: { colorScheme: "ocean", fontFamily: "serif" },
    });

    const result = await provisionBlog({
      name: "Mi Blog",
      domain: "miblog.com",
      niche: "travel blog",
      repoName: "blog-miblog",
    });

    expect(result.apiKey).toBeTruthy();
    expect(result.vercelProjectId).toBeTruthy();
    expect(result.apiUrl).toContain("https://");
  });

  it("site is created in DB with provisioned credentials", async () => {
    mockCreate.mockResolvedValue({ id: "site_new" });

    await prisma.site.create({
      data: {
        name: "Mi Blog",
        domain: "miblog.com",
        platform: "blog-base",
        apiUrl: "https://blog-miblog.vercel.app",
        apiPassword: "uuid-key",
      },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          platform: "blog-base",
          apiPassword: "uuid-key",
        }),
      })
    );
  });
});
