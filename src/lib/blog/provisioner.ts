/**
 * Blog provisioning orchestrator.
 * Creates a new blog instance from blog-base:
 * 1. GitHub repo from source
 * 2. Vercel project linked to repo
 * 3. Environment variables (API_KEY)
 * 4. Trigger first deploy
 * 5. Generate & send theme config
 */

import { createRepoFromSource } from "./github-client";
import { createVercelProject, setEnvVar, triggerDeploy } from "./vercel-client";
import { sendThemeConfig } from "./blog-config-client";
import { generateThemeConfig, type ThemeConfig } from "../ai/theme-generator";

const SOURCE_REPO = "amaw-sas/amaw-blog";
const GITHUB_ORG = "amaw-sas";
const TEAM_ID = process.env.VERCEL_TEAM_ID || "team_0gDIrEJ82nRS9B7qGAn9sDnG";

export interface ProvisionBlogParams {
  name: string;        // "Alquila Tu Carro"
  domain: string;      // "alquilatucarro.com" (for theme generation context)
  niche: string;       // "alquiler de carros en Bogotá"
  repoName: string;    // "blog-alquilatucarro"
  skipTheme?: boolean; // Skip LLM theme generation (useful when OpenAI has no credits)
}

export interface ProvisionBlogResult {
  repoFullName: string;
  vercelProjectId: string;
  vercelProjectName: string;
  deployUrl: string;
  apiKey: string;
  apiUrl: string;
  theme: ThemeConfig | null;
}

export async function provisionBlog(
  params: ProvisionBlogParams
): Promise<ProvisionBlogResult> {
  // Step 1: Create GitHub repo
  const repo = await createRepoFromSource({
    sourceRepo: SOURCE_REPO,
    newRepoName: params.repoName,
    org: GITHUB_ORG,
    isPrivate: true,
  });

  // Step 2: Create Vercel project
  const project = await createVercelProject({
    name: params.repoName,
    gitRepo: repo.fullName,
    teamId: TEAM_ID,
    framework: "astro",
  });

  // Step 3: Set API_KEY env var
  const apiKey = crypto.randomUUID();
  await setEnvVar({
    projectId: project.id,
    teamId: TEAM_ID,
    key: "API_KEY",
    value: apiKey,
  });

  // Step 4: Trigger first deploy
  const deploy = await triggerDeploy({
    projectName: project.name,
    teamId: TEAM_ID,
    gitRepo: repo.fullName,
  });

  const apiUrl = `https://${deploy.url}`;

  // Step 5: Generate & send theme (optional — skipped if no LLM credits)
  let theme: ThemeConfig | null = null;
  if (!params.skipTheme) {
    try {
      theme = await generateThemeConfig(params.niche, params.domain);
      await sendThemeConfig({
        apiUrl,
        apiKey,
        siteConfig: {
          name: params.name,
          description: params.niche,
          url: `https://${params.domain}`,
          language: "es",
          author: { name: params.name },
        },
        theme,
      });
    } catch {
      // Theme config is non-critical — blog works without it
      theme = null;
    }
  }

  return {
    repoFullName: repo.fullName,
    vercelProjectId: project.id,
    vercelProjectName: project.name,
    deployUrl: apiUrl,
    apiKey,
    apiUrl,
    theme,
  };
}
