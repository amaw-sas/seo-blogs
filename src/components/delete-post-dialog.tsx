"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";

interface DeletePostDialogProps {
  post: {
    id: string;
    title: string;
    externalPostId?: string | null;
  };
  sitePlatform?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeletePostDialog({
  post,
  sitePlatform,
  open,
  onOpenChange,
  onDeleted,
}: DeletePostDialogProps) {
  const hasExternal = !!post.externalPostId;
  const [deleteExternal, setDeleteExternal] = useState(hasExternal);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<{
    deleted: boolean;
    externalDeleted: boolean | null;
    externalError?: string;
  } | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setResult(null);

    try {
      const params = deleteExternal && hasExternal ? "?deleteExternal=true" : "";
      const res = await fetch(`/api/posts/${post.id}${params}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al eliminar");
      }

      const data = await res.json();

      if (data.externalDeleted === false && data.externalError) {
        setResult(data);
      } else {
        onOpenChange(false);
        onDeleted();
      }
    } catch (err) {
      setResult({
        deleted: false,
        externalDeleted: null,
        externalError: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setDeleting(false);
    }
  }

  function handleClose() {
    if (result?.deleted) {
      onDeleted();
    }
    setResult(null);
    setDeleteExternal(hasExternal);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar post</DialogTitle>
          <DialogDescription>
            {result?.deleted
              ? "Post eliminado del sistema. No se pudo eliminar del blog externo."
              : (
                <>
                  ¿Eliminar <strong>{post.title}</strong>? Esta acción no se puede deshacer.
                </>
              )}
          </DialogDescription>
        </DialogHeader>

        {!result?.deleted && (
          <>
            {hasExternal && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteExternal}
                  onChange={(e) => setDeleteExternal(e.target.checked)}
                  className="size-4 rounded border-gray-300"
                />
                También eliminar del blog externo
                {sitePlatform && (
                  <span className="text-muted-foreground">({sitePlatform})</span>
                )}
              </label>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={deleting}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="gap-2"
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Eliminar
              </Button>
            </DialogFooter>
          </>
        )}

        {result?.deleted && result.externalError && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cerrar
            </Button>
          </DialogFooter>
        )}

        {result && !result.deleted && result.externalError && (
          <p className="text-sm text-red-600">{result.externalError}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
