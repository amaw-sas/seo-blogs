"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface Site {
  id: string;
  name: string;
}

interface LogEntry {
  id: string;
  siteId: string;
  postId: string | null;
  eventType: string;
  status: string;
  errorMessage: string | null;
  costTokens: number | null;
  costImages: number | null;
  createdAt: string;
  site: { name: string };
}

const eventTypes = [
  "generation",
  "publication",
  "image_generation",
  "keyword_expansion",
  "seo_analysis",
  "scheduling",
];

const statusColors: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  success: "Exitoso",
  failed: "Fallido",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const limit = 20;

  const [siteFilter, setSiteFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (siteFilter) params.set("siteId", siteFilter);
      if (eventFilter) params.set("eventType", eventFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFilter) params.set("dateFrom", new Date(dateFilter).toISOString());

      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      setLogs(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, siteFilter, eventFilter, statusFilter, dateFilter]);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => setSites(d.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Logs de actividad</h2>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={siteFilter || "all"}
          onValueChange={(v: string | null) => {
            setSiteFilter(!v || v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los sitios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los sitios</SelectItem>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={eventFilter || "all"}
          onValueChange={(v: string | null) => {
            setEventFilter(!v || v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo de evento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {eventTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter || "all"}
          onValueChange={(v: string | null) => {
            setStatusFilter(!v || v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="success">Exitoso</SelectItem>
            <SelectItem value="failed">Fallido</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-[160px]"
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="space-y-2">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border p-4 space-y-2"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
            ))
          : logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                No se encontraron logs
              </div>
            ) : (
              logs.map((log) => {
                const isExpanded = expanded.has(log.id);
                const isFailed = log.status === "failed";

                return (
                  <div
                    key={log.id}
                    className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isFailed ? (
                          <AlertCircle className="size-5 text-red-500" />
                        ) : (
                          <CheckCircle2 className="size-5 text-green-500" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {log.eventType.replace(/_/g, " ")}
                          </span>
                          <Badge
                            variant="secondary"
                            className={statusColors[log.status] ?? ""}
                          >
                            {statusLabels[log.status] ?? log.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {log.site?.name ?? "—"}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {new Date(log.createdAt).toLocaleString("es-CO", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                          {log.costTokens != null && (
                            <span>
                              | Tokens: ${log.costTokens.toFixed(4)}
                            </span>
                          )}
                        </div>

                        {log.errorMessage && (
                          <div className="mt-2">
                            <button
                              onClick={() => toggleExpanded(log.id)}
                              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                            >
                              {isExpanded ? (
                                <ChevronUp className="size-3" />
                              ) : (
                                <ChevronDown className="size-3" />
                              )}
                              {isExpanded ? "Ocultar error" : "Ver error"}
                            </button>
                            {isExpanded && (
                              <pre className="mt-2 rounded bg-red-50 p-3 text-xs text-red-800 overflow-x-auto whitespace-pre-wrap">
                                {log.errorMessage}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} evento{total !== 1 ? "s" : ""} en total
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
