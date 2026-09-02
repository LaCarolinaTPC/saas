-- Matriz de Ausentismo: lote de carga
--
-- Contexto. Con la migración 20260902220946 la carga del Excel deja de borrar
-- la tabla y pasa a hacer upsert por la llave natural (cédula, fecha de
-- inicio, consecutivo), para que lo capturado en el formulario sobreviva. Pero
-- una fila que RRHH eliminó del Excel debe desaparecer también de la matriz,
-- como pasaba antes. Para saber qué filas de origen Excel NO vinieron en la
-- carga sin depender de relojes ni de nombres de archivo, cada carga recibe
-- un identificador de lote que se estampa en cada fila que toca; al terminar,
-- las filas de origen excel con otro lote (o sin lote) se retiran.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- No crea tablas: la columna hereda los privilegios de `ausentismo`.

ALTER TABLE ausentismo
  ADD COLUMN IF NOT EXISTS lote_carga UUID;

CREATE INDEX IF NOT EXISTS idx_ausentismo_lote_carga
  ON ausentismo (origen_registro, lote_carga);

-- La vista de la matriz expone el lote para poder auditar qué carga trajo cada
-- fila. Se recrea porque CREATE OR REPLACE VIEW solo admite columnas nuevas al
-- final; la vista es de la migración anterior y nada depende de ella.
DROP VIEW IF EXISTS vw_ausentismo_matriz;
CREATE VIEW vw_ausentismo_matriz AS
SELECT
  a.id,
  a.consecutivo_incapacidad,
  a.cedula                  AS documento_de_identidad,
  a.nombre,
  a.cargo,
  a.indicador_prorroga,
  a.dias_it_pagados         AS dias_perdidos,
  a.origen,
  a.fecha_inicio,
  a.fecha_fin,
  a.mes_inicio,
  a.dia_ocurrencia          AS dia_de_ocurrencia_del_evento,
  a.eps,
  a.arl,
  a.ips,
  a.profesional_responsable,
  a.tipo_conductor          AS tipo_de_conductor,
  a.estado,
  a.cie10,
  a.diagnostico             AS dx,
  a.soat,
  a.grd,
  a.estado_registro,
  a.origen_registro,
  a.revision,
  a.abierto_por_email,
  a.cerrado_por_email,
  a.cerrado_at,
  a.modificado_por_email,
  a.motivo_modificacion,
  a.source_file,
  a.lote_carga,
  a.created_at,
  a.updated_at
FROM ausentismo a;

GRANT SELECT ON vw_ausentismo_matriz TO service_role;
