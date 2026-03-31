# SEO Blogs — Automated Multi-Blog Publishing System

## Purpose
Central system that generates SEO-optimized blog posts from keywords using AI and publishes
them autonomously to external blogs. Admin panel for human review and correction.
Hosted at generador.estrategias.us (Vercel) with background worker on Railway.

## Domain Concepts
- **Site**: An external blog to publish to (WordPress or custom), with its own keyword pool and schedule
- **Post**: AI-generated article with structured SEO elements (headings, meta, ToC, tags, images, internal/external links, conclusion)
- **Keyword**: Seed phrase driving content generation; tracked per post for measurement
- **Schedule**: Per-site publishing frequency (e.g., 2 posts/day for car rental, 1/day for marketing)
- **Connector**: Integration layer that pushes posts to external blogs (WordPress REST API, custom API)
- **Internal Link Graph**: Cross-references between published posts within same site

## Active Sites
- alquilercarrobogota.com — WordPress, 2 posts/day, Spanish
- estrategias.us — Custom (connector pending), 1 post/day, Spanish

## Paradigms
- This is NOT a blog — it is a publishing engine that pushes to external blogs
- Content pipeline: keyword → outline → draft → images → SEO optimization → review queue → publish to external blog
- API-first: admin panel consumes internal API
- Single admin user (no multi-role needed currently)
