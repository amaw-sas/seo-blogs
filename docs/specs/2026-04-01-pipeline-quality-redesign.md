# Pipeline Quality & Redesign — Design Document

**Status:** IN PROGRESS (brainstorming phase)
**Date:** 2026-04-01
**Author:** Diego + Claude

---

## Part 1: Quality Fixes (7 temas + extra)

Fixes for immediate quality issues found in real pipeline output.

### Tema 1: Contenido generico/incorrecto — keyword interpretation
**Decision:** New pipeline step `keyword_interpretation` before `competition_analysis`.
- Input: keyword + knowledgeBase + domain
- Output: user intention, recommended angle, business connection, suggested word range, depth level
- Feeds into all downstream steps (competition, outline, content, images)
- If it fails, pipeline continues without interpretation (non-fatal, like competition_analysis)
- New row in `pipeline_steps`, configurable from admin

### Tema 2: Sin enlaces externos autoritativos
**Decisions:**
1. UI in admin — add `authoritativeSources` field to site form (exists in DB but not in UI)
2. Pass sources to content prompt — AI cites them contextually within content
3. Fix link inserter regex — change `/<p>[^<]+<\/p>/g` to `/<p>[\s\S]+?<\/p>/g` to match paragraphs with child tags. Use as fallback if AI didn't insert links.
4. Investigate SERP API (pending deep-research) — Serper.dev, SerpAPI, DataForSEO to replace competition analyzer that currently guesses from model knowledge

### Tema 3: Sin enlaces internos
**Decision:** Minimal fix (full redesign via batch planning will replace this later).
1. Fix regex `/<p>[^<]+<\/p>/g` → `/<p>[\s\S]+?<\/p>/g` in 3 places (insertLinksIntoHtml, insertInternalLink, addConversionLink)
2. Use `findRelatedPosts()` (with scoring) in `buildLinks()` instead of `.slice(0, 3)` without relevance
3. Lower `addRetroactiveLinks` threshold from 2→1 minimum posts
4. Fix hardcoded URL `/blog/${slug}` — get permalink structure from site config

### Tema 4: Keyword no en primer parrafo
**Decision:** Post-generation validation.
- After generating content, verify keyword appears in first 100 words
- If missing, attempt is marked as failed and enters retry loop (same as word count)
- Add as additional condition to existing loop in pipeline.ts

### Tema 5: SEO title > 60 chars
**Decision:** Unify limit to 60 chars (no suffix — target is Nuxt).
- Outline prompt: change "MAXIMO 45 caracteres" → "MAXIMO 60 caracteres"
- Outline post-processing: change `> 45` → `> 60`
- Pipeline: keep `.slice(0, 60)` as safety net
- Remove " | Brand" suffix logic — not needed for Nuxt

### Tema 6: Meta description > 155 chars
**Decision:** Unify everything to 155 chars.
- Prompt: already says 155 ✓
- Pipeline AI path: already truncates to 155 ✓
- Pipeline fallback: change `truncate(..., 160)` → `truncate(..., 155)`
- SEO scorer: change `<= 160` → `<= 155`

### Tema 7: Contenido corto (435 words when minimum is 1500)
**Decision:** Two changes:
1. Don't publish posts that fail minWords — save as `status: "error"` with message, not "review"
2. Dynamic minWords — keyword_interpretation step (Tema 1) recommends target length per keyword:
   - `suggestedWordRange: { min, max }` and `depth: "light" | "medium" | "deep"`
   - Site's minWords is the default, but interpretation step can adjust
   - Requires deep-research on optimal ranges per content type

### Tema extra: Image alt tags sin keyword
**Decision:** Bug fix.
- `generateAltText()` path 1: verify keyword as exact phrase (case-insensitive, diacritics-stripped)
- If context doesn't contain exact phrase, force path 2: `"{keyword} — {context}"`

---

## Part 2: Pipeline Redesign (temas A-I)

Restructuring from individual post generation to batch-planned content strategy.

