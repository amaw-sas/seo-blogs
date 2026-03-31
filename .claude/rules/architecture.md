# Architecture

## Deployment Split
- **Vercel** (generador.estrategias.us): Admin UI + API + dashboard
- **Railway**: Background worker (content generation, scheduled publishing)
- **Supabase**: PostgreSQL database + auth

## Layers
1. **Admin UI** (Next.js App Router) — post management, stats, scheduling, keyword management
2. **API Layer** (Next.js Route Handlers) — CRUD for posts/sites/keywords, auth, analytics
3. **Content Pipeline** (Railway worker) — AI generation: keyword→outline→content→images→SEO
4. **Connectors** — push posts to external blogs (WordPress REST API, custom API extensible)
5. **Scheduler** (Railway cron) — triggers pipeline per site frequency config

## Communication
- Railway worker calls Vercel API (internal API key) to read keywords and save generated posts
- Railway worker calls WordPress REST API to publish posts
- Admin UI calls Vercel API for all operations

## Data Flow
Scheduler triggers → picks next keyword from pool → Pipeline generates post →
Post saved as "draft" in Supabase → auto-publish or human review →
Connector pushes to external blog → status updated to "published" →
Internal links updated across site's posts

## Key Entities
- sites (id, name, domain, platform[wordpress|custom], api_url, api_credentials_encrypted, schedule_config, posts_per_day, created_at)
- posts (id, site_id, title, slug, content_html, meta_title, meta_description, keyword_id, status[draft|review|published|archived|error], char_count, external_post_id, published_at, created_at, updated_at)
- post_tags (post_id, tag_id)
- tags (id, name, slug, site_id)
- post_images (id, post_id, url, alt_text, position, width, height)
- keywords (id, site_id, phrase, status[pending|used|skipped], priority, created_at)
- users (id, email, password_hash, reset_token, reset_expires, created_at)
- post_links (id, source_post_id, target_post_id, anchor_text, link_type[internal|external])
- publish_logs (id, post_id, site_id, action, status[success|failed], error_message, created_at)
- analytics (id, post_id, views, date)
