-- modulos contabilidad y nomina de mgx
--
-- Contexto: los datos del ERP MGX ya se exponen al MCP y a la Data API como
-- vistas mgx_v_* (migración 20261022183940). Hasta ahora solo los veían los
-- roles con Financiera, Tesorería o Empleados. Se agregan dos módulos de SOLO
-- DATOS para darlos a roles concretos desde Configuración › Usuarios:
--
--   · contabilidad_mgx: comprobantes y movimientos contables, plan de
--     cuentas, centros de costo, terceros, inventarios y taller;
--   · nomina_mgx: nómina liquidada, períodos, conceptos, catálogos de nómina
--     y maestro de empleados (con salarios).
--
-- No abren pantalla (su inicio es /docs/mcp). El mapa de qué vista da cada
-- módulo vive en src/lib/external/acceso.ts. Financiera, Tesorería y
-- Empleados siguen viendo lo mismo que antes.
--
-- No crea tablas: solo registra los módulos en el rol administrador, que de
-- todos modos ve todo por el MCP. Los demás roles los reciben a mano.
-- Idempotente: se puede correr más de una vez.

UPDATE user_types
  SET modulos = modulos || '["contabilidad_mgx"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'contabilidad_mgx');

UPDATE user_types
  SET modulos = modulos || '["nomina_mgx"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'nomina_mgx');
