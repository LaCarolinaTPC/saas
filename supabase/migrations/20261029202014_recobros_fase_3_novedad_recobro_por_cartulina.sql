-- recobros fase 3 novedad recobro por cartulina
--
-- Contexto: en la revisión de cartulina, cuando la auxiliar de Tesorería ve
-- una diferencia de timbradas sin justificar, ella misma define el recobro
-- (requerimiento de Tesorería del 28-oct-2026). Hasta ahora eso quedaba como
-- la marca «No justificado — cobrar/descontar» y no llegaba a caja.
--
-- La novedad nueva «Recobro por cartulina» lleva la marca `genera_recobro`:
-- al guardarla, la auxiliar escribe la diferencia sin justificar y la
-- observación, y Gestivo abre el recobro ya resuelto (tipo cartulina) para
-- que caja lo gestione. No reemplaza a «No justificado»: esa marca conserva su
-- sentido histórico y no crea recobros.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).

ALTER TABLE tesoreria_revision_novedades
  ADD COLUMN IF NOT EXISTS genera_recobro BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tesoreria_revision_novedades.genera_recobro IS
  'Al marcar un viaje con esta novedad se abre un recobro por cartulina (diferencia sin justificar que digita la auxiliar). Solo la novedad de sistema recobro_cartulina.';

INSERT INTO tesoreria_revision_novedades (clave, nombre, orden, envia_a_camaras, es_sistema, genera_recobro)
VALUES ('recobro_cartulina', 'Recobro por cartulina', 65, false, true, true)
ON CONFLICT (clave) DO UPDATE SET genera_recobro = true, es_sistema = true;

-- Verificación:
-- SELECT clave, nombre, activo, envia_a_camaras, genera_recobro FROM tesoreria_revision_novedades ORDER BY orden;
