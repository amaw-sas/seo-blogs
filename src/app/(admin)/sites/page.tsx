"use client";

import { useEffect, useState } from "react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Pencil, Globe, Loader2 } from "lucide-react";

interface Site {
  id: string;
  domain: string;
  name: string;
  platform: string;
  apiUrl: string | null;
  apiUser: string | null;
  postsPerDay: number;
  minWords: number;
  maxWords: number;
  windowStart: number;
  windowEnd: number;
  conversionUrl: string | null;
  active: boolean;
  createdAt: string;
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
              placeholder="https://ejemplo.com/wp-json/wp/v2"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Usuario API</Label>
              <Input
                value={form.apiUser}
                onChange={(e) => update("apiUser", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña API</Label>
              <Input
                type="password"
                value={form.apiPassword}
                onChange={(e) => update("apiPassword", e.target.value)}
              />
            </div>
          </div>

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

  async function handleCreate(form: SiteForm) {
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) throw new Error("Error al crear sitio");
    fetchSites();
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
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setEditSite(site)}
                  >
                    <Pencil className="size-3" />
                    Editar configuración
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
            active: editSite.active,
          }}
          onSave={handleEdit}
          title="Editar sitio"
          description={`Configuración de ${editSite.domain}`}
        />
      )}
    </div>
  );
}
