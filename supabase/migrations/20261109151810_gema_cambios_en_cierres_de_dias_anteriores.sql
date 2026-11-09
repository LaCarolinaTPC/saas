-- gema cambios en cierres de dias anteriores
--
-- Contexto. GEMA modifica cierres de días ya pasados (le cambia la producción
-- o el salario a un conductor, rehace o borra filas) y la sincronización los
-- sobrescribía en silencio: cada corrida relee los últimos 45 días, hace upsert
-- y borra lo que GEMA ya no reporta, sin dejar constancia del valor anterior.
-- Ya pasó con el 27 y 28-oct-2026 (289 filas, $19,3 M de neto) y volvió a
-- pasar después; en ambos casos nadie en Gestivo se enteró a tiempo.
--
-- Qué hace: gema_cambios_cierres guarda, por cada cierre de hace más de 2 días
-- que cambió en dinero o producción, el valor de antes y el de después, para
-- que Tesorería lo revise en Parámetros y Liquidación Producción avise.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. Las tablas nuevas no heredan privilegios: el GRANT va aquí.
-- Sin esta migración la sincronización sigue funcionando, solo no registra.

CREATE TABLE IF NOT EXISTS gema_cambios_cierres (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Corrida que lo detectó (gema_corridas.id). Sin FK: la bitácora es opcional.
  corrida_id       BIGINT,
  detectado_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha            DATE NOT NULL,
  cod_conductor    TEXT NOT NULL,
  conductor_nombre TEXT,
  ruta             TEXT NOT NULL DEFAULT '',
  tipo             TEXT NOT NULL CHECK (tipo IN ('modificado', 'nuevo', 'borrado')),
  -- {"salario_neto_dia": [antes, despues], …}: solo los campos que cambiaron.
  cambios          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- salario_neto_dia después − antes (nulos como 0).
  delta_neto       NUMERIC NOT NULL DEFAULT 0,
  revisado_at      TIMESTAMPTZ,
  revisado_por     TEXT
);

CREATE INDEX IF NOT EXISTS idx_gema_cambios_cierres_pendientes
  ON gema_cambios_cierres (fecha) WHERE revisado_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_gema_cambios_cierres_detectado
  ON gema_cambios_cierres (detectado_at DESC);

ALTER TABLE gema_cambios_cierres ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gema_cambios_cierres FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE gema_cambios_cierres TO service_role;

COMMENT ON TABLE gema_cambios_cierres IS
  'Cierres de días anteriores (más de 2 días) que GEMA cambió después de sincronizados: valor de antes y de después. Se revisan en Tesorería › Parámetros.';
