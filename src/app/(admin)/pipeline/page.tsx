"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  Save,
  Loader2,
  Check,
  RotateCcw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface PromptSection {
  label: string;
  content: string;
  active: boolean;
}

interface PipelineStep {
  id: string;
  stepKey: string;
  label: string;
  description: string;
  order: number;
  active: boolean;
  hasPrompt: boolean;
  promptBase: string | null;
  promptSections: Record<string, PromptSection>;
  extraInstructions: string | null;
  responseFormat: string | null;
  model: string;
  maxTokens: number;
  temperature: number | null;
  overrides?: PipelineStepOverride[];
}

interface PipelineStepOverride {
  id: string;
  siteId: string;
  stepKey: string;
  promptSections: Record<string, PromptSection> | null;
  extraInstructions: string | null;
  temperature: number | null;
  maxTokens: number | null;
  active: boolean | null;
}

interface Site {
  id: string;
  name: string;
}

// ── Form state for editing ──────────────────────────────────

interface StepFormState {
  active: boolean;
  promptBase: string;
  promptSections: Record<string, PromptSection>;
  extraInstructions: string;
  responseFormat: string;
  model: string;
  maxTokens: number;
  temperature: string; // string to handle empty input
}

function stepToForm(step: PipelineStep, siteId: string): StepFormState {
  const override = siteId
    ? step.overrides?.find((o) => o.siteId === siteId)
    : null;

  return {
    active: override?.active ?? step.active,
    promptBase: step.promptBase ?? "",
    promptSections: override?.promptSections ?? { ...step.promptSections },
    extraInstructions: override?.extraInstructions ?? step.extraInstructions ?? "",
    responseFormat: step.responseFormat ?? "",
    model: step.model,
    maxTokens: override?.maxTokens ?? step.maxTokens,
    temperature: String(override?.temperature ?? step.temperature ?? ""),
  };
}

function hasOverride(step: PipelineStep, siteId: string): boolean {
  if (!siteId) return false;
  return !!step.overrides?.some((o) => o.siteId === siteId);
}

const OPTIONAL_STEPS = new Set([
  "competition_analysis",
  "auto_categorization",
  "auto_linking",
]);

// ── Component ───────────────────────────────────────────────

