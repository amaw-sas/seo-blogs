"use client";

import { useState } from "react";
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

interface ImagePoolGenerateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: Site[];
  onGenerateComplete: () => void;
}

export function ImagePoolGenerate({
  open,
  onOpenChange,
  sites,
  onGenerateComplete,
}: ImagePoolGenerateProps) {
  const [siteId, setSiteId] = useState("");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit() {
    if (!siteId || count < 1) return;

    setGenerating(true);
    setMessage("");
    try {
      const res = await fetch("/api/image-pool/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, count }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al generar imágenes");
      }

      const data = await res.json();
      setMessage(
        `Generadas ${data.generated} de ${data.total}` +
          (data.failed > 0 ? ` (${data.failed} fallida${data.failed !== 1 ? "s" : ""})` : "")
      );
      onGenerateComplete();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al generar imágenes");
    } finally {
      setGenerating(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSiteId("");
      setCount(5);
      setMessage("");
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar imágenes para el pool</DialogTitle>
          <DialogDescription>
            Genera imágenes con IA para tener disponibles en posts futuros.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gen-site">Sitio</Label>
            <Select value={siteId} onValueChange={(v: string | null) => setSiteId(v ?? "")}>
              <SelectTrigger id="gen-site" className="w-full">
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
            <Label htmlFor="gen-count">Cantidad</Label>
            <Input
              id="gen-count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
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
            disabled={generating || !siteId}
            className="w-full"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Generando...
              </>
            ) : (
              "Generar imágenes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
