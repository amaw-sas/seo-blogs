# Plan: Eliminar keywords (individual y en lote)

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

No hay forma de eliminar keywords desde el admin. Las keywords omitidas o de prueba se acumulan sin poder borrarlas. El estado "skipped" no aporta valor — el pipeline ya verifica canibalización en cada ejecución.

## Cambios

### Frontend: `src/app/(admin)/keywords/page.tsx`
- Botón Trash2 en columna Acciones de cada keyword (todos los estados, no solo pending)
- Al click: DELETE `/api/keywords/[id]` → refrescar lista (sin confirmación para una sola)
- Botón "Eliminar seleccionadas" cuando hay checkboxes marcados
- Al click en lote: confirmación "¿Eliminar X keywords?" → DELETE cada una → refrescar

### Backend: `src/app/api/keywords/[id]/route.ts`
- Verificar que ya tenga DELETE handler (probablemente sí)

### Consideración futura
- Evaluar si el estado "skipped" debería eliminarse del enum y simplificar a solo "pending" y "used"