export default function PipelineEditorPage() {
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [editingStep, setEditingStep] = useState<PipelineStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [form, setForm] = useState<StepFormState | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [loadingLastResult, setLoadingLastResult] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────

  const fetchSteps = useCallback(async (siteId: string) => {
    try {
      const params = siteId ? `?siteId=${siteId}` : "";
      const res = await fetch(`/api/pipeline-steps${params}`);
      if (!res.ok) throw new Error("Error al cargar pasos");
      const data = await res.json();
      setSteps(data.data ?? []);
    } catch {
      setSteps([]);
    }
  }, []);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch("/api/sites");
      const data = await res.json();
      setSites(
        (data.data ?? []).map((s: { id: string; name: string }) => ({
          id: s.id,
          name: s.name,
        })),
      );
    } catch {
      setSites([]);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchSteps(""), fetchSites()]).finally(() =>
      setLoading(false),
    );
  }, [fetchSteps, fetchSites]);

  // ── Site change ────────────────────────────────────────────

  async function handleSiteChange(value: string) {
    const siteId = value === "global" ? "" : value;
    setSelectedSiteId(siteId);
    setEditingStep(null);
    setForm(null);
    setLoading(true);
    await fetchSteps(siteId);
    setLoading(false);
  }

  // ── Edit step ──────────────────────────────────────────────

  function startEditing(step: PipelineStep) {
    setEditingStep(step);
    setForm(stepToForm(step, selectedSiteId));
    setSaveMessage("");
    setLastResult(null);
  }

  function stopEditing() {
    setEditingStep(null);
    setForm(null);
    setSaveMessage("");
    setLastResult(null);
  }

  // ── Form updaters ──────────────────────────────────────────

  function updateForm<K extends keyof StepFormState>(
    key: K,
    value: StepFormState[K],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateSection(
    sectionKey: string,
    field: keyof PromptSection,
    value: string | boolean,
  ) {
    setForm((prev) => {
      if (!prev) return prev;
      const sections = { ...prev.promptSections };
      sections[sectionKey] = { ...sections[sectionKey], [field]: value };
      return { ...prev, promptSections: sections };
    });
  }

  // ── Fetch last result (lazy) ───────────────────────────────

  async function fetchLastResult(stepKey: string) {
    if (lastResult !== null) return; // already loaded
    setLoadingLastResult(true);
    try {
      const params = selectedSiteId ? `?siteId=${selectedSiteId}` : "";
      const res = await fetch(
        `/api/pipeline-steps/${stepKey}/last-result${params}`,
      );
      if (res.ok) {
        const data = await res.json();
        setLastResult(JSON.stringify(data.data, null, 2));
      } else {
        setLastResult("Sin resultados disponibles");
      }
    } catch {
      setLastResult("Error al cargar resultado");
    } finally {
      setLoadingLastResult(false);
    }
  }

  // ── Save ───────────────────────────────────────────────────

  async function handleSave() {
    if (!editingStep || !form) return;
    setSaving(true);
    setSaveMessage("");

    try {
      const temp =
        form.temperature === "" ? null : Number(form.temperature);

      if (selectedSiteId) {
        // Per-site override
        const res = await fetch(
          `/api/pipeline-steps/${editingStep.stepKey}/override?siteId=${selectedSiteId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              promptSections: form.promptSections,
              extraInstructions: form.extraInstructions || null,
              temperature: temp,
              maxTokens: form.maxTokens,
              active: form.active,
            }),
          },
        );
        if (!res.ok) throw new Error("Error al guardar override");
      } else {
        // Global save
        const res = await fetch(
          `/api/pipeline-steps/${editingStep.stepKey}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              active: form.active,
              promptBase: form.promptBase || null,
              promptSections: form.promptSections,
              extraInstructions: form.extraInstructions || null,
              responseFormat: form.responseFormat || null,
              model: form.model,
              maxTokens: form.maxTokens,
              temperature: temp,
            }),
          },
        );
        if (!res.ok) throw new Error("Error al guardar paso");
      }

      setSaveMessage("Guardado");
      await fetchSteps(selectedSiteId);
      // Update editingStep with fresh data
      const updatedSteps = await fetch(
        `/api/pipeline-steps${selectedSiteId ? `?siteId=${selectedSiteId}` : ""}`,
      ).then((r) => r.json());
      const updated = (updatedSteps.data ?? []).find(
        (s: PipelineStep) => s.stepKey === editingStep.stepKey,
      );
      if (updated) {
        setEditingStep(updated);
        setForm(stepToForm(updated, selectedSiteId));
      }

      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Error al guardar",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Restore to global ─────────────────────────────────────

  async function handleRestoreGlobal() {
    if (!editingStep || !selectedSiteId) return;
    setSaving(true);
    setSaveMessage("");

    try {
      const res = await fetch(
        `/api/pipeline-steps/${editingStep.stepKey}/override?siteId=${selectedSiteId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Error al restaurar");

      setSaveMessage("Restaurado a global");
      await fetchSteps(selectedSiteId);
      const updatedSteps = await fetch(
        `/api/pipeline-steps?siteId=${selectedSiteId}`,
      ).then((r) => r.json());
      const updated = (updatedSteps.data ?? []).find(
        (s: PipelineStep) => s.stepKey === editingStep.stepKey,
      );
      if (updated) {
        setEditingStep(updated);
        setForm(stepToForm(updated, selectedSiteId));
      }

      setTimeout(() => setSaveMessage(""), 3000);
    } catch (err) {
      setSaveMessage(
        err instanceof Error ? err.message : "Error al restaurar",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ── Step Editor View ───────────────────────────────────────

  if (editingStep && form) {
    const isOverridden = hasOverride(editingStep, selectedSiteId);

    return (
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={stopEditing}
          >
            <ArrowLeft className="size-4" />
            Volver
          </Button>
          <div className="flex items-center gap-3">
            {saveMessage && (
              <span
                className={`text-sm flex items-center gap-1 ${
                  saveMessage === "Guardado" ||
                  saveMessage === "Restaurado a global"
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {(saveMessage === "Guardado" ||
                  saveMessage === "Restaurado a global") && (
                  <Check className="size-3" />
                )}
                {saveMessage}
              </span>
            )}
            {OPTIONAL_STEPS.has(editingStep.stepKey) && (
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Activo</Label>
                <Switch
                  checked={form.active}
                  onCheckedChange={(checked: boolean) =>
                    updateForm("active", checked)
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Step header */}
        <div>
          <h2 className="text-2xl font-bold">{editingStep.label}</h2>
          <p className="text-muted-foreground">{editingStep.description}</p>
          {selectedSiteId && isOverridden && (
            <Badge
              variant="secondary"
              className="mt-2 text-amber-700 bg-amber-50 border-amber-200"
            >
              Personalizado
            </Badge>
          )}
        </div>

        {editingStep.hasPrompt ? (
          <div className="space-y-6">
            {/* Prompt Base */}
            <div className="space-y-2">
              <div>
                <Label className="text-sm font-semibold">Prompt Base</Label>
                <p className="text-sm text-muted-foreground">
                  Instrucción base que define el rol y objetivo de este paso
                </p>
              </div>
              <Textarea
                className="font-mono text-sm"
                rows={8}
                value={form.promptBase}
                onChange={(e) => updateForm("promptBase", e.target.value)}
                disabled={!!selectedSiteId} // prompt base only editable globally
              />
              {selectedSiteId && (
                <p className="text-xs text-muted-foreground">
                  El prompt base solo se edita en la vista global.
                </p>
              )}
            </div>

            <Separator />

            {/* Prompt Sections */}
            {Object.keys(form.promptSections).length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Secciones de Reglas
                </Label>
                <Accordion>
                  {Object.entries(form.promptSections).map(
                    ([key, section]) => (
                      <AccordionItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <AccordionTrigger className="flex-1">
                            {section.label}
                          </AccordionTrigger>
                          <Switch
                            size="sm"
                            checked={section.active}
                            onCheckedChange={(checked: boolean) =>
                              updateSection(key, "active", checked)
                            }
                          />
                        </div>
                        <AccordionContent>
                          <Textarea
                            className="font-mono text-sm"
                            rows={6}
                            value={section.content}
                            onChange={(e) =>
                              updateSection(key, "content", e.target.value)
                            }
                          />
                        </AccordionContent>
                      </AccordionItem>
                    ),
                  )}
                </Accordion>
              </div>
            )}

            <Separator />

            {/* Extra Instructions */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Instrucciones Extra
              </Label>
              <Textarea
                className="text-sm"
                rows={4}
                value={form.extraInstructions}
                onChange={(e) =>
                  updateForm("extraInstructions", e.target.value)
                }
                placeholder="Instrucciones adicionales específicas para este paso..."
              />
            </div>

            <Separator />

            {/* Response Format */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Formato de Respuesta
              </Label>
              <p className="text-xs text-amber-600">
                Modificar con cuidado — define la estructura JSON esperada
              </p>
              <Textarea
                className="font-mono text-sm"
                rows={6}
                value={form.responseFormat}
                onChange={(e) =>
                  updateForm("responseFormat", e.target.value)
                }
                disabled={!!selectedSiteId}
              />
              {selectedSiteId && (
                <p className="text-xs text-muted-foreground">
                  El formato de respuesta solo se edita en la vista global.
                </p>
              )}
            </div>

            <Separator />

            {/* Advanced Config */}
            <Accordion>
              <AccordionItem value="advanced">
                <AccordionTrigger>Configuración Avanzada</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 sm:grid-cols-3 pt-2">
                    <div className="space-y-2">
                      <Label>Modelo</Label>
                      <Input
                        value={form.model}
                        onChange={(e) =>
                          updateForm("model", e.target.value)
                        }
                        disabled={!!selectedSiteId}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Tokens</Label>
                      <Input
                        type="number"
                        min={100}
                        value={form.maxTokens}
                        onChange={(e) =>
                          updateForm("maxTokens", Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Temperatura</Label>
                      <Input
                        type="number"
                        min={0}
                        max={2}
                        step={0.1}
                        value={form.temperature}
                        onChange={(e) =>
                          updateForm("temperature", e.target.value)
                        }
                        placeholder="0.0 - 2.0"
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Last Result */}
            <Accordion>
              <AccordionItem value="last-result">
                <AccordionTrigger
                  onClick={() => fetchLastResult(editingStep.stepKey)}
                >
                  Último Resultado
                </AccordionTrigger>
                <AccordionContent>
                  {loadingLastResult ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Cargando...
                    </div>
                  ) : lastResult ? (
                    <pre className="font-mono text-xs bg-muted p-4 rounded-md overflow-auto max-h-80 whitespace-pre-wrap">
                      {lastResult}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">
                      Expande para cargar el último resultado.
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Este paso no requiere configuración de IA.
          </p>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {selectedSiteId && isOverridden && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                onClick={handleRestoreGlobal}
                disabled={saving}
              >
                <RotateCcw className="size-3" />
                Restaurar a global
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={stopEditing} disabled={saving}>
              {editingStep.hasPrompt ? "Cancelar" : "Volver"}
            </Button>
            {editingStep.hasPrompt && (
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Guardar
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Step List View ─────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline Editor</h1>
          <p className="text-muted-foreground">
            Configura los pasos de generación de contenido.
          </p>
        </div>
        <Select
          value={selectedSiteId || "global"}
          onValueChange={(v: string | null) => handleSiteChange(v ?? "global")}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Global</SelectItem>
            {sites.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Step cards */}
      {steps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-muted-foreground">
              No hay pasos de pipeline configurados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {steps
            .sort((a, b) => a.order - b.order)
            .map((step) => {
              const overridden = hasOverride(step, selectedSiteId);
              return (
                <Card
                  key={step.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => startEditing(step)}
                >
                  <CardHeader className={step.hasPrompt ? "pb-2" : "pb-0"}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-muted-foreground text-white flex items-center justify-center text-xs font-medium shrink-0">
                          {step.order}
                        </span>
                        <CardTitle className="text-base">
                          {step.label}
                        </CardTitle>
                        {overridden && (
                          <Badge
                            variant="secondary"
                            className="text-amber-700 bg-amber-50 border-amber-200"
                          >
                            Personalizado
                          </Badge>
                        )}
                      </div>
                      <span
                        className={`size-2.5 rounded-full ${
                          step.active ? "bg-green-500" : "bg-gray-300"
                        }`}
                        title={step.active ? "Activo" : "Inactivo"}
                      />
                    </div>
                    <CardDescription className="ml-9">
                      {step.description}
                    </CardDescription>
                  </CardHeader>
                  {step.hasPrompt && (
                    <CardContent className="pt-0 pb-3 ml-9">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
                          {step.model}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {step.maxTokens.toLocaleString()} tokens
                        </Badge>
                        {step.temperature !== null && (
                          <Badge variant="outline" className="text-xs">
                            temp: {step.temperature}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  )}
                  {!step.hasPrompt && (
                    <CardContent className="pt-0 pb-3 ml-9">
                      <span className="text-xs text-muted-foreground">
                        No requiere IA
                      </span>
                    </CardContent>
                  )}
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
