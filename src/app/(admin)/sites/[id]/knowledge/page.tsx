"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import {
  parseKnowledgeBase,
  composeKnowledgeBase,
  estimateTokens,
  countWords,
  FIELD_LABELS,
  EMPTY_FIELDS,
  type KnowledgeFields,
} from "@/lib/knowledge-base";

const FIELD_PLACEHOLDERS: Record<keyof Omit<KnowledgeFields, "extra">, string> = {
  businessName: "Ej: RentaCar Bogotá",
  services: "Ej: Alquiler de carros económicos, SUVs, camionetas",
  locations: "Ej: Bogotá, Medellín, Cartagena — aeropuerto y centro",
  pricing: "Ej: Desde $80.000/día, descuentos por semana",
  differentiators: "Ej: Entrega en aeropuerto sin costo, carros modelo reciente",
  contact: "Ej: WhatsApp 311-xxx-xxxx, info@empresa.com",
  policies: "Ej: Edad mínima 21 años, se requiere tarjeta de crédito",
  tone: "Ej: Profesional pero cercano, informativo, sin tecnicismos",
};

const FIELD_ORDER: (keyof Omit<KnowledgeFields, "extra">)[] = [
  "businessName",
  "services",
  "locations",
  "pricing",
  "differentiators",
  "contact",
  "policies",
  "tone",
];

export default function KnowledgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [siteName, setSiteName] = useState("");
  const [fields, setFields] = useState<KnowledgeFields>({ ...EMPTY_FIELDS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/sites/${id}`);
      if (!res.ok) return;
      const site = await res.json();
      setSiteName(site.name);
      setFields(parseKnowledgeBase(site.knowledgeBase));
      setLoading(false);
    }
    load();
  }, [id]);

  function updateField(key: keyof KnowledgeFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    const knowledgeBase = composeKnowledgeBase(fields);
    const res = await fetch(`/api/sites/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ knowledgeBase }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const composed = composeKnowledgeBase(fields);
  const words = countWords(composed);
  const tokens = estimateTokens(composed);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/sites")}
        >
          <ArrowLeft className="size-4 mr-1" />
          Sitios
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Base de conocimiento</h1>
          <p className="text-sm text-muted-foreground">{siteName}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información del negocio</CardTitle>
          <CardDescription>
            Esta información se inyecta en los prompts de generación para que el
            contenido sea específico del negocio. Solo los campos con contenido
            se incluyen.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {FIELD_ORDER.map((key) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key}>{FIELD_LABELS[key]}</Label>
              <Input
                id={key}
                value={fields[key]}
                onChange={(e) => updateField(key, e.target.value)}
                placeholder={FIELD_PLACEHOLDERS[key]}
              />
            </div>
          ))}

          <div className="space-y-1.5 pt-2">
            <Label htmlFor="extra">Información adicional</Label>
            <Textarea
              id="extra"
              value={fields.extra}
              onChange={(e) => updateField("extra", e.target.value)}
              placeholder="Cualquier otra información relevante que no encaje en los campos anteriores..."
              rows={4}
              className="resize-y"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Preview del prompt</CardTitle>
            <div className="flex gap-2">
              <Badge variant="secondary">~{words} palabras</Badge>
              <Badge variant="secondary">~{tokens} tokens</Badge>
              {words > 1000 && (
                <Badge variant="destructive">
                  Recomendado: máx 1000 palabras
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground bg-muted rounded-md p-4 max-h-60 overflow-auto">
            {composed || "Sin contenido — llena los campos para ver el preview."}
          </pre>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.push("/sites")}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : (
            <Save className="size-4 mr-2" />
          )}
          {saved ? "Guardado" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
