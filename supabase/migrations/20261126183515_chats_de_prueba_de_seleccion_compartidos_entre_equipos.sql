-- Selección: chats de prueba compartidos entre equipos
--
-- Contexto: los chats de la pestaña «Probar el asistente» se guardaban solo en
-- el navegador (localStorage), así que una conversación empezada en un equipo
-- no se veía en otro y se perdía al borrar los datos del navegador. Quienes
-- prueban trabajan desde varios equipos y necesitan ver y seguir las mismas
-- conversaciones (pedido del 26-nov-2026). Cada fila es un chat: cómo se
-- abrió (Croma real o simulado, escenario), el resumen para la lista y la
-- conversación completa con el estado del panel. Cerrar un chat lo marca
-- (cerrado_at) en lugar de borrarlo.
--
-- Tabla nueva: necesita su GRANT a service_role. Idempotente.

CREATE TABLE IF NOT EXISTS seleccion_chats_prueba (
  -- El identificador que genera el navegador al abrir el chat (Date.now()).
  id              BIGINT PRIMARY KEY,
  numero          INTEGER NOT NULL DEFAULT 1,
  -- ConfigChatPrueba: { cromaReal, guardar, escenario }
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ResumenChatPrueba: lo que muestra la lista (nombre, último mensaje, estado…)
  resumen         JSONB,
  -- ChatGuardado: la conversación y el estado del chat (sin las fotos)
  estado          JSONB,
  creado_por      TEXT,
  actualizado_por TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_at      TIMESTAMPTZ,
  cerrado_por     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sel_chats_prueba_abiertos ON seleccion_chats_prueba (updated_at DESC) WHERE cerrado_at IS NULL;

ALTER TABLE seleccion_chats_prueba ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seleccion_chats_prueba FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE seleccion_chats_prueba TO service_role;
COMMENT ON TABLE seleccion_chats_prueba IS
  'Chats de prueba del asistente de selección, compartidos entre equipos: configuración, resumen y conversación.';
