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
  Plus,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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
  pending: "Disponible",
  used: "Usada",
  skipped: "Omitida",
};

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanding, setExpanding] = useState(false);
  const [expandMessage, setExpandMessage] = useState("");

  // Expand preview dialog
  const [expandOpen, setExpandOpen] = useState(false);
  const [expandCount, setExpandCount] = useState(5);
  const [expandSuggestions, setExpandSuggestions] = useState<Array<{ phrase: string; priority: number; parentId: string; checked: boolean }>>([]);
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandSaving, setExpandSaving] = useState(false);
  const [expandSiteId, setExpandSiteId] = useState("");

  // Add keyword dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addSiteId, setAddSiteId] = useState("");
  const [addPhrase, setAddPhrase] = useState("");
  const [addPriority, setAddPriority] = useState(0);
  const [addSaving, setAddSaving] = useState(false);
  const [addMessage, setAddMessage] = useState("");

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (siteFilter) params.set("siteId", siteFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (sortField) {
        params.set("sortField", sortField);
        params.set("sortDir", sortDir);
      }

      const res = await fetch(`/api/keywords?${params}`);
      const data = await res.json();
      setKeywords(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setKeywords([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, siteFilter, statusFilter, sortField, sortDir]);

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

  function handleExpandClick() {
    if (selected.size === 0) return;

    const selectedKeywords = keywords.filter((k) => selected.has(k.id));
    const siteIds = new Set(selectedKeywords.map((k) => {
      const site = sites.find((s) => s.name === k.site.name && s.domain === k.site.domain);
      return site?.id;
    }).filter(Boolean));

    if (siteIds.size !== 1) {
      setExpandMessage("Selecciona keywords de un solo sitio");
      return;
    }

    setExpandSiteId([...siteIds][0]!);
    setExpandSuggestions([]);
    setExpandMessage("");
    setExpandOpen(true);
  }

  async function handleExpandGenerate() {
    setExpandLoading(true);
    setExpandMessage("");
    try {
      const res = await fetch("/api/keywords/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywordIds: [...selected],
          siteId: expandSiteId,
          dryRun: true,
          maxPerSeed: expandCount,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al generar sugerencias");
      }

      const data = await res.json();
      const suggestions = (data.keywords ?? []).map((kw: { phrase: string; priority: number; parentId: string }) => ({
        ...kw,
        checked: true,
      }));
      setExpandSuggestions(suggestions);
    } catch (err) {
      setExpandMessage(err instanceof Error ? err.message : "Error al generar sugerencias");
    } finally {
      setExpandLoading(false);
    }
  }

  async function handleExpandSave() {
    const toCreate = expandSuggestions.filter((s) => s.checked);
    if (toCreate.length === 0) return;

    setExpandSaving(true);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          toCreate.map((kw) => ({
            siteId: expandSiteId,
            phrase: kw.phrase,
            priority: kw.priority,
            parentId: kw.parentId,
          }))
        ),
      });

      if (!res.ok) throw new Error("Error al crear keywords");
      const data = await res.json();

      setExpandMessage(`${data.created} keywords creadas`);
      setSelected(new Set());
      setExpandOpen(false);
      setExpandSuggestions([]);
      fetchKeywords();
    } catch (err) {
      setExpandMessage(err instanceof Error ? err.message : "Error al guardar keywords");
    } finally {
      setExpandSaving(false);
    }
  }

  function toggleExpandSuggestion(index: number) {
    setExpandSuggestions((prev) =>
      prev.map((s, i) => (i === index ? { ...s, checked: !s.checked } : s))
    );
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

  async function handleAddKeyword() {
    if (!addSiteId || !addPhrase.trim()) return;

    setAddSaving(true);
    setAddMessage("");
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: addSiteId, phrase: addPhrase.trim(), priority: addPriority }),
      });

      if (res.status === 409) {
        setAddMessage("Esta keyword ya existe para este sitio");
        return;
      }
      if (!res.ok) throw new Error("Error al crear keyword");

      setAddMessage("Keyword creada");
      setAddPhrase("");
      setAddPriority(0);
      setSiteFilter(addSiteId);
      setStatusFilter("pending");
      setPage(1);
    } catch (err) {
      setAddMessage(err instanceof Error ? err.message : "Error al crear keyword");
    } finally {
      setAddSaving(false);
    }
  }

  function handleAddOpenChange(open: boolean) {
    if (!open) {
      setAddSiteId("");
      setAddPhrase("");
      setAddPriority(0);
      setAddMessage("");
    }
    setAddOpen(open);
  }

  function SortableHead({ field, children, className, title }: { field: string; children: React.ReactNode; className?: string; title?: string }) {
    const active = sortField === field;
    return (
      <TableHead
        className={`cursor-pointer select-none ${className ?? ""}`}
        title={title}
        onClick={() => {
          if (active) {
            setSortDir(d => d === "asc" ? "desc" : "asc");
          } else {
            setSortField(field);
            setSortDir("asc");
          }
          setPage(1);
        }}
      >
        <div className="flex items-center gap-1">
          {children}
          {active ? (
            sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
          ) : (
            <ArrowUpDown className="size-3 text-muted-foreground/50" />
          )}
        </div>
      </TableHead>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Keywords</h2>
        <div className="flex items-center gap-2">
          {/* Agregar keyword manual */}
          <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
            <DialogTrigger
              render={
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="size-4" />
                  Agregar
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar keyword</DialogTitle>
                <DialogDescription>
                  Agrega una palabra clave manualmente a un sitio.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="add-site">Sitio</Label>
                  <Select value={addSiteId} onValueChange={(v: string | null) => setAddSiteId(v ?? "")}>
                    <SelectTrigger id="add-site" className="w-full">
                      <SelectValue placeholder="Seleccionar sitio" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-phrase">Frase</Label>
                  <Input
                    id="add-phrase"
                    placeholder="ej. alquiler de carros en bogotá"
                    value={addPhrase}
                    onChange={(e) => setAddPhrase(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-priority">Prioridad (0-10)</Label>
                  <Input
                    id="add-priority"
                    type="number"
                    min={0}
                    max={10}
                    value={addPriority}
                    onChange={(e) => setAddPriority(Math.min(10, Math.max(0, Number(e.target.value))))}
                  />
                </div>
                {addMessage && (
                  <p className={`text-sm ${addMessage.includes("creada") ? "text-green-600" : "text-red-600"}`}>
                    {addMessage}
                  </p>
                )}
                <Button
                  onClick={handleAddKeyword}
                  disabled={addSaving || !addSiteId || !addPhrase.trim()}
                  className="w-full"
                >
                  {addSaving ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Guardando...
                    </>
                  ) : (
                    "Agregar keyword"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Importar CSV */}
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

          {/* Expandir */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={selected.size === 0}
            onClick={handleExpandClick}
          >
            <Sparkles className="size-4" />
            Expandir{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </div>
      </div>

      {/* Filters */}
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
            <SelectValue placeholder="Todos los estados">
              {statusFilter ? statusLabels[statusFilter] ?? statusFilter : "Todos los estados"}
            </SelectValue>
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

      {/* Table */}
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
              <SortableHead field="phrase">Frase</SortableHead>
              <TableHead>Sitio</TableHead>
              <SortableHead field="status">Estado</SortableHead>
              <SortableHead field="priority" className="text-right" title="Mayor número = se usa primero. 0=normal, 1-5=media, 6-10=alta">
                Prioridad
              </SortableHead>
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
                        {kw.status === "pending" ? (
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
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700"
                            onClick={() => handleStatusChange(kw.id, "pending")}
                            title="Reactivar a pendiente"
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} keyword{total !== 1 ? "s" : ""} en total
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mostrar:</span>
            <Select
              value={String(limit)}
              onValueChange={(v: string | null) => {
                if (v) {
                  setLimit(Number(v));
                  setPage(1);
                }
              }}
            >
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100, 200].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

      {/* Expand preview dialog */}
      <Dialog open={expandOpen} onOpenChange={(open) => {
        if (!open) {
          setExpandSuggestions([]);
          setExpandMessage("");
        }
        setExpandOpen(open);
      }}>
        <DialogContent className="max-w-2xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Expandir keywords</DialogTitle>
            <DialogDescription>
              Genera sugerencias de keywords derivadas y elige cuáles guardar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {expandSuggestions.length === 0 ? (
              <>
                <div className="space-y-2">
                  <Label>Cantidad por semilla</Label>
                  <Select
                    value={String(expandCount)}
                    onValueChange={(v: string | null) => v && setExpandCount(Number(v))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 keywords</SelectItem>
                      <SelectItem value="10">10 keywords</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleExpandGenerate}
                  disabled={expandLoading}
                  className="w-full"
                >
                  {expandLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Generando sugerencias...
                    </>
                  ) : (
                    "Generar sugerencias"
                  )}
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-md border max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <input
                            type="checkbox"
                            checked={expandSuggestions.every((s) => s.checked)}
                            onChange={() => {
                              const allChecked = expandSuggestions.every((s) => s.checked);
                              setExpandSuggestions((prev) =>
                                prev.map((s) => ({ ...s, checked: !allChecked }))
                              );
                            }}
                            className="size-4 rounded border-gray-300"
                          />
                        </TableHead>
                        <TableHead>Frase sugerida</TableHead>
                        <TableHead className="text-right w-[80px]">Prioridad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expandSuggestions.map((s, i) => (
                        <TableRow key={i} className={s.checked ? "" : "opacity-50"}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={s.checked}
                              onChange={() => toggleExpandSuggestion(i)}
                              className="size-4 rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell className="text-sm break-words">{s.phrase}</TableCell>
                          <TableCell className="text-right text-sm">{s.priority}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {expandSuggestions.filter((s) => s.checked).length} de {expandSuggestions.length} seleccionadas
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandSuggestions([])}
                    >
                      Regenerar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleExpandSave}
                      disabled={expandSaving || expandSuggestions.filter((s) => s.checked).length === 0}
                    >
                      {expandSaving ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          Guardando...
                        </>
                      ) : (
                        `Crear ${expandSuggestions.filter((s) => s.checked).length} keywords`
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {expandMessage && (
              <p className={`text-sm ${expandMessage.includes("Error") ? "text-red-600" : "text-green-600"}`}>
                {expandMessage}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
