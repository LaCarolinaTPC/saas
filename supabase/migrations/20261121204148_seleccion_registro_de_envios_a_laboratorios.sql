-- Selección: registro de las órdenes enviadas a los laboratorios
--
-- Contexto: la orden de exámenes sale por correo (Biobac) o por WhatsApp
-- (Rescate), y en el chat de prueba se simula. Hace falta ver qué se le mandó
-- a cada laboratorio, cuándo y con qué adjuntos: en el chat de prueba se
-- muestra como la conversación con el laboratorio (junto con lo que responde),
-- y para los envíos reales queda como constancia (21-nov-2026). Lo que el
-- laboratorio responde ya queda en seleccion_avisos_laboratorio.
--
-- Tabla nueva: necesita su GRANT a service_role. Idempotente.

CREATE TABLE IF NOT EXISTS seleccion_envios_laboratorio (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratorio_id  UUID REFERENCES seleccion_laboratorios(id) ON DELETE SET NULL,
  canal           TEXT NOT NULL CHECK (canal IN ('whatsapp', 'correo')),
  para            TEXT[] NOT NULL DEFAULT '{}',
  copia           TEXT[] NOT NULL DEFAULT '{}',
  asunto          TEXT,
  cuerpo          TEXT NOT NULL,
  adjuntos        TEXT[] NOT NULL DEFAULT '{}',
  cita_ids        UUID[] NOT NULL DEFAULT '{}',
  proceso_ids     UUID[] NOT NULL DEFAULT '{}',
  -- enviado | simulado (chat de prueba o simulación) | fallido
  resultado       TEXT NOT NULL CHECK (resultado IN ('enviado', 'simulado', 'fallido')),
  error           TEXT,
  enviado_por     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sel_envios_lab ON seleccion_envios_laboratorio (laboratorio_id, created_at DESC);

ALTER TABLE seleccion_envios_laboratorio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seleccion_envios_laboratorio FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE seleccion_envios_laboratorio TO service_role;
COMMENT ON TABLE seleccion_envios_laboratorio IS
  'Órdenes de exámenes enviadas (o simuladas) a cada laboratorio: a quién, qué decía y con qué adjuntos.';
