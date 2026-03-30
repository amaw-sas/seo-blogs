"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Loader2 } from "lucide-react";

interface Site {
  id: string;
  name: string;
  domain: string;
}

interface ImagePoolUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: Site[];
  onUploadComplete: () => void;
}

export function ImagePoolUpload({
  open,
  onOpenChange,
  sites,
  onUploadComplete,
}: ImagePoolUploadProps) {
  const [siteId, setSiteId] = useState("");
  const [altTextBase, setAltTextBase] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    const files = fileInputRef.current?.files;
    if (!siteId || !altTextBase || !files?.length) return;

    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("siteId", siteId);
      formData.append("altTextBase", altTextBase);
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }

      const res = await fetch("/api/image-pool/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al subir imágenes");
      }

      const data = await res.json();
      const errorCount = data.errors?.length ?? 0;
      setMessage(
        `${data.uploaded} imagen${data.uploaded !== 1 ? "es" : ""} subida${data.uploaded !== 1 ? "s" : ""}` +
          (errorCount > 0 ? `, ${errorCount} error${errorCount !== 1 ? "es" : ""}` : "")
      );
      onUploadComplete();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al subir imágenes");
    } finally {
      setUploading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSiteId("");
      setAltTextBase("");
      setMessage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir imágenes al pool</DialogTitle>
          <DialogDescription>
            Sube imágenes manuales para usar en posts futuros.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-site">Sitio</Label>
            <Select value={siteId} onValueChange={(v: string | null) => setSiteId(v ?? "")}>
              <SelectTrigger id="upload-site" className="w-full">
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
            <Label htmlFor="upload-alt">Texto alt base</Label>
            <Input
              id="upload-alt"
              placeholder="Describe qué muestran las imágenes"
              value={altTextBase}
              onChange={(e) => setAltTextBase(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="upload-files">Imágenes</Label>
            <Input
              id="upload-files"
              type="file"
              accept="image/*"
              multiple
              ref={fileInputRef}
            />
          </div>

          {message && (
            <p
              className={`text-sm ${
                message.includes("Error") ? "text-red-600" : "text-green-600"
              }`}
            >
              {message}
            </p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={uploading || !siteId || !altTextBase}
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Subiendo...
              </>
            ) : (
              "Subir imágenes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
