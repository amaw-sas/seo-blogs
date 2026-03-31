# Stack

## Runtime
- Node.js 20+ LTS
- TypeScript strict mode

## Framework
- Next.js 15 (App Router) — admin UI + API (deployed to Vercel)
- Tailwind CSS 4 — styling
- shadcn/ui — admin component library (pre-built tables, forms, modals)

## Database & Auth
- Supabase — PostgreSQL + auth
- Prisma ORM — schema, migrations, queries

## AI Services
- Claude API (Anthropic) — content generation (key available)
- OpenAI API — DALL-E image generation (key available)

## Background Worker (Railway)
- Node.js service with node-cron for scheduling
- Calls Vercel API to read/write data
- Calls WordPress REST API and future custom connectors

## External Integrations
- WordPress REST API — publish to alquilercarrobogota.com
- Custom connector (pending) — publish to estrategias.us

## Hosting
- Vercel — admin UI + API at generador.estrategias.us
- Railway — background worker ($5/mo Hobby plan)
- Supabase — database (free tier)

## Key Scripts
- `npm run dev` — local development
- `npm run build` — production build
- `npx prisma migrate dev` — run migrations
- `npx prisma db seed` — seed initial data
