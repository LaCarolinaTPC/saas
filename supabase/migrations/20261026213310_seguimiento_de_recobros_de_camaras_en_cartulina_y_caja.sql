-- seguimiento de recobros de camaras en cartulina y caja
--
-- Contexto: la respuesta de cámaras (Recobro / Normalidad de timbradas) solo se
-- veía abriendo el viaje en la revisión de su día, y cámaras suele resolver
-- días después: nadie en cartulina se enteraba. Del recobro tampoco quedaba si
-- caja lo cobró. Esta migración guarda que cartulina vio la respuesta (para la
-- alarma) y el seguimiento de caja del cobro al conductor, con su historial.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- ── Visto en cartulina (alarma) ──────────────────────────────────────────────
ALTER TABLE tesoreria_camaras_solicitudes
  ADD COLUMN IF NOT EXISTS visto_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visto_por_email TEXT;

-- ── Seguimiento de caja del recobro (se cobra al conductor del viaje) ────────
ALTER TABLE tesoreria_camaras_solicitudes
  ADD COLUMN IF NOT EXISTS cobro_estado TEXT,
  ADD COLUMN IF NOT EXISTS cobro_valor NUMERIC(14, 0),
  ADD COLUMN IF NOT EXISTS cobro_fecha DATE,
  ADD COLUMN IF NOT EXISTS cobro_soporte TEXT,
  ADD COLUMN IF NOT EXISTS cobro_motivo TEXT,
  ADD COLUMN IF NOT EXISTS cobro_nota TEXT,
  ADD COLUMN IF NOT EXISTS cobro_por_email TEXT,
  ADD COLUMN IF NOT EXISTS cobro_at TIMESTAMPTZ;

-- Las reglas de la app también viven aquí: un cobro sin valor, fecha o soporte,
-- o un "no cobrado" sin motivo, no se puede guardar ni por fuera de la app.
ALTER TABLE tesoreria_camaras_solicitudes
  DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_cobro_check;
ALTER TABLE tesoreria_camaras_solicitudes
  ADD CONSTRAINT tesoreria_camaras_solicitudes_cobro_check CHECK (
    cobro_estado IS NULL
    OR (cobro_estado = 'cobrado'
        AND resultado = 'recobro'
        AND cobro_valor > 0
        AND cobro_fecha IS NOT NULL
        AND length(trim(coalesce(cobro_soporte, ''))) BETWEEN 1 AND 100)
    OR (cobro_estado = 'no_cobrado'
        AND resultado = 'recobro'
        AND length(trim(coalesce(cobro_motivo, ''))) BETWEEN 1 AND 500)
  );
ALTER TABLE tesoreria_camaras_solicitudes
  DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_cobro_nota_check;
ALTER TABLE tesoreria_camaras_solicitudes
  ADD CONSTRAINT tesoreria_camaras_solicitudes_cobro_nota_check CHECK (
    cobro_nota IS NULL OR length(cobro_nota) <= 500
  );

-- La bandeja de caja filtra por recobros sin gestión.
CREATE INDEX IF NOT EXISTS idx_tes_cam_solic_cobro
  ON tesoreria_camaras_solicitudes (resultado, cobro_estado);

-- ── Historial: cada visto y cada guardado del cobro, con antes y después ─────
CREATE TABLE IF NOT EXISTS tesoreria_camaras_solicitudes_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES tesoreria_camaras_solicitudes(id) ON DELETE CASCADE,
  accion TEXT NOT NULL CHECK (accion IN ('visto', 'cobro_registrado', 'cobro_corregido')),
  antes JSONB,
  despues JSONB,
  usuario_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tesoreria_camaras_solicitudes_eventos IS
  'Historial de las solicitudes a cámaras: visto en Revisión cartulina y cada registro o corrección del cobro de caja (antes/después).';

CREATE INDEX IF NOT EXISTS idx_tes_cam_solic_eventos_solicitud
  ON tesoreria_camaras_solicitudes_eventos (solicitud_id, created_at);

ALTER TABLE tesoreria_camaras_solicitudes_eventos ENABLE ROW LEVEL SECURITY;

-- En esta instalación los privilegios no se heredan: se conceden a mano.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tesoreria_camaras_solicitudes_eventos TO service_role;
