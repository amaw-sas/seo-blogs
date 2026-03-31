# Plan: Base de conocimiento como sección separada

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

La base de conocimiento está actualmente como un textarea al final del formulario de sitio. Es un campo importante que determina la calidad y especificidad del contenido generado, pero no tiene guía sobre cómo llenarlo ni estructura.

## Propuesta

Sacar la base de conocimiento del formulario de sitio y crear una sección dedicada:

### Opción: Tab o página `/sites/[id]/knowledge`

- Página dedicada con instrucciones claras de qué poner
- Campos estructurados sugeridos (no obligatorios):
  - Nombre del negocio
  - Qué vende/ofrece
  - Ubicaciones / zonas de servicio
  - Precios o rangos
  - Diferenciadores
  - Datos de contacto
  - Restricciones o políticas
  - Tono de comunicación
- Textarea libre al final para info adicional
- Preview de cómo se ve el prompt final con la info ingresada
- Indicador de longitud (tokens estimados) para que el usuario sepa si es demasiado

### Notas sobre costo
- 500 palabras de knowledge base ≈ $0.18/mes extra (insignificante)
- El límite práctico es de calidad, no costo — demasiado texto irrelevante distrae al modelo
- Recomendación: máximo ~1000 palabras, enfocado en lo que diferencia al negocio

### Archivos a modificar
- `src/app/(admin)/sites/page.tsx` — remover textarea de knowledge base del form
- `src/app/(admin)/sites/[id]/knowledge/page.tsx` — nueva página
- `src/app/api/sites/[id]/route.ts` — ya soporta PUT con knowledgeBase
