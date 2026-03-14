"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Save, Loader2, Eye, History, RotateCcw, Share2, Copy, Check, RefreshCw, Trash2 } from "lucide-react";
import { DeletePostDialog } from "@/components/delete-post-dialog";

interface PostData {
  id: string;
  title: string;
  slug: string;
  contentHtml: string;
  metaTitle: string | null;
  metaDescription: string | null;
  keyword: string;
  status: string;
  seoScore: number | null;
  keywordDensity: number | null;
  keywordFrequency: number | null;
  readabilityScore: number | null;
  wordCount: number | null;
  charCount: number | null;
  readingTimeMinutes: number | null;
  externalPostId: string | null;
  site: { name: string; domain: string; platform: string };
}

interface PostVersion {
  id: string;
  contentHtml: string;
  changedBy: string | null;
  createdAt: string;
}

interface SocialSnippets {
  twitter: string;
  facebook: string;
  linkedin: string;
  instagram: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  review: "bg-yellow-100 text-yellow-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-blue-100 text-blue-800",
  error: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  draft: "Borrador",
  review: "Revisión",
  published: "Publicado",
  archived: "Archivado",
  error: "Error",
};

export default function PostEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [contentHtml, setContentHtml] = useState("");

  // Version history
  const [versions, setVersions] = useState<PostVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<PostVersion | null>(null);

  // Social snippets
  const [snippets, setSnippets] = useState<SocialSnippets | null>(null);
  const [snippetsLoading, setSnippetsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/posts/${id}`);
        if (!res.ok) throw new Error("Post no encontrado");
        const data = await res.json();
        setPost(data);
        setTitle(data.title);
        setSlug(data.slug);
        setMetaTitle(data.metaTitle ?? "");
        setMetaDescription(data.metaDescription ?? "");
        setContentHtml(data.contentHtml);
      } catch {
        setPost(null);
      } finally {
        setLoading(false);
      }
    }

    fetchPost();
  }, [id]);

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/posts/${id}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data);
      }
    } catch {
      /* silent */
    } finally {
      setVersionsLoading(false);
    }
  }, [id]);

  const fetchSnippets = useCallback(async (force = false) => {
    setSnippetsLoading(true);
    try {
      const url = `/api/posts/${id}/social-snippets`;
      const res = force
        ? await fetch(url, { method: "POST" })
        : await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setSnippets(json.data);
      }
    } catch {
      /* silent */
    } finally {
      setSnippetsLoading(false);
    }
  }, [id]);

  async function handleCopySnippet(platform: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedField(platform);
    setTimeout(() => setCopiedField(null), 2000);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage("");
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          metaTitle: metaTitle || null,
          metaDescription: metaDescription || null,
          contentHtml,
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const updated = await res.json();
      setPost((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaveMessage("Guardado correctamente");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch {
      setSaveMessage("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore(versionId: string) {
    setRestoring(versionId);
    try {
      const res = await fetch(`/api/posts/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      if (!res.ok) throw new Error("Error al restaurar");
      // Refresh post data and versions
      const postRes = await fetch(`/api/posts/${id}`);
      if (postRes.ok) {
        const data = await postRes.json();
        setPost(data);
        setContentHtml(data.contentHtml);
        setTitle(data.title);
        setSlug(data.slug);
        setMetaTitle(data.metaTitle ?? "");
        setMetaDescription(data.metaDescription ?? "");
      }
      await fetchVersions();
      setSaveMessage("Versión restaurada correctamente");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch {
      setSaveMessage("Error al restaurar versión");
    } finally {
      setRestoring(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-[400px] w-full" />
          </div>
          <Skeleton className="h-[500px] w-full" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-muted-foreground">Post no encontrado</p>
        <Button variant="outline" onClick={() => router.push("/posts")}>
          <ArrowLeft className="mr-2 size-4" />
          Volver a posts
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/posts")}>
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-xl font-bold tracking-tight truncate flex-1">
          Editar post
        </h2>
        <Badge
          variant="secondary"
          className={statusColors[post.status] ?? ""}
        >
          {statusLabels[post.status] ?? post.status}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          render={<Link href={`/posts/${id}/preview`} />}
        >
          <Eye className="size-4" />
          Vista previa
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="gap-2"
          onClick={() => setShowDelete(true)}
        >
          <Trash2 className="size-4" />
          Eliminar
        </Button>
        <Button size="sm" className="gap-2" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Guardar
        </Button>
      </div>

      {saveMessage && (
        <p
          className={`text-sm ${
            saveMessage.includes("Error") ? "text-red-600" : "text-green-600"
          }`}
        >
          {saveMessage}
        </p>
      )}

      <Tabs defaultValue="editor">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="history" onClick={fetchVersions}>
            <History className="mr-1 size-3.5" />
            Historial
          </TabsTrigger>
          <TabsTrigger value="social" onClick={() => fetchSnippets()}>
            <Share2 className="mr-1 size-3.5" />
            Redes Sociales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor">
          <div className="grid gap-4 md:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Keyword</Label>
                  <Input value={post.keyword} disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="metaTitle">Meta título</Label>
                <Input
                  id="metaTitle"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  maxLength={70}
                />
                <p className="text-xs text-muted-foreground">
                  {metaTitle.length}/70 caracteres
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="metaDesc">Meta descripción</Label>
                <Textarea
                  id="metaDesc"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={2}
                  maxLength={160}
                />
                <p className="text-xs text-muted-foreground">
                  {metaDescription.length}/160 caracteres
                </p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="content">Contenido HTML</Label>
                <Textarea
                  id="content"
                  value={contentHtml}
                  onChange={(e) => setContentHtml(e.target.value)}
                  rows={20}
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Métricas SEO</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <MetricRow label="Score SEO" value={post.seoScore != null ? `${post.seoScore}/100` : "—"} />
                  <MetricRow
                    label="Densidad keyword"
                    value={post.keywordDensity != null ? `${post.keywordDensity.toFixed(2)}%` : "—"}
                  />
                  <MetricRow
                    label="Frecuencia keyword"
                    value={post.keywordFrequency != null ? String(post.keywordFrequency) : "—"}
                  />
                  <MetricRow
                    label="Legibilidad"
                    value={post.readabilityScore != null ? `${post.readabilityScore.toFixed(1)}` : "—"}
                  />
                  <MetricRow
                    label="Palabras"
                    value={post.wordCount != null ? String(post.wordCount) : "—"}
                  />
                  <MetricRow
                    label="Caracteres"
                    value={post.charCount != null ? String(post.charCount) : "—"}
                  />
                  <MetricRow
                    label="Tiempo lectura"
                    value={
                      post.readingTimeMinutes != null
                        ? `${post.readingTimeMinutes.toFixed(1)} min`
                        : "—"
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Información</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <MetricRow label="Sitio" value={post.site.name} />
                  <MetricRow label="Dominio" value={post.site.domain} />
                  <MetricRow
                    label="Estado"
                    value={statusLabels[post.status] ?? post.status}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial de versiones</CardTitle>
            </CardHeader>
            <CardContent>
              {versionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay versiones anteriores.
                </p>
              ) : (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded-md border p-3"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          {new Date(v.createdAt).toLocaleString("es-ES", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {v.changedBy ? `Por: ${v.changedBy}` : "Cambio automático"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger
                            render={
                              <Button variant="outline" size="sm" className="gap-1" onClick={() => setPreviewVersion(v)}>
                                <Eye className="size-3.5" />
                                Ver
                              </Button>
                            }
                          />
                          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>
                                Versión del{" "}
                                {previewVersion &&
                                  new Date(previewVersion.createdAt).toLocaleString(
                                    "es-ES",
                                    {
                                      year: "numeric",
                                      month: "long",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                              </DialogTitle>
                            </DialogHeader>
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none"
                              dangerouslySetInnerHTML={{
                                __html: previewVersion?.contentHtml ?? "",
                              }}
                            />
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          disabled={restoring === v.id}
                          onClick={() => handleRestore(v.id)}
                        >
                          {restoring === v.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          Restaurar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="social">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Snippets para redes sociales</CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={snippetsLoading}
                onClick={() => fetchSnippets(true)}
              >
                {snippetsLoading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Regenerar
              </Button>
            </CardHeader>
            <CardContent>
              {snippetsLoading && !snippets ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : !snippets ? (
                <p className="text-sm text-muted-foreground">
                  Haz clic en la pestaña para generar los snippets.
                </p>
              ) : (
                <div className="space-y-4">
                  <SnippetCard
                    platform="Twitter / X"
                    text={snippets.twitter}
                    maxChars={280}
                    onCopy={() => handleCopySnippet("twitter", snippets.twitter)}
                    copied={copiedField === "twitter"}
                  />
                  <SnippetCard
                    platform="Facebook"
                    text={snippets.facebook}
                    onCopy={() => handleCopySnippet("facebook", snippets.facebook)}
                    copied={copiedField === "facebook"}
                  />
                  <SnippetCard
                    platform="LinkedIn"
                    text={snippets.linkedin}
                    onCopy={() => handleCopySnippet("linkedin", snippets.linkedin)}
                    copied={copiedField === "linkedin"}
                  />
                  <SnippetCard
                    platform="Instagram"
                    text={snippets.instagram}
                    onCopy={() => handleCopySnippet("instagram", snippets.instagram)}
                    copied={copiedField === "instagram"}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DeletePostDialog
        post={{
          id: post.id,
          title: post.title,
          externalPostId: post.externalPostId,
        }}
        sitePlatform={post.site.platform}
        open={showDelete}
        onOpenChange={setShowDelete}
        onDeleted={() => router.push("/posts")}
      />
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SnippetCard({
  platform,
  text,
  maxChars,
  onCopy,
  copied,
}: {
  platform: string;
  text: string;
  maxChars?: number;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-md border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{platform}</h4>
        <div className="flex items-center gap-2">
          {maxChars && (
            <span
              className={`text-xs ${
                text.length > maxChars ? "text-red-500" : "text-muted-foreground"
              }`}
            >
              {text.length}/{maxChars}
            </span>
          )}
          <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={onCopy}>
            {copied ? (
              <>
                <Check className="size-3.5" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copiar
              </>
            )}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{text}</p>
    </div>
  );
}
