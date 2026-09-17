-- ausentismo: conceptos que cubren un rango de dias
--
-- Contexto. En el registro diario de ausentismo cada fila es un conductor
-- ausente UN día: la pestaña "Registro del día" busca por `fecha`. Desde
-- 20260902162916 la fila guarda además `fecha_inicio` y `fecha_fin`, pero
-- nadie los leía para armar la lista del día.
--
-- Con vacaciones eso no sirve: RRHH las diligencia una sola vez ("del 20/09 al
-- 05/10") y el conductor solo aparecía como ausente el día de inicio. Los
-- demás días quedaban en blanco o alguien lo volvía a registrar como novedad
-- nueva cada mañana.
--
-- Se marca el concepto, no la palabra: `cubre_rango` es una bandera más del
-- catálogo, como `cuenta_reincidencia` y `exige_soporte`. Queda encendida solo
-- en Vacaciones; si mañana Descanso, Licencia o Suspensión deben comportarse
-- igual, RRHH lo enciende desde la base sin otra migración.
--
-- Invariante que introduce el cambio: en un concepto con `cubre_rango`, el día
-- operativo `fecha` es siempre `fecha_inicio`. Así el registro nunca queda
-- escondido fuera de su propio rango. El formulario lo fuerza al guardar; aquí
-- se corrige lo que ya estaba registrado.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- No crea tablas: `ausentismo_conceptos` y `ausentismo_registros` ya tienen sus
-- privilegios y la columna nueva los hereda.

-- ── 1. La bandera del catálogo ───────────────────────────────────────────────
ALTER TABLE ausentismo_conceptos
  ADD COLUMN IF NOT EXISTS cubre_rango BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ausentismo_conceptos.cubre_rango IS
  'El registro ocupa todos los días entre fecha_inicio y fecha_fin: el ausente '
  'se presenta cada día del periodo y el formulario impide agregarlo otra vez. '
  'Exige fecha de terminación y fija fecha = fecha_inicio.';

UPDATE ausentismo_conceptos
  SET cubre_rango = true
  WHERE key = 'vacaciones' AND cubre_rango IS DISTINCT FROM true;

-- ── 2. El histórico al invariante ────────────────────────────────────────────
-- Vacaciones digitadas antes del día de inicio: el día operativo se mueve al
-- comienzo del periodo para que la fila no quede fuera de su propio rango.
UPDATE ausentismo_registros r
  SET fecha = r.fecha_inicio
  FROM ausentismo_conceptos c
  WHERE c.key = r.tipo
    AND c.cubre_rango
    AND r.fecha_inicio IS NOT NULL
    AND r.fecha < r.fecha_inicio;

-- Al revés (el día operativo quedó después del fin declarado) el rango es el
-- que está mal, no la fecha: se estira el fin hasta el día registrado en vez de
-- perder ese día de ausencia.
UPDATE ausentismo_registros r
  SET fecha_fin = r.fecha
  FROM ausentismo_conceptos c
  WHERE c.key = r.tipo
    AND c.cubre_rango
    AND r.fecha_fin IS NOT NULL
    AND r.fecha > r.fecha_fin;

-- ── 3. Índice de la consulta del día ─────────────────────────────────────────
-- La lista del día pasa a ser "empieza hoy" UNION "el rango cubre hoy"; esta
-- segunda mitad filtra por fecha_inicio <= hoy <= fecha_fin.
CREATE INDEX IF NOT EXISTS idx_ausentismo_registros_periodo
  ON ausentismo_registros (fecha_inicio, fecha_fin)
  WHERE fecha_fin IS NOT NULL;