### A. Images — contextual prompts ✅ DECIDED
- Hero: keep 1024x1024, looks good in layout
- Content images: generate 768x512 (landscape), insert with `max-width:400px;width:100%`
- Prohibit documents/text in images: "Never depict documents, IDs, licenses, certificates, or any surface with text. Show the contextual scene instead."
- Style: "Documentary photography, candid, realistic, slightly imperfect framing. Latin American urban/rural context."
- Context: prompt receives angle + intention from keyword_interpretation

### B. Visual content aesthetics ✅ DECIDED
- Base: Tailwind Typography (`prose`) + customizations in tailwind.config
- Elements pipeline can generate: `<hr>`, `<blockquote>`, `<figure>/<figcaption>`, `<aside class="tip">`, `<mark>`, `<details>/<summary>`
- Implement styles when Nuxt blog is set up — no point before
- Meanwhile (WordPress): only use elements WP already styles (blockquote, table, figure)

### C. Keywords at scale — 10 to 1000 ✅ DECIDED
- Upload Excel/CSV with column mapping (user picks which column is keyword, which is priority, rest ignored)
- Deduplication on import: exact + normalized (strip stopwords/accents)
- Preview before confirming: new vs duplicates
- Post-load: Phase 0 groups into clusters automatically (5-15 per cluster)
- If cluster grows >15, suggest splitting
- Prioritization by cluster, not individual keyword

### D. Duplicate/similar keyword detection ✅ DECIDED
- Level 1 (exact): on import, already exists
- Level 2 (normalized): on import, strip stopwords + accents and compare
- Level 3 (semantic): embedding similarity with OpenAI (~$0.0001/keyword), in Phase 0
- Clustering as second net: if two semantic keywords land in same cluster, detect redundancy

### E. Autonomous keyword generation ✅ DECIDED
- Hybrid: AI generates long-tail candidates → Google Suggest (free public API) validates they exist
- Keywords proposed to user, not auto-loaded — user decides which to accept
- Cost: $0 (Google autocomplete public API + AI already paid for)
- Real SERP for competition analysis: evaluate separately (Serper.dev $50/mo, pending research)

### F. Keyword recycling/repetition 🔄 IN DISCUSSION
- published/review → blocked, suggest "update existing post"
- error → reusable immediately
- archived → reusable after 30 days
- Pending: confirm suggestion UX when keyword is blocked

### G. Cluster size and management ⏳ PENDING
- Minimum 3 posts for topical authority
- Start with 5-10 per cluster, expand based on performance
- Optional pillar page for large clusters

### H. External links without constraints ⏳ PENDING
- Remove authoritativeSources as fixed list
- Specific prompt that decides IF there's a relevant source (government, city hall, newspapers, etc.)
- If nothing relevant → don't force any

### I. Phased generation (structure → content → enrichment) ⏳ PENDING
- Phase 1: titles, metaTitles, H1, H2, tags
- Phase 2: body content adapted to keyword length
- Phase 3: links, images, tables, blockquotes, data, conversion
- Validation between each phase

---

## Background context

### WordPress → Nuxt migration
- WordPress is temporary, already configured
- Target platform is Nuxt
- Design decisions should consider Nuxt, not WordPress
- No title suffix needed

### New pipeline flow (proposed)
```
PHASE 0 — PLANNING (on keyword load)
├── Receives: 5-15 keywords (or batch from Excel)
├── keyword_interpretation × each one
├── Auto-group into clusters
├── Create "content plan":
│   ├── Pillar page (if applicable)
│   ├── Generation order
│   ├── Pre-planned internal links map
│   └── Suggested length per post
└── Output: plan saved in DB, visible in admin

PHASE 1 — STRUCTURE (per post, in plan order)
├── Outline: H1, H2s, H3s, FAQ questions
├── metaTitle, metaDescription
├── Tags/badges
└── Structure validation before continuing

PHASE 2 — CONTENT (per post)
├── Generate body HTML from outline
├── Length adapted to keyword (not fixed)
├── Keyword in first paragraph (validated)
└── Output: base content

PHASE 3 — ENRICHMENT (per post)
├── Internal links (from plan, already knows targets)
├── External links (prompt decides if relevant — not forced)
├── Images + alt text with keyword
├── Tables, blockquotes, concrete data
├── Conversion link
└── SEO scoring + final validation
```
