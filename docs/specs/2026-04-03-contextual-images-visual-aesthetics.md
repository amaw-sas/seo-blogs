# Contextual Images + Visual Content Aesthetics

**Status:** APPROVED  
**Date:** 2026-04-03  
**Topics:** Pipeline redesign A (images) + B (aesthetics)

---

## A. Contextual Images

### A1. Content images in landscape

**Current:** All images generated at 1024x1024 (square).  
**Target:** Hero stays 1024x1024. Content images generated at 1536x1024 (landscape native from GPT Image API), compressed/resized to 768x512 via Sharp.

**Changes:**

| File | Change |
|------|--------|
| `src/lib/ai/image-generator.ts` > `generateRawImage()` | Add `size` parameter (default `1024x1024`) |
| `src/lib/ai/image-generator.ts` > `generatePostImages()` | Hero: `1024x1024`, content: `1536x1024` |
| `worker/utils/image-compressor.ts` > `CONTENT_PRESET` | `maxWidth: 800` → `maxWidth: 768` |
| `worker/pipeline.ts` > `insertImagesIntoHtml()` | Content `<figure>` gets `style="max-width:400px;width:100%"` |

### A2. Documentary style prompts + prohibitions

**Current prompts:** Generic "photograph that visually represents" with separate noOverlays string.  
**Target prompts:** Documentary photography style with explicit prohibitions.

Shared elements for both hero and content:
- **Style:** `"Documentary photography, candid, realistic, slightly imperfect framing. Latin American urban/rural context."`
- **Prohibition:** `"Never depict documents, IDs, licenses, certificates, or any surface with text. Show the contextual scene instead. No signs, banners, screens, posters, people, hands, or cameras."`

Hero-specific: `"Warm natural light, vivid colors. Balanced square composition."`  
Content-specific: `"Natural light, warm tones, shallow depth of field. Landscape composition."`

**File:** `src/lib/ai/image-generator.ts` > `buildImagePrompt()`

### A3. Prompt receives keyword interpretation context

**Current:** `buildImagePrompt(context, keyword, isHero, knowledgeBase)` — no interpretation.  
**Target:** Add optional `interpretation?: { angle: string; intent: string }` parameter.

If interpretation exists, inject into prompt:  
`"The article's angle: {angle}. The user is looking for: {intent}. Generate an image that matches this specific perspective."`

**Files:**
- `src/lib/ai/image-generator.ts` > `buildImagePrompt()` signature + body
- `src/lib/ai/image-generator.ts` > `generatePostImages()` signature — accept interpretation
- `worker/pipeline.ts` — pass `keywordInterpretation` to image generation calls

---

## B. Visual Content Aesthetics (WordPress-scoped)

### B1. Additional HTML elements in content prompt

**Current:** Prompt allows `blockquote`, `table`, `ul/ol`, `details/summary`.  
**Target:** Also allow `<figure>` with `<figcaption>` and `<hr>`.

Instructions added to content generation prompt:
- `<figure><figcaption>` — for highlighted data points or cited quotes with source attribution
- `<hr>` — visual separator between thematically distinct long sections (max 1-2 per article)

**NOT added yet** (waiting for Nuxt): `<aside class="tip">`, `<mark>`, custom-styled elements.

**Files:** `src/lib/ai/content-generator.ts` (fallback prompt), `prisma/seed-pipeline.ts` (variedad_formato section)

---

## Observable Scenarios

### S1: Content images are landscape
Given a pipeline run generating 2 images,  
when images are produced,  
then hero is 1024x1024 and content image width > height (landscape aspect ratio).

### S2: Content images inserted with constrained width
Given generated HTML with content images,  
when `insertImagesIntoHtml()` runs,  
then non-hero `<figure>` tags contain `style="max-width:400px;width:100%"`.

### S3: Image prompts use documentary style
Given a call to `buildImagePrompt()`,  
when the prompt is built,  
then it contains "Documentary photography" and "Never depict documents".

### S4: Image prompts include interpretation when available
Given a keyword interpretation with angle "Comparativa de precios" and intent "Buscar opciones economicas",  
when `buildImagePrompt()` is called with this interpretation,  
then the prompt contains both the angle and intent text.

### S5: Image prompts work without interpretation
Given no keyword interpretation (null),  
when `buildImagePrompt()` is called,  
then the prompt is valid and does not contain "undefined" or "null".

### S6: Content prompt allows figure and hr elements
Given the content generation prompt (DB or fallback),  
when content is generated,  
then `<figure>`, `<figcaption>`, and `<hr>` are listed as permitted elements.

### S7: Hero image size unchanged
Given a hero image generation,  
when `generateRawImage()` is called for hero,  
then size parameter is "1024x1024" (not landscape).
