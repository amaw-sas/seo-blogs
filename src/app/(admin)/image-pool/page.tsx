"use client";

import { useEffect, useState, useCallback } from "react";
import { useSiteContext } from "@/lib/site-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Upload,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { ImagePoolUpload } from "@/components/admin/image-pool-upload";
import { ImagePoolGenerate } from "@/components/admin/image-pool-generate";

interface PoolImage {
  id: string;
  url: string;
  altTextBase: string;
  source: string;
  status: string;
  reuseCount: number;
  postId: string | null;
  postTitle: string | null;
  createdAt: string;
}

interface PoolStats {
  available: number;
  used: number;
  manual: number;
}

const sourceLabels: Record<string, string> = {
  ai_pregenerated: "IA",
  manual: "Manual",
};

const statusLabels: Record<string, string> = {
  available: "Disponible",
  used: "Usada",
};

export default function ImagePoolPage() {
  const { siteId: siteFilter, sites } = useSiteContext();
  const [images, setImages] = useState<PoolImage[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<PoolStats>({ available: 0, used: 0, manual: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (siteFilter) params.set("siteId", siteFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/image-pool?${params}`);
      const data = await res.json();
      setImages(data.data ?? []);
      setTotal(data.total ?? 0);
      if (data.stats) setStats(data.stats);
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [page, siteFilter, sourceFilter, statusFilter]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  async function handleDelete(id: string) {
    try {
      const res = await fetch("/api/image-pool", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) fetchImages();
    } catch {
      // ignore
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Image Pool</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="size-4" />
            Subir imágenes
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setGenerateOpen(true)}
          >
            <Sparkles className="size-4" />
            Generar para pool
          </Button>
        </div>
      </div>

      {/* Pool health stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Disponibles</span>
            <span className="text-2xl font-bold text-green-600">{stats.available}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Usadas</span>
            <span className="text-2xl font-bold text-gray-500">{stats.used}</span>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Manuales</span>
            <span className="text-2xl font-bold text-blue-600">{stats.manual}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={sourceFilter || "all"}
          onValueChange={(v: string | null) => {
            setSourceFilter(!v || v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Todas las fuentes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las fuentes</SelectItem>
            <SelectItem value="ai_pregenerated">IA</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
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
            <SelectItem value="available">Disponible</SelectItem>
            <SelectItem value="used">Usada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[64px]">Imagen</TableHead>
              <TableHead>Texto alt</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Post</TableHead>
              <TableHead className="text-right">Reusos</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : images.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-8"
                    >
                      No se encontraron imágenes en el pool
                    </TableCell>
                  </TableRow>
                ) : (
                  images.map((img) => (
                    <TableRow key={img.id}>
                      <TableCell>
                        <img
                          src={img.url}
                          alt={img.altTextBase}
                          className="size-12 rounded object-cover"
                        />
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {img.altTextBase}
                      </TableCell>
                      <TableCell>
                        <Badge variant={img.source === "manual" ? "outline" : "secondary"}>
                          {sourceLabels[img.source] ?? img.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            img.status === "available"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }
                        >
                          {statusLabels[img.status] ?? img.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                        {img.postId ? (
                          <a
                            href={`/posts/${img.postId}/edit`}
                            className="text-blue-600 hover:underline"
                          >
                            {img.postTitle ?? "Ver post"}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">{img.reuseCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(img.createdAt).toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => handleDelete(img.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
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
          {total} imagen{total !== 1 ? "es" : ""} en total
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
            Pagina {page} de {totalPages}
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

      {/* Dialogs */}
      <ImagePoolUpload
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        sites={sites}
        onUploadComplete={fetchImages}
      />
      <ImagePoolGenerate
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        sites={sites}
        onGenerateComplete={fetchImages}
      />
    </div>
  );
}
