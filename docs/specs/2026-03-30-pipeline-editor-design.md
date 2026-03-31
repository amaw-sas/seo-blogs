# Pipeline Editor — Design Spec

## Problem

Pipeline prompts and rules are hardcoded as template literals inside TypeScript files (`content-generator.ts`, `competition-analyzer.ts`, `auto-categorizer.ts`). Changing any instruction requires editing source code and redeploying. The user has no visibility into what each pipeline step does without reading code.

## Solution

A Pipeline Editor page in the admin panel that shows each pipeline step as a card. Clicking a step opens an editor with its prompt (split into sections), parameters, and last result. Prompts are stored in the database and read at runtime instead of being hardcoded.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Objective | Visibility + editing from admin | User wants to understand AND modify prompts without deploy |
| Prompt granularity | Hybrid: rule sections + free textarea | Organized but flexible — sections for structure, textarea for custom rules |
| Scope | Global with per-site overrides | Improvements apply to all sites; each site can customize what differs |
| Technical params | Collapsible "advanced" section | Available when needed, hidden by default |
| Preview | Last result only | Immediate context without overloading; /logs exists for history |
| Color palette | Minimal: white, grays, blue for actions | User preference — no pink/yellow/purple |

## Data Model

### Table: `pipeline_steps` (global configuration)

Prisma model `PipelineStep`, mapped to `pipeline_steps`.

| Field | Type | Description |
|-------|------|-------------|
| id | String @id @default(cuid()) | Primary key |
| stepKey | String @unique | Identifier: "competition_analysis", "outline_generation", etc. |
| label | String | Display name: "Analisis de Competencia" |
| description | String | Short explanation of what this step does |
| order | Int | Execution order (1, 2, 3...) |
| active | Boolean @default(true) | Enable/disable step |
| hasPrompt | Boolean @default(true) | Whether this step uses an AI prompt (false for keyword_selection, seo_scoring, post_save, auto_linking, publishing) |
| promptBase | String? (text) | Base prompt — null for non-AI steps |
| promptSections | Json @default("{}") | Editable rule sections (see structure below) |
| extraInstructions | String? | Free textarea appended to prompt end |
| responseFormat | String? (text) | Expected JSON response structure — null for non-AI steps |
| model | String @default("gpt-4o") | AI model (OpenAI only — all prompts use GPT-4o) |
| maxTokens | Int @default(2000) | Response token limit |
| temperature | Float? | Creativity (null = model default) |
| overrides | PipelineStepOverride[] | Relation to per-site overrides |
| createdAt | DateTime @default(now()) | Creation timestamp |
| updatedAt | DateTime @updatedAt | Last modification |

### Table: `pipeline_step_overrides` (per-site overrides)

Prisma model `PipelineStepOverride`, mapped to `pipeline_step_overrides`.

| Field | Type | Description |
|-------|------|-------------|
| id | String @id @default(cuid()) | Primary key |
| siteId | String (FK → Site) | Site that overrides |
| site | Site @relation | Prisma relation to Site |
| stepKey | String (FK → PipelineStep.stepKey) | Step being overridden |
| step | PipelineStep @relation(fields: [stepKey], references: [stepKey]) | Prisma relation to PipelineStep |
| promptSections | Json? | Only modified sections (section-level merge with global) |
| extraInstructions | String? | Additional instructions for this site |
| temperature | Float? | Temperature override (null = use global) |
| maxTokens | Int? | Max tokens override |
| active | Boolean? | Activation override (null = use global) |
| createdAt | DateTime @default(now()) | Creation timestamp |
| updatedAt | DateTime @updatedAt | Last modification |

Unique constraint: `@@unique([siteId, stepKey])` — one override per site per step.

**Reverse relation on Site model:** Add `pipelineOverrides PipelineStepOverride[]` to the existing `Site` model.

### `promptSections` JSON Structure

```json
{
  "keyword_placement": {
    "label": "Keyword Placement",
    "content": "1. INTRODUCCION: La keyword debe aparecer en la PRIMERA ORACION\n2. CUERPO: minimo 3-4 veces...",
    "active": true
  },
  "length_depth": {
    "label": "Longitud y Profundidad",
    "content": "Objetivo: 1950-3000 palabras. MINIMO: 1500...",
    "active": true
  },
  "style": {
    "label": "Estilo de Contenido",
    "content": "...",
    "active": true
  }
}
```

Each section has: `label` (display name), `content` (editable textarea), `active` (toggle on/off).

**Validation rules for `promptSections` JSON:**
- Each section object MUST have `label` (string, non-empty), `content` (string), and `active` (boolean)
- Section keys must be alphanumeric + underscores only (`/^[a-z][a-z0-9_]*$/`)
- The API PUT handler validates this structure and returns 400 with specific field errors if malformed
- Empty `content` is allowed (section can exist but be blank)

