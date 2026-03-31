"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSiteContext } from "@/lib/site-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ChevronLeft, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { buildPostUrl } from "@/lib/ui/post-url";
import { DeletePostDialog } from "@/components/delete-post-dialog";

interface Post {
  id: string;
  title: string;
  slug: string;
  keyword: string;
  status: string;
  seoScore: number | null;
  keywordDensity: number | null;
  wordCount: number | null;
  createdAt: string;
  externalPostId: string | null;
  site: { name: string; domain: string; platform: string };
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

export default function PostsPage() {
  const router = useRouter();
  const { siteId: siteFilter, sites } = useSiteContext();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (siteFilter) params.set("siteId", siteFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("keyword", search);

      const res = await fetch(`/api/posts?${params}`);
      const data = await res.json();
      setPosts(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [page, siteFilter, statusFilter, search]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Posts</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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

        <Input
          placeholder="Buscar por keyword..."
          className="w-[220px]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Sitio</TableHead>
              <TableHead>Keyword</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Score SEO</TableHead>
              <TableHead className="text-right">Densidad</TableHead>
              <TableHead className="text-right">Palabras</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : posts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      No se encontraron posts
                    </TableCell>
                  </TableRow>
                ) : (
                  posts.map((post) => (
                    <TableRow
                      key={post.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/posts/${post.id}/edit`)}
                    >
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {post.title}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {post.site.name}
                      </TableCell>
                      <TableCell className="text-sm">{post.keyword}</TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusColors[post.status] ?? ""}
                        >
                          {statusLabels[post.status] ?? post.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {post.seoScore != null ? (
                          <span
                            className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium ${
                              post.seoScore >= 80
                                ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                                : post.seoScore >= 60
                                  ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                            }`}
                          >
                            {post.seoScore}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {post.keywordDensity != null
                          ? `${post.keywordDensity.toFixed(2)}%`
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right ${
                          post.wordCount != null && post.wordCount < 1500
                            ? "text-red-600 dark:text-red-400 font-medium"
                            : ""
                        }`}
                      >
                        {post.wordCount ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(post.createdAt).toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="flex items-center gap-1">
                        {post.externalPostId && buildPostUrl(post.site.domain, post.slug) && (
                          <a
                            href={buildPostUrl(post.site.domain, post.slug)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-blue-600"
                            >
                              <ExternalLink className="size-4" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(post);
                          }}
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

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} post{total !== 1 ? "s" : ""} en total
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

      {deleteTarget && (
        <DeletePostDialog
          post={deleteTarget}
          sitePlatform={deleteTarget.site.platform}
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          onDeleted={() => {
            setDeleteTarget(null);
            fetchPosts();
          }}
        />
      )}
    </div>
  );
}
