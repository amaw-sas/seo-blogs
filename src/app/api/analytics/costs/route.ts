import { NextRequest, NextResponse } from "next/server";
import {
  calculateDailyCost,
  calculateMonthlyCost,
  calculatePostCost,
  type DailyCost,
  type PostCost,
} from "@/lib/seo/cost-tracker";
import { prisma } from "@/lib/db/prisma";

/**
 * GET — cost breakdown for a site.
 * Params: siteId, period (daily|monthly), startDate, endDate
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const siteId = searchParams.get("siteId");
    const period = searchParams.get("period") ?? "daily";
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");

    if (!siteId) {
      return NextResponse.json({ error: "siteId is required" }, { status: 400 });
    }

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 },
      );
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    let total = 0;
    let byDay: DailyCost[] = [];
    let byPost: PostCost[] = [];

    if (period === "monthly") {
      // Iterate month by month
      const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

      const months = [];
      while (current <= end) {
        const monthlyCost = await calculateMonthlyCost(siteId, new Date(current));
        months.push(monthlyCost);
        total += monthlyCost.totalCost;
        byDay.push(...monthlyCost.dailyBreakdown);
        current.setMonth(current.getMonth() + 1);
      }

      return NextResponse.json({
        data: { total, byMonth: months, byDay },
      });
    }

    // Daily period: iterate day by day
    const current = new Date(startDate);
    while (current <= endDate) {
      const dailyCost = await calculateDailyCost(siteId, new Date(current));
      byDay.push(dailyCost);
      total += dailyCost.totalCost;
      current.setDate(current.getDate() + 1);
    }

    // Also get per-post breakdown for the period
    const logs = await prisma.publishLog.findMany({
      where: {
        siteId,
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { postId: true },
      distinct: ["postId"],
    });

    const postIds = logs.map((l) => l.postId).filter(Boolean) as string[];
    byPost = await Promise.all(postIds.map((pid) => calculatePostCost(pid)));

    return NextResponse.json({
      data: { total, byDay, byPost },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to calculate costs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
