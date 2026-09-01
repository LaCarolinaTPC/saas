---
type: session
title: "Estado de trabajo 2026-08-21"
created: 2026-08-21
updated: 2026-08-21
tags:
  - gestivo
  - liquidacion-conductor
  - supabase
  - continuidad
status: developing
related: []
sources: []
---

# Estado de trabajo 2026-08-21

## Objetivo en curso

Incorporar el módulo **Liquidación conductor Quincena**: consulta por código que muestra la producción diaria del período sin exponer tarjetas de resumen, base, saldos ni retiros. El acceso debe ser independiente de los módulos de liquidación consolidada y producción.

## Cambios locales pendientes de commit

- `src/app/(dashboard)/liquidacion-conductor-quincena/page.tsx`: nueva ruta `/liquidacion-conductor-quincena`, protegida con el permiso `liquidacion_conductor_quincena`; usa el rango de quincena actual por defecto y reutiliza el cálculo de liquidación.
- `src/app/(dashboard)/liquidacion/liquidacion-client.tsx`: parámetros reutilizables para ocultar el resumen, personalizar textos, título de Excel y tipo de auditoría. En el módulo nuevo se muestran solamente las filas diarias de producción y el Excel equivalente.
- `src/lib/constants.ts`: enlace de navegación para el módulo nuevo.
- `src/lib/permissions-shared.ts`: módulo, etiqueta, ruta de inicio y resolución de URL incorporados.
- `src/lib/devengados/actions.ts`: la auditoría de exportación permite el nuevo permiso.
- `supabase/migrations/046_modulo_liquidacion_conductor_quincena.sql`: crea el rol/módulo `liquidacion_conductor_quincena` y lo añade al administrador de forma idempotente.

## Validaciones realizadas

- `npm run lint`: correcto, sin errores.
- `npx tsc --noEmit`: correcto, sin errores.
- `git diff --check`: correcto; solo advierte la conversión automática LF a CRLF de cuatro archivos ya modificados.
- `npm run build`: se inició con Next.js 16.2.1 y Turbopack, pero la salida capturada terminó después de `Creating an optimized production build ...`; debe repetirse y confirmarse su finalización antes de publicar.

## Estado de Supabase

El archivo `.env` existe, pero el acceso de servidor no queda listo:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: presente.
- `NEXT_PUBLIC_SUPABASE_URL`: su formato actual no coincide con `https://<project-ref>.supabase.co` y debe corregirse.
- `SUPABASE_SERVICE_ROLE_KEY`: está vacía. Es necesaria para la resolución de permisos en servidor y en `proxy.ts`.

No se deben guardar claves en esta nota ni compartirlas en el chat.

## Próximo punto de continuación

1. Corregir `.env` o, preferiblemente, crear `.env.local` con una URL válida, la clave anónima y `SUPABASE_SERVICE_ROLE_KEY`.
2. Verificar conectividad con Supabase sin imprimir secretos.
3. Aplicar `supabase/migrations/046_modulo_liquidacion_conductor_quincena.sql` en el SQL Editor de Supabase.
4. Probar con un usuario que tenga solo el nuevo permiso: debe ver únicamente `/liquidacion-conductor-quincena`; no debe acceder a `/liquidacion` ni a `/produccion-conductor` salvo que tenga dichos permisos.
5. Repetir `npm run build` y confirmar que finalice correctamente.
6. Revisar el diff y crear commit solo cuando se autorice.
