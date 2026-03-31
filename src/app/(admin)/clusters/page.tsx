"use client";

import { useEffect, useState, useCallback } from "react";
import { useSiteContext } from "@/lib/site-context";
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
  HelpCircle,
  X,
  Sparkles,
  Search,
  Loader2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

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

interface SuggestedPost {
  id: string;
  title: string;
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
  const { siteId: siteFilter, sites } = useSiteContext();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Help dialog state
  const [helpOpen, setHelpOpen] = useState(false);

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

  // Suggest posts state
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestClusterId, setSuggestClusterId] = useState("");
  const [suggestKeyword, setSuggestKeyword] = useState("");
  const [suggestedPosts, setSuggestedPosts] = useState<SuggestedPost[]>([]);
  const [selectedSuggestIds, setSelectedSuggestIds] = useState<Set<string>>(new Set());
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [addingSuggested, setAddingSuggested] = useState(false);

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

  function openSuggestDialog(cluster: Cluster) {
    setSuggestClusterId(cluster.id);
    setSuggestKeyword(cluster.pillarKeyword);
    setSuggestedPosts([]);
    setSelectedSuggestIds(new Set());
    setSuggestOpen(true);
  }

  async function fetchSuggestions() {
    const cluster = clusters.find((c) => c.id === suggestClusterId);
    if (!cluster || !suggestKeyword.trim()) return;

    setLoadingSuggest(true);
    try {
      const site = sites.find((s) => s.domain === cluster.site.domain);
      if (!site) return;

      const excludeIds = cluster.clusterPosts.map((cp) => cp.post.id).join(",");
      const params = new URLSearchParams({
        keyword: suggestKeyword.trim(),
        siteId: site.id,
        ...(excludeIds && { excludePostIds: excludeIds }),
      });

      const res = await fetch(`/api/clusters/suggest-posts?${params}`);
      const data = await res.json();
      setSuggestedPosts(data.data ?? []);
      setSelectedSuggestIds(new Set());
    } catch {
      setSuggestedPosts([]);
    } finally {
      setLoadingSuggest(false);
    }
  }

  function toggleSuggestSelection(postId: string) {
    setSelectedSuggestIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  async function handleAddSuggestedPosts() {
    if (selectedSuggestIds.size === 0 || !suggestClusterId) return;
    setAddingSuggested(true);
    try {
      const cluster = clusters.find((c) => c.id === suggestClusterId);
      const currentPosts =
        cluster?.clusterPosts.map((cp) => ({
          postId: cp.post.id,
          isPillar: cp.isPillar,
        })) ?? [];

      const newPosts = Array.from(selectedSuggestIds).map((id) => ({
        postId: id,
        isPillar: false,
      }));

      await fetch(`/api/clusters/${suggestClusterId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: [...currentPosts, ...newPosts] }),
      });

      setSuggestOpen(false);
      fetchClusters();
    } catch {
      // Error handled silently
    } finally {
      setAddingSuggested(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">
            Clusters de contenido
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setHelpOpen(true)}
            title="¿Qué es un cluster?"
          >
            <HelpCircle className="size-5" />
          </Button>
        </div>
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

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-2"
                          onClick={() =>
                            openAddPostDialog(cluster.id, cluster.site.domain)
                          }
                        >
                          <Plus className="size-4" />
                          Agregar post
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-2"
                          onClick={() => openSuggestDialog(cluster)}
                        >
                          <Sparkles className="size-4" />
                          Sugerir posts
                        </Button>
                      </div>
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

      {/* Suggest posts dialog */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sugerir posts por keyword</DialogTitle>
            <DialogDescription>
              Busca posts cuyo título o keyword coincidan con el término ingresado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Keyword de búsqueda"
                value={suggestKeyword}
                onChange={(e) => setSuggestKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchSuggestions();
                }}
              />
              <Button
                size="sm"
                className="shrink-0 gap-2"
                onClick={fetchSuggestions}
                disabled={loadingSuggest || !suggestKeyword.trim()}
              >
                {loadingSuggest ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Buscar
              </Button>
            </div>

            {loadingSuggest ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : suggestedPosts.length > 0 ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  {suggestedPosts.length} resultado{suggestedPosts.length !== 1 ? "s" : ""}
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                  {suggestedPosts.map((post) => (
                    <label
                      key={post.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 rounded border-gray-300 accent-primary"
                        checked={selectedSuggestIds.has(post.id)}
                        onChange={() => toggleSuggestSelection(post.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{post.title}</p>
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs text-muted-foreground">
                            {post.keyword}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`shrink-0 text-xs ${statusColors[post.status] ?? ""}`}
                          >
                            {statusLabels[post.status] ?? post.status}
                          </Badge>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : suggestKeyword && !loadingSuggest ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Sin resultados para &quot;{suggestKeyword}&quot;
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddSuggestedPosts}
              disabled={addingSuggested || selectedSuggestIds.size === 0}
            >
              {addingSuggested
                ? "Agregando..."
                : `Agregar seleccionados (${selectedSuggestIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>¿Qué es un cluster de contenido?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed">
            <section>
              <h4 className="font-semibold mb-1">Qué es un cluster</h4>
              <p className="text-muted-foreground">
                Un cluster agrupa posts relacionados alrededor de una keyword
                pilar. Es la estrategia SEO de autoridad temática: Google
                posiciona mejor sitios que cubren un tema en profundidad desde
                múltiples ángulos.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">Estructura</h4>
              <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs space-y-1">
                <p>Cluster: &quot;Alquiler de carros Bogotá&quot;</p>
                <p className="pl-3">👑 <strong>Pilar</strong> — Guía completa para alquilar carro en Bogotá</p>
                <p className="pl-3">📄 Satélite — Requisitos para alquilar carro en Colombia</p>
                <p className="pl-3">📄 Satélite — Mejores carros económicos para alquilar</p>
                <p className="pl-3">📄 Satélite — Alquiler cerca al aeropuerto El Dorado</p>
              </div>
              <p className="text-muted-foreground mt-1">
                Los satélites enlazan al pilar y viceversa, creando una red de
                links internos que Google interpreta como autoridad.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-1">Cómo usarlo</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li><strong>Crear cluster</strong> — nombre + keyword pilar + sitio</li>
                <li><strong>Agregar posts</strong> — expandir cluster → &quot;Agregar post&quot;</li>
                <li><strong>Post pilar</strong> — el primero marcado como pilar aparece con badge dorado</li>
                <li><strong>Quitar posts</strong> — click en la X junto a cada post</li>
              </ol>
            </section>

            <section>
              <h4 className="font-semibold mb-1">Flujo recomendado</h4>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Genera keywords con &quot;Expandir&quot; (seed + long-tails)</li>
                <li>El pipeline genera posts para esas keywords</li>
                <li>Crea un cluster con la keyword seed como pilar</li>
                <li>Asigna el post seed como pilar, y los long-tail como satélites</li>
                <li>El auto-linker inyecta links internos entre posts del cluster</li>
              </ol>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
