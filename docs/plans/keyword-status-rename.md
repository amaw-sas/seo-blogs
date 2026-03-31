# Plan: Renombrar estado "Pendiente" a "Disponible" en keywords

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

El estado "pending" de las keywords se muestra como "Pendiente" en la UI. El usuario prefiere "Disponible" porque refleja mejor que la keyword está lista para ser usada por el pipeline.

## Cambios

### Solo cambio de label en UI (NO cambiar el valor en BD)

El enum en Prisma sigue siendo `pending` — solo se cambia el texto que se muestra:

- `src/app/(admin)/keywords/page.tsx` — cambiar `statusLabels.pending` de "Pendiente" a "Disponible"
- Cualquier otra página que muestre estados de keywords

### NO cambiar
- `prisma/schema.prisma` — el enum `KeywordStatus` sigue siendo `pending`
- Lógica del pipeline — sigue filtrando por `status: "pending"`
- API responses — siguen retornando `"pending"`
