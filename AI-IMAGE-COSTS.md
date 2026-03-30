# AI Image Generation — Costs & Architecture

**Production URL:** https://seo-blogs-tawny.vercel.app/

## Architecture

| Config | Value |
|--------|-------|
| Service | GPT Image 1 Mini (OpenAI) |
| Images per post | 2 (1 hero + 1 in-content) |
| Output format | WebP |
| Max file size | 150 KB |
| Dimensions | 1024×1024 |
| Quality | medium |
| Storage | Supabase Storage (cache: 1 year) |

## Image Priority Chain (4 levels)

```
1. Pool pre-generated (AI) → unique images, ready to use → $0
2. GPT Image 1 Mini (real-time) → if pool empty → ~$0.015/img
3. Manual pool (emergency fallback) → if API fails → $0, reusable
4. Reuse AI images already used → last resort → $0
```

## Cost per Image

| Service | Model | Size | Quality | Cost/image |
|---------|-------|------|---------|------------|
| GPT Image 1 Mini | gpt-image-1 | 1024×1024 | medium | $0.015 |

## Cost per Post

| Scenario | Images | Image cost | Tokens (Claude) | Total/post |
|----------|--------|------------|-----------------|------------|
| Pool covers all | 2 | $0.00 | ~$0.10 | **~$0.10** |
| Real-time generation | 2 | $0.03 | ~$0.10 | **~$0.13** |
| Mixed (1 pool + 1 gen) | 2 | ~$0.015 | ~$0.10 | **~$0.115** |

## Monthly Estimates (3 posts/day)

| Scenario | Cost/post | Monthly |
|----------|-----------|---------|
| Pool fully stocked | ~$0.10 | **~$9** |
| Real-time only | ~$0.13 | **~$12** |
| Pool covers ~80% | ~$0.103 | **~$9.30** |

## Cost Tracking (implemented)

- `publish_logs.costTokens` — token cost per publish action
- `publish_logs.costImages` — image cost per publish action
- `cost-tracker.ts` — calculates per-post, daily, and monthly costs
- `weekly-report.ts` — aggregates weekly cost summary
- ROI estimate: default $0.50/click (LatAm market)

## Key Files

- `src/lib/ai/image-generator.ts` — GPT Image 1 Mini generation + compression
- `src/lib/db/image-pool-queries.ts` — pool lookup, mark-as-used, reuse logic
- `src/lib/seo/cost-tracker.ts` — cost aggregation
- `worker/pipeline.ts` — 4-level fallback chain integration
- `src/app/api/image-pool/` — pool CRUD, upload, pre-generation endpoints

## History

- **v1** (pre-2026-03-30): Freepik Mystic (primary) + DALL-E 3 (fallback), 1792×1024, ~$12-14/mo
- **v2** (2026-03-30): GPT Image 1 Mini + image pool system, 1024×1024, ~$0-2.70/mo
