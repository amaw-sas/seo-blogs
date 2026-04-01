"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSiteContext } from "@/lib/site-context";
import { PIPELINE_STEPS, STEP_LABELS } from "@/lib/pipeline-steps";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  X,
  Loader2,
  MinusCircle,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LogEntry {
  id: string;
  siteId: string;
  eventType: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  site?: { name: string; domain: string };
}

interface RunSummary {
  siteId: string;
  siteName: string;
  siteDomain: string;
  startedAt: string;
  status: "running" | "success" | "failed";
  keyword?: string;
  logCount: number;
}

type NodeStatus = "pending" | "started" | "success" | "failed" | "skipped";

interface StepState {
  step: string;
  status: NodeStatus;
  startedAt?: string;
  finishedAt?: string;
  duration?: number;
  metadata?: Record<string, unknown> | null;
}

function StepIcon({ status }: { status: NodeStatus }) {
  switch (status) {
    case "started":
      return <Loader2 className="size-5 animate-spin text-blue-500" />;
    case "success":
      return <Check className="size-5 text-green-600" />;
    case "failed":
      return <X className="size-5 text-red-500" />;
    case "skipped":
      return <MinusCircle className="size-5 text-amber-500" />;
    default:
      return <div className="size-5 rounded-full border-2 border-muted-foreground/30" />;
  }
}

function statusClasses(status: NodeStatus) {
  switch (status) {
    case "started":
      return "border-blue-400 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-400/40 animate-pulse";
    case "success":
      return "border-green-400 bg-green-50 dark:bg-green-950/30";
    case "failed":
      return "border-red-400 bg-red-50 dark:bg-red-950/30";
    case "skipped":
      return "border-amber-400 bg-amber-50 dark:bg-amber-950/30";
    default:
      return "border-muted bg-muted/30";
  }
}

