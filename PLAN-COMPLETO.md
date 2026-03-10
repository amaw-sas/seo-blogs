# SEO Blogs Engine — Plan de implementación

## Contexto

Sistema centralizado de generación y publicación automática de posts SEO en blogs externos.
Genera contenido con Claude API, imágenes con DALL-E (WebP ≤150KB), y publica autónomamente
en WordPress y blogs custom. Admin panel para gestión humana en generador.estrategias.us.

### Decisiones tomadas
- **Vercel**: Admin UI + API (generador.estrategias.us)
- **Railway**: Worker background (generación, scheduling, publicación)
- **Supabase**: PostgreSQL + Auth + Storage (imágenes)
- **Stack**: Next.js 15, Prisma, Tailwind CSS 4, shadcn/ui, TypeScript strict
- **Auto-publicación**: sin revisión previa, admin corrige después
- **Keywords**: lista amplia del usuario + expansión moderada por IA
- **Imágenes**: 2-3 por post, WebP 50% compresión, ≤150KB, almacenadas en Supabase Storage
- **Editor**: WYSIWYG para correcciones
- **Horario**: ventana horaria aleatoria por sitio, mínimo 2h entre posts
- **Errores**: reintento 3x con backoff, continúa sin pausar
- **Longitud**: configurable por sitio (carros 1500-2000, marketing 2500-3500)
- **Idioma**: español
- **Blogs custom**: HTML para humanos, markdown para bots IA

### Blogs activos
- alquilercarrobogota.com — WordPress, 2 posts/día, ventana 7am-12pm
- estrategias.us — Custom (conector pendiente), 1 post/día

### Costos estimados mensuales
| Servicio | Costo |
|----------|-------|
| Railway (worker) | $5 |
| Vercel (free tier) | $0 |
| Supabase (free tier, ~25 meses) | $0 |
| Claude API (contenido) | $10-30 |
| OpenAI DALL-E (imágenes) | $5-20 |
| Dominios | ~$2 prorrateado |
| **Total** | **~$22-57/mes** |

---

## Diseño

### Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    VERCEL                             │
│  generador.estrategias.us                            │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Admin UI │  │   API    │  │  Auth Middleware  │   │
│  │ (Next.js)│──│ (Routes) │──│   (Supabase)     │   │
│  └──────────┘  └────┬─────┘  └──────────────────┘   │
│                      │                                │
└──────────────────────┼────────────────────────────────┘
                       │ API calls
                       ▼
              ┌────────────────┐
              │    SUPABASE    │
              │  PostgreSQL    │
              │  Auth          │
              │  Storage       │
              └───────┬────────┘
                      │
                      ▲ Read/Write
┌─────────────────────┼────────────────────────────────┐
│                  RAILWAY                              │
│                                                       │
│  ┌───────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Scheduler │──│ Pipeline │──│   Connectors     │  │
│  │ (cron)    │  │ (AI gen) │  │ (WordPress API)  │  │
│  └───────────┘  └──────────┘  └──────────────────┘  │
│                                                       │
│  ┌───────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Trends    │  │ Monitors │  │   Reporters      │  │
│  │ (Google)  │  │ (regs)   │  │ (email/Telegram) │  │
│  └───────────┘  └──────────┘  └──────────────────┘  │
└───────────────────────────────────────────────────────┘
                       │
                       ▼ Publish
              ┌────────────────┐
              │ EXTERNAL BLOGS │
              │ WordPress API  │
              │ Custom API     │
              └────────────────┘
