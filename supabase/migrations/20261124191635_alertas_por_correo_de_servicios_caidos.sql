-- Alertas por correo cuando un servicio externo está fallando
--
-- Contexto (24-nov-2026): Gestivo ya muestra el estado de Croma, la IA,
-- WhatsApp y el correo (src/lib/estado-servicios.ts), pero nadie se enteraba
-- si no entraba a mirar. Ahora la revisión periódica (cada 15 min) le escribe
-- a Gestión Humana cuando uno empieza a fallar, le recuerda cada 6 horas si
-- sigue igual y le avisa cuando vuelve a funcionar
-- (src/lib/alerta-servicios.ts). Los destinatarios son un ajuste editable;
-- vacío, no se envía nada. Desde el entorno de pruebas el correo dice que es
-- de pruebas.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar.

-- Una fila por episodio de falla de un servicio: cuándo se avisó, el último
-- recordatorio y cuándo volvió a funcionar (fin_at). Sin fin_at, sigue abierto.
CREATE TABLE IF NOT EXISTS alertas_servicios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio        TEXT NOT NULL CHECK (servicio IN ('croma', 'ia', 'whatsapp', 'correo')),
  inicio_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_aviso_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  avisos          INTEGER NOT NULL DEFAULT 1,
  fin_at          TIMESTAMPTZ,
  ultimo_error    TEXT,
  destinatarios   TEXT[] NOT NULL DEFAULT '{}'
);
-- Un solo episodio abierto por servicio.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alertas_servicios_abierta ON alertas_servicios (servicio) WHERE fin_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alertas_servicios_inicio ON alertas_servicios (inicio_at DESC);

ALTER TABLE alertas_servicios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON alertas_servicios FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE alertas_servicios TO service_role;

COMMENT ON TABLE alertas_servicios IS 'Episodios de falla de los servicios externos (Croma, IA, WhatsApp, correo) y los correos de alerta enviados a Gestión Humana.';

-- A quién se le avisa (Selección › Tiempos y reglas › Verificaciones con Croma).
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES ('alerta_servicios_correos', 'dato', 'Correos que reciben la alerta cuando un servicio externo está fallando', 247,
        '["drrhumanos@lacarolina.com.co"]'::jsonb, '["drrhumanos@lacarolina.com.co"]'::jsonb, 'lista', 'Gestión Humana, 24-nov-2026', 4),
       -- Con copia a soporte, para que verifiquen.
       ('alerta_servicios_copia', 'dato', 'Con copia a (alerta de servicios)', 248,
        '["soporte@lacarolina.com.co"]'::jsonb, '["soporte@lacarolina.com.co"]'::jsonb, 'lista', 'Gestión Humana, 24-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT to_regclass('public.alertas_servicios') AS tabla,
       (SELECT valor FROM seleccion_ajustes WHERE clave = 'alerta_servicios_correos') AS correos,
       (SELECT valor FROM seleccion_ajustes WHERE clave = 'alerta_servicios_copia') AS copia;