function connectorColor(status: NodeStatus) {
  switch (status) {
    case "success":
      return "bg-green-400";
    case "failed":
      return "bg-red-400";
    case "started":
      return "bg-blue-400";
    default:
      return "bg-muted-foreground/20";
  }
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function buildStepStates(logs: LogEntry[], platform?: string): StepState[] {
  const logByStep = new Map<string, { started?: LogEntry; finished?: LogEntry }>();

  for (const log of logs) {
    if (log.eventType === "pipeline_run" || log.eventType === "pipeline_error") continue;
    const existing = logByStep.get(log.eventType) ?? {};
    if (log.status === "started") {
      existing.started = log;
    } else {
      existing.finished = log;
    }
    logByStep.set(log.eventType, existing);
  }

  const steps = PIPELINE_STEPS.filter((step) => {
    if (step === "wordpress_publish" && platform && platform !== "wordpress") return false;
    if (step === "nuxt_publish" && platform && platform !== "custom") return false;
    return true;
  });

  const pipelineFailed = logs.some(
    (l) => l.eventType === "pipeline_run" && l.status === "failed",
  );
  let reachedCurrent = false;

  return steps.map((step) => {
    const entry = logByStep.get(step);
    const state: StepState = { step, status: "pending" };

    if (entry?.finished) {
      state.status = entry.finished.status as NodeStatus;
      state.finishedAt = entry.finished.createdAt;
      state.metadata = entry.finished.metadata;
      if (entry.started) {
        state.startedAt = entry.started.createdAt;
        state.duration =
          new Date(entry.finished.createdAt).getTime() -
          new Date(entry.started.createdAt).getTime();
      }
    } else if (entry?.started) {
      state.status = "started";
      state.startedAt = entry.started.createdAt;
      state.metadata = entry.started.metadata;
      reachedCurrent = true;
    } else if (pipelineFailed && !reachedCurrent) {
      state.status = "skipped";
    }

    return state;
  });
}

function PipelineVisualizer({
  siteId,
  from,
}: {
  siteId: string;
  from: string;
}) {
  const router = useRouter();
  const { sites } = useSiteContext();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const site = sites.find((s) => s.id === siteId);

  const poll = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        siteId,
        dateFrom: from,
        limit: "50",
      });
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      const fetched: LogEntry[] = data.data ?? [];
      setLogs([...fetched].reverse());

      const terminal = fetched.some(
        (l) =>
          l.eventType === "pipeline_run" &&
          (l.status === "success" || l.status === "failed"),
      );
      if (terminal) setDone(true);
    } catch {
      /* retry next poll */
    }
  }, [siteId, from]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 3000);

    const timeout = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimedOut(true);
      setDone(true);
    }, 360_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(timeout);
    };
  }, [poll]);

  useEffect(() => {
    if (done && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [done]);

  const pipelineFailed = logs.some(
    (l) => l.eventType === "pipeline_run" && l.status === "failed",
  );
  const pipelineSuccess = logs.some(
    (l) => l.eventType === "pipeline_run" && l.status === "success",
  );

  const overallStatus = done
    ? pipelineFailed
      ? "failed"
      : timedOut
        ? "timeout"
        : "success"
    : "running";

  const overallLabel =
    overallStatus === "running"
      ? "En progreso..."
      : overallStatus === "success"
        ? "Completado"
        : overallStatus === "timeout"
          ? "Tiempo agotado"
          : "Fallido";

  const overallColor =
    overallStatus === "running"
      ? "text-blue-600"
      : overallStatus === "success"
        ? "text-green-600"
        : "text-red-600";

  const keyword = logs.find(
    (l) => l.eventType === "keyword_selection" && l.metadata?.keyword,
  )?.metadata?.keyword as string | undefined;

  const postId = logs.find(
    (l) => l.eventType === "post_save" && l.status === "success",
  )?.metadata?.postId as string | undefined;

  const sitePlatform = site ? undefined : undefined;
  const stepStates = buildStepStates(logs, sitePlatform);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/runs")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">
            {site?.name ?? "Sitio"}
          </h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{new Date(from).toLocaleString("es-CO")}</span>
            {keyword && (
              <Badge variant="secondary" className="text-xs">
                {keyword}
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className={`text-sm font-semibold ${overallColor}`}>
            {overallStatus === "running" && (
              <Loader2 className="inline size-3.5 animate-spin mr-1" />
            )}
            {overallLabel}
          </span>
          {postId && (
            <div className="mt-1">
              <a
                href={`/posts/${postId}/edit`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3" />
                Ver post
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-0">
        {stepStates.map((state, i) => (
          <div key={state.step} className="flex items-start">
            {/* Node */}
            <div
              className={`relative w-[130px] rounded-xl border-2 p-3 transition-all ${statusClasses(state.status)}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <StepIcon status={state.status} />
                {state.duration != null && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {formatDuration(state.duration)}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium leading-tight">
                {STEP_LABELS[state.step] ?? state.step}
              </p>
              {state.metadata && (
                <div className="mt-1.5 space-y-0.5">
                  {"keyword" in state.metadata && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {String(state.metadata.keyword)}
                    </p>
                  )}
                  {"score" in state.metadata && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      SEO: {String(state.metadata.score)}
                    </Badge>
                  )}
                  {"error" in state.metadata && (
                    <p className="text-[10px] text-red-500 truncate" title={String(state.metadata.error)}>
                      {String(state.metadata.error)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Connector */}
            {i < stepStates.length - 1 && (
              <div className="flex items-center self-center pt-4">
                <div className={`h-0.5 w-6 ${connectorColor(state.status)}`} />
                <div
                  className={`size-0 border-y-[4px] border-y-transparent border-l-[6px] ${
                    state.status === "success"
                      ? "border-l-green-400"
                      : state.status === "failed"
                        ? "border-l-red-400"
                        : state.status === "started"
                          ? "border-l-blue-400"
                          : "border-l-muted-foreground/20"
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {logs.length === 0 && !done && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Esperando primer paso del pipeline...
        </div>
      )}
    </div>
  );
}

function RecentRuns() {
  const router = useRouter();
  const { siteId: globalSiteId, sites } = useSiteContext();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRuns() {
      try {
        const params = new URLSearchParams({
          eventType: "pipeline_run",
          limit: "50",
        });
        if (globalSiteId) params.set("siteId", globalSiteId);

        const res = await fetch(`/api/logs?${params}`);
        const data = await res.json();
        const logs: LogEntry[] = data.data ?? [];

        const grouped = new Map<string, RunSummary>();
        for (const log of logs) {
          const key = `${log.siteId}__${log.status === "started" ? log.createdAt : ""}`;

          if (log.status === "started") {
            grouped.set(log.createdAt, {
              siteId: log.siteId,
              siteName: log.site?.name ?? "Sitio",
              siteDomain: log.site?.domain ?? "",
              startedAt: log.createdAt,
              status: "running",
              keyword: log.metadata?.keyword as string | undefined,
              logCount: 1,
            });
          } else {
            for (const [startedAt, run] of grouped) {
              if (run.siteId === log.siteId && run.status === "running") {
                run.status = log.status === "success" ? "success" : "failed";
                break;
              }
            }
          }
        }

        setRuns(Array.from(grouped.values()));
      } catch {
        setRuns([]);
      } finally {
        setLoading(false);
      }
    }
    fetchRuns();
  }, [globalSiteId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No hay ejecuciones recientes
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <Card
          key={`${run.siteId}-${run.startedAt}`}
          className="cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() =>
            router.push(
              `/runs?siteId=${run.siteId}&from=${encodeURIComponent(run.startedAt)}`,
            )
          }
        >
          <CardContent className="flex items-center gap-4 py-3 px-4">
            <div
              className={`size-3 rounded-full shrink-0 ${
                run.status === "running"
                  ? "bg-blue-500 animate-pulse"
                  : run.status === "success"
                    ? "bg-green-500"
                    : "bg-red-500"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{run.siteName}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(run.startedAt).toLocaleString("es-CO")}
                {run.keyword && ` — ${run.keyword}`}
              </p>
            </div>
            <Badge
              variant={
                run.status === "success"
                  ? "default"
                  : run.status === "failed"
                    ? "destructive"
                    : "secondary"
              }
              className="shrink-0"
            >
              {run.status === "running"
                ? "En progreso"
                : run.status === "success"
                  ? "Completado"
                  : "Fallido"}
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RunsContent() {
  const searchParams = useSearchParams();
  const siteId = searchParams.get("siteId");
  const from = searchParams.get("from");

  if (siteId && from) {
    return <PipelineVisualizer siteId={siteId} from={from} />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Ejecuciones</h2>
      <p className="text-sm text-muted-foreground">
        Últimas ejecuciones del pipeline de generación
      </p>
      <RecentRuns />
    </div>
  );
}

export default function RunsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[300px]" />
        </div>
      }
    >
      <RunsContent />
    </Suspense>
  );
}
