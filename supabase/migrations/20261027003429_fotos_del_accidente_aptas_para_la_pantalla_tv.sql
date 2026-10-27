-- fotos del accidente aptas para la pantalla tv
--
-- Contexto: el carrusel «Accidentes de ayer» de la pantalla TV muestra, después
-- de cada accidente, sus fotos. Pero entre las fotos del reporte hay fotos de
-- documentos (cédulas, licencias, SOAT: visto el 2026-10-26) y la pantalla es
-- pública. Las fotos no tienen tipo, así que alguien con permiso de edición en
-- Accidentabilidad marca en el detalle cuáles se pueden mostrar. Solo esas
-- salen en el TV; sin marcar, ninguna.
--
-- Solo agrega una columna a `accidentes` (que ya tiene sus GRANT). Idempotente.

ALTER TABLE public.accidentes
  ADD COLUMN IF NOT EXISTS fotos_pantalla TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.accidentes.fotos_pantalla IS
  'Rutas de `fotos` aprobadas para la pantalla TV (nunca documentos). Las marca quien edita Accidentabilidad en el detalle del accidente.';

-- Verificación: debe devolver la columna.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'accidentes' AND column_name = 'fotos_pantalla';
