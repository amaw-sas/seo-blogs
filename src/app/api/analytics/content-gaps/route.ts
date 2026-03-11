import { NextRequest, NextResponse } from "next/server";
import { findContentGaps } from "@/lib/ai/content-gap";

/**
 * GET /api/analytics/content-gaps
 * Runs content gap analysis for a site.
 * Query params: siteId (required)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");

    if (!siteId) {
      return NextResponse.json(
        { error: "Missing required param: siteId" },
        { status: 400 },
      );
    }

    const gaps = await findContentGaps(siteId);

    return NextResponse.json({ data: gaps, total: gaps.length });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to analyze content gaps";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
