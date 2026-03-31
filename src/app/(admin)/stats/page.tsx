"use client";

import { useEffect, useState, useCallback } from "react";
import { useSiteContext } from "@/lib/site-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MousePointerClick,
  Eye,
  TrendingUp,
  Target,
  Lightbulb,
  RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface AnalyticsTotals {
  views: number;
  clicks: number;
  impressions: number;
  avgPosition: number | null;
  ctr: number;
}

interface PostAnalytics {
  postId: string;
  title: string;
  slug: string;
  keyword: string;
  views: number;
  clicks: number;
  impressions: number;
  avgPosition: number | null;
  ctr: number;
}

interface GscRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface ContentGap {
  topic: string;
  reason: string;
  suggestedKeywords: string[];
}

// ── Date range helpers ───────────────────────────────────────

type DateRange = "7d" | "30d" | "90d";

function getDateRange(range: DateRange): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
  }

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

const rangeLabels: Record<DateRange, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
};

// ── Stat Card ────────────────────────────────────────────────

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-7 w-20 mb-1" />
            <Skeleton className="h-4 w-32" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function StatsPage() {
  const { siteId, sites } = useSiteContext();
  const [localSiteId, setLocalSiteId] = useState("");
  const selectedSiteId = siteId || localSiteId;
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  const [totals, setTotals] = useState<AnalyticsTotals>({
    views: 0,
    clicks: 0,
    impressions: 0,
    avgPosition: null,
    ctr: 0,
  });
  const [postAnalytics, setPostAnalytics] = useState<PostAnalytics[]>([]);
  const [topQueries, setTopQueries] = useState<GscRow[]>([]);
  const [contentGaps, setContentGaps] = useState<ContentGap[]>([]);

  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [loadingGaps, setLoadingGaps] = useState(false);

  // Auto-select first site when context has no site selected
  useEffect(() => {
    if (!siteId && !localSiteId && sites.length > 0) {
      setLocalSiteId(sites[0].id);
    }
  }, [siteId, localSiteId, sites]);

  // Fetch analytics when site or date range changes
  const fetchAnalytics = useCallback(async () => {
    if (!selectedSiteId) return;

    setLoadingAnalytics(true);
    try {
      const { startDate, endDate } = getDateRange(dateRange);
      const res = await fetch(
        `/api/analytics?siteId=${selectedSiteId}&startDate=${startDate}&endDate=${endDate}`,
      );
      const json = await res.json();

      setTotals(
        json.totals ?? {
          views: 0,
          clicks: 0,
          impressions: 0,
          avgPosition: null,
          ctr: 0,
        },
      );
      setPostAnalytics(json.perPost ?? []);
    } catch {
      // silently fail
    } finally {
      setLoadingAnalytics(false);
    }
  }, [selectedSiteId, dateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Fetch GSC top queries
  const fetchQueries = useCallback(async () => {
    if (!selectedSiteId) return;

    setLoadingQueries(true);
    try {
      const { startDate, endDate } = getDateRange(dateRange);
      const res = await fetch(
        `/api/analytics/gsc?siteId=${selectedSiteId}&startDate=${startDate}&endDate=${endDate}`,
      );
      const json = await res.json();
      const rows: GscRow[] = json.data ?? [];

      // Aggregate by query and sort by clicks
      const queryMap = new Map<string, GscRow>();
      for (const row of rows) {
        const existing = queryMap.get(row.query);
        if (existing) {
          existing.clicks += row.clicks;
          existing.impressions += row.impressions;
          existing.position = (existing.position + row.position) / 2;
          existing.ctr =
            existing.impressions > 0
              ? existing.clicks / existing.impressions
              : 0;
        } else {
          queryMap.set(row.query, { ...row });
        }
      }

      const sorted = Array.from(queryMap.values())
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 20);

      setTopQueries(sorted);
    } catch {
      // silently fail
    } finally {
      setLoadingQueries(false);
    }
  }, [selectedSiteId, dateRange]);

  // Fetch content gaps
  const fetchContentGaps = useCallback(async () => {
    if (!selectedSiteId) return;

    setLoadingGaps(true);
    try {
      const res = await fetch(
        `/api/analytics/content-gaps?siteId=${selectedSiteId}`,
      );
      const json = await res.json();
      setContentGaps(json.data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoadingGaps(false);
    }
  }, [selectedSiteId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Estadisticas</h2>
        <div className="flex items-center gap-3">
          <Select
            value={dateRange}
            onValueChange={(v) => setDateRange(v as DateRange)}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(rangeLabels) as DateRange[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {rangeLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Clicks totales"
          value={totals.clicks.toLocaleString("es-CO")}
          description={`Ultimos ${rangeLabels[dateRange]}`}
          icon={MousePointerClick}
          loading={loadingAnalytics}
        />
        <StatCard
          title="Impresiones"
          value={totals.impressions.toLocaleString("es-CO")}
          description={`Ultimos ${rangeLabels[dateRange]}`}
          icon={Eye}
          loading={loadingAnalytics}
        />
        <StatCard
          title="Posicion promedio"
          value={totals.avgPosition?.toFixed(1) ?? "-"}
          description="En resultados de Google"
          icon={TrendingUp}
          loading={loadingAnalytics}
        />
        <StatCard
          title="CTR promedio"
          value={`${totals.ctr.toFixed(2)}%`}
          description="Click-through rate"
          icon={Target}
          loading={loadingAnalytics}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="posts">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="queries" onClick={fetchQueries}>
            Consultas
          </TabsTrigger>
          <TabsTrigger value="gaps" onClick={fetchContentGaps}>
            Brechas de contenido
          </TabsTrigger>
        </TabsList>

        {/* Top posts by clicks */}
        <TabsContent value="posts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Posts por rendimiento</CardTitle>
              <CardDescription>
                Ordenados por clicks en los ultimos {rangeLabels[dateRange]}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingAnalytics ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              ) : postAnalytics.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin datos de analytics para este periodo
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titulo</TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">Impresiones</TableHead>
                      <TableHead className="text-right">Posicion</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postAnalytics.map((row) => (
                      <TableRow key={row.postId}>
                        <TableCell className="font-medium max-w-[250px] truncate">
                          {row.title}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{row.keyword}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.clicks.toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.impressions.toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.avgPosition?.toFixed(1) ?? "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.ctr.toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top queries */}
        <TabsContent value="queries" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Top consultas</CardTitle>
                <CardDescription>
                  Consultas de busqueda en Google Search Console
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchQueries}
                disabled={loadingQueries}
              >
                <RefreshCw
                  className={`size-4 mr-2 ${loadingQueries ? "animate-spin" : ""}`}
                />
                Sincronizar GSC
              </Button>
            </CardHeader>
            <CardContent>
              {loadingQueries ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              ) : topQueries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin datos de consultas. Haz click en &quot;Sincronizar GSC&quot; para obtener datos.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Consulta</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">Impresiones</TableHead>
                      <TableHead className="text-right">Posicion</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topQueries.map((row, idx) => (
                      <TableRow key={`${row.query}-${idx}`}>
                        <TableCell className="font-medium max-w-[300px] truncate">
                          {row.query}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.clicks.toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.impressions.toLocaleString("es-CO")}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.position.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(row.ctr * 100).toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content gaps */}
        <TabsContent value="gaps" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Brechas de contenido</CardTitle>
                <CardDescription>
                  Temas sugeridos basados en analisis de contenido existente
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchContentGaps}
                disabled={loadingGaps}
              >
                <Lightbulb
                  className={`size-4 mr-2 ${loadingGaps ? "animate-spin" : ""}`}
                />
                Analizar brechas
              </Button>
            </CardHeader>
            <CardContent>
              {loadingGaps ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              ) : contentGaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Haz click en &quot;Analizar brechas&quot; para identificar oportunidades de contenido.
                </p>
              ) : (
                <div className="space-y-4">
                  {contentGaps.map((gap, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-sm">{gap.topic}</h4>
                        <Badge variant="outline" className="shrink-0 ml-2">
                          {gap.suggestedKeywords.length} keywords
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {gap.reason}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {gap.suggestedKeywords.map((kw, kwIdx) => (
                          <Badge key={kwIdx} variant="secondary" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
