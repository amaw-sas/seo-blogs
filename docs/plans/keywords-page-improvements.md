# Plan: Mejoras a la página de Keywords

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

La página de Keywords (`/keywords`) tiene varios problemas de UX reportados:
1. No se pueden agregar keywords manualmente (solo CSV)
2. El paginador es fijo a 20, sin opción de cambiar cantidad
3. El filtro de estados muestra valores en inglés ("skipped") en el selector
4. El selector de sitios será inmanejable con muchos blogs
5. Keywords con estado "used" no permiten acciones (no se pueden reactivar)
6. La expansión crea keywords directamente sin permitir revisión previa
7. No hay control sobre cuántas keywords genera la expansión

## Cambios planificados

### Archivos a modificar
- `src/app/(admin)/keywords/page.tsx` — todos los cambios de UI
- `src/app/api/keywords/route.ts` — aumentar límite máximo de paginación
- `src/app/api/keywords/expand/route.ts` — agregar parámetros `maxPerSeed` y `dryRun`

### 1. Botón "Agregar keyword" manualmente

Agregar un Dialog con:
- Select de sitio (requerido)
- Input de frase (requerido)
- Input de prioridad (numérico, default 0)
- POST a `/api/keywords` con `{ siteId, phrase, priority }`

Ubicación: junto a "Importar CSV" y "Expandir" en la barra superior. Icono: `Plus`.

### 2. Selector de cantidad por página

Reemplazar `const limit = 20` por `useState` con selector.
Opciones: 10 (default), 20, 50, 100, 200.
Ubicar un Select pequeño junto a la paginación: "Mostrar: [10 ▾] por página".

Modificar API: cambiar `Math.min(100, ...)` a `Math.min(200, ...)` en `/api/keywords/route.ts`.

### 3. Filtro de estados en español

El Select de estados ya usa `statusLabels` para las opciones del dropdown (Pendiente, Usada, Omitida) — eso funciona. El bug está en el `SelectValue` que muestra el valor crudo (`skipped`) cuando se selecciona. Solución: resolver el label en el SelectValue con `statusLabels[statusFilter]` de la misma forma que se resuelve el sitio con `resolveSiteLabel`.

### 4. Selector de sitios con búsqueda

Con pocos sitios el Select actual funciona. Para escalar a 40+, cambiar a un input con filtro tipo combobox:
- Agregar un Input de búsqueda dentro del SelectContent que filtre los sitios en tiempo real
- Mantener el Select de shadcn pero agregar un campo de búsqueda al inicio del dropdown

### 5. Acciones para keywords "used" y "skipped"

Actualmente solo "pending" muestra acciones. Agregar:
- **used** → botón para reactivar (volver a "pending") con icono `RotateCcw`
- **skipped** → botón para reactivar (volver a "pending") con icono `RotateCcw`

Esto permite al admin recuperar keywords descartadas o reusar keywords ya publicadas.

### 6. Expansión con preview y aprobación

Cambiar el flujo de expansión:

**Antes:** Click "Expandir" → se crean las keywords directamente → mensaje "10 keywords creadas"

**Después:**
1. Click "Expandir" → abre Dialog de configuración
2. Dialog muestra: cantidad a generar (Select: 5 o 10, default 5), botón "Generar sugerencias"
3. Al generar: llama al endpoint expand con `dryRun=true` para retornar sin guardar
4. Muestra tabla con las keywords sugeridas + prioridad + checkbox para cada una (todas marcadas por defecto)
5. El usuario desmarca las que no quiere
6. Botón "Crear seleccionadas" → POST a `/api/keywords` con las elegidas
7. Al confirmar: filtrar por las keywords recién creadas para verlas

Modificar `/api/keywords/expand/route.ts`: agregar parámetro `dryRun` (boolean) y `maxPerSeed` (number). Si `dryRun=true`, retornar las keywords sugeridas sin insertarlas.

### 7. Columna "Prioridad" — explicación visual

Agregar tooltip o título a la columna "Prioridad" que explique: mayor número = se usa primero.
Valores típicos: 0 (normal), 1-5 (media), 6-10 (alta).

## Verificación

1. `npm run test` — todos los tests existentes pasan
2. `npx tsc --noEmit` — sin errores de tipo
3. Verificación manual en `/keywords`:
   - Agregar keyword manual → aparece en la tabla
   - Cambiar paginador a 50 → muestra 50 resultados
   - Filtrar por estado → muestra label en español en el selector
   - Buscar sitio en dropdown → filtra mientras escribes
   - Click reactivar en keyword "used" → vuelve a "pending"
   - Expandir → muestra preview → seleccionar 3 de 5 → crear → aparecen filtradas
