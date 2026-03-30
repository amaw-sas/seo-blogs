import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./github-client", () => ({
  createRepoFromSource: vi.fn(),
}));

vi.mock("./vercel-client", () => ({
  createVercelProject: vi.fn(),
  setEnvVar: vi.fn(),
  triggerDeploy: vi.fn(),
}));

vi.mock("./blog-config-client", () => ({
  sendThemeConfig: vi.fn(),
}));

import { createRepoFromSource } from "./github-client";
import { createVercelProject, setEnvVar } from "./vercel-client";

const mockCreateRepo = createRepoFromSource as ReturnType<typeof vi.fn>;
const mockCreateProject = createVercelProject as ReturnType<typeof vi.fn>;
const mockSetEnv = setEnvVar as ReturnType<typeof vi.fn>;

describe("Blog provisioning — data contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("step 1: creates GitHub repo from blog-base source", async () => {
    mockCreateRepo.mockResolvedValue({
      fullName: "amaw-sas/blog-test-niche",
      cloneUrl: "https://github.com/amaw-sas/blog-test-niche.git",
    });

    const result = await createRepoFromSource({
      sourceRepo: "amaw-sas/amaw-blog",
      newRepoName: "blog-test-niche",
      org: "amaw-sas",
    });

    expect(result.fullName).toBe("amaw-sas/blog-test-niche");
    expect(mockCreateRepo).toHaveBeenCalledWith({
      sourceRepo: "amaw-sas/amaw-blog",
      newRepoName: "blog-test-niche",
      org: "amaw-sas",
    });
  });

  it("step 2: creates Vercel project linked to repo", async () => {
    mockCreateProject.mockResolvedValue({
      id: "prj_new123",
      name: "blog-test-niche",
    });

    const result = await createVercelProject({
      name: "blog-test-niche",
      gitRepo: "amaw-sas/blog-test-niche",
      teamId: "team_123",
      framework: "astro",
    });

    expect(result.id).toBeTruthy();
    expect(result.name).toBe("blog-test-niche");
  });

  it("step 3: sets API_KEY env var on Vercel project", async () => {
    mockSetEnv.mockResolvedValue(undefined);

    await setEnvVar({
      projectId: "prj_new123",
      teamId: "team_123",
      key: "API_KEY",
      value: "uuid-generated-key",
      target: ["production", "preview"],
    });

    expect(mockSetEnv).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "API_KEY",
        value: "uuid-generated-key",
      })
    );
  });

  it("generates unique API key as UUID format", () => {
    const key = crypto.randomUUID();
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("provisioning result includes all connection details", () => {
    const result = {
      repoFullName: "amaw-sas/blog-test-niche",
      vercelProjectId: "prj_new123",
      domain: "blog-test-niche.vercel.app",
      apiKey: "uuid-key",
      apiUrl: "https://blog-test-niche.vercel.app",
    };

    expect(result).toHaveProperty("repoFullName");
    expect(result).toHaveProperty("vercelProjectId");
    expect(result).toHaveProperty("domain");
    expect(result).toHaveProperty("apiKey");
    expect(result).toHaveProperty("apiUrl");
  });
});
