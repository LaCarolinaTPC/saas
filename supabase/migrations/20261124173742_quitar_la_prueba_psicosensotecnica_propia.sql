-- Quitar la prueba psicosensotécnica propia
--
-- Contexto: la prueba psicosensotécnica se presenta en una plataforma externa
-- que necesita el correo del aspirante (migración siguiente, 20261124173744).
-- La batería propia de Gestivo (bandeja de la psicóloga, prueba pública por
-- cédula, rol «Psicóloga») y la cita psicosensotécnica con su recordatorio se
-- quitaron del código el 24-nov-2026. Se conserva el resultado que registra
-- Gestión Humana (procesos_contratacion.psicotecnica_*) y el requisito para
-- contratar (ajuste contratar_exige_psicotecnica).
--
-- Las migraciones de la prueba propia (20261120170136 y 20261120212346) se
-- borraron del repositorio porque solo se aplicaron en la base de desarrollo:
-- en producción este script no encuentra nada que borrar y no hace daño.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar.

-- ── 1. Tablas de la prueba propia (se pierden los intentos de prueba) ──────
DROP TABLE IF EXISTS psico_intento_pruebas;
DROP TABLE IF EXISTS psico_intentos;
DROP TABLE IF EXISTS psico_equipos;
DROP TABLE IF EXISTS psico_config;

-- ── 2. Rol «Psicóloga» y permisos del módulo ───────────────────────────────
-- Borrar el rol quita también sus permisos y a quien lo tuviera asignado
-- (rol_permisos y usuario_roles tienen ON DELETE CASCADE).
DO $$
BEGIN
  IF to_regclass('public.roles') IS NOT NULL THEN
    DELETE FROM roles WHERE clave = 'psicologa';
  END IF;
  IF to_regclass('public.rol_permisos') IS NOT NULL THEN
    DELETE FROM rol_permisos WHERE permiso LIKE 'psicosensotecnica.%' OR permiso LIKE 'psicosensotecnica:%' OR permiso LIKE '%psico_config%';
  END IF;
  IF to_regclass('public.usuario_permisos') IS NOT NULL THEN
    DELETE FROM usuario_permisos WHERE permiso LIKE 'psicosensotecnica.%' OR permiso LIKE 'psicosensotecnica:%' OR permiso LIKE '%psico_config%';
  END IF;
  -- El catálogo de permisos lo sincroniza la aplicación; lo que ya no está en el código se marca obsoleto.
  IF to_regclass('public.permisos') IS NOT NULL THEN
    UPDATE permisos SET obsoleto = true WHERE modulo = 'psicosensotecnica';
  END IF;
END $$;

-- ── 3. Recordatorio de la cita psicosensotécnica ───────────────────────────
-- Ya no hay cita: el mensaje del catálogo sobra.
DELETE FROM seleccion_mensajes WHERE clave = 'recordatorio_psicotecnica';

-- Citas psicosensotécnicas que quedaron programadas: se cancelan para que no
-- aparezcan en la agenda (el historial las conserva).
UPDATE seleccion_citas SET estado = 'cancelada'
WHERE tipo = 'psicotecnica' AND estado IN ('programada', 'confirmada');

-- Comprobación: todo en NULL y 0.
SELECT to_regclass('public.psico_intentos') AS intentos,
       to_regclass('public.psico_config') AS config,
       (SELECT count(*) FROM seleccion_mensajes WHERE clave = 'recordatorio_psicotecnica') AS mensaje_recordatorio;