```

### Pipeline de generación (por cada post)

1. **Selección de keyword** — Prioriza por: Google Trends, estacionalidad, festivos, regulaciones, prioridad manual. Verifica canibalización (<40% similitud)
2. **Análisis pre-generación (Fase 3)** — Top 5 resultados Google, analiza estructura/longitud/temas
3. **Generación del outline** — Claude genera: H1, H2s, H3s, secciones tabla, FAQ, conclusión. Long-tail keywords en headings
4. **Generación del contenido** — Post completo en español. Keyword en primeras 100 palabras. Cada H2 abre con respuesta directa (LLM-friendly). Tablas, textos destacados, information gain
5. **Imágenes** — DALL-E genera 2-3 imágenes → WebP 50% → máx 150KB → Supabase Storage. Alt text con keyword
6. **SEO y links** — meta_title ≤60 chars, meta_description ≤160 chars, slug con keyword, tags 3-7, categoría auto, 2-5 links internos, 1-3 links externos, link de conversión, schema JSON-LD
7. **Validación (score ≥70/100)** — Checklist: keyword en primeras 100 palabras, en H2s, FAQ presente, imágenes con alt, links internos, densidad <2.5%, legibilidad. Si <70, regenera (máx 3 intentos). Si falla 3x → estado "review"
8. **Publicación** — WordPress REST API → ping Google → actualiza sitemap → auto-linking retroactivo en posts anteriores → log con costos

### Estructura de carpetas

```
seoblogs/
├── src/
│   ├── app/
│   │   ├── (admin)/
│   │   │   ├── dashboard/
│   │   │   ├── posts/
│   │   │   │   ├── [id]/edit/
│   │   │   │   └── page.tsx
│   │   │   ├── keywords/
│   │   │   ├── sites/
│   │   │   ├── clusters/
│   │   │   ├── calendar/
│   │   │   ├── logs/
│   │   │   ├── stats/
│   │   │   ├── settings/
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── posts/
│   │   │   ├── keywords/
│   │   │   ├── sites/
│   │   │   ├── clusters/
│   │   │   ├── logs/
│   │   │   ├── analytics/
│   │   │   ├── upload/
│   │   │   └── worker/
│   │   ├── login/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/
│   │   └── admin/
│   │       ├── post-table.tsx
│   │       ├── post-editor.tsx
│   │       ├── keyword-manager.tsx
│   │       ├── site-config.tsx
│   │       ├── calendar-view.tsx
│   │       ├── cluster-map.tsx
│   │       ├── log-timeline.tsx
│   │       ├── dashboard-stats.tsx
│   │       └── seo-score-panel.tsx
│   ├── lib/
│   │   ├── db/
│   │   │   └── prisma.ts
│   │   ├── ai/
│   │   │   ├── content-generator.ts
│   │   │   ├── keyword-expander.ts
│   │   │   ├── image-generator.ts
│   │   │   └── seo-scorer.ts
│   │   ├── auth/
│   │   │   └── supabase.ts
│   │   ├── connectors/
│   │   │   ├── wordpress.ts
│   │   │   └── custom.ts
│   │   └── seo/
│   │       ├── metrics.ts
│   │       ├── schema-markup.ts
│   │       └── sitemap.ts
│   └── types/
│       └── index.ts
├── worker/
│   ├── index.ts
│   ├── scheduler.ts
│   ├── pipeline.ts
│   ├── connectors/
│   │   ├── wordpress.ts
│   │   └── custom.ts
│   ├── monitors/
│   │   ├── regulations.ts
│   │   ├── broken-links.ts
│   │   └── outdated-content.ts
│   ├── trends/
│   │   └── google-trends.ts
│   ├── reports/
│   │   └── weekly-report.ts
│   └── utils/
│       ├── image-compressor.ts
│       ├── similarity-checker.ts
│       └── api-client.ts
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

### Modelo de datos (18 tablas)

- **sites** — blogs externos: dominio, plataforma, credenciales API, schedule, rango palabras, ventana horaria, URL de conversión, fuentes autoritativas preferidas
- **posts** — contenido HTML + markdown, métricas SEO (keyword_density, keyword_frequency, keyword_distribution JSON, readability_score, seo_score), word_count, char_count, reading_time_minutes, generation_cost, status [draft|review|published|archived|error], external_post_id
- **post_versions** — historial de ediciones: snapshot del contenido por cada cambio
- **keywords** — pool por sitio: frase, estado [pending|used|skipped], prioridad, keyword padre (si fue expandida), motivo skip
- **tags** — tags por sitio: name, slug
- **post_tags** — relación post ↔ tag
- **categories** — categorías por sitio (auto-asignadas)
- **post_images** — imágenes: URL Supabase, alt text, posición en post, width, height, file_size
- **post_links** — links internos/externos: URL destino, anchor text, tipo [internal|external|conversion], estado [active|broken]
- **content_clusters** — pillar pages: nombre del cluster, keyword pilar, sitio
- **cluster_posts** — relación cluster ↔ posts satélite
- **holidays** — fechas relevantes: fecha, nombre, país, tipo [national|commercial|lunar|custom]
- **site_holidays** — relación sitio ↔ holidays activados, con días de anticipación configurables
- **regulations** — regulaciones recurrentes: tipo (pico_y_placa), datos JSON, vigencia desde/hasta, sitio, source_url, auto_monitor boolean
- **publish_logs** — log de toda actividad: tipo evento, sitio, post_id, status [success|failed], error_message, cost_tokens, cost_images, created_at
- **analytics** — métricas por post/día: views, clicks, impressions, position (desde GSC)
- **users** — admin: email, password_hash, reset_token, reset_token_expires, created_at
- **site_ab_tests** — A/B tests: post_id, variantes JSON, ctr por variante, ganador
- **notifications** — cola: tipo, mensaje, canal [email|telegram], sent boolean, created_at

