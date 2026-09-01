-- 064: Mantenimiento se engancha al maestro de vehículos de GEMA.
--
-- Las migraciones 048/049 crearon `busetas`, un catálogo manual que nunca se
-- llenó (0 filas). El maestro real ya vive en Gestivo: la migración 057 trajo
-- `vehiculos`, sincronizado desde la vista `vst_ext_get_vehiculos` de GEMA por
-- el cron /api/cron/sync-gema (202 vehículos al 2026-09-01).
--
-- Se usa `vehiculos.codigo` y no la placa: es la llave primaria del maestro,
-- sobrevive a un cambio de placa y es la misma que el módulo Rotación emplea
-- en `velocidades` y en el mapa de calor (`codigo_vehiculo`). La placa sigue
-- disponible en `vehiculos` para mostrarla.
--
-- Ejecutar después de 057 y de 063.

-- ── Guarda ───────────────────────────────────────────────────────────────────
-- Esta migración reconstruye la columna del vehículo; no homologa datos. Solo
-- es segura mientras las tablas del módulo estén vacías.
DO $$
DECLARE
  n_reportes BIGINT;
  n_alertas BIGINT;
BEGIN
  SELECT count(*) INTO n_reportes FROM mantenimiento_reportes;
  SELECT count(*) INTO n_alertas FROM mantenimiento_alertas;
  IF n_reportes > 0 OR n_alertas > 0 THEN
    RAISE EXCEPTION
      'La 064 reemplaza placa_buseta por codigo_vehiculo y solo es segura con las tablas vacías (reportes=%, alertas=%). Homologue antes las placas contra vehiculos.codigo.',
      n_reportes, n_alertas;
  END IF;
END $$;

-- ── 1. Retirar lo que depende de placa_buseta ────────────────────────────────
DROP TRIGGER IF EXISTS trg_mantenimiento_recurrencia ON mantenimiento_reportes;
DROP INDEX IF EXISTS idx_mantenimiento_alerta_abierta;
DROP INDEX IF EXISTS idx_mantenimiento_reportes_buseta_concepto;

-- ── 2. Cambiar la llave de vehículo ──────────────────────────────────────────
ALTER TABLE mantenimiento_reportes DROP COLUMN IF EXISTS placa_buseta;
ALTER TABLE mantenimiento_reportes
  ADD COLUMN IF NOT EXISTS codigo_vehiculo TEXT NOT NULL REFERENCES vehiculos(codigo);

ALTER TABLE mantenimiento_alertas DROP COLUMN IF EXISTS placa_buseta;
ALTER TABLE mantenimiento_alertas
  ADD COLUMN IF NOT EXISTS codigo_vehiculo TEXT NOT NULL REFERENCES vehiculos(codigo);

-- ── 3. Reconstruir los índices sobre la nueva columna ────────────────────────
-- Una sola alerta abierta por vehículo y concepto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mantenimiento_alerta_abierta
  ON mantenimiento_alertas(codigo_vehiculo, concepto_id)
  WHERE estado = 'abierta';

CREATE INDEX IF NOT EXISTS idx_mantenimiento_reportes_vehiculo_concepto
  ON mantenimiento_reportes(codigo_vehiculo, concepto_id, fecha_reporte DESC);

-- ── 4. Recrear la detección de recurrencia ───────────────────────────────────
-- Misma regla que la 049: al segundo reporte del mismo vehículo y concepto
-- dentro de 30 días se abre (o se actualiza) la alerta.
CREATE OR REPLACE FUNCTION mantenimiento_detectar_recurrencia()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_reportes INTEGER;
  alerta UUID;
BEGIN
  SELECT COUNT(*) INTO total_reportes
  FROM mantenimiento_reportes
  WHERE codigo_vehiculo = NEW.codigo_vehiculo
    AND concepto_id = NEW.concepto_id
    AND fecha_reporte >= NEW.fecha_reporte - INTERVAL '30 days'
    AND fecha_reporte <= NEW.fecha_reporte;

  IF total_reportes >= 2 THEN
    SELECT id INTO alerta
    FROM mantenimiento_alertas
    WHERE codigo_vehiculo = NEW.codigo_vehiculo
      AND concepto_id = NEW.concepto_id
      AND estado = 'abierta'
    LIMIT 1;

    IF alerta IS NULL THEN
      INSERT INTO mantenimiento_alertas (codigo_vehiculo, concepto_id, cantidad)
      VALUES (NEW.codigo_vehiculo, NEW.concepto_id, total_reportes)
      RETURNING id INTO alerta;
      INSERT INTO mantenimiento_auditoria (alerta_id, accion, detalle)
      VALUES (alerta, 'alerta_abierta', jsonb_build_object('cantidad', total_reportes));
    ELSE
      UPDATE mantenimiento_alertas SET cantidad = total_reportes WHERE id = alerta;
    END IF;

    UPDATE mantenimiento_reportes
    SET alerta_id = alerta
    WHERE codigo_vehiculo = NEW.codigo_vehiculo
      AND concepto_id = NEW.concepto_id
      AND fecha_reporte >= NEW.fecha_reporte - INTERVAL '30 days'
      AND fecha_reporte <= NEW.fecha_reporte
      AND alerta_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mantenimiento_recurrencia ON mantenimiento_reportes;
CREATE TRIGGER trg_mantenimiento_recurrencia
  AFTER INSERT ON mantenimiento_reportes
  FOR EACH ROW EXECUTE FUNCTION mantenimiento_detectar_recurrencia();

-- ── 5. La auditoría deja de registrar altas manuales ─────────────────────────
DELETE FROM mantenimiento_auditoria WHERE accion = 'buseta_creada';

ALTER TABLE mantenimiento_auditoria
  DROP CONSTRAINT IF EXISTS mantenimiento_auditoria_accion_check;
ALTER TABLE mantenimiento_auditoria
  ADD CONSTRAINT mantenimiento_auditoria_accion_check
  CHECK (accion IN ('reporte_creado', 'alerta_abierta', 'alerta_cerrada'));

-- ── 6. Retirar el catálogo manual ────────────────────────────────────────────
-- El maestro pasa a ser exclusivamente GEMA; mantener una segunda copia a mano
-- solo la desincroniza. La 063 concedía permisos sobre esta tabla: desaparecen
-- con ella.
DROP TABLE IF EXISTS busetas;

-- `vehiculos` no necesita permisos nuevos: la 057 le dio SELECT a authenticated
-- y la 059 le dio ALL a service_role.
