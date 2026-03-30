/**
 * GitHub API client for blog provisioning.
 * Creates new repositories from the blog-base source repo.
 */

export interface CreateRepoParams {
  sourceRepo: string;   // "amaw-sas/amaw-blog"
  newRepoName: string;  // "blog-my-niche"
  org: string;          // "amaw-sas"
  isPrivate?: boolean;
}

export interface CreateRepoResult {
  fullName: string;     // "amaw-sas/blog-my-niche"
  cloneUrl: string;
}

/**
 * Create a new repo by importing content from the source repo.
 * Uses GitHub's repository creation + content import since blog-base
 * is not marked as a template repo.
 */
export async function createRepoFromSource(
  params: CreateRepoParams
): Promise<CreateRepoResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set");

  // Create empty repo under the org
  const createRes = await fetch(`https://api.github.com/orgs/${params.org}/repos`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github.v3+json",
    },
    body: JSON.stringify({
      name: params.newRepoName,
      private: params.isPrivate ?? true,
      auto_init: false,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`GitHub create repo error ${createRes.status}: ${err}`);
  }

  const repo = (await createRes.json()) as { full_name: string; clone_url: string };

  // Import source repo content via GitHub's source import API
  const importRes = await fetch(
    `https://api.github.com/repos/${repo.full_name}/import`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        vcs_url: `https://github.com/${params.sourceRepo}.git`,
        vcs: "git",
      }),
    }
  );

  if (!importRes.ok) {
    const err = await importRes.text();
    throw new Error(`GitHub import error ${importRes.status}: ${err}`);
  }

  return {
    fullName: repo.full_name,
    cloneUrl: repo.clone_url,
  };
}
