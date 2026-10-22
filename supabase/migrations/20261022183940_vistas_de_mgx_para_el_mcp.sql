-- vistas de mgx para el mcp
--
-- Contexto: las vistas mgx_v_* son lo que el servidor MCP expone a los agentes
-- de IA sobre la copia de MGX (src/lib/mcp/catalogo/mgx-*.ts). Las tablas
-- crudas mgx_* no se exponen: tienen cientos de columnas sin documentar, y una
-- vista entrega exactamente las columnas que el catálogo explica.
--
-- A las diez vistas del documento de MGX solo se les ANEXAN columnas al final
-- (CREATE OR REPLACE VIEW no admite otra cosa); las demás son nuevas. Cada
-- una lleva su GRANT SELECT a service_role (en esta instalación no se hereda).
-- Todo es OR REPLACE: correrla dos veces no cambia nada.
--
-- GENERADA por scripts/mgx-generar-vistas.mts desde sqlVistas() de
-- src/lib/mgx/esquema.ts. No se edita a mano.
--
-- Se aplica a mano en el SQL Editor, entera y de una sola vez.
-- Detalle en docs/mgx-sincronizacion.md y docs/mcp/CONEXION.md.

BEGIN;

CREATE OR REPLACE VIEW mgx_v_co_cabeza AS
SELECT empresa, ano_doc, per_doc, tip_doc, num_doc, fecha, descrip, usercreo, fhedicion, fhcreacion,
       tot_deb, tot_cre, llave_doc, ide
  FROM mgx_co_cabeza;
GRANT SELECT ON mgx_v_co_cabeza TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_cuerpo AS
SELECT empresa, ano_doc, per_doc, tip_doc, num_doc, item, cod_cta, debito, credito, concepto, cod_cos,
       nit_ter, cheque, base, doc_rel, porcen, doc_cru, dias, fec_ven, norma, llave_doc, ide
  FROM mgx_co_cuerpo;
GRANT SELECT ON mgx_v_co_cuerpo TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_movimientos AS
SELECT cabeza.empresa, cabeza.ano_doc, cabeza.per_doc, cabeza.tip_doc, cabeza.num_doc, cabeza.fecha,
       pri_cta.codigo AS cod_cta, pri_cta.nombre AS nom_cta, pri_cta.nat_cue,
       upper(cuerpo.concepto) AS concepto, cuerpo.cod_cos, cuerpo.nit_ter, cuerpo.doc_rel,
       cuerpo.base, cuerpo.porcen, cuerpo.credito, cuerpo.debito, cuerpo.norma,
       cuerpo.item, cuerpo.nom_ter, pri_cos.nombre AS nom_cos, cabeza.descrip, cabeza.llave_doc, cuerpo.ide
  FROM mgx_co_cabeza cabeza
  JOIN mgx_co_cuerpo cuerpo ON cuerpo.empresa = cabeza.empresa AND cuerpo.llave_doc = cabeza.llave_doc
  JOIN mgx_co_pri_cta pri_cta ON pri_cta.empresa = cuerpo.empresa AND pri_cta.codigo = cuerpo.cod_cta
  LEFT JOIN mgx_co_pri_cos pri_cos ON pri_cos.empresa = cuerpo.empresa AND pri_cos.codigo = cuerpo.cod_cos;
GRANT SELECT ON mgx_v_co_movimientos TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_pri_cos AS
SELECT empresa, codigo, nombre, tipo, ruta, interno, nit_pre, activo,
       CASE WHEN nombre ~ '^[A-Z]{3}-?[0-9]{3}$' THEN replace(nombre, '-', '') END AS placa, ide
  FROM mgx_co_pri_cos;
GRANT SELECT ON mgx_v_co_pri_cos TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_pri_cta AS
SELECT empresa, codigo, nombre, tipo, nat_cue, estado, norma, ide FROM mgx_co_pri_cta;
GRANT SELECT ON mgx_v_co_pri_cta TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_pri_ter AS
SELECT empresa, nit, nombre, direccion, telefonos, correo, fax, cod_ciu, apa_aer, representante, estado, prod_ser,
       cod_tid, tip_per, prove, cliente, empleado, afiliado, fec_ing, tel_movil, ide
  FROM mgx_co_pri_ter;