### Admin Panel

**Dashboard:** posts hoy/semana/mes por sitio, keywords pendientes vs usadas, próximas publicaciones, errores recientes, costo estimado del mes, gráfica 30 días, alertas

**Lista posts (estilo WordPress):** tabla con título, sitio, keyword, estado, score SEO, densidad, word count, char count, lectura estimada, fecha. Filtros por sitio/estado/fecha/keyword/score

**Editor WYSIWYG:** texto enriquecido, preview en tiempo real, panel lateral con métricas SEO en vivo, historial de versiones, recalcula al guardar

**Keywords:** lista por sitio, importación CSV, botón expandir, aprobar/descartar variaciones, alerta <10 pendientes

**Sitios:** config dominio, plataforma, credenciales, posts/día, rango palabras, ventana horaria, URL de conversión, fuentes autoritativas

**Calendario:** vista mensual/semanal, posts programados/publicados/error, festivos marcados

**Log:** timeline cronológico, filtros por sitio/evento/fecha, detalle expandible

**Stats (Fase 3):** GSC integrado, ROI por post, content gap, A/B testing

**Extras:** dark mode, responsive, exportar CSV/JSON, snippets redes sociales

### SEO — Reglas de generación

- meta_title: keyword cerca del inicio, máx 60 chars
- meta_description: keyword incluida, máx 160 chars, compelling para CTR
- URL slug: contiene keyword, corto y descriptivo
- H1: uno por post, contiene keyword
- H2-H3: keywords secundarias, descriptivos (no genéricos)
- Keyword en primeras 100 palabras: obligatorio
- Distribución: intro, H2s, body, conclusión
- Frecuencia: 5-10 veces por 2000-3000 palabras, warning si >2.5% densidad
- Long-tail keywords: variaciones "People Also Ask"
- Cada H2: abre con respuesta clara (LLM-friendly)
- Table of contents: auto-generado
- Imágenes: 2-3 por post, alt text con keywords, max-height 400px
- Links internos: 2-5 por post
- Links externos: 1-3 fuentes autoritativas (preferidas por sitio)
- Link de conversión: 1 por post hacia URL configurada por sitio
- FAQ: 3-5 preguntas antes de conclusión
- Conclusión: obligatoria al final
- Tags: 3-7 derivados del contenido
- Schema: JSON-LD Article
- Information gain: al menos 1 elemento único por post
- Idioma: español

### Métricas SEO por post (visibles en admin)

- Keyword frequency (veces que aparece)
- Keyword distribution score (first 100 words, H2s, body, conclusion)
- Keyword density % (warning si >2.5%)
- SEO score 0-100
- Readability score
- Word count, char count
- Reading time (minutes)
- Image count
- Internal link count, external link count
- Has FAQ, has schema, has conversion link
- Generation cost (USD)

---

## Escenarios observables (holdout set)

### SCENARIO 1: auto-publish-post
```
Given el sitio "alquilercarrobogota.com" tiene keywords pendientes y schedule de 2 posts/día en ventana 7am-12pm
When el scheduler se ejecuta dentro de la ventana horaria
Then se genera un post en español con: H1 con keyword, keyword en primeras 100 palabras, ToC, 2-3 imágenes WebP ≤150KB, FAQ, conclusión, 2-5 links internos, 1-3 links externos, schema JSON-LD, link de conversión a /reservas
And el post tiene score SEO ≥70/100 y densidad de keyword <2.5%
And el post se publica en WordPress vía REST API
And aparece en el log con estado "success" y costo de generación
And la keyword se marca como "used"
```

### SCENARIO 2: admin-auth-flow
```
Given el admin accede a generador.estrategias.us
When ingresa email y contraseña correctos
Then accede al dashboard con resumen de posts, keywords, errores y costos

Given el admin olvidó su contraseña
When solicita recuperación con su email
Then recibe un email con link de reset
And al hacer clic, puede establecer nueva contraseña
And la sesión anterior se invalida
```

