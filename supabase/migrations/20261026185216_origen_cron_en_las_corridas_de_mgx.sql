-- origen cron en las corridas de mgx
--
-- Contexto: la sincronización con MGX pasa a correr sola cada noche con un cron
-- de Vercel (/api/cron/sync-mgx, 4:00 am de Colombia, después de la réplica de
-- MGX de las 2:00). Cada corrida queda en mgx_corridas con su origen, y hasta
-- ahora solo se aceptaban 'manual' (la pantalla) y 'script' (la consola): sin
-- esta migración la primera corrida del cron falla al abrir su registro.
--
-- No crea tablas: solo cambia el CHECK de mgx_corridas.origen. Idempotente.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez.

-- El CHECK original se declaró en línea (20261021193546) y Postgres le puso
-- nombre solo. Se busca por su definición en vez de suponer el nombre.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'mgx_corridas'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%origen%'
  LOOP
    EXECUTE format('ALTER TABLE mgx_corridas DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE mgx_corridas
  ADD CONSTRAINT mgx_corridas_origen_check CHECK (origen IN ('manual', 'script', 'cron'));

COMMENT ON TABLE mgx_corridas IS
  'Bitácora de sincronizaciones de MGX, una fila por corrida (pantalla, consola o cron nocturno). Una en «corriendo» con actualizada_at reciente bloquea otra.';

-- Verificación: debe listar 'manual', 'script' y 'cron'.
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'mgx_corridas'::regclass AND contype = 'c';