GRANT SELECT ON mgx_v_co_pri_ter TO service_role;

CREATE OR REPLACE VIEW mgx_v_no_nomina AS
SELECT cabeza.empresa, cabeza.num_doc, cabeza.fecha, pri_epl.codigo AS cod_epl, pri_epl.nomcom AS nom_epl,
       pri_epl.sueldo, pri_con.codigo AS cod_con, pri_con.nombre AS nom_con, cuerpo.cantidad AS cantbasepor,
       cuerpo.valor, pri_per.codigo AS cod_per, pri_per.nombre AS nom_per, pri_per.est_per,
       pri_per.fec_ini AS feciniper, pri_per.fec_fin AS fecfinper, pri_gpa.codigo AS cod_gpa,
       pri_gpa.nombre AS nom_gpa, pri_epr.codigo AS cod_epr, pri_epr.nombre AS nom_epr, pri_epr.nit,
       cuerpo.horas, pri_dpt.nombre AS nom_car,
       (SELECT obs_liq.observacion FROM mgx_no_obs_liq obs_liq
         WHERE obs_liq.empresa = cabeza.empresa AND obs_liq.cod_epl = pri_epl.codigo
           AND obs_liq.num_doc = cabeza.num_doc LIMIT 1) AS observa,
       (SELECT pri_est.nombre FROM mgx_no_pri_est pri_est
         WHERE pri_est.empresa = cabeza.empresa AND pri_est.codigo = rtrim(cuerpo.est_emp::text) LIMIT 1) AS nom_est,
       cuerpo.est_emp,
       cabeza.ano_doc, cabeza.per_doc, cabeza.llave_doc, pri_con.tipo AS tip_con, pri_epl.cod_car,
       pri_car.nombre AS nom_cargo, pri_epl.cod_dpt, pri_dpt.nombre AS nom_dpt, cuerpo.ide
  FROM mgx_no_cabeza cabeza
  JOIN mgx_no_cuerpo cuerpo   ON cuerpo.empresa = cabeza.empresa AND cuerpo.llave_doc = cabeza.llave_doc
  JOIN mgx_no_pri_con pri_con ON pri_con.empresa = cabeza.empresa AND pri_con.codigo = cuerpo.cod_con
  JOIN mgx_rh_pri_epl pri_epl ON pri_epl.empresa = cabeza.empresa AND pri_epl.codigo = cuerpo.cod_epl
  JOIN mgx_no_pri_per pri_per ON pri_per.empresa = cabeza.empresa AND pri_per.codigo = cabeza.cod_per
  JOIN mgx_no_pri_gpa pri_gpa ON pri_gpa.empresa = cabeza.empresa AND pri_gpa.codigo = pri_per.cod_gpa
  JOIN mgx_no_pri_epr pri_epr ON pri_epr.empresa = cabeza.empresa AND pri_epr.codigo = pri_epl.cod_epr
  JOIN mgx_no_pri_dpt pri_dpt ON pri_dpt.empresa = cabeza.empresa AND pri_dpt.codigo = pri_epl.cod_dpt
  LEFT JOIN mgx_no_pri_car pri_car ON pri_car.empresa = cabeza.empresa AND pri_car.codigo = pri_epl.cod_car
 WHERE cabeza.tip_doc = '03'
   AND pri_con.tipo >= 1 AND pri_con.tipo <= 2;
GRANT SELECT ON mgx_v_no_nomina TO service_role;

