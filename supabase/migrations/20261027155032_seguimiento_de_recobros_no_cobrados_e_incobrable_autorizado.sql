-- seguimiento de recobros no cobrados e incobrable autorizado
--
-- Contexto: hasta ahora caja cerraba el recobro con "No se cobró" y un motivo,
-- y nadie volvía a mirarlo. Tesorería pidió que un recobro sin cobrar quede
-- abierto con un histórico de gestiones (fecha, qué se hizo y próxima fecha)
-- hasta que caja lo cobre, y que darlo por perdido ("incobrable") solo lo
-- autorice la directora de tesorería (sub-función recobros_incobrable). Con
-- esas fechas salen los indicadores de días de atención.
--
-- Los "no_cobrado" que ya existen vuelven a quedar abiertos: su motivo pasa a
-- ser su primera gestión (origen 'migracion') y caja decide si sigue o pide el
-- incobrable.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

BEGIN;

-- ── Gestiones de caja sobre un recobro abierto ───────────────────────────────
CREATE TABLE IF NOT EXISTS tesoreria_camaras_recobro_gestiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES tesoreria_camaras_solicitudes(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  gestion TEXT NOT NULL CHECK (length(trim(gestion)) BETWEEN 1 AND 500),
  proxima_fecha DATE CHECK (proxima_fecha IS NULL OR proxima_fecha >= fecha),
  origen TEXT NOT NULL DEFAULT 'caja' CHECK (origen IN ('caja', 'migracion')),
  usuario_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tesoreria_camaras_recobro_gestiones IS
  'Gestiones de caja sobre un recobro de cámaras que no se ha cobrado: fecha, qué se hizo y próxima fecha. Histórico hasta el cobro o el incobrable autorizado.';

CREATE INDEX IF NOT EXISTS idx_tes_cam_recobro_gestiones_solicitud
  ON tesoreria_camaras_recobro_gestiones (solicitud_id, fecha, created_at);

ALTER TABLE tesoreria_camaras_recobro_gestiones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tesoreria_camaras_recobro_gestiones TO service_role;

-- ── Resumen de gestiones y flujo del incobrable en la solicitud ──────────────
-- El resumen (n.º, última fecha y próxima) evita leer todas las gestiones para
-- la alarma; lo mantiene la acción que registra cada gestión.
ALTER TABLE tesoreria_camaras_solicitudes
  ADD COLUMN IF NOT EXISTS gestiones_n INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gestion_ultima_fecha DATE,
  ADD COLUMN IF NOT EXISTS gestion_proxima_fecha DATE,
  ADD COLUMN IF NOT EXISTS incobrable_motivo TEXT,
  ADD COLUMN IF NOT EXISTS incobrable_solicitado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS incobrable_solicitado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS incobrable_autorizado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS incobrable_autorizado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS incobrable_rechazo_nota TEXT,
  ADD COLUMN IF NOT EXISTS incobrable_rechazado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS incobrable_rechazado_at TIMESTAMPTZ;

-- ── Los "no_cobrado" pasan a seguimiento ─────────────────────────────────────
ALTER TABLE tesoreria_camaras_solicitudes
  DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_cobro_check;

INSERT INTO tesoreria_camaras_recobro_gestiones (solicitud_id, fecha, gestion, origen, usuario_email, created_at)
SELECT s.id,
       coalesce((s.cobro_at AT TIME ZONE 'America/Bogota')::date, current_date),
       left('No cobrado: ' || coalesce(nullif(trim(s.cobro_motivo), ''), 'sin motivo')
            || coalesce(' · ' || nullif(trim(s.cobro_nota), ''), ''), 500),
       'migracion',
       s.cobro_por_email,
       coalesce(s.cobro_at, now())
  FROM tesoreria_camaras_solicitudes s
 WHERE s.cobro_estado = 'no_cobrado'
   AND NOT EXISTS (
     SELECT 1 FROM tesoreria_camaras_recobro_gestiones g
      WHERE g.solicitud_id = s.id AND g.origen = 'migracion');

ALTER TABLE tesoreria_camaras_solicitudes_eventos
  DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_eventos_accion_check;
ALTER TABLE tesoreria_camaras_solicitudes_eventos
  ADD CONSTRAINT tesoreria_camaras_solicitudes_eventos_accion_check CHECK (accion IN (
    'visto', 'cobro_registrado', 'cobro_corregido', 'migrado_a_seguimiento',
    'incobrable_solicitado', 'incobrable_autorizado', 'incobrable_rechazado', 'incobrable_reabierto'
  ));

INSERT INTO tesoreria_camaras_solicitudes_eventos (solicitud_id, accion, antes, despues, usuario_email)
SELECT s.id, 'migrado_a_seguimiento',
       jsonb_build_object('estado', s.cobro_estado, 'motivo', s.cobro_motivo, 'nota', s.cobro_nota),
       jsonb_build_object('estado', null),
       'migracion 20261027155032'
  FROM tesoreria_camaras_solicitudes s
 WHERE s.cobro_estado = 'no_cobrado';

UPDATE tesoreria_camaras_solicitudes
   SET cobro_estado = NULL, cobro_motivo = NULL, cobro_nota = NULL, cobro_por_email = NULL, cobro_at = NULL
 WHERE cobro_estado = 'no_cobrado';

-- Resumen de gestiones de todo lo que ya tenga (las migradas).
UPDATE tesoreria_camaras_solicitudes s
   SET gestiones_n = g.n, gestion_ultima_fecha = g.ultima
  FROM (SELECT solicitud_id, count(*)::int AS n, max(fecha) AS ultima
          FROM tesoreria_camaras_recobro_gestiones GROUP BY solicitud_id) g
 WHERE g.solicitud_id = s.id;

-- ── Reglas nuevas del cobro ──────────────────────────────────────────────────
-- Cobrado: valor, fecha y recibo. Incobrable: motivo y autorización de la
-- directora; ni por fuera de la app se puede saltar la autorización.
ALTER TABLE tesoreria_camaras_solicitudes
  ADD CONSTRAINT tesoreria_camaras_solicitudes_cobro_check CHECK (
    cobro_estado IS NULL
    OR (cobro_estado = 'cobrado'
        AND resultado = 'recobro'
        AND cobro_valor > 0
        AND cobro_fecha IS NOT NULL
        AND length(trim(coalesce(cobro_soporte, ''))) BETWEEN 1 AND 100)
    OR (cobro_estado = 'incobrable'
        AND resultado = 'recobro'
        AND length(trim(coalesce(incobrable_motivo, ''))) BETWEEN 1 AND 500
        AND incobrable_autorizado_por_email IS NOT NULL
        AND incobrable_autorizado_at IS NOT NULL)
  );

-- Una solicitud de incobrable trae motivo y quién la pidió.
ALTER TABLE tesoreria_camaras_solicitudes
  DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_incobrable_check;
ALTER TABLE tesoreria_camaras_solicitudes
  ADD CONSTRAINT tesoreria_camaras_solicitudes_incobrable_check CHECK (
    incobrable_solicitado_at IS NULL
    OR (length(trim(coalesce(incobrable_motivo, ''))) BETWEEN 1 AND 500
        AND incobrable_solicitado_por_email IS NOT NULL)
  );

COMMIT;

-- Verificación:
-- SELECT cobro_estado, count(*) FROM tesoreria_camaras_solicitudes
--  WHERE resultado = 'recobro' GROUP BY 1;                       -- ya no hay no_cobrado
-- SELECT count(*) FROM tesoreria_camaras_recobro_gestiones
--  WHERE origen = 'migracion';                                   -- = los no_cobrado que había
-- La sub-función recobros_incobrable no se concede a ningún tipo: se le asigna
-- a la directora de tesorería en Usuarios (permisos individuales).
