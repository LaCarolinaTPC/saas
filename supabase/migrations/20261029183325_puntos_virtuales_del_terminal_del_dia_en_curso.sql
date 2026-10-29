-- puntos virtuales del terminal del dia en curso
--
-- Contexto. Revisión cartulina cruza cada viaje con los eventos de entrada y
-- salida de la geocerca del terminal (puntos virtuales de GEMA). GEMA los
-- registra en tiempo real (medido: 5–7 s de atraso), pero mientras el día está
-- en curso les da números PROVISIONALES que reutilizan rangos viejos, y solo al
-- cerrar el día los renumera en la serie definitiva. Como `puntos_virtuales`
-- usa el número como llave, lo provisional choca con días ya guardados y se
-- descarta (el 29/10 a las 08:42, 34.646 de 36.151): la revisión de hoy no
-- tenía datos del terminal.
--
-- Qué hace: `pv_terminal_hoy` guarda SOLO los eventos de entrada y salida del
-- terminal del día en curso (unos 2.000 al día), identificados por el equipo
-- (IMEI), la hora y el tipo de evento en vez del número provisional. Se llena
-- desde Revisión cartulina mientras alguien la mira; los días que ya llegaron
-- cerrados a `puntos_virtuales` se borran de aquí. Los días cerrados se leen
-- siempre de `puntos_virtuales`.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. Las tablas nuevas no heredan privilegios: el GRANT va aquí.

CREATE TABLE IF NOT EXISTS pv_terminal_hoy (
  fecha            DATE NOT NULL,
  imei             TEXT NOT NULL,
  fecha_hora       TIMESTAMPTZ NOT NULL,
  descripcion      TEXT NOT NULL,
  hora             TEXT,
  placa            TEXT,
  codigo_vehiculo  TEXT,
  subidas          INTEGER,
  bajadas          INTEGER,
  registradora     INTEGER,
  -- El número provisional que traía GEMA, solo informativo: no es estable.
  numero_provisional BIGINT,
  sincronizado_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (imei, fecha_hora, descripcion)
);
CREATE INDEX IF NOT EXISTS idx_pv_terminal_hoy_fecha ON pv_terminal_hoy (fecha);

ALTER TABLE pv_terminal_hoy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pv_terminal_hoy FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pv_terminal_hoy TO service_role;

COMMENT ON TABLE pv_terminal_hoy IS
  'Eventos de entrada/salida de la geocerca del terminal del día en curso, casi en tiempo real (Revisión cartulina). Provisional: los días cerrados se leen de puntos_virtuales y se borran de aquí.';

-- Estado y candado del refresco del día (misma técnica que el despacho del día).
INSERT INTO gema_sync_state (dataset) VALUES ('cartulina_hoy')
ON CONFLICT (dataset) DO NOTHING;

-- Verificación.
SELECT to_regclass('public.pv_terminal_hoy') AS tabla,
       (SELECT count(*) FROM gema_sync_state WHERE dataset = 'cartulina_hoy') AS estado;
