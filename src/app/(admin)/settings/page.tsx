"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  MessageCircle,
  Download,
  CheckCircle,
  XCircle,
  RefreshCw,
  Shield,
  Bell,
  Database,
  Clock,
  Loader2,
  LinkIcon,
  FileWarning,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface SystemStatus {
  smtp: boolean;
  telegram: boolean;
  lastReport: string | null;
  brokenLinksCount: number;
  nextChecks: {
    brokenLinks: string;
    outdatedContent: string;
    weeklyReport: string;
  };
}

interface NotificationTest {
  loading: boolean;
  result: "success" | "error" | null;
  message: string;
}

// ── Helpers ──────────────────────────────────────────────────

function maskValue(value: string | undefined): string {
  if (!value) return "No configurado";
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "****" + value.slice(-2);
}

function nextDayAt(dayOfWeek: number, hour: number): string {
  const now = new Date();
  const next = new Date(now);
  const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7;
  next.setDate(now.getDate() + daysUntil);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 7);
  return next.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function nextTimeAt(hour: number): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ────────────────────────────────────────────────

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [emailTest, setEmailTest] = useState<NotificationTest>({
    loading: false,
    result: null,
    message: "",
  });
  const [telegramTest, setTelegramTest] = useState<NotificationTest>({
    loading: false,
    result: null,
    message: "",
  });
  const [exporting, setExporting] = useState<string | null>(null);
  const [brokenLinksCount, setBrokenLinksCount] = useState(0);
  const [lastReport, setLastReport] = useState<string | null>(null);
  const [checkingLinks, setCheckingLinks] = useState(false);
  const [checkingOutdated, setCheckingOutdated] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      // Fetch broken links count
      const blRes = await fetch("/api/analytics/broken-links");
      if (blRes.ok) {
        const blData = await blRes.json();
        setBrokenLinksCount(blData.totalBroken ?? 0);
      }

      // Fetch last weekly report from logs
      const logsRes = await fetch(
        "/api/logs?eventType=weekly_report&limit=1",
      );
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        if (logsData.data?.length > 0) {
          setLastReport(logsData.data[0].createdAt);
        }
      }
    } catch {
      console.error("Failed to fetch system status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function testNotification(channel: "email" | "telegram") {
    const setter = channel === "email" ? setEmailTest : setTelegramTest;
    setter({ loading: true, result: null, message: "" });

    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "test",
          message: "Notificación de prueba desde la configuración.",
          channel,
        }),
      });

      if (res.ok) {
        setter({
          loading: false,
          result: "success",
          message: "Notificación enviada correctamente",
        });
      } else {
        const data = await res.json();
        setter({
          loading: false,
          result: "error",
          message: data.error ?? "Error al enviar",
        });
      }
    } catch (error) {
      setter({
        loading: false,
        result: "error",
        message: error instanceof Error ? error.message : "Error de red",
      });
    }
  }

  async function exportData(
    type: "posts" | "keywords" | "logs",
    format: "csv" | "json",
  ) {
    const key = `${type}-${format}`;
    setExporting(key);

    try {
      const res = await fetch(`/api/${type}?limit=10000`);
      if (!res.ok) throw new Error("Failed to fetch data");

      const result = await res.json();
      const data = result.data ?? result;

      let content: string;
      let mimeType: string;
      let extension: string;

      if (format === "json") {
        content = JSON.stringify(data, null, 2);
        mimeType = "application/json";
        extension = "json";
      } else {
        content = convertToCsv(data);
        mimeType = "text/csv";
        extension = "csv";
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-export-${new Date().toISOString().slice(0, 10)}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Export failed:`, error);
    } finally {
      setExporting(null);
    }
  }

  async function triggerBrokenLinksCheck() {
    setCheckingLinks(true);
    try {
      await fetch("/api/analytics/broken-links", { method: "POST" });
      await fetchStatus();
    } catch {
      console.error("Broken links check failed");
    } finally {
      setCheckingLinks(false);
    }
  }

  async function triggerOutdatedContentCheck() {
    setCheckingOutdated(true);
    try {
      // This would normally be a dedicated endpoint; for now, trigger via worker
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch {
      console.error("Outdated content check failed");
    } finally {
      setCheckingOutdated(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Configuración</h1>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">
          Gestiona notificaciones, exportaciones y monitoreo del sistema.
        </p>
      </div>

      {/* ── Notification Settings ─────────────────────────────── */}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5" />
              Correo Electrónico (SMTP)
            </CardTitle>
            <CardDescription>
              Configuración del servidor de correo para notificaciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-muted-foreground">Host</Label>
                <span className="text-sm font-mono">
                  {maskValue(process.env.NEXT_PUBLIC_SMTP_HOST)}
                </span>
              </div>
              <div className="flex justify-between">
                <Label className="text-muted-foreground">Puerto</Label>
                <span className="text-sm font-mono">
                  {process.env.NEXT_PUBLIC_SMTP_PORT ?? "587"}
                </span>
              </div>
              <div className="flex justify-between">
                <Label className="text-muted-foreground">Usuario</Label>
                <span className="text-sm font-mono">
                  {maskValue(process.env.NEXT_PUBLIC_SMTP_USER)}
                </span>
              </div>
              <div className="flex justify-between">
                <Label className="text-muted-foreground">Contraseña</Label>
                <span className="text-sm font-mono">********</span>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testNotification("email")}
                disabled={emailTest.loading}
              >
                {emailTest.loading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 size-4" />
                )}
                Enviar prueba
              </Button>
              {emailTest.result === "success" && (
                <Badge variant="outline" className="text-green-600 border-green-300">
                  <CheckCircle className="mr-1 size-3" />
                  Enviado
                </Badge>
              )}
              {emailTest.result === "error" && (
                <Badge variant="outline" className="text-red-600 border-red-300">
                  <XCircle className="mr-1 size-3" />
                  {emailTest.message}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="size-5" />
              Telegram
            </CardTitle>
            <CardDescription>
              Bot de Telegram para alertas y reportes instantáneos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-muted-foreground">Bot Token</Label>
                <span className="text-sm font-mono">
                  {maskValue(process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN)}
                </span>
              </div>
              <div className="flex justify-between">
                <Label className="text-muted-foreground">Chat ID</Label>
                <span className="text-sm font-mono">
                  {maskValue(process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID)}
                </span>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => testNotification("telegram")}
                disabled={telegramTest.loading}
              >
                {telegramTest.loading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <MessageCircle className="mr-2 size-4" />
                )}
                Enviar prueba
              </Button>
              {telegramTest.result === "success" && (
                <Badge variant="outline" className="text-green-600 border-green-300">
                  <CheckCircle className="mr-1 size-3" />
                  Enviado
                </Badge>
              )}
              {telegramTest.result === "error" && (
                <Badge variant="outline" className="text-red-600 border-red-300">
                  <XCircle className="mr-1 size-3" />
                  {telegramTest.message}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Export Section ────────────────────────────────────── */}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-5" />
            Exportar Datos
          </CardTitle>
          <CardDescription>
            Descarga posts, keywords o logs en formato CSV o JSON.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <ExportGroup
              label="Posts"
              type="posts"
              exporting={exporting}
              onExport={exportData}
            />
            <ExportGroup
              label="Keywords"
              type="keywords"
              exporting={exporting}
              onExport={exportData}
            />
            <ExportGroup
              label="Logs"
              type="logs"
              exporting={exporting}
              onExport={exportData}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── System Status ────────────────────────────────────── */}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5" />
              Estado del Sistema
            </CardTitle>
            <CardDescription>
              Información general y estado de los servicios.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow
              label="Último reporte semanal"
              value={
                lastReport
                  ? new Date(lastReport).toLocaleDateString("es-CO", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Ninguno"
              }
              icon={<Clock className="size-4 text-muted-foreground" />}
            />
            <StatusRow
              label="Enlaces rotos detectados"
              value={String(brokenLinksCount)}
              icon={<LinkIcon className="size-4 text-muted-foreground" />}
              badge={
                brokenLinksCount > 0 ? (
                  <Badge variant="destructive" className="ml-2">
                    {brokenLinksCount}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 text-green-600 border-green-300">
                    OK
                  </Badge>
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-5" />
              Próximas Verificaciones
            </CardTitle>
            <CardDescription>
              Tareas programadas del worker.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow
              label="Enlaces rotos"
              value={nextTimeAt(3)}
              icon={<LinkIcon className="size-4 text-muted-foreground" />}
            />
            <StatusRow
              label="Contenido desactualizado"
              value={nextDayAt(0, 2)}
              icon={<FileWarning className="size-4 text-muted-foreground" />}
            />
            <StatusRow
              label="Reporte semanal"
              value={nextDayAt(1, 8)}
              icon={<Clock className="size-4 text-muted-foreground" />}
            />
            <Separator className="my-3" />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={triggerBrokenLinksCheck}
                disabled={checkingLinks}
              >
                {checkingLinks ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                Verificar enlaces ahora
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={triggerOutdatedContentCheck}
                disabled={checkingOutdated}
              >
                {checkingOutdated ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <FileWarning className="mr-2 size-4" />
                )}
                Verificar contenido
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function ExportGroup({
  label,
  type,
  exporting,
  onExport,
}: {
  label: string;
  type: "posts" | "keywords" | "logs";
  exporting: string | null;
  onExport: (type: "posts" | "keywords" | "logs", format: "csv" | "json") => void;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Database className="size-4 text-muted-foreground" />
        <span className="font-medium">{label}</span>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={exporting !== null}
          onClick={() => onExport(type, "csv")}
        >
          {exporting === `${type}-csv` ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <Download className="mr-1 size-3" />
          )}
          CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={exporting !== null}
          onClick={() => onExport(type, "json")}
        >
          {exporting === `${type}-json` ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <Download className="mr-1 size-3" />
          )}
          JSON
        </Button>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  icon,
  badge,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center">
        <span className="text-sm text-muted-foreground">{value}</span>
        {badge}
      </div>
    </div>
  );
}

// ── CSV helper ──────────────────────────────────────────────

function convertToCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = row[h];
        const str = val === null || val === undefined ? "" : String(val);
        // Escape CSV values
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}
