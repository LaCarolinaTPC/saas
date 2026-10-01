-- Tesorería · Revisión cartulina: evidencia de la revisión de timbradas.
-- Pegar entero en: Supabase → SQL Editor (idempotente).
--
-- Contexto: la revisión diaria de timbradas se hacía con un informe HTML
-- generado fuera de Gestivo; lo revisado quedaba en el navegador o en una
-- copia "_REVISADO.html". Gestivo ya calcula la revisión desde las tablas de
-- GEMA, así que el resultado de cada viaje revisado (con quién y cuándo) se
-- guarda aquí y deja de depender de un archivo.
--
-- Una fila por viaje revisado (`numero` = historico_despacho.numero). Volver a
-- marcar reemplaza la fila; desmarcar la borra. Cada cambio queda además en
-- tesoreria_audit_log desde la aplicación.
--
-- `estado_calculado` guarda el estado que tenía el viaje al revisarlo: si una
-- sincronización posterior lo cambia (un descuento o un recaudo que GEMA
-- registra tarde), la pantalla lo muestra.
--
-- Las tablas nuevas no heredan privilegios en esta instancia: el GRANT a
-- service_role va aquí mismo.

CREATE TABLE IF NOT EXISTS tesoreria_revision_timbradas (
  fecha_viaje DATE NOT NULL,
  numero BIGINT NOT NULL,
  placa TEXT,
  viaje INTEGER,
  resultado TEXT NOT NULL CHECK (resultado IN (
    'Justificado (con soporte)',
    'No justificado — cobrar/descontar',
    'Error de datos / sistema',
    'Escalado a otra área',
    'Otro (ver nota)'
  )),
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  estado_calculado TEXT,
  revisado_por UUID REFERENCES auth.users(id),
  revisado_por_email TEXT,
  revisado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha_viaje, numero)
);

CREATE INDEX IF NOT EXISTS idx_tesoreria_revision_timbradas_numero ON tesoreria_revision_timbradas (numero);

COMMENT ON TABLE tesoreria_revision_timbradas IS
  'Evidencia de la revisión diaria de timbradas (Tesorería → Revisión cartulina): resultado, nota, revisor y estado calculado al revisar, por viaje.';

ALTER TABLE tesoreria_revision_timbradas ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tesoreria_revision_timbradas TO service_role;
GRANT SELECT ON TABLE historico_despacho TO service_role;
GRANT SELECT ON TABLE timbradas_descontadas TO service_role;
GRANT SELECT ON TABLE puntos_virtuales TO service_role;
GRANT SELECT ON TABLE viajes_recaudados TO service_role;

-- Comprobación: debe devolver la tabla con RLS activo y los privilegios de service_role.
SELECT c.relname AS tabla,
       c.relrowsecurity AS rls,
       has_table_privilege('service_role', c.oid, 'SELECT') AS puede_leer,
       has_table_privilege('service_role', c.oid, 'INSERT') AS puede_insertar,
       has_table_privilege('service_role', c.oid, 'DELETE') AS puede_borrar
FROM pg_class c
WHERE c.relname = 'tesoreria_revision_timbradas';