CREATE OR REPLACE VIEW mgx_v_in_catalogo AS
SELECT pri_ref.empresa, pri_ref.ref_cod, pri_ref.nombre, pri_ref.cod_gru, pri_ref.cod_und,
       pri_und.nombre AS nom_und, pri_gru.nombre AS nom_gru, pri_gru.cta_inv, pri_ref.cod_sgr,
       pri_sgr.nombre AS nom_sgr, pri_ref.cod_lin, pri_lin.nombre AS nom_lin, pri_ref.activa,
       pri_ref.codigo AS cod_interno, pri_ref.sto_min, pri_ref.sto_max, pri_ref.cod_mar, pri_ref.fec_ing, pri_ref.ide
  FROM mgx_in_pri_ref pri_ref
  LEFT JOIN mgx_in_pri_gru pri_gru ON pri_gru.empresa = pri_ref.empresa AND pri_gru.codigo = pri_ref.cod_gru
  LEFT JOIN mgx_in_pri_sgr pri_sgr ON pri_sgr.empresa = pri_ref.empresa AND pri_sgr.codigo = pri_ref.cod_sgr
  LEFT JOIN mgx_in_pri_lin pri_lin ON pri_lin.empresa = pri_ref.empresa AND pri_lin.codigo = pri_ref.cod_lin
  LEFT JOIN mgx_in_pri_und pri_und ON pri_und.empresa = pri_ref.empresa AND pri_und.codigo = pri_ref.cod_und;
GRANT SELECT ON mgx_v_in_catalogo TO service_role;

CREATE OR REPLACE VIEW mgx_v_in_bodegas AS
SELECT empresa, codigo, nombre, direccion, telefonos, ide FROM mgx_in_pri_bod;
GRANT SELECT ON mgx_v_in_bodegas TO service_role;

CREATE OR REPLACE VIEW mgx_v_in_unidades AS
SELECT empresa, codigo, nombre, ide FROM mgx_in_pri_und;
GRANT SELECT ON mgx_v_in_unidades TO service_role;

CREATE OR REPLACE VIEW mgx_v_rh_empleados AS
SELECT e.empresa, e.codigo, e.tip_ide, e.nomcom, e.nombres, e.nombres2, e.apellidos, e.apellidos2, e.sexo,
       e.fec_nac, e.fec_ing, e.fec_ret, e.fec_rein, e.est_emp,
       (e.est_emp = 1 AND (e.fec_ret IS NULL OR e.fec_ret > current_date)) AS activo,
       e.cod_car, car.nombre AS nom_car, e.cod_dpt, dpt.nombre AS nom_dpt,
       e.cod_gpa, gpa.nombre AS nom_gpa, e.cod_ctr, ctr.nombre AS nom_ctr,
       e.cod_cos, e.cod_epr, e.cod_tco, e.contrato, e.tip_sal, e.sueldo, e.aux_tra,
       e.cod_sal, e.cod_pen, e.cod_arp, e.cod_caj, e.cod_fon, e.relevo, e.produccion,
       e.cod_ciu, e.direccion, e.telefonos, e.tel_movil, e.correo, e.fhc, e.ide
  FROM mgx_rh_pri_epl e
  LEFT JOIN mgx_no_pri_car car ON car.empresa = e.empresa AND car.codigo = e.cod_car
  LEFT JOIN mgx_no_pri_dpt dpt ON dpt.empresa = e.empresa AND dpt.codigo = e.cod_dpt
  LEFT JOIN mgx_no_pri_gpa gpa ON gpa.empresa = e.empresa AND gpa.codigo = e.cod_gpa
  LEFT JOIN mgx_no_pri_ctr ctr ON ctr.empresa = e.empresa AND ctr.codigo = e.cod_ctr;
GRANT SELECT ON mgx_v_rh_empleados TO service_role;

CREATE OR REPLACE VIEW mgx_v_no_periodos AS
SELECT p.empresa, p.codigo, p.nombre, p.fec_ini, p.fec_fin, p.fec_pag, p.est_per, p.liquida, p.prima, p.subper,
       p.cod_gpa, gpa.nombre AS nom_gpa, p.cod_tno, p.cod_epr, p.fhe, p.ide
  FROM mgx_no_pri_per p
  LEFT JOIN mgx_no_pri_gpa gpa ON gpa.empresa = p.empresa AND gpa.codigo = p.cod_gpa;
GRANT SELECT ON mgx_v_no_periodos TO service_role;

CREATE OR REPLACE VIEW mgx_v_no_conceptos AS
SELECT empresa, codigo, nombre, tipo, clasec, activo, cta_con, nit_ben, fhe, ide FROM mgx_no_pri_con;
GRANT SELECT ON mgx_v_no_conceptos TO service_role;

