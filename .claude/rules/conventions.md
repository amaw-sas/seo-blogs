# Conventions

## Naming
- Files: kebab-case (post-editor.tsx, content-pipeline.ts)
- Components: PascalCase (PostEditor, SiteSelector)
- DB tables: snake_case plural (posts, post_tags)
- API routes: /api/[resource] RESTful (GET /api/posts, POST /api/posts)
- Environment vars: NEXT_PUBLIC_ prefix for client, plain for server

## Structure
src/
  app/
    (admin)/               # Admin panel routes (behind auth)
    api/                   # API route handlers
  components/
    ui/                    # shadcn/ui primitives
    admin/                 # Admin-specific components
  lib/
    db/                    # Prisma client, queries
    ai/                    # Content generation pipeline
    auth/                  # Supabase auth config
    connectors/            # WordPress API, custom API adapters
    seo/                   # Meta tags, keyword optimization
  types/                   # Shared TypeScript types
worker/                    # Railway background service (separate entry point)
  scheduler.ts             # Cron job definitions
  pipeline.ts              # Content generation orchestration
  connectors/              # Publish to external blogs
prisma/
  schema.prisma
  migrations/
  seed.ts

## Error Handling
- API routes: return { error: string, status: number }
- AI pipeline: retry with exponential backoff, max 3 attempts, log to publish_logs
- Auth: generic error messages, never leak user existence
- Connectors: log all publish attempts (success/failure) to publish_logs

## Security
- All admin routes behind Supabase auth middleware
- CSRF protection on mutations
- Input sanitization (DOMPurify for HTML content)
- Rate limiting on auth endpoints
- WordPress API credentials encrypted at rest in Supabase
- Internal API key for Railway→Vercel communication

## SEO Post Structure (generated content must follow)
- meta_title: primary keyword near start, max 60 chars
- meta_description: keyword included, max 160 chars, compelling for CTR
- URL slug: contains primary keyword, short and descriptive
- H1: one per post, contains primary keyword
- H2-H3: secondary/related keywords, descriptive (not generic like "Step 1")
- Keyword in first 100 words: mandatory
- Keyword distribution: spread across intro, H2s, body, conclusion (not concentrated)
- Keyword frequency: natural usage 5-10 times per 2000-3000 words, warn if >2.5% density
- Long-tail keywords: include "People Also Ask" variations in content
- Each H2 section: lead with a clear answer/statement, then expand with details (LLM-friendly)
- Table of contents: auto-generated from headings
- Images: 2-3 per post (1 hero + 1-2 in content), alt text with keywords, max-height 400px
- Internal links: 2-5 per post, contextual anchors to existing published posts on same site
- External links: 1-3 authoritative sources
- FAQ section: 3-5 relevant questions at end, before conclusion (helps LLMs and featured snippets)
- Conclusion section: mandatory, at end of every post
- Tags: 3-7 per post, derived from content
- Tables and highlighted text blocks where relevant
- Schema markup: JSON-LD Article structured data per post
- Content language: Spanish
- Information gain: each post must include at least one unique element (data, comparison, checklist, original angle)

## SEO Metrics (measured and displayed per post in admin)
- Keyword frequency (times keyword appears)
- Keyword distribution score (present in: first 100 words, H2s, body, conclusion)
- Keyword density % (frequency / total words × 100)
- Density warning if >2.5% (keyword stuffing risk)
- Character count
- Word count
- Image count
- Internal link count
- External link count
- Has FAQ section (yes/no)
- Has schema markup (yes/no)
