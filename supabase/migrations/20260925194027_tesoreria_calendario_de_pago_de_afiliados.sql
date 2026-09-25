-- tesoreria calendario de pago de afiliados
--
-- Contexto: la liquidación de afiliados de Tesorería (formato GAF-R-12 de
-- GEMA) se paga según propietarios.plazo_pago, pero GEMA no arma los periodos:
-- quien imprime el reporte escoge el rango a mano. Tesorería definió el
-- 2026-09-25 la regla: SEMANAL de lunes a domingo; "DECADA" en GEMA es en
-- realidad quincenal (1-15 y 16-fin de mes); se paga el martes siguiente al
-- corte y, si ese lunes o ese martes es festivo, el miércoles. La regla debe
-- poder cambiarse sin tocar código, así que vive en esta tabla. Los festivos
-- de Colombia se calculan en la aplicación (src/lib/tesoreria/calendario-pago.ts).
--
-- Días de la semana en numeración ISO: 1 = lunes … 7 = domingo.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: el script corre entero de una vez y es
-- idempotente. La aplicación la lee con service_role, que aquí no hereda
-- privilegios: el GRANT va al final.

BEGIN;

CREATE TABLE IF NOT EXISTS tesoreria_calendario_pago (
  -- Valor tal cual llega de GEMA en propietarios.plazo_pago.
  plazo                      TEXT PRIMARY KEY CHECK (plazo IN ('SEMANAL', 'DECADA')),
  etiqueta                   TEXT NOT NULL,
  -- SEMANAL: día ISO en que cierra la semana (7 = domingo).
  -- DECADA (quincenal): día del mes en que cierra la primera quincena (15);
  -- la segunda cierra el último día del mes.
  dia_corte                  SMALLINT NOT NULL,
  -- Día ISO en que se paga, el primero que llega después del corte.
  dia_pago                   SMALLINT NOT NULL DEFAULT 2 CHECK (dia_pago BETWEEN 1 AND 7),
  -- Día ISO al que se corre el pago cuando aplica una de las dos reglas de festivo.
  dia_pago_alterno           SMALLINT NOT NULL DEFAULT 3 CHECK (dia_pago_alterno BETWEEN 1 AND 7),
  correr_si_lunes_festivo    BOOLEAN NOT NULL DEFAULT true,
  correr_si_dia_pago_festivo BOOLEAN NOT NULL DEFAULT true,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_por_email          TEXT,
  CONSTRAINT tesoreria_calendario_corte_valido CHECK (
    (plazo = 'SEMANAL' AND dia_corte BETWEEN 1 AND 7)
    OR (plazo = 'DECADA' AND dia_corte BETWEEN 1 AND 27)
  )
);

COMMENT ON TABLE tesoreria_calendario_pago IS
  'Regla de pago de la liquidación de afiliados por plazo (propietarios.plazo_pago). DECADA en GEMA es quincenal. Días ISO: 1 = lunes … 7 = domingo.';

INSERT INTO tesoreria_calendario_pago (plazo, etiqueta, dia_corte, dia_pago, dia_pago_alterno)
VALUES
  ('SEMANAL', 'Semanal',   7,  2, 3),
  ('DECADA',  'Quincenal', 15, 2, 3)
ON CONFLICT (plazo) DO NOTHING;

ALTER TABLE tesoreria_calendario_pago ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tesoreria_calendario_pago FROM anon, authenticated, public;
GRANT ALL ON tesoreria_calendario_pago TO service_role;

-- La pantalla es de Tesorería: su tipo restringe sub-funciones
-- (caja, analisis, entregas), así que la nueva se le añade. Los tipos sin
-- restricción (admin, rrhh) ya la ven. Cambiar el calendario sigue exigiendo
-- la sub-función "parametros", que este tipo no tiene.
UPDATE user_types
   SET submodulos = jsonb_set(
         submodulos, '{tesoreria}',
         (submodulos -> 'tesoreria') || '["liq_afiliados"]'::jsonb)
 WHERE key = 'tesoreria'
   AND jsonb_typeof(submodulos -> 'tesoreria') = 'array'
   AND NOT (submodulos -> 'tesoreria') ? 'liq_afiliados';

COMMIT;

-- Verificación (debe devolver dos filas: SEMANAL y DECADA):
-- SELECT plazo, etiqueta, dia_corte, dia_pago, dia_pago_alterno,
--        correr_si_lunes_festivo, correr_si_dia_pago_festivo
--   FROM tesoreria_calendario_pago ORDER BY plazo DESC;
-- Y el tipo tesoreria debe listar liq_afiliados:
-- SELECT submodulos -> 'tesoreria' FROM user_types WHERE key = 'tesoreria';
