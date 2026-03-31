# Image Generation Migration — GPT Image 1 Mini + Image Pool

**Date:** 2026-03-30
**Status:** Approved

## Summary

Migrate image generation from DALL-E 3 + Freepik Mystic to GPT Image 1 Mini (medium quality, 1024x1024). Add an image pool system with manual uploads as emergency fallback and AI image reuse as last resort.

## Motivation

- DALL-E 3 costs $0.08/image → GPT Image 1 Mini costs ~$0.015/image (80% savings)
- DALL-E 2/3 being deprecated May 2026
- Freepik Mystic adds complexity (polling, separate API key) for marginal benefit
- Image pool with manual fallback prevents pipeline failure when API is down or credits exhausted

## Architecture

### Image Priority Chain (4 levels)

```
1. Pool pre-generated (AI) → unique images, ready to use → $0
2. GPT Image 1 Mini (real-time) → if pool empty or partial → ~$0.015/img
3. Manual pool (emergency fallback) → if API fails/no credits → $0, reusable
4. Reuse AI images already used → if everything else fails → $0, last resort
```

### Changes

#### 1. Migrate to GPT Image 1 Mini

**File:** `src/lib/ai/image-generator.ts`

- Replace `dall-e-3` model with `gpt-image-1`
- Change size from `1792x1024` to `1024x1024`
- Change quality from `standard` to `medium`
- Remove Freepik import and fallback logic
- Default dimensions in metadata: 1024x1024
- Verify `response_format: "b64_json"` compatibility with gpt-image-1 API (may differ from DALL-E 3 response shape)

**File:** `src/lib/ai/freepik-client.ts` — DELETE

**File:** `src/lib/ai/freepik-client.test.ts` — DELETE

**Environment:** Remove `FREEPIK_API_KEY` from Vercel/Railway deployment env vars (no `.env.example` exists in repo)

#### 2. Image Pool Database

**New Prisma model:** `ImagePool` (maps to `image_pool`)

Uses `cuid()` IDs and `@map` annotations consistent with existing schema patterns.

```prisma
enum ImagePoolSource {
  ai_pregenerated
  manual

  @@map("image_pool_source")
}

enum ImagePoolStatus {
  available
  used

  @@map("image_pool_status")
}

model ImagePool {
  id                   String          @id @default(cuid())
  siteId               String          @map("site_id")
  categoryId           String?         @map("category_id")
  url                  String
  altTextBase          String          @map("alt_text_base")
  width                Int
  height               Int
  fileSize             Int             @map("file_size")
  source               ImagePoolSource
  status               ImagePoolStatus @default(available)
  postId               String?         @map("post_id")
  generatedFromKeyword String?         @map("generated_from_keyword")
  reuseCount           Int             @default(0) @map("reuse_count")
  createdAt            DateTime        @default(now()) @map("created_at")
  updatedAt            DateTime        @updatedAt @map("updated_at")

  site     Site      @relation(fields: [siteId], references: [id])
  category Category? @relation(fields: [categoryId], references: [id])
  post     Post?     @relation(fields: [postId], references: [id])

  @@index([siteId, source, status])
  @@index([siteId, categoryId, status])
  @@index([siteId, status, reuseCount])
  @@map("image_pool")
}
```

Key behaviors:
- `source = manual`: never changes status to `used`, always available as fallback
- `source = ai_pregenerated`: changes to `used` when assigned to a post
- `reuseCount`: only incremented for level 4 (reuse), tracks how many times an already-used image is reused

**Alt text personalization:** `altTextBase` stores a descriptive base (e.g., "ciudad bogotá tráfico centro"). When assigned to a post, the existing `generateAltText()` function is used to combine the base with the post's keyword, same logic as today.

#### 3. Pipeline Integration

**File:** `worker/pipeline.ts` — modify `generateAndUploadImages()`

**Query file:** `src/lib/db/image-pool-queries.ts` — NEW (pool lookup/update logic, per project conventions for DB queries in `src/lib/db/`)

**Critical note:** Category is assigned AFTER image generation in the pipeline (auto-categorize step ~line 440). Therefore, all pool queries during pipeline execution filter by `site_id` only, NOT by `category_id`. Category is used only for organization in the admin UI.

