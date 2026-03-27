"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { resolveSiteLabel } from "@/lib/ui/select-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Upload,
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
} from "lucide-react";

interface Site {
  id: string;
  name: string;
  domain: string;
}

interface Keyword {
  id: string;
  phrase: string;
  status: string;
  priority: number;
  parentId: string | null;
  createdAt: string;
  site: { name: string; domain: string };
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  used: "bg-green-100 text-green-800",
  skipped: "bg-gray-100 text-gray-800",
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  used: "Usada",
  skipped: "Omitida",
};

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 20;

  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanding, setExpanding] = useState(false);
  const [expandMessage, setExpandMessage] = useState("");

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (siteFilter) params.set("siteId", siteFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/keywords?${params}`);
      const data = await res.json();
      setKeywords(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setKeywords([]);
    } finally {
      setLoading(false);
    }
  }, [page, siteFilter, statusFilter]);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => setSites(d.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      await fetch(`/api/keywords/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setKeywords((prev) =>
        prev.map((k) => (k.id === id ? { ...k, status: newStatus } : k))
      );
    } catch {
      // ignore
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === keywords.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(keywords.map((k) => k.id)));
    }
  }

  async function handleExpand() {
    if (selected.size === 0) return;

    // Determine siteId from selected keywords
    const selectedKeywords = keywords.filter((k) => selected.has(k.id));
    const siteIds = new Set(selectedKeywords.map((k) => {
      const site = sites.find((s) => s.name === k.site.name && s.domain === k.site.domain);
      return site?.id;
    }).filter(Boolean));

    if (siteIds.size !== 1) {
      setExpandMessage("Selecciona keywords de un solo sitio");
      return;
    }

    const siteId = [...siteIds][0]!;
    setExpanding(true);
    setExpandMessage("");

    try {
      const res = await fetch("/api/keywords/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywordIds: [...selected], siteId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al expandir");
      }

      const data = await res.json();
      setExpandMessage(`${data.created} keywords creadas a partir de ${data.expanded} semillas`);
      setSelected(new Set());
      fetchKeywords();
    } catch (err) {
      setExpandMessage(err instanceof Error ? err.message : "Error al expandir keywords");
    } finally {
      setExpanding(false);
    }
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Error al subir archivo");
      const data = await res.json();
      setUploadMessage(`Importación exitosa: ${data.created ?? 0} keywords creadas`);
      fetchKeywords();
    } catch {
      setUploadMessage("Error al importar archivo");
    } finally {
      setUploading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Keywords</h2>
        <div className="flex items-center gap-2">
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm" className="gap-2">
                  <Upload className="size-4" />
                  Importar CSV
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Importar keywords desde CSV</DialogTitle>
                <DialogDescription>
                  El archivo debe contener columnas: phrase, siteId, priority (opcional)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="csvFile">Archivo CSV</Label>
                  <Input
                    id="csvFile"
                    type="file"
                    accept=".csv"
                    ref={fileInputRef}
                  />
                </div>
                {uploadMessage && (
                  <p
                    className={`text-sm ${
                      uploadMessage.includes("Error")
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {uploadMessage}
                  </p>
                )}
                <Button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full"
                >
                  {uploading ? "Importando..." : "Importar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={selected.size === 0 || expanding}
            onClick={handleExpand}
          >
            {expanding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {expanding ? "Expandiendo..." : `Expandir${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={siteFilter || "all"}
          onValueChange={(v: string | null) => {
            setSiteFilter(!v || v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Todos los sitios">
              {resolveSiteLabel(sites, siteFilter, "Todos los sitios")}
            </SelectValue>
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
          value={statusFilter || "all"}
          onValueChange={(v: string | null) => {
            setStatusFilter(!v || v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {expandMessage && (
        <p className={`text-sm ${expandMessage.includes("Error") || expandMessage.includes("Selecciona") ? "text-red-600" : "text-green-600"}`}>
          {expandMessage}
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <input
                  type="checkbox"
                  checked={keywords.length > 0 && selected.size === keywords.length}
                  onChange={toggleAll}
                  className="size-4 rounded border-gray-300"
                />
              </TableHead>
              <TableHead>Frase</TableHead>
              <TableHead>Sitio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Prioridad</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : keywords.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-8"
                    >
                      No se encontraron keywords
                    </TableCell>
                  </TableRow>
                ) : (
                  keywords.map((kw) => (
                    <TableRow key={kw.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(kw.id)}
                          onChange={() => toggleSelect(kw.id)}
                          className="size-4 rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{kw.phrase}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {kw.site.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusColors[kw.status] ?? ""}
                        >
                          {statusLabels[kw.status] ?? kw.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{kw.priority}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {kw.parentId ? "Expandida" : "Manual"}
                      </TableCell>
                      <TableCell className="text-right">
                        {kw.status === "pending" && (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                              onClick={() => handleStatusChange(kw.id, "used")}
                              title="Marcar como usada"
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-gray-500 hover:text-gray-700"
                              onClick={() => handleStatusChange(kw.id, "skipped")}
                              title="Omitir"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} keyword{total !== 1 ? "s" : ""} en total
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
