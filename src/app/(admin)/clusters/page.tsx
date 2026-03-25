"use client";

import { useEffect, useState, useCallback } from "react";
import { resolveSiteLabel } from "@/lib/ui/select-helpers";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Network,
  Crown,
  FileText,
  X,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface Site {
  id: string;
  name: string;
  domain: string;
}

interface ClusterPost {
  isPillar: boolean;
  post: {
    id: string;
    title: string;
    slug: string;
    status: string;
  };
}

interface Cluster {
  id: string;
  name: string;
  pillarKeyword: string;
  createdAt: string;
  site: { name: string; domain: string };
  clusterPosts: ClusterPost[];
}

interface SitePost {
  id: string;
  title: string;
  slug: string;
  keyword: string;
  status: string;
}

// ── Status helpers ───────────────────────────────────────────

const statusLabels: Record<string, string> = {
  draft: "Borrador",
  review: "Revisión",
  published: "Publicado",
  archived: "Archivado",
  error: "Error",
};

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  review: "bg-blue-100 text-blue-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-800",
  error: "bg-red-100 text-red-800",
};

// ── Component ────────────────────────────────────────────────

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [siteFilter, setSiteFilter] = useState("");

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPillarKeyword, setNewPillarKeyword] = useState("");
  const [newSiteId, setNewSiteId] = useState("");

  // Add post dialog state
  const [addPostOpen, setAddPostOpen] = useState(false);
  const [addPostClusterId, setAddPostClusterId] = useState("");
  const [addPostSiteId, setAddPostSiteId] = useState("");
  const [sitePosts, setSitePosts] = useState<SitePost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [addingPost, setAddingPost] = useState(false);

  const fetchClusters = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (siteFilter) params.set("siteId", siteFilter);
      const res = await fetch(`/api/clusters?${params}`);
      const data = await res.json();
      setClusters(data.data ?? []);
    } catch {
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }, [siteFilter]);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((d) => setSites(d.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  async function handleCreate() {
    if (!newName || !newPillarKeyword || !newSiteId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: newSiteId,
          name: newName,
          pillarKeyword: newPillarKeyword,
        }),
      });
      if (!res.ok) throw new Error("Error al crear cluster");
      setCreateOpen(false);
      setNewName("");
      setNewPillarKeyword("");
      setNewSiteId("");
      fetchClusters();
    } catch {
      // Error handled silently
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(clusterId: string) {
    try {
      await fetch(`/api/clusters/${clusterId}`, { method: "DELETE" });
      setClusters((prev) => prev.filter((c) => c.id !== clusterId));
      if (expandedId === clusterId) setExpandedId(null);
    } catch {
      // Error handled silently
    }
  }

  async function handleRemovePost(clusterId: string, postId: string) {
    const cluster = clusters.find((c) => c.id === clusterId);
    if (!cluster) return;

    const remainingPosts = cluster.clusterPosts
      .filter((cp) => cp.post.id !== postId)
      .map((cp) => ({ postId: cp.post.id, isPillar: cp.isPillar }));

    try {
      await fetch(`/api/clusters/${clusterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: remainingPosts }),
      });
      fetchClusters();
    } catch {
      // Error handled silently
    }
  }

  async function openAddPostDialog(clusterId: string, siteDomain: string) {
    setAddPostClusterId(clusterId);
    const site = sites.find((s) => s.domain === siteDomain);
    if (site) {
      setAddPostSiteId(site.id);
      await fetchSitePosts(site.id, clusterId);
    }
    setAddPostOpen(true);
  }

  async function fetchSitePosts(siteId: string, clusterId: string) {
    setLoadingPosts(true);
    try {
      const res = await fetch(`/api/posts?siteId=${siteId}&limit=100`);
      const data = await res.json();
      const allPosts: SitePost[] = data.data ?? [];
      const cluster = clusters.find((c) => c.id === clusterId);
      const existingPostIds = new Set(
        cluster?.clusterPosts.map((cp) => cp.post.id) ?? [],
      );
      setSitePosts(allPosts.filter((p) => !existingPostIds.has(p.id)));
    } catch {
      setSitePosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }

  async function handleAddPost() {
    if (!selectedPostId || !addPostClusterId) return;
    setAddingPost(true);
    try {
      const cluster = clusters.find((c) => c.id === addPostClusterId);
      const currentPosts =
        cluster?.clusterPosts.map((cp) => ({
          postId: cp.post.id,
          isPillar: cp.isPillar,
        })) ?? [];

      await fetch(`/api/clusters/${addPostClusterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: [...currentPosts, { postId: selectedPostId, isPillar: false }],
        }),
      });

      setAddPostOpen(false);
      setSelectedPostId("");
      fetchClusters();
    } catch {
      // Error handled silently
    } finally {
      setAddingPost(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">
          Clusters de contenido
        </h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button size="sm" className="gap-2">
                <Plus className="size-4" />
                Crear cluster
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear cluster de contenido</DialogTitle>
              <DialogDescription>
                Agrupa posts relacionados alrededor de una keyword pilar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clusterName">Nombre del cluster</Label>
                <Input
                  id="clusterName"
                  placeholder="Ej: Guia completa de SEO"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pillarKeyword">Keyword pilar</Label>
                <Input
                  id="pillarKeyword"
                  placeholder="Ej: estrategias seo 2026"
                  value={newPillarKeyword}
                  onChange={(e) => setNewPillarKeyword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clusterSite">Sitio</Label>
                <Select value={newSiteId} onValueChange={(v: string | null) => setNewSiteId(v ?? "")}>
                  <SelectTrigger id="clusterSite">
                    <SelectValue placeholder="Seleccionar sitio">
                      {resolveSiteLabel(sites, newSiteId, undefined)}
                    </SelectValue>
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
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={creating || !newName || !newPillarKeyword || !newSiteId}
              >
                {creating ? "Creando..." : "Crear"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={siteFilter || "all"}
          onValueChange={(v: string | null) => {
            setSiteFilter(!v || v === "all" ? "" : v);
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
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : clusters.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Network className="mx-auto mb-4 size-12 opacity-40" />
            <p className="text-lg font-medium">Sin clusters</p>
            <p className="text-sm">
              Crea tu primer cluster para organizar contenido relacionado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clusters.map((cluster) => {
            const isExpanded = expandedId === cluster.id;
            const pillarPost = cluster.clusterPosts.find((cp) => cp.isPillar);
            const satellitePosts = cluster.clusterPosts.filter(
              (cp) => !cp.isPillar,
            );
            const totalPosts = cluster.clusterPosts.length;

            return (
              <Card key={cluster.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate">{cluster.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {cluster.site.name}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0 text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(cluster.id)}
                      title="Eliminar cluster"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      {cluster.pillarKeyword}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>{totalPosts} post{totalPosts !== 1 ? "s" : ""}</span>
                    {pillarPost && (
                      <Badge
                        variant="secondary"
                        className="gap-1 bg-amber-100 text-amber-800"
                      >
                        <Crown className="size-3" />
                        Pilar
                      </Badge>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2 text-sm"
                    onClick={() => toggleExpand(cluster.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                    {isExpanded ? "Ocultar posts" : "Ver posts"}
                  </Button>

                  {isExpanded && (
                    <div className="space-y-2">
                      {pillarPost && (
                        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                          <Crown className="size-4 shrink-0 text-amber-600" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {pillarPost.post.title}
                            </p>
                            <Badge
                              variant="secondary"
                              className={`mt-1 text-xs ${statusColors[pillarPost.post.status] ?? ""}`}
                            >
                              {statusLabels[pillarPost.post.status] ??
                                pillarPost.post.status}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 shrink-0 p-0"
                            onClick={() =>
                              handleRemovePost(cluster.id, pillarPost.post.id)
                            }
                            title="Quitar del cluster"
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      )}

                      {satellitePosts.length > 0 && (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Post</TableHead>
                                <TableHead className="w-20 text-xs">
                                  Estado
                                </TableHead>
                                <TableHead className="w-10" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {satellitePosts.map((cp) => (
                                <TableRow key={cp.post.id}>
                                  <TableCell className="max-w-[200px] truncate text-sm">
                                    <div className="flex items-center gap-2">
                                      <FileText className="size-3 shrink-0 text-muted-foreground" />
                                      {cp.post.title}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant="secondary"
                                      className={`text-xs ${statusColors[cp.post.status] ?? ""}`}
                                    >
                                      {statusLabels[cp.post.status] ??
                                        cp.post.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() =>
                                        handleRemovePost(
                                          cluster.id,
                                          cp.post.id,
                                        )
                                      }
                                      title="Quitar del cluster"
                                    >
                                      <X className="size-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {totalPosts === 0 && (
                        <p className="py-2 text-center text-sm text-muted-foreground">
                          Sin posts asignados
                        </p>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() =>
                          openAddPostDialog(cluster.id, cluster.site.domain)
                        }
                      >
                        <Plus className="size-4" />
                        Agregar post
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add post to cluster dialog */}
      <Dialog open={addPostOpen} onOpenChange={setAddPostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar post al cluster</DialogTitle>
            <DialogDescription>
              Selecciona un post del sitio para agregar al cluster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {loadingPosts ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : sitePosts.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No hay posts disponibles para agregar.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>Post</Label>
                <Select
                  value={selectedPostId}
                  onValueChange={(v: string | null) => setSelectedPostId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar post">
                      {sitePosts.find((p) => p.id === selectedPostId)?.title}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sitePosts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddPost}
              disabled={addingPost || !selectedPostId}
            >
              {addingPost ? "Agregando..." : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
