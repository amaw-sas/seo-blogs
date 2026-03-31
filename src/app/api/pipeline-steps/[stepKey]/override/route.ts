import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { validatePromptSections } from "../../validate";

type RouteContext = { params: Promise<{ stepKey: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { stepKey } = await context.params;
    const siteId = request.nextUrl.searchParams.get("siteId");

    if (!siteId) {
      return NextResponse.json(
        { error: "siteId query parameter is required" },
        { status: 400 },
      );
    }

    const body = await request.json();

    // Validate promptSections if present
    if (body.promptSections !== undefined) {
      const errors = validatePromptSections(body.promptSections);
      if (errors.length > 0) {
        return NextResponse.json(
          { error: "Validation failed", details: errors },
          { status: 400 },
        );
      }
    }

    const override = await prisma.pipelineStepOverride.upsert({
      where: { siteId_stepKey: { siteId, stepKey } },
      create: { siteId, stepKey, ...body },
      update: body,
    });

    return NextResponse.json({ data: override });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "Duplicate entry" }, { status: 409 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to upsert override";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { stepKey } = await context.params;
    const siteId = request.nextUrl.searchParams.get("siteId");

    if (!siteId) {
      return NextResponse.json(
        { error: "siteId query parameter is required" },
        { status: 400 },
      );
    }

    await prisma.pipelineStepOverride.delete({
      where: { siteId_stepKey: { siteId, stepKey } },
    });

    return NextResponse.json({ message: "Override deleted" });
  } catch (error) {
    // P2025 = not found — treat as success (idempotent delete)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ message: "Override deleted" });
    }
    const message =
      error instanceof Error ? error.message : "Failed to delete override";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
