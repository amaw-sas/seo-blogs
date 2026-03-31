# Plan: Mostrar keyword recién creada después de agregarla

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

Al agregar una keyword nueva desde el dialog "Agregar", la lista se refresca pero la keyword nueva queda perdida entre las demás (ordenadas por prioridad desc, fecha desc). El usuario no puede verificar que se creó correctamente.

## Opciones

### Opción A: Filtrar automáticamente después de crear
- Al crear exitosamente, aplicar filtro por sitio + estado "pending" + ordenar por fecha desc
- La keyword recién creada aparece primera en la lista

### Opción B: Navegar a la keyword creada
- Después de crear, calcular en qué página está la keyword y navegar ahí
- Más complejo, menos útil

### Opción C: Mensaje con la keyword creada visible
- Mostrar un toast/banner con la frase creada y un link "Ver" que aplica los filtros

## Recomendación

Opción A — es la más simple y útil. Al cerrar el dialog después de crear:
1. Setear `siteFilter` al sitio seleccionado
2. Setear `statusFilter` a "pending"
3. Setear `page` a 1
4. El fetchKeywords se ejecuta automáticamente y la keyword aparece arriba

### Archivo a modificar
- `src/app/(admin)/keywords/page.tsx` — en `handleAddKeyword()`, después del éxito, aplicar filtros