CREATE OR REPLACE VIEW mgx_v_no_catalogos AS
SELECT empresa, 'cargo'::text AS catalogo, codigo, nombre, (activo = 1) AS activo, NULL::numeric AS riesgo_arl,
       empresa || '|cargo|' || ide::text AS id
  FROM mgx_no_pri_car
UNION ALL
SELECT empresa, 'departamento', codigo, nombre, NULL, NULL, empresa || '|departamento|' || ide::text FROM mgx_no_pri_dpt
UNION ALL
SELECT empresa, 'grupo_pago', codigo, nombre, NULL, NULL, empresa || '|grupo_pago|' || ide::text FROM mgx_no_pri_gpa
UNION ALL
SELECT empresa, 'centro_trabajo', codigo, nombre, (activo = 1), riesgo, empresa || '|centro_trabajo|' || ide::text
  FROM mgx_no_pri_ctr
UNION ALL
SELECT empresa, 'empresa_nomina', codigo, nombre, (estado = 1), NULL, empresa || '|empresa_nomina|' || ide::text
  FROM mgx_no_pri_epr
UNION ALL
SELECT empresa, 'estado_empleado', codigo, nombre, NULL, NULL, empresa || '|estado_empleado|' || ide::text
  FROM mgx_no_pri_est;
GRANT SELECT ON mgx_v_no_catalogos TO service_role;

CREATE OR REPLACE VIEW mgx_v_in_movimientos AS
SELECT cabeza.empresa, cabeza.ano_doc, cabeza.per_doc, cabeza.tip_doc, mov.nombre AS nom_tip_doc, cabeza.num_doc,
       cabeza.fecha, cabeza.descrip, cabeza.nit_ter, cabeza.cod_epl, cabeza.cod_cco AS cod_cco_doc,
       cabeza.estado, cabeza.est_mov, cabeza.cerrada, cabeza.total AS total_doc,
       cuerpo.item, cuerpo.cod_ref, coalesce(nullif(cuerpo.nom_ref, ''), pri_ref.nombre) AS nom_ref, pri_ref.cod_gru,
       cuerpo.cod_bod, coalesce(nullif(cuerpo.nom_bod, ''), bod.nombre) AS nom_bod, cuerpo.cod_cco,
       cuerpo.cantidad, cuerpo.cod_und, cuerpo.pre_cos, cuerpo.valor, cuerpo.subtotal, cuerpo.tot_iva,
       cuerpo.detalle, cuerpo.doc_rel, cuerpo.cod_cta, cabeza.llave_doc, cuerpo.ide
  FROM mgx_in_cabeza cabeza
  JOIN mgx_in_cuerpo cuerpo ON cuerpo.empresa = cabeza.empresa AND cuerpo.llave_doc = cabeza.llave_doc
  LEFT JOIN mgx_in_pri_mov mov ON mov.empresa = cabeza.empresa AND mov.codigo = cabeza.tip_doc
  LEFT JOIN mgx_in_pri_ref pri_ref ON pri_ref.empresa = cuerpo.empresa AND pri_ref.ref_cod = cuerpo.cod_ref
                                  AND cuerpo.cod_ref <> ''
  LEFT JOIN mgx_in_pri_bod bod ON bod.empresa = cuerpo.empresa AND bod.codigo = cuerpo.cod_bod;
GRANT SELECT ON mgx_v_in_movimientos TO service_role;

CREATE OR REPLACE VIEW mgx_v_estado AS
SELECT t.empresa, t.modulo, t.tabla, 'mgx_' || t.modulo || '_' || t.tabla AS tabla_espejo, t.activa, t.estrategia,
       t.estado, t.fase, t.ultima_corrida_at, t.filas, t.filas_origen_estimadas, t.ultimo_ide, t.ultima_edicion,
       t.error, t.aviso, t.corrida_id, c.estado AS corrida_estado, c.origen AS corrida_origen,
       c.iniciada_at AS corrida_iniciada_at, c.terminada_at AS corrida_terminada_at,
       t.empresa || '|' || t.modulo || '|' || t.tabla AS id
  FROM mgx_tablas t
  LEFT JOIN mgx_corridas c ON c.id = t.corrida_id;
GRANT SELECT ON mgx_v_estado TO service_role;

COMMIT;