New flow (supports partial pool — takes what's available, generates the remainder):

```
needed = 2

Step 1: Query image_pool for ai_pregenerated + available + matching site_id
  → Take up to `needed`, mark as used, personalize alt_text
  → remaining = needed - taken
  → If remaining = 0: done
  → Else: go to step 2

Step 2: Generate `remaining` images with GPT Image 1 Mini in real-time
  → Success: upload to Supabase, save to image_pool as ai_pregenerated + used, assign to post
  → Log costImages for generated images only (pool images log costImages: 0)
  → Failure: go to step 3

Step 3: Query image_pool for manual + matching site_id
  → Take up to `remaining`, personalize alt_text, do NOT mark as used
  → remaining = remaining - taken
  → If remaining = 0: done
  → Else: go to step 4

Step 4: Query image_pool for ai_pregenerated + used + matching site_id
  → Order by reuse_count ASC, created_at ASC (least reused, oldest first)
  → Take up to `remaining`, increment reuse_count, personalize alt_text
  → If remaining > 0: pipeline continues with fewer images (non-fatal), warning logged
```

**Relationship to `post_images` table:** Pool images are copied into `post_images` as today (url, altText, width, height, fileSize). The `image_pool.post_id` is a tracking reference only — the canonical post-image relationship remains in `post_images`.

#### 4. Migration of Existing Images

Existing images in `post_images` are NOT migrated to the pool. They were generated for specific posts and their alt text is already personalized. Step 4 (reuse) starts empty and grows organically as new AI images are generated via Step 2.

#### 5. Admin UI — Image Pool Page

**New page:** `src/app/(admin)/image-pool/page.tsx`

Components:
- **Pool table** (`src/components/admin/image-pool-table.tsx`) — filterable by site, category, source, status
  - Columns: thumbnail, category, source (AI/manual), status (available/used), associated post, date
  - "Pool health" indicator: available images per category
- **Manual upload** (`src/components/admin/image-pool-upload.tsx`)
  - Select site + category
  - Drag & drop multiple images
  - Auto-compress to WebP (same pipeline as AI images)
  - Upload to Supabase Storage, save to image_pool as `manual`
- **Manual pre-generation** (`src/components/admin/image-pool-generate.tsx`)
  - Select site + category + count
  - Generates based on pending keywords for that category
  - Visible progress
  - Partial failure: successfully generated images are kept in pool

**Nav entry:** Add "Image Pool" to `src/components/admin/nav-items.ts`

### Files Affected

| File | Action |
|------|--------|
| `src/lib/ai/image-generator.ts` | Modify (new model, remove Freepik) |
| `src/lib/ai/freepik-client.ts` | Delete |
| `src/lib/ai/freepik-client.test.ts` | Delete |
| `src/lib/ai/image-generator.test.ts` | Modify (update mocks for new model) |
| `src/lib/db/image-pool-queries.ts` | New (pool lookup/update logic) |
| `worker/pipeline.ts` | Modify (pool lookup before generation) |
| `worker/pipeline.test.ts` | Modify (update image generation tests for pool flow) |
| `worker/pipeline.e2e.test.ts` | Modify (update cost estimates, model references) |
| `prisma/schema.prisma` | Add ImagePool model + enums + relations |
| `src/app/(admin)/image-pool/page.tsx` | New (pool management page) |
| `src/components/admin/image-pool-table.tsx` | New (pool table component) |
| `src/components/admin/image-pool-upload.tsx` | New (upload form component) |
| `src/components/admin/image-pool-generate.tsx` | New (pre-generation component) |
| `src/components/admin/nav-items.ts` | Modify (add Image Pool nav entry) |
| `src/app/api/image-pool/route.ts` | New (CRUD API for pool) |
| `src/app/api/image-pool/upload/route.ts` | New (manual upload endpoint) |
| `src/app/api/image-pool/generate/route.ts` | New (pre-generation endpoint) |
| `AI-IMAGE-COSTS.md` | Update (remove Freepik references, update model info) |

### Cost Projection

| Phase | Images/month | Cost/month |
|-------|-------------|------------|
| Current (DALL-E 3 + Freepik) | 180 | ~$12-14 |
| After migration (GPT Image 1 Mini only) | 180 | ~$2.70 |
| With pool active (pool covers ~80%) | 36 generated | ~$0.54 |
| Pool fully stocked | ~0 generated | ~$0 |

## Observable Scenarios

### S1: GPT Image 1 Mini generates successfully
**Given** the pool is empty for the post's site
**When** the pipeline runs image generation
**Then** GPT Image 1 Mini is called with model `gpt-image-1`, size `1024x1024`, quality `medium`, 2 images are produced, uploaded, saved to image_pool as used, and costImages is logged

### S2: Pool pre-generated images are consumed
**Given** the pool has ≥2 `ai_pregenerated` + `available` images for the post's site
**When** the pipeline runs image generation
**Then** 2 images are taken from the pool, their status changes to `used`, their alt_text is personalized with the post keyword, no API call is made, and costImages logged as 0

### S3: Partial pool + real-time generation
**Given** the pool has 1 `ai_pregenerated` + `available` image for the post's site
**When** the pipeline runs image generation
**Then** 1 image is taken from pool (marked used), 1 image is generated via GPT Image 1 Mini, costImages reflects only the 1 generated image

### S4: Manual fallback when API fails
**Given** the pool has no available AI images AND GPT Image 1 Mini API call fails AND manual images exist for the site
**When** the pipeline runs image generation
**Then** manual images from the pool are used, their status remains `available`, and their alt_text is personalized

### S5: Reuse as last resort
**Given** no available AI images, API fails, and no manual images exist for the site, but used AI images exist
**When** the pipeline runs image generation
**Then** already-used AI images are reused (least reused first, filtered by site_id), reuse_count is incremented

### S6: Pipeline survives with no images
**Given** the pool is completely empty for the site and API fails
**When** the pipeline runs image generation
**Then** the post is created without images (non-fatal), and a warning is logged

### S7: Manual upload via admin
**Given** the admin navigates to /admin/image-pool
**When** they upload images selecting a site and category
**Then** images are compressed to WebP, uploaded to Supabase Storage, and saved in image_pool with source=manual and status=available

### S8: Manual pre-generation via admin
**Given** the admin clicks "Generate images for pool" with site, category, and count=5
**When** the generation runs
**Then** images are generated using pending keywords, saved to pool as ai_pregenerated + available, with visible progress. If generation fails partway (e.g., 3 of 5), successfully generated images are kept.

### S9: Freepik code fully removed
**Given** the migration is complete
**When** searching the codebase for "freepik" (case-insensitive)
**Then** no production code references remain (only this spec, AI-IMAGE-COSTS.md history notes, and git history)

### S10: Cost tracking accuracy
**Given** a post uses 1 pool image + 1 real-time generated image
**When** the pipeline logs costs
**Then** costImages reflects only the cost of the 1 generated image (~$0.015), not the pool image
