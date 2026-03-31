# Plan: Ordenar por columnas en la tabla de keywords

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

La tabla de keywords no permite ordenar por columnas. El usuario quiere poder hacer click en los encabezados para ordenar asc/desc.

## Cambios

### Frontend: `src/app/(admin)/keywords/page.tsx`
- Agregar estado `sortField` (string: "phrase", "priority", "status", "createdAt") y `sortDir` ("asc" | "desc")
- Agregar icono de flecha (ArrowUpDown / ArrowUp / ArrowDown) en cada encabezado clickeable
- Al hacer click en un encabezado: si ya está ordenado por ese campo, invertir dirección; si no, ordenar asc
- Enviar `sortField` y `sortDir` como query params al API
- Columnas ordenables: Frase, Estado, Prioridad, Fecha (Origen y Sitio no tienen sentido ordenar)

### Backend: `src/app/api/keywords/route.ts`
- Leer `sortField` y `sortDir` de searchParams
- Validar que el campo sea uno de los permitidos
- Usar en `orderBy` de la query Prisma (reemplazando el default `[{ priority: "desc" }, { createdAt: "desc" }]`)
