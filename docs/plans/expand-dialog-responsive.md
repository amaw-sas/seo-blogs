# Plan: Modal de expandir keywords no se adapta al tamaño

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

El dialog de "Expandir keywords" no se adapta bien al contenido. Las frases largas hacen que la tabla se desborde del modal. Se necesita que el dialog sea más ancho y que las frases se ajusten.

## Cambios

### Archivo: `src/app/(admin)/keywords/page.tsx`

1. Cambiar `max-w-lg` del DialogContent a `max-w-2xl` para dar más espacio
2. Agregar `break-words` o `whitespace-normal` a las celdas de frase para que el texto se ajuste
3. Asegurar que en pantallas pequeñas el dialog ocupe casi todo el ancho disponible
