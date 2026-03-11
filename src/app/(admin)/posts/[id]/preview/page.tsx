"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

interface PostPreview {
  id: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  contentHtml: string;
  keyword: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  wordCount: number | null;
  readingTimeMinutes: number | null;
  site: { name: string; domain: string };
  images: { url: string; altText: string; position: number }[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  review: "Revisión",
  published: "Publicado",
  archived: "Archivado",
  error: "Error",
};

export default function PostPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<PostPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/posts/${id}`);
        if (!res.ok) throw new Error("Post no encontrado");
        const data = await res.json();
        setPost(data);
      } catch {
        setPost(null);
      } finally {
        setLoading(false);
      }
    }
    fetchPost();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-[600px] w-full" />
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

  const displayDate = post.publishedAt ?? post.createdAt;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/posts/${id}/edit`)}
        >
          <ArrowLeft className="mr-1 size-4" />
          Volver al editor
        </Button>
        <Badge variant="secondary">Vista previa</Badge>
      </div>

      {/* Article */}
      <article className="space-y-6">
        {/* Meta info */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{post.site.name}</span>
            <span>·</span>
            <span>
              {new Date(displayDate).toLocaleDateString("es-ES", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            {post.readingTimeMinutes != null && (
              <>
                <span>·</span>
                <span>
                  {Math.ceil(post.readingTimeMinutes)} min de lectura
                </span>
              </>
            )}
            <span>·</span>
            <Badge variant="secondary" className="text-xs">
              {STATUS_LABEL[post.status] ?? post.status}
            </Badge>
          </div>

          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {post.title}
          </h1>

          {post.metaDescription && (
            <p className="text-lg text-muted-foreground leading-relaxed">
              {post.metaDescription}
            </p>
          )}

          {post.keyword && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{post.keyword}</Badge>
              {post.wordCount != null && (
                <span className="text-xs text-muted-foreground">
                  {post.wordCount.toLocaleString("es-ES")} palabras
                </span>
              )}
            </div>
          )}
        </div>

        <hr className="border-border" />

        {/* Content */}
        <div
          className="prose prose-neutral dark:prose-invert max-w-none
            prose-headings:font-bold prose-headings:tracking-tight
            prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:leading-relaxed prose-p:text-base
            prose-a:text-primary prose-a:underline
            prose-img:rounded-lg prose-img:shadow-md
            prose-li:text-base
            prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />

        {/* Images gallery if any */}
        {post.images.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Imágenes</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {post.images.map((img) => (
                <figure key={img.url} className="space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.altText}
                    className="w-full rounded-lg border object-cover"
                  />
                  <figcaption className="text-xs text-muted-foreground">
                    {img.altText}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
