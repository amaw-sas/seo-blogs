"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Globe, Loader2, KeyRound, Check, X, Trash2, BookOpen, Play } from "lucide-react";


interface Site {
  id: string;
  domain: string;
  name: string;
  platform: string;
  apiUrl: string | null;
  apiUser: string | null;
  apiPassword: string | null;
  hasApiPassword: boolean;
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


const defaultSiteForm = {
  name: "",
  domain: "",
  platform: "wordpress",
  apiUrl: "",
  apiUser: "",
  apiPassword: "",
  hasApiPassword: false,
  postsPerDay: 1,
  minWords: 1500,
  maxWords: 2500,
  windowStart: 7,
  windowEnd: 12,
  conversionUrl: "",
  active: true,
};

type SiteForm = typeof defaultSiteForm;

function SiteFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SiteForm;
  onSave: (form: SiteForm) => Promise<void>;
  title: string;
}) {
  const [form, setForm] = useState<SiteForm>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function update<K extends keyof SiteForm>(key: K, value: SiteForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function formatDomain(v: string) {
    return v.trim().replace(/^https?[:;]\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }

  function formatUrl(v: string) {
    let url = v.trim().replace(/\/+$/, "");
    if (!url) return "";
    url = url.replace(/^https?[:;]\/\//, "");
    return `https://${url}`;
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
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
              onBlur={() => {
                const cleaned = formatDomain(form.domain);
                if (cleaned !== form.domain) update("domain", cleaned);
              }}
              required
              placeholder="alquilerdecarrosbogota.com"
            />
          </div>
          <div className="space-y-2">
            <Label>URL de conversión</Label>
            <Input
              value={form.conversionUrl}
              onChange={(e) => update("conversionUrl", e.target.value)}
              onBlur={() => {
                const cleaned = formatUrl(form.conversionUrl);
                if (cleaned !== form.conversionUrl) update("conversionUrl", cleaned);
              }}
              placeholder="reservatuvehiculo.com"
            />
            <p className="text-xs text-muted-foreground">
              Cada post incluirá un link contextual hacia esta dirección.
            </p>
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
            <div className="flex items-end pb-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="site-active"
                  checked={form.active}
                  onChange={(e) => update("active", e.target.checked)}
                  className="size-4 rounded border-gray-300"
                />
                <Label htmlFor="site-active" className="cursor-pointer">Publicación automática</Label>
              </div>
            </div>
          </div>

          <hr className="border-border" />

          <div className="space-y-2">
            <Label>URL de la REST API</Label>
            <Input
              value={form.apiUrl}
              onChange={(e) => update("apiUrl", e.target.value)}
              onBlur={() => {
                const cleaned = formatUrl(form.apiUrl);
                if (cleaned !== form.apiUrl) update("apiUrl", cleaned);
              }}
              placeholder={form.platform === "wordpress" ? "alquilerdecarrosbogota.com/wp-json" : "ejemplo.com/api"}
            />
            {form.platform === "wordpress" && (
              <p className="text-xs text-muted-foreground">
                Tu dominio + <code className="bg-muted px-1 rounded">/wp-json</code>
              </p>
            )}
          </div>

          {form.platform === "wordpress" ? (
            <>
              <div className="space-y-2">
                <Label>Usuario de WordPress</Label>
                <Input
                  value={form.apiUser}
                  onChange={(e) => update("apiUser", e.target.value)}
                  placeholder="seo-blog"
                />
                <p className="text-xs text-muted-foreground">
                  El nombre de usuario de WordPress que tiene la contraseña de aplicación. Lo encuentras en WordPress → Usuarios → tu perfil.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Contraseña de aplicación</Label>
                <div className="flex gap-1.5">
                  <Input
                    type="password"
                    value={form.apiPassword}
                    onChange={(e) => update("apiPassword", e.target.value)}
                    placeholder={form.hasApiPassword ? "••••••••••••" : "xxxx xxxx xxxx xxxx xxxx xxxx"}
                    className="flex-1"
                  />
                  {form.hasApiPassword && !form.apiPassword && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 size-9 text-green-600"
                      title="Contraseña guardada — dejá vacío para mantenerla o escribí una nueva"
                    >
                      <Check className="size-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Genérala en WordPress → Usuarios → tu perfil → Contraseñas de aplicación. Pega el código completo con espacios.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={form.apiPassword}
                  onChange={(e) => update("apiPassword", e.target.value)}
                  placeholder={form.hasApiPassword ? "••••••••••••" : "Clave de autenticación"}
                  className="flex-1 font-mono text-sm"
                  readOnly={!!form.apiPassword}
                />
                {form.hasApiPassword && !form.apiPassword && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 size-9 text-green-600"
                    title="Key guardada — dejá vacío para mantenerla o escribí una nueva"
                  >
                    <Check className="size-4" />
                  </Button>
                )}
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

          <hr className="border-border" />

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

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Horario de publicación</legend>
            <div className="grid gap-4 sm:grid-cols-3">
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
          </fieldset>

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
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Site | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  async function handleTestPipeline(site: Site) {
    try {
      const res = await fetch(`/api/sites/${site.id}/generate`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error desconocido" }));
        alert(err.error ?? `Error ${res.status}`);
        return;
      }
      router.push(`/runs?siteId=${site.id}&from=${new Date().toISOString()}`);
    } catch {
      alert("No se pudo iniciar el pipeline");
    }
  }

  async function handleCreate(form: SiteForm) {
    const { hasApiPassword, ...payload } = form;
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Error al crear sitio");
    fetchSites();
  }


  async function handleEdit(form: SiteForm) {
    if (!editSite) return;
    const { hasApiPassword, ...payload } = form;
    const res = await fetch(`/api/sites/${editSite.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Nuevo sitio
        </Button>
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
                    onClick={() => router.push(`/sites/${site.id}/knowledge`)}
                  >
                    <BookOpen className="size-3" />
                    Base de conocimiento
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => handleTestPipeline(site)}
                    disabled={site._count.keywords === 0}
                    title={site._count.keywords === 0 ? "No hay keywords pendientes" : "Genera un post de prueba con la keyword de mayor prioridad"}
                  >
                    <Play className="size-3" />
                    Probar pipeline
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
            hasApiPassword: editSite.hasApiPassword,
            postsPerDay: editSite.postsPerDay,
            minWords: editSite.minWords,
            maxWords: editSite.maxWords,
            windowStart: editSite.windowStart,
            windowEnd: editSite.windowEnd,
            conversionUrl: editSite.conversionUrl ?? "",
            active: editSite.active,
          }}
          onSave={handleEdit}
          title="Editar sitio"
        />
      )}

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

    </div>
  );
}