### SCENARIO 3: edit-post-wysiwyg
```
Given el admin abre un post publicado desde la lista de posts
When modifica el título, corrige un párrafo y reemplaza una imagen
Then el editor WYSIWYG muestra los cambios en tiempo real
And el panel lateral recalcula métricas SEO (densidad, score, word count) en vivo
And al guardar, se crea una versión en el historial con el contenido anterior
And el post actualizado se republica en WordPress automáticamente
```

### SCENARIO 4: keyword-import-and-expand
```
Given el admin sube un archivo CSV con 50 keywords para "alquilercarrobogota.com"
When el sistema procesa el CSV
Then las 50 keywords aparecen en la lista con estado "pendiente"

Given el admin selecciona la keyword "alquiler de carros en Bogotá" y presiona "Expandir"
When Claude genera variaciones
Then aparecen 5-10 keywords derivadas
And cada una tiene estado "pendiente" y referencia a la keyword padre
And el admin puede aprobar o descartar cada variación individualmente
```

### SCENARIO 5: seo-score-gate
```
Given el pipeline generó un post con score SEO de 55/100
When la validación detecta score <70
Then el sistema regenera el post automáticamente (máximo 3 intentos)
And si los 3 intentos fallan, el post se guarda con estado "review"
And cada intento queda registrado en el log con su score y motivo de fallo
```

### SCENARIO 6: random-schedule-window
```
Given "alquilercarrobogota.com" tiene configurado 2 posts/día en ventana 7am-12pm
When el scheduler calcula los horarios del día
Then genera 2 horarios aleatorios dentro de la ventana con mínimo 2 horas de separación
And los horarios son diferentes cada día
And los posts se publican en los horarios calculados
And el dashboard muestra "próxima publicación" con la hora programada
```

### SCENARIO 7: publish-retry-on-failure
```
Given el pipeline generó un post listo para publicar en WordPress
When el conector intenta publicar y WordPress responde con error 503
Then el sistema reintenta 3 veces con espera creciente (30s, 60s, 120s)
And si uno de los reintentos tiene éxito, el post se marca como "published"
And si los 3 fallan, el post se marca como "error"
And cada intento queda en el log con el código de error
And el sistema continúa con el siguiente post programado
```

### SCENARIO 8: retroactive-internal-linking
```
Given el sitio "alquilercarrobogota.com" tiene 20 posts publicados y URL de conversión configurada como "/reservas"
When se publica un nuevo post "Alquiler de carro para Semana Santa en Bogotá"
Then el nuevo post incluye un link de conversión hacia /reservas con anchor text contextual
And el sistema analiza los 20 posts existentes buscando contexto relevante
And agrega un link hacia el nuevo post en 2-5 posts anteriores relacionados
And los posts modificados se actualizan en WordPress
And el log registra qué posts fueron actualizados
```

### SCENARIO 9: holiday-content-generation
```
Given el sitio "alquilercarrobogota.com" tiene festivos activados con "Semana Santa" seleccionada y 15 días de anticipación
And el sitio "esotericos.com" tiene festivos activados solo con "Halloween" y "equinoccio de primavera"
When el scheduler detecta que faltan 15 días para una fecha activa de un sitio
Then genera post temático solo para los sitios que tienen esa fecha activada
And los sitios sin esa fecha activa no se ven afectados
And el admin puede agregar fechas personalizadas por sitio
```

### SCENARIO 10: regulation-auto-monitor
```
Given el sitio "alquilercarrobogota.com" tiene regulaciones activadas con monitoreo de pico y placa
And tiene fuentes autoritativas configuradas (movilidadbogota.gov.co, bogota.gov.co)
When el worker detecta nuevas reglas en la fuente oficial
Then genera posts con links externos hacia las fuentes oficiales
And actualiza el post anterior con aviso "Información no vigente" + link al nuevo
And genera posts derivados relacionados

Given la extracción automática falla
When el worker no puede leer la fuente oficial
Then alerta al admin para carga manual desde tabla editable
```

### SCENARIO 11: trends-keyword-prioritization
```
Given el pool de keywords tiene 30 keywords pendientes
When el scheduler consulta Google Trends antes de seleccionar
Then prioriza keywords con tendencia creciente
And desprioritiza keywords con tendencia decreciente
And el dashboard muestra indicador de tendencia por keyword
```

