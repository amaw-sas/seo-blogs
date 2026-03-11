"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  Key,
  AlertTriangle,
  DollarSign,
} from "lucide-react";

interface Post {
  id: string;
  title: string;
  keyword: string;
  status: string;
  seoScore: number | null;
  scheduledAt: string | null;
  createdAt: string;
  site: { name: string; domain: string };
}

interface Log {
  id: string;
  eventType: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  site: { name: string };
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  review: "bg-yellow-100 text-yellow-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-blue-100 text-blue-800",
  error: "bg-red-100 text-red-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

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

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [stats, setStats] = useState({
    postsToday: 0,
    postsWeek: 0,
    postsMonth: 0,
    keywordsPending: 0,
    keywordsUsed: 0,
    recentErrors: 0,
    estimatedCost: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const [
          postsRes,
          postsTodayRes,
          postsWeekRes,
          postsMonthRes,
          kwPendingRes,
          kwUsedRes,
          logsRes,
        ] = await Promise.all([
          fetch("/api/posts?limit=5"),
          fetch(`/api/posts?dateFrom=${todayStart}&limit=1`),
          fetch(`/api/posts?dateFrom=${weekStart}&limit=1`),
          fetch(`/api/posts?dateFrom=${monthStart}&limit=1`),
          fetch("/api/keywords?status=pending&limit=1"),
          fetch("/api/keywords?status=used&limit=1"),
          fetch("/api/logs?limit=5"),
        ]);

        const postsData = await postsRes.json();
        const todayData = await postsTodayRes.json();
        const weekData = await postsWeekRes.json();
        const monthData = await postsMonthRes.json();
        const kwPendingData = await kwPendingRes.json();
        const kwUsedData = await kwUsedRes.json();
        const logsData = await logsRes.json();

        setPosts(postsData.data ?? []);
        setLogs(logsData.data ?? []);

        const errorLogs = (logsData.data ?? []).filter(
          (l: Log) => l.status === "failed"
        );

        setStats({
          postsToday: todayData.total ?? 0,
          postsWeek: weekData.total ?? 0,
          postsMonth: monthData.total ?? 0,
          keywordsPending: kwPendingData.total ?? 0,
          keywordsUsed: kwUsedData.total ?? 0,
          recentErrors: errorLogs.length,
          estimatedCost: 0,
        });
      } catch {
        // silently fail — data will show as 0
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Posts hoy"
          value={stats.postsToday}
          description={`${stats.postsWeek} esta semana / ${stats.postsMonth} este mes`}
          icon={FileText}
          loading={loading}
        />
        <StatCard
          title="Keywords"
          value={`${stats.keywordsUsed} / ${stats.keywordsPending + stats.keywordsUsed}`}
          description={`${stats.keywordsPending} pendientes`}
          icon={Key}
          loading={loading}
        />
        <StatCard
          title="Errores recientes"
          value={stats.recentErrors}
          description="Últimos 5 eventos"
          icon={AlertTriangle}
          loading={loading}
        />
        <StatCard
          title="Costo estimado"
          value={`$${stats.estimatedCost.toFixed(2)}`}
          description="Este mes"
          icon={DollarSign}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximas publicaciones</CardTitle>
            <CardDescription>Posts programados o en revisión</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin publicaciones próximas</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Sitio</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((post) => (
                    <TableRow key={post.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {post.title}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {post.site.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusColors[post.status] ?? ""}
                        >
                          {post.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Errores recientes</CardTitle>
            <CardDescription>Últimos eventos del sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos recientes</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium text-sm">
                        {log.eventType}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusColors[log.status] ?? ""}
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(log.createdAt).toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
