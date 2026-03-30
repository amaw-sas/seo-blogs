/**
 * Vercel API client for blog provisioning.
 * Creates projects, sets env vars, and triggers deployments.
 */

const VERCEL_API = "https://api.vercel.com";

function getHeaders(): Record<string, string> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ── Create Project ──────────────────────────────────────────

export interface CreateProjectParams {
  name: string;
  gitRepo: string;     // "amaw-sas/blog-my-niche"
  teamId: string;
  framework?: string;  // "astro"
}

export interface CreateProjectResult {
  id: string;
  name: string;
}

export async function createVercelProject(
  params: CreateProjectParams
): Promise<CreateProjectResult> {
  const [owner, repo] = params.gitRepo.split("/");

  const res = await fetch(`${VERCEL_API}/v10/projects?teamId=${params.teamId}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      name: params.name,
      framework: params.framework ?? "astro",
      gitRepository: {
        type: "github",
        repo: `${owner}/${repo}`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel create project error ${res.status}: ${err}`);
  }

  const project = (await res.json()) as { id: string; name: string };
  return { id: project.id, name: project.name };
}

// ── Set Environment Variable ────────────────────────────────

export interface SetEnvVarParams {
  projectId: string;
  teamId: string;
  key: string;
  value: string;
  target?: string[];   // ["production", "preview", "development"]
}

export async function setEnvVar(params: SetEnvVarParams): Promise<void> {
  const res = await fetch(
    `${VERCEL_API}/v10/projects/${params.projectId}/env?teamId=${params.teamId}`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        key: params.key,
        value: params.value,
        type: "encrypted",
        target: params.target ?? ["production", "preview", "development"],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel set env error ${res.status}: ${err}`);
  }
}

// ── Trigger Deployment ──────────────────────────────────────

export interface TriggerDeployParams {
  projectName: string;
  teamId: string;
  gitRepo: string;     // "amaw-sas/blog-my-niche"
  ref?: string;        // "main"
}

export interface TriggerDeployResult {
  id: string;
  url: string;
}

export async function triggerDeploy(
  params: TriggerDeployParams
): Promise<TriggerDeployResult> {
  const [owner, repo] = params.gitRepo.split("/");

  const res = await fetch(
    `${VERCEL_API}/v13/deployments?teamId=${params.teamId}`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        name: params.projectName,
        gitSource: {
          type: "github",
          org: owner,
          repo,
          ref: params.ref ?? "main",
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel deploy error ${res.status}: ${err}`);
  }

  const deploy = (await res.json()) as { id: string; url: string };
  return { id: deploy.id, url: deploy.url };
}