### SCENARIO 12: keyword-cannibalization-detection
```
Given el sitio tiene un post publicado con keyword "alquiler de carros baratos en Bogotá"
When el pipeline va a generar un post con keyword "alquiler carros económicos Bogotá"
Then detecta similitud >40%
And descarta la keyword, la marca como "skipped" con motivo "canibalización"
And selecciona la siguiente keyword disponible y continúa
And el admin puede ver keywords descartadas y reactivarlas
```

### SCENARIO 13: content-cluster-creation
```
Given el admin crea un cluster "Alquiler de carros Bogotá" con keyword pilar
When el pipeline genera posts con keywords relacionadas
Then los asocia automáticamente como posts satélite
And cada satélite incluye link al pilar
And el pilar incluye links a todos sus satélites
And cuando se agrega un nuevo satélite, el pilar se actualiza en WordPress
And el admin ve el cluster como mapa visual
```

### SCENARIO 14: dual-content-delivery
```
Given un post está publicado en "estrategias.us" (blog custom)
When un humano visita el post
Then recibe HTML renderizado completo

When un bot de IA visita el mismo post
Then recibe markdown limpio
And el sitio sirve llms.txt en la raíz
```

### SCENARIO 15: weekly-report
```
Given es lunes a las 8am
When el worker genera el reporte semanal
Then envía mensaje al canal configurado (email/Telegram) con:
  posts publicados por sitio, errores, keywords consumidas vs pendientes,
  costo semanal, links rotos, alertas
And el reporte queda visible en el admin como entrada del log
```

### SCENARIO 16: cost-tracking
```
Given el pipeline genera un post usando Claude API y DALL-E
When el post se completa
Then calcula y guarda el costo (tokens Claude + imágenes DALL-E)
And si hubo regeneraciones, suma el costo de todos los intentos
And el dashboard muestra: costo por post, diario, mensual, por sitio
```

---

## Plan de implementación

### Fase 1 — Core funcional

| Step | Qué | Archivos clave | Criterio de aceptación |
|------|-----|----------------|----------------------|
| 1.1 | Setup: Next.js 15, Prisma, Supabase, Tailwind, shadcn/ui | package.json, next.config.ts, tailwind.config.ts | `npm run dev` corre sin errores |
| 1.2 | Schema BD + migraciones | prisma/schema.prisma | 18 tablas creadas en Supabase |
| 1.3 | Auth: login, logout, reset password | src/app/login/, src/lib/auth/ | Escenario 2 satisfecho |
| 1.4 | API CRUD: posts, keywords, sites, tags, logs | src/app/api/ | Endpoints responden correctamente |
| 1.5 | Admin UI: dashboard + lista posts + editor WYSIWYG | src/app/(admin)/, src/components/admin/ | Escenario 3 satisfecho |
| 1.6 | Importación CSV de keywords | src/app/api/upload/ | Escenario 4 (parte 1) satisfecho |
| 1.7 | Expansión de keywords por IA | src/lib/ai/keyword-expander.ts | Escenario 4 (parte 2) satisfecho |
| 1.8 | Pipeline: outline → contenido → imágenes WebP → métricas SEO | src/lib/ai/, worker/pipeline.ts | Escenario 1 (generación) satisfecho |
| 1.9 | Score SEO ≥70 gate | src/lib/ai/seo-scorer.ts | Escenario 5 satisfecho |
| 1.10 | Conector WordPress REST API | worker/connectors/wordpress.ts | Post aparece en WordPress |
| 1.11 | Scheduler ventana horaria aleatoria | worker/scheduler.ts | Escenarios 6, 7 satisfechos |
| 1.12 | Log de actividad | src/app/(admin)/logs/ | Timeline funcional con filtros |
| 1.13 | Deploy Vercel + Railway + Supabase | vercel.json, Procfile | Sistema accesible en generador.estrategias.us |

### Fase 2 — Inteligencia

| Step | Qué | Escenarios |
|------|-----|-----------|
| 2.1 | Auto-linking retroactivo + link de conversión | 8 |
| 2.2 | Content clusters / pillar pages | 13 |
| 2.3 | Detección de canibalización | 12 |
| 2.4 | Score de legibilidad | Métrica en escenario 1 |
| 2.5 | Detección de similitud entre posts | Complementa 12 |
| 2.6 | Auto-categorización | Complementa 1 |
| 2.7 | Calendario de contenido visual | Vista admin |
| 2.8 | Historial de versiones | 3 |
| 2.9 | Preview del post | Vista admin |
| 2.10 | Calendario de festivos (configurable por sitio, tipos: national/commercial/lunar/custom) | 9 |
| 2.11 | Regulaciones recurrentes con monitoreo automático (configurable por sitio) | 10 |
| 2.12 | Sitemap automático + ping a Google | Post-publish |
| 2.13 | Dark mode | UI |
| 2.14 | Lectura estimada | Métrica |
| 2.15 | Contenido markdown para IAs (blogs custom) + llms.txt | 14 |

