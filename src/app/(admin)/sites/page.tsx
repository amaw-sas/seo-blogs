"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Globe, Loader2, Play, Palette, KeyRound, Rocket, Check, X, Trash2 } from "lucide-react";

interface Site {
  id: string;
  domain: string;
  name: string;
  platform: string;
  apiUrl: string | null;
  apiUser: string | null;
  apiPassword: string | null;
  postsPerDay: number;
  minWords: number;
  maxWords: number;
  windowStart: number;
  windowEnd: number;
  conversionUrl: string | null;
  knowledgeBase: string | null;
  active: boolean;
  createdAt: string;
  _count: { keywords: number };
}

interface LogEntry {
  id: string;
  eventType: string;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const STEP_LABELS: Record<string, string> = {
  pipeline_run: "Inicio del pipeline",
  keyword_selection: "Selección de keyword",
  competition_analysis: "Análisis de competencia",
  outline_generation: "Generación de outline",
  content_generation: "Generación de contenido",
  image_generation: "Generación de imágenes",
  seo_scoring: "Puntuación SEO",
  regeneration: "Regeneración (score bajo)",
  post_save: "Guardado del post",
  auto_categorization: "Categorización automática",
  auto_linking: "Enlaces automáticos",
  wordpress_publish: "Publicación WordPress",
  pipeline_error: "Error en pipeline",
};

function StepIcon({ status }: { status: string }) {
  if (status === "started") return <Loader2 className="size-4 animate-spin text-blue-500" />;
  if (status === "success") return <Check className="size-4 text-green-500" />;
  if (status === "failed") return <X className="size-4 text-red-500" />;
  return <Loader2 className="size-4 text-muted-foreground" />;
}

function PipelineProgressDialog({
  open,
  onOpenChange,
  siteId,
  siteName,
  runStartedAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  siteName: string;
  runStartedAt: string;
}) {
  const [steps, setSteps] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        siteId,
        dateFrom: runStartedAt,
        limit: "50",
      });
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      const logs: LogEntry[] = data.data ?? [];
      // API returns desc order, reverse for chronological display
      setSteps([...logs].reverse());

      const terminal = logs.some(
        (l) =>
          (l.eventType === "post_save" && l.status === "success") ||
          (l.eventType === "pipeline_run" && l.status === "success") ||
          (l.eventType === "pipeline_run" && l.status === "failed"),
      );
      if (terminal) setDone(true);
    } catch {
      // Silently retry on next poll
    }
  }, [siteId, runStartedAt]);

  useEffect(() => {
    if (!open) return;
    poll(); // eslint-disable-line react-hooks/set-state-in-effect -- polling pattern: poll() is a stable callback that fetches external data
    intervalRef.current = setInterval(poll, 3000);

    // Auto-stop after 5.5 min (matches maxDuration=300s + buffer)
    const timeout = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimedOut(true);
      setDone(true);
    }, 330_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearTimeout(timeout);
    };
  }, [open, poll]);

  useEffect(() => {
    if (done && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [done]);

  const postId = steps.find(
    (s) => s.eventType === "post_save" && s.status === "success",
  )?.metadata?.postId as string | undefined;

  const failed = steps.some(
    (s) => s.eventType === "pipeline_run" && s.status === "failed",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generando post — {siteName}</DialogTitle>
          <DialogDescription>
            {done
              ? failed
                ? "El pipeline falló"
                : timedOut
                  ? "Tiempo agotado — el pipeline puede seguir en segundo plano"
                  : "Pipeline completado"
              : "El pipeline está corriendo..."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {steps.length === 0 && !done && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="size-4 animate-spin" />
              Esperando primer paso...
            </div>
          )}
          {steps
            .filter((s) => !(s.eventType === "pipeline_run" && s.status === "started"))
            .map((step) => (
            <div key={step.id} className="flex items-center gap-3 text-sm">
              <StepIcon status={step.status} />
              <span className="flex-1">
                {STEP_LABELS[step.eventType] ?? step.eventType}
              </span>
              {"keyword" in (step.metadata ?? {}) && (
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                  {String(step.metadata!.keyword)}
                </span>
              )}
              {"score" in (step.metadata ?? {}) && (
                <Badge variant="secondary" className="text-xs">
                  SEO: {String(step.metadata!.score)}
                </Badge>
              )}
              {"error" in (step.metadata ?? {}) && (
                <span className="text-xs text-red-500 truncate max-w-[200px]">
                  {String(step.metadata!.error)}
                </span>
              )}
            </div>
          ))}
        </div>
        {postId && (
          <a
            href={`/posts/${postId}/edit`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ver post generado
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}

const defaultSiteForm = {
  name: "",
  domain: "",
  platform: "wordpress",
  apiUrl: "",
  apiUser: "",
  apiPassword: "",
  postsPerDay: 1,
  minWords: 1500,
  maxWords: 2500,
  windowStart: 7,
  windowEnd: 12,
  conversionUrl: "",
  knowledgeBase: "",
  active: true,
};

type SiteForm = typeof defaultSiteForm;

function SiteFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SiteForm;
  onSave: (form: SiteForm) => Promise<void>;
  title: string;
  description: string;
}) {
  const [form, setForm] = useState<SiteForm>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function update<K extends keyof SiteForm>(key: K, value: SiteForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Dominio</Label>
              <Input
                value={form.domain}
                onChange={(e) => update("domain", e.target.value)}
                required
                placeholder="ejemplo.com"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Plataforma</Label>
              <Select
                value={form.platform}
                onValueChange={(v: string | null) => update("platform", v ?? "wordpress")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wordpress">WordPress</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Posts por día</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.postsPerDay}
                onChange={(e) => update("postsPerDay", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>URL de API</Label>
            <Input
              value={form.apiUrl}
              onChange={(e) => update("apiUrl", e.target.value)}
              placeholder={form.platform === "wordpress" ? "https://ejemplo.com/wp-json" : "https://ejemplo.com/api"}
            />
          </div>

          {form.platform === "wordpress" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Usuario API</Label>
                <Input
                  value={form.apiUser}
                  onChange={(e) => update("apiUser", e.target.value)}
                  placeholder="usuario-wordpress"
                />
              </div>
              <div className="space-y-2">
                <Label>Application Password</Label>
                <Input
                  type="password"
                  value={form.apiPassword}
                  onChange={(e) => update("apiPassword", e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={form.apiPassword}
                  onChange={(e) => update("apiPassword", e.target.value)}
                  placeholder="Clave de autenticación para el blog"
                  className="flex-1 font-mono text-sm"
                  readOnly={!!form.apiPassword}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={() => {
                    const key = crypto.randomUUID();
                    update("apiPassword", key);
                    navigator.clipboard.writeText(key);
                  }}
                  title="Generar API Key y copiar al portapapeles"
                >
                  <KeyRound className="size-3" />
                  Generar y copiar
                </Button>
              </div>
              {form.apiPassword && (
                <p className="text-xs text-muted-foreground">
                  Copia esta key y configúrala en tu blog. No se mostrará de nuevo después de guardar.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Mín. palabras</Label>
              <Input
                type="number"
                min={500}
                value={form.minWords}
                onChange={(e) => update("minWords", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Máx. palabras</Label>
              <Input
                type="number"
                min={500}
                value={form.maxWords}
                onChange={(e) => update("maxWords", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Hora inicio</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={form.windowStart}
                onChange={(e) => update("windowStart", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Hora fin</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={form.windowEnd}
                onChange={(e) => update("windowEnd", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>URL de conversión</Label>
            <Input
              value={form.conversionUrl}
              onChange={(e) => update("conversionUrl", e.target.value)}
              placeholder="https://ejemplo.com/contacto"
            />
          </div>

          <div className="space-y-2">
            <Label>Base de conocimiento</Label>
            <Textarea
              value={form.knowledgeBase}
              onChange={(e) => update("knowledgeBase", e.target.value)}
              placeholder="Información del negocio: categorías de vehículos, sedes, tarifas, servicios, diferenciadores..."
              rows={6}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Se inyecta en los prompts de generación de contenido e imágenes para hacer el contenido más específico.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<Site | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionForm, setProvisionForm] = useState({
    name: "",
    domain: "",
    niche: "",
    repoName: "",
    knowledgeBase: "",
  });
  const [theming, setTheming] = useState<Record<string, boolean>>({});
  const [progressSite, setProgressSite] = useState<{
    id: string;
    name: string;
    startedAt: string;
  } | null>(null);

  async function fetchSites() {
    try {
      const res = await fetch("/api/sites");
      const data = await res.json();
      setSites(data.data ?? []);
    } catch {
      setSites([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSites();
  }, []);

  async function handleDelete(siteId: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar sitio");
      setDeleteConfirm(null);
      fetchSites();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate(form: SiteForm) {
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) throw new Error("Error al crear sitio");
    fetchSites();
  }

  async function handleGenerate(site: Site) {
    setGenerating((prev) => ({ ...prev, [site.id]: true }));
    try {
      const res = await fetch(`/api/sites/${site.id}/generate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Error al iniciar pipeline");
        return;
      }
      setProgressSite({
        id: site.id,
        name: site.name,
        startedAt: new Date().toISOString(),
      });
    } catch {
      alert("Error de conexión");
    } finally {
      setGenerating((prev) => ({ ...prev, [site.id]: false }));
    }
  }

  async function handleProvision() {
    const { name, domain, niche, repoName, knowledgeBase } = provisionForm;
    if (!name || !domain || !niche || !repoName) return;
    setProvisioning(true);
    try {
      const res = await fetch("/api/sites/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain, niche, repoName, knowledgeBase, skipTheme: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Error al provisionar");
        return;
      }
      alert(`Blog provisionado: ${data.provisioning.deployUrl}`);
      setProvisionOpen(false);
      setProvisionForm({ name: "", domain: "", niche: "", repoName: "", knowledgeBase: "" });
      fetchSites();
    } catch {
      alert("Error de conexión");
    } finally {
      setProvisioning(false);
    }
  }

  async function handleTheme(siteId: string) {
    setTheming((prev) => ({ ...prev, [siteId]: true }));
    try {
      const res = await fetch(`/api/sites/${siteId}/theme`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Error al configurar tema");
        return;
      }
      alert(`Tema configurado: ${data.theme.colorScheme} + ${data.theme.fontFamily}`);
    } catch {
      alert("Error de conexión");
    } finally {
      setTheming((prev) => ({ ...prev, [siteId]: false }));
    }
  }

  async function handleEdit(form: SiteForm) {
    if (!editSite) return;
    const res = await fetch(`/api/sites/${editSite.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) throw new Error("Error al actualizar sitio");
    setEditSite(null);
    fetchSites();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[200px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Sitios</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setProvisionOpen(true)}>
            <Rocket className="size-4" />
            Provisionar blog
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            Nuevo sitio
          </Button>
        </div>
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <Globe className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">No hay sitios configurados</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Crear primer sitio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <Card key={site.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{site.name}</CardTitle>
                    <CardDescription>{site.domain}</CardDescription>
                  </div>
                  <Badge variant={site.active ? "default" : "secondary"}>
                    {site.active ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plataforma</span>
                  <span className="font-medium capitalize">{site.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Posts/día</span>
                  <span className="font-medium">{site.postsPerDay}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rango palabras</span>
                  <span className="font-medium">
                    {site.minWords}–{site.maxWords}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ventana horaria</span>
                  <span className="font-medium">
                    {String(site.windowStart).padStart(2, "0")}:00 –{" "}
                    {String(site.windowEnd).padStart(2, "0")}:00
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Keywords pendientes</span>
                  <span className="font-medium">{site._count.keywords}</span>
                </div>
                <div className="pt-2 space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setEditSite(site)}
                  >
                    <Pencil className="size-3" />
                    Editar configuración
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    disabled={!site.apiUrl || !site.apiPassword || theming[site.id]}
                    onClick={() => handleTheme(site.id)}
                  >
                    {theming[site.id] ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Palette className="size-3" />
                    )}
                    {theming[site.id] ? "Generando tema..." : "Configurar tema"}
                  </Button>
                  <Button
                    size="sm"
                    className="w-full gap-2"
                    disabled={!site.active || site._count.keywords === 0 || generating[site.id]}
                    onClick={() => handleGenerate(site)}
                  >
                    {generating[site.id] ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Play className="size-3" />
                    )}
                    {!site.active
                      ? "Sitio inactivo"
                      : site._count.keywords === 0
                        ? "Sin keywords"
                        : "Generar post"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteConfirm(site)}
                  >
                    <Trash2 className="size-3" />
                    Eliminar sitio
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SiteFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={defaultSiteForm}
        onSave={handleCreate}
        title="Nuevo sitio"
        description="Configura un nuevo sitio para publicación automática"
      />

      {editSite && (
        <SiteFormDialog
          open={!!editSite}
          onOpenChange={(open) => !open && setEditSite(null)}
          initial={{
            name: editSite.name,
            domain: editSite.domain,
            platform: editSite.platform,
            apiUrl: editSite.apiUrl ?? "",
            apiUser: editSite.apiUser ?? "",
            apiPassword: "",
            postsPerDay: editSite.postsPerDay,
            minWords: editSite.minWords,
            maxWords: editSite.maxWords,
            windowStart: editSite.windowStart,
            windowEnd: editSite.windowEnd,
            conversionUrl: editSite.conversionUrl ?? "",
            knowledgeBase: editSite.knowledgeBase ?? "",
            active: editSite.active,
          }}
          onSave={handleEdit}
          title="Editar sitio"
          description={`Configuración de ${editSite.domain}`}
        />
      )}

      {/* Provision blog dialog */}
      <Dialog open={provisionOpen} onOpenChange={setProvisionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Provisionar nuevo blog</DialogTitle>
            <DialogDescription>
              Crea automáticamente: repo GitHub + proyecto Vercel + deploy + API key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre del blog</Label>
                <Input
                  placeholder="Alquila Tu Carro"
                  value={provisionForm.name}
                  onChange={(e) => setProvisionForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Dominio</Label>
                <Input
                  placeholder="alquilatucarro.com"
                  value={provisionForm.domain}
                  onChange={(e) => setProvisionForm((f) => ({ ...f, domain: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nicho</Label>
                <Input
                  placeholder="alquiler de carros en Bogotá"
                  value={provisionForm.niche}
                  onChange={(e) => setProvisionForm((f) => ({ ...f, niche: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre del repo</Label>
                <Input
                  placeholder="blog-alquilatucarro"
                  value={provisionForm.repoName}
                  onChange={(e) => setProvisionForm((f) => ({ ...f, repoName: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Base de conocimiento (opcional)</Label>
              <Textarea
                placeholder="Información del negocio para generar contenido específico..."
                value={provisionForm.knowledgeBase}
                onChange={(e) => setProvisionForm((f) => ({ ...f, knowledgeBase: e.target.value }))}
                rows={3}
                className="resize-y"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleProvision}
              disabled={provisioning || !provisionForm.name || !provisionForm.domain || !provisionForm.niche || !provisionForm.repoName}
            >
              {provisioning ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Provisionando...
                </>
              ) : (
                <>
                  <Rocket className="mr-2 size-4" />
                  Provisionar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) { setDeleteConfirm(null); setDeleteInput(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar sitio</DialogTitle>
            <DialogDescription>
              Esto eliminará <strong>{deleteConfirm?.name}</strong> ({deleteConfirm?.domain}) y todas sus keywords, posts, logs e imágenes del pool.
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Escribe <strong>{deleteConfirm?.name}</strong> para confirmar</Label>
            <Input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={deleteConfirm?.name ?? ""}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteConfirm(null); setDeleteInput(""); }} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
              disabled={deleting || deleteInput !== deleteConfirm?.name}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {progressSite && (
        <PipelineProgressDialog
          key={progressSite.startedAt}
          open={!!progressSite}
          onOpenChange={(open) => {
            if (!open) {
              setProgressSite(null);
              fetchSites();
            }
          }}
          siteId={progressSite.id}
          siteName={progressSite.name}
          runStartedAt={progressSite.startedAt}
        />
      )}
    </div>
  );
}
