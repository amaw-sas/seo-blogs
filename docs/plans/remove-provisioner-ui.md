# Plan: Quitar provisionador de blogs de la UI

**Fecha:** 2026-03-30
**Estado:** Pendiente

## Context

El provisionador de blogs (botón "Provisionar" + "Configurar tema") no se usará. Los blogs custom se crean manualmente con mejor diseño. Estos botones distraen la interfaz sin agregar valor.

## Cambios

### Archivo: `src/app/(admin)/sites/page.tsx`

1. Quitar botón "Provisionar nuevo blog" de la barra superior
2. Quitar botón "Configurar tema" de cada tarjeta de sitio
3. Quitar el Dialog de provisión completo (formulario + lógica)
4. Quitar estados relacionados: `provisionOpen`, `provisionForm`, `provisioning`, `theming`
5. Quitar imports no usados: `Rocket`, `Palette`, `KeyRound` (si ya no se usan en otro lado)

### Eliminar también (backend)
- `src/app/api/sites/provision/route.ts`
- `src/app/api/sites/[id]/theme/route.ts`
- `src/lib/ai/theme-generator.ts`
- `src/lib/blog/provisioner.ts`
- `src/lib/blog/blog-config-client.ts`

Eliminación completa: UI + backend. El código queda en git history si algún día se necesita.
