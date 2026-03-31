# Plan: Cambiar colores de estados de keywords

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

Los colores actuales no son intuitivos:
- Disponible (pending) → amarillo (parece advertencia)
- Usada (used) → verde (parece positivo pero ya no está disponible)
- Omitida (skipped) → gris

Con la eliminación de keywords el estado "skipped" desaparece. Los colores deben reflejar:
- Disponible = lista para usar = positivo
- Usada = ya se consumió = neutro

## Cambios

### Archivo: `src/app/(admin)/keywords/page.tsx`

Cambiar `statusColors`:
```typescript
const statusColors: Record<string, string> = {
  pending: "bg-green-100 text-green-800",   // Disponible → verde (lista para usar)
  used: "bg-gray-100 text-gray-800",        // Usada → gris (ya consumida)
};
```

Eliminar la entrada `skipped` del mapa de colores y labels (las omitidas se eliminan en vez de marcarse).