## Prompt Building (Runtime)

### Function: `buildPrompt(stepKey, siteId, variables)`

Located in `src/lib/ai/prompt-builder.ts`.

1. Load `pipeline_steps` row from DB by `stepKey`
2. Load `pipeline_step_overrides` row for `(siteId, stepKey)` if exists
3. Merge (section-level): if a section key exists in the override, the **entire section object** replaces the global one. Section keys not present in the override fall back to global. New global sections not in the override are included automatically. Scalar fields (`temperature`, `maxTokens`, `active`, `extraInstructions`): override value wins if non-null, otherwise global value.
4. Concatenate active pieces: `promptBase` + active `promptSections` (in key order) + `extraInstructions` + `responseFormat`
5. Inject dynamic variables via `{{variable}}` replacement
6. Return `{ prompt, maxTokens, temperature, model }`

### Variable Injection

Prompts use `{{variable}}` placeholders (not `${}` to avoid confusion with JS template literals):
- `{{keyword}}` — current keyword phrase
- `{{minWords}}` — site's minimum word count
- `{{maxWords}}` — site's maximum word count
- `{{knowledgeBase}}` — site's knowledge base text
- `{{conversionUrl}}` — site's conversion URL
- `{{platform}}` — "wordpress" or "custom"
- `{{domain}}` — site domain

**Unresolved placeholders:** If a `{{variable}}` has no matching value at runtime, it is replaced with an empty string. This prevents the AI from seeing raw placeholder syntax. The `buildPrompt` function logs a warning when this happens for debugging.

### Migration from Hardcoded Prompts

A seed script extracts current prompts from `content-generator.ts`, `competition-analyzer.ts`, and `auto-categorizer.ts`, splitting them into base + sections, and inserts them as `pipeline_step` rows. The original functions are then modified to call `buildPrompt()` instead of constructing prompts inline.

## Pipeline Steps to Seed

| stepKey | label | Has AI Prompt | Sections |
|---------|-------|---------------|----------|
| keyword_selection | Seleccion de Keyword | No | — |
| competition_analysis | Analisis de Competencia | Yes | (single block, no subsections) |
| outline_generation | Generacion de Outline | Yes | titulo_slug, estructura_headings, relevancia_tematica |
| content_generation | Generacion de Contenido | Yes | keyword_placement, longitud_profundidad, estilo, variedad_formato, seccion_faq, prohibido, obligatorio |
| image_generation | Generacion de Imagenes | Yes (image prompt) | prompt_style, prohibitions |
| seo_scoring | Puntuacion SEO | No (local logic) | — |
| post_save | Guardar Post | No | — |
| auto_categorization | Auto-categorizacion | Yes | (single block) |
| auto_linking | Auto-linking | No (local logic) | — |
| publishing | Publicacion | No | — |

Steps without AI prompts (`hasPrompt: false`) are displayed as read-only informational cards (no editable prompt sections). They show description + active toggle only.

### stepKey ↔ publishLog.eventType Mapping

The "Last Result" feature queries `publishLog` by `eventType`. The mapping is 1:1 for most steps:

| stepKey | publishLog eventType(s) |
|---------|------------------------|
| keyword_selection | `keyword_selection` |
| competition_analysis | `competition_analysis` |
| outline_generation | `outline_generation` |
| content_generation | `content_generation` |
| image_generation | `image_generation` |
| seo_scoring | `seo_scoring` |
| post_save | `post_save` |
| auto_categorization | `auto_categorization` |
| auto_linking | `auto_linking` |
| publishing | `wordpress_publish` OR `nuxt_publish` (query both, return most recent) |

### Known Limitations

- **Concurrency:** Single-admin system — last write wins. No optimistic locking.
- **Model provider:** The `model` field supports OpenAI models only (gpt-4o, gpt-image-1). Claude API is listed in the stack but all current AI calls go through OpenAI.

## UI Components

### Page: `/pipeline` (`src/app/(admin)/pipeline/page.tsx`)

**Top bar:**
- Title "Pipeline Editor"
- View toggle: "Global" (default) | site selector dropdown

**Step list (main area):**
- Vertical list of cards, one per step
- Each card shows: order number, label, description, model/tokens badge (if AI step), active status
- Click a card → opens editor panel

**Editor panel (replaces or slides over step list):**
- Header: step label + description + active toggle
- Prompt Base: monospace textarea
- Rule Sections: collapsible accordions, each with textarea + active toggle
- Extra Instructions: free textarea
- Response Format: monospace textarea with warning label
- Advanced (collapsed): model, maxTokens, temperature inputs
- Last Result (collapsed): formatted JSON of last pipeline run for this step (from `publishLog`)
- Override indicator (bottom): shows which site has overrides when viewing global
- Save / Cancel buttons

