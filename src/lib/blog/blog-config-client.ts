/**
 * Client for blog-base PUT /api/config endpoint.
 * Sends site configuration including theme to a blog-base instance.
 */

import type { ThemeConfig } from "../ai/theme-generator";

export interface BlogSiteConfig {
  name: string;
  description: string;
  url: string;
  language: string;
  author: { name: string; url?: string };
}

export interface SendThemeConfigParams {
  apiUrl: string;
  apiKey: string;
  siteConfig: BlogSiteConfig;
  theme: ThemeConfig;
}

/**
 * Send site config + theme to a blog-base instance via PUT /api/config.
 * Authenticated with X-Api-Key header.
 */
export async function sendThemeConfig(params: SendThemeConfigParams): Promise<void> {
  const baseUrl = params.apiUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/api/config`;

  const body = {
    ...params.siteConfig,
    theme: params.theme,
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": params.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Blog config API error ${response.status}: ${text}`);
  }
}
