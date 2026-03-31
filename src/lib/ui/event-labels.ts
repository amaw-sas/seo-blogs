/**
 * Centralized Spanish labels for system event types.
 * Used in Dashboard, Logs, and anywhere event names are displayed.
 */

const EVENT_LABELS: Record<string, string> = {
  pipeline_run: "Generación de post",
  broken_link_check: "Verificación de enlaces",
  auto_linking: "Enlazado interno",
  auto_categorization: "Categorización automática",
  image_generation: "Generación de imágenes",
  publication: "Publicación",
  keyword_expansion: "Expansión de keywords",
  seo_analysis: "Análisis SEO",
  scheduling: "Programación",
  external_delete: "Eliminación externa",
  started: "Iniciado",
};

/**
 * Get the Spanish label for an event type.
 * Falls back to replacing underscores with spaces if not mapped.
 */
export function getEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/_/g, " ");
}