**Per-site view:**
- When a site is selected in the dropdown, sections that differ from global show a visual indicator (e.g., "Personalizado" badge)
- Non-overridden sections show grayed placeholder: "Usando configuracion global"
- A "Restaurar a global" action per section to remove the override

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/pipeline-steps` | GET | List all steps (with merged overrides if `?siteId=`) |
| `/api/pipeline-steps/[stepKey]` | GET | Single step detail |
| `/api/pipeline-steps/[stepKey]` | PUT | Update global step |
| `/api/pipeline-steps/[stepKey]/override` | PUT | Create/update site override (`?siteId=` required) |
| `/api/pipeline-steps/[stepKey]/override` | DELETE | Remove site override (`?siteId=` required) |
| `/api/pipeline-steps/[stepKey]/last-result` | GET | Last publishLog entry for this step (`?siteId=` optional) |

| `/api/pipeline-steps/[stepKey]/prompt` | GET | Returns assembled prompt with variables injected (`?siteId=&keyword=&minWords=`...) — used by Railway worker |

All routes behind auth middleware (internal API key for Railway→Vercel calls).

### Railway Worker Integration

The worker currently imports `src/lib/ai/` functions directly (shared code, same DB). `buildPrompt()` lives in `src/lib/ai/prompt-builder.ts` and is called directly by the pipeline functions — no API call needed. The `/api/pipeline-steps/[stepKey]/prompt` route exists as a debugging/testing tool only.

## What Does NOT Change

- `extractJson()` — JSON parsing logic stays in code
- Post-response validations (H1 truncation, field checks) — stay in code
- SEO scorer logic (`seo-scorer.ts`) — algorithmic, not a prompt
- Auto-linker logic (`auto-linker.ts`) — algorithmic, not a prompt
- Image upload/compression — infrastructure, not a prompt
- Pipeline orchestration flow (`pipeline.ts`) — step order, retry logic, fallbacks stay in code

## Observable Scenarios

### S1: View pipeline steps
**Given** the user navigates to /pipeline,
**When** the page loads,
**Then** all 10 pipeline steps appear as cards in execution order with label, description, and active status.

### S2: Edit a prompt section
**Given** the user clicks on "Generacion de Outline",
**When** they modify the "Titulo y Slug" section content and click Save,
**Then** the next pipeline run uses the updated text in its prompt.

### S3: Toggle a section off
**Given** the user opens "Generacion de Contenido",
**When** they toggle off the "Prohibido" section and save,
**Then** the next pipeline run's prompt does NOT include the prohibited phrases rules.

### S4: Add extra instructions
**Given** the user opens any AI step,
**When** they type "Incluir siempre un dato estadistico en cada H2" in Extra Instructions and save,
**Then** that text appears at the end of the prompt in the next pipeline run.

### S5: Per-site override
**Given** the user selects "alquilercarrobogota.com" in the site dropdown,
**When** they modify the "Estilo" section for that site and save,
**Then** pipeline runs for that site use the modified style, while other sites use the global style.

### S6: Remove site override
**Given** a site has an override on "Estilo",
**When** the user clicks "Restaurar a global" on that section,
**Then** the override is deleted and the site falls back to global configuration.

### S7: View last result
**Given** the pipeline has run at least once,
**When** the user expands "Ultimo Resultado" on any step,
**Then** they see the formatted output from the most recent pipeline execution for that step.

### S8: Disable a step
**Given** the user toggles "Analisis de Competencia" to inactive,
**When** the pipeline runs,
**Then** competition analysis is skipped and outline generation proceeds without competition data.

### S9: Edit advanced parameters
**Given** the user opens "Configuracion Avanzada" on "Generacion de Contenido",
**When** they change temperature from 0.7 to 0.9 and save,
**Then** the next content generation call uses temperature 0.9.

### S10: Pipeline uses DB prompts
**Given** pipeline_step rows exist in the database,
**When** `buildPrompt("content_generation", siteId, variables)` is called,
**Then** it returns the assembled prompt from DB config (not from hardcoded strings), with `{{keyword}}` and other placeholders replaced by actual values.

### S11: Non-AI step shows read-only view
**Given** the user clicks on "Seleccion de Keyword" (a non-AI step),
**When** the editor panel opens,
**Then** it shows only description and active toggle — no prompt base, sections, or response format fields.

### S12: Invalid promptSections rejected
**Given** the user submits a PUT to `/api/pipeline-steps/outline_generation` with a section missing the `label` field,
**When** the API validates the payload,
**Then** it returns 400 with a descriptive error and does not save.
