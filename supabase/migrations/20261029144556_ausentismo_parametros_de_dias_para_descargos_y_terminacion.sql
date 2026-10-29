-- Ausentismo · Reincidentes: días seguidos sin justificar que disparan la
-- citación a descargos y la terminación de contrato.
-- Pegar entero en: Supabase → SQL Editor (idempotente).
--
-- Contexto: los días estaban fijos en el código (4 para descargos, 5 para
-- terminación). RRHH necesita ajustarlos desde la pestaña Reincidentes sin un
-- despliegue. El valor es global: decide la alerta, qué notificaciones se
-- piden, quién entra siempre a la lista y la validación al marcar
-- «notificado», así que todos deben ver el mismo. Sin esta tabla la
-- aplicación sigue con 4 y 5.
--
-- Las tablas nuevas no heredan privilegios en esta instancia: los GRANT a
-- service_role van aquí mismo.

CREATE TABLE IF NOT EXISTS ausentismo_parametros (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Días seguidos sin justificar desde los que se notifica la citación a descargos.
  dias_descargos INTEGER NOT NULL DEFAULT 4 CHECK (dias_descargos >= 1 AND dias_descargos <= 60),
  -- Días seguidos sin justificar desde los que se notifica la terminación de contrato.
  dias_terminacion INTEGER NOT NULL DEFAULT 5 CHECK (dias_terminacion >= 2 AND dias_terminacion <= 60),
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ausentismo_parametros_orden CHECK (dias_terminacion > dias_descargos)
);
INSERT INTO ausentismo_parametros (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE ausentismo_parametros IS
  'Parámetros de Reincidentes: días seguidos sin justificar para la citación a descargos y para la terminación de contrato. Una sola fila, editable desde la pantalla.';

ALTER TABLE ausentismo_parametros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ausentismo_parametros FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ausentismo_parametros TO service_role;
