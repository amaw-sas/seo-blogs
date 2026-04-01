export const PIPELINE_STEPS = [
  "keyword_selection",
  "competition_analysis",
  "outline_generation",
  "content_generation",
  "image_generation",
  "seo_scoring",
  "post_save",
  "auto_categorization",
  "auto_linking",
  "wordpress_publish",
  "nuxt_publish",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const STEP_LABELS: Record<string, string> = {
  pipeline_run: "Inicio del pipeline",
  keyword_selection: "Selección de keyword",
  competition_analysis: "Análisis de competencia",
  outline_generation: "Generación de outline",
  content_generation: "Generación de contenido",
  image_generation: "Generación de imágenes",
  seo_scoring: "Puntuación SEO",
  regeneration: "Regeneración (score bajo)",
  post_save: "Guardado del post",
  auto_categorization: "Categorización automática",
  auto_linking: "Enlaces automáticos",
  wordpress_publish: "Publicación WordPress",
  nuxt_publish: "Publicación Nuxt",
  pipeline_error: "Error en pipeline",
};
