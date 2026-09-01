-- 072: Acceso interno del módulo Mantenimiento.
--
-- Las tablas 048 y 049 tienen RLS activo intencionalmente. Gestivo las usa
-- exclusivamente desde Server Components/Server Actions con service_role y
-- valida antes los permisos de aplicación. En esta instancia el rol no recibe
-- privilegios por defecto sobre tablas creadas posteriormente, por lo que las
-- consultas devolvían 403 y los selectores quedaban vacíos.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  busetas,
  mantenimiento_conceptos,
  mantenimiento_alertas,
  mantenimiento_reportes,
  mantenimiento_auditoria
TO service_role;

-- La migración 049 inicial no incluía la auditoría del alta de busetas.
ALTER TABLE mantenimiento_auditoria
  DROP CONSTRAINT IF EXISTS mantenimiento_auditoria_accion_check;
ALTER TABLE mantenimiento_auditoria
  ADD CONSTRAINT mantenimiento_auditoria_accion_check
  CHECK (accion IN ('reporte_creado', 'alerta_abierta', 'alerta_cerrada', 'buseta_creada'));
