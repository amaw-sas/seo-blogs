import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { validatePromptSections } from "../validate";

type RouteContext = { params: Promise<{ stepKey: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { stepKey } = await context.params;
    const siteId = request.nextUrl.searchParams.get("siteId");

    const step = await prisma.pipelineStep.findUnique({
      where: { stepKey },
      ...(siteId
        ? { include: { overrides: { where: { siteId } } } }
        : {}),
    });

    if (!step) {
      return NextResponse.json({ error: "Pipeline step not found" }, { status: 404 });
    }

    return NextResponse.json({ data: step });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch pipeline step";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { stepKey } = await context.params;
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

    // Don't allow updating stepKey
    delete body.stepKey;

    const step = await prisma.pipelineStep.update({
      where: { stepKey },
      data: body,
    });

    return NextResponse.json({ data: step });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Pipeline step not found" }, { status: 404 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "Duplicate entry" }, { status: 409 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to update pipeline step";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
