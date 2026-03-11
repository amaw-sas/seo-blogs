/**
 * Google Search Console API client.
 * Fetches search analytics data (queries, pages, clicks, impressions, position, CTR).
 * Auth via service account JSON (base64-encoded in GSC_SERVICE_ACCOUNT_JSON env var).
 */

import { google } from "googleapis";

// ── Types ────────────────────────────────────────────────────

export interface GscRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface GscApiRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

// ── Auth ─────────────────────────────────────────────────────

function getAuthClient() {
  const encoded = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!encoded) {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON environment variable is not set");
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const credentials = JSON.parse(decoded) as {
    client_email: string;
    private_key: string;
  };

  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

// ── Public API ───────────────────────────────────────────────

/**
 * Fetch search analytics data from Google Search Console.
 * Dimensions: query + page — returns one row per (query, page) pair.
 */
export async function getGscData(
  siteUrl: string,
  startDate: string,
  endDate: string,
): Promise<GscRow[]> {
  const auth = getAuthClient();
  const searchconsole = google.searchconsole({ version: "v1", auth });

  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query", "page"],
      rowLimit: 1000,
    },
  });

  const rows = (response.data.rows ?? []) as GscApiRow[];

  return rows.map((row) => ({
    query: row.keys?.[0] ?? "",
    page: row.keys?.[1] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}