### Fase 3 — Datos y optimización

| Step | Qué | Escenarios |
|------|-----|-----------|
| 3.1 | Google Search Console integrado | Dashboard |
| 3.2 | Google Trends integrado | 11 |
| 3.3 | Análisis de competencia pre-generación | Pipeline |
| 3.4 | Análisis de impacto histórico por fecha | Scheduler |
| 3.5 | A/B testing de títulos | Post-publish |
| 3.6 | Detección de links rotos | Monitor |
| 3.7 | Costo por post y ROI estimado | 16 |
| 3.8 | Content gap analysis | Dashboard |
| 3.9 | Detección de contenido desactualizado | Monitor |
| 3.10 | Reporte semanal automático | 15 |
| 3.11 | Notificaciones email/Telegram | Alertas |
| 3.12 | Exportar datos CSV/JSON | Admin |
| 3.13 | Snippets para redes sociales | Admin |

---

## Blast radius

### Archivos nuevos (todo el proyecto es nuevo)
- ~40 archivos en src/ (app routes, components, lib)
- ~15 archivos en worker/
- 1 schema.prisma + seed
- Config files (next.config, tailwind, tsconfig, package.json)

### Servicios externos afectados
- Supabase: nueva BD + storage
- WordPress (alquilercarrobogota.com): posts creados/actualizados vía API
- Claude API: consumo de tokens
- OpenAI API: generación de imágenes
- Google Search Console: lectura de datos (Fase 3)
- Google Trends: consulta de tendencias (Fase 3)

### Dominios
- generador.estrategias.us → Vercel (requiere config DNS: CNAME a cname.vercel-dns.com)

---

## Verificación

### Fase 1 completa cuando:
1. Admin accesible en generador.estrategias.us con login funcional
2. Se carga CSV de keywords y aparecen en el admin
3. Se expande una keyword y genera variaciones
4. El worker genera un post completo con score ≥70
5. El post aparece publicado en alquilercarrobogota.com
6. El scheduler publica automáticamente en horarios aleatorios
7. El editor WYSIWYG permite corregir y republicar
8. El log muestra toda la actividad
9. Errores de publicación se reintentan 3x

### Fase 2 completa cuando:
10. Posts nuevos reciben links de posts anteriores automáticamente
11. Clusters visibles con mapa pilar-satélites
12. Keywords canibalizadas se descartan automáticamente
13. Festivos generan posts anticipados por sitio (solo sitios con festivo activado)
14. Pico y placa se monitorea y genera posts automáticamente (solo sitios con regulación activada)
15. Dark mode funcional
16. Blogs custom sirven markdown a bots IA

### Fase 3 completa cuando:
17. Dashboard muestra datos reales de GSC
18. Google Trends prioriza keywords
19. Reporte semanal llega por email/Telegram
20. Costos calculados y visibles por post/día/mes

---

## Requisitos previos para ejecutar

### Cuentas necesarias
- [ ] Cuenta Supabase (supabase.com) — crear proyecto, obtener URL + anon key + service role key
- [ ] Cuenta Vercel (vercel.com) — conectar repo GitHub
- [ ] Cuenta Railway (railway.com) — plan Hobby $5/mes
- [ ] API key Claude (console.anthropic.com) — ya disponible
- [ ] API key OpenAI (platform.openai.com) — ya disponible
- [ ] Credenciales WordPress REST API de alquilercarrobogota.com (Application Password)

### Variables de entorno
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# WordPress
WP_ALQUILER_URL=https://alquilercarrobogota.com
WP_ALQUILER_USER=
WP_ALQUILER_APP_PASSWORD=

# Internal
WORKER_API_KEY=        # Railway → Vercel auth
NEXTAUTH_SECRET=       # Session encryption

# Notifications (Fase 3)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
```

### DNS
- Crear CNAME: `generador.estrategias.us` → `cname.vercel-dns.com`
