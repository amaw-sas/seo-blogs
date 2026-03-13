import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { runPipeline } from "../../../../../../worker/pipeline";

export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id: siteId } = await context.params;

  // Validate site exists
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      _count: {
        select: { keywords: { where: { status: "pending" } } },
      },
    },
  });

  if (!site) {
    return NextResponse.json(
      { error: "Sitio no encontrado" },
      { status: 404 },
    );
  }

  if (!site.active) {
    return NextResponse.json(
      { error: "El sitio está inactivo" },
      { status: 400 },
    );
  }

  if (site._count.keywords === 0) {
    return NextResponse.json(
      { error: "No hay keywords pendientes" },
      { status: 400 },
    );
  }

  // Atomic concurrency check + log creation via transaction
  // Prevents TOCTOU race condition on double-click
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const runLog = await prisma.$transaction(async (tx) => {
    const activeRun = await tx.publishLog.findFirst({
      where: {
        siteId,
        eventType: "pipeline_run",
        status: "started",
        createdAt: { gte: fiveMinAgo },
      },
      orderBy: { createdAt: "desc" },
    });

    if (activeRun) {
      // Check if this run already finished (has a terminal log after it)
      const terminalLog = await tx.publishLog.findFirst({
        where: {
          siteId,
          eventType: "pipeline_run",
          status: { in: ["success", "failed"] },
          createdAt: { gt: activeRun.createdAt },
        },
      });

      if (!terminalLog) {
        return null; // Still running
      }
    }

    return tx.publishLog.create({
      data: {
        siteId,
        eventType: "pipeline_run",
        status: "started",
        metadata: { trigger: "manual" },
      },
    });
  });

  if (!runLog) {
    return NextResponse.json(
      { error: "Pipeline en progreso" },
      { status: 409 },
    );
  }

  const runId = runLog.id;

  // Execute pipeline in background via after()
  after(async () => {
    try {
      const result = await runPipeline(siteId);
      await prisma.publishLog.create({
        data: {
          siteId,
          postId: result.postId,
          eventType: "pipeline_run",
          status: "success",
          metadata: {
            runId,
            postId: result.postId,
            seoScore: result.seoScore,
            wordCount: result.wordCount,
            attempts: result.attempts,
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.publishLog.create({
        data: {
          siteId,
          eventType: "pipeline_run",
          status: "failed",
          metadata: { runId, error: message },
        },
      });
    }
  });

  return NextResponse.json({
    runId,
    siteId,
    message: "Pipeline iniciado",
  });
}
