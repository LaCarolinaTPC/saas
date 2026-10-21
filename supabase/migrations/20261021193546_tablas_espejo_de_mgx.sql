-- tablas espejo de mgx
--
-- Contexto: MGX (el ERP contable, de nómina e inventarios del grupo) entregó un
-- usuario de solo lectura sobre su base ETL (etl_00027), replicada cada noche a
-- las 2:00 am. Esta migración crea en Gestivo la copia de sus tablas base para
-- las siete empresas, con una columna «empresa», y recrea encima las vistas que
-- nombra el documento de MGX. Se copian las tablas y no las vistas porque solo
-- las tablas tienen «ide» y fecha de edición, que es lo que permite traer cada
-- noche solo lo nuevo en vez de 16 millones de filas.
--
-- GENERADA por scripts/mgx-generar-migracion.mts a partir del esquema de MGX
-- (leído en vivo, 2026-10-21).
-- No se edita a mano: si MGX cambia, se crea otra migración y se regenera.
-- Todo es IF NOT EXISTS / OR REPLACE: correrla dos veces no cambia nada.
--
-- Se aplica a mano en el SQL Editor, entera y de una sola vez. Cada tabla nueva
-- lleva su GRANT a service_role (en esta instalación no se hereda).
--
-- Detalle en docs/mgx-sincronizacion.md.

BEGIN;

-- =============================================================================
-- 1. Tablas espejo (31)
-- =============================================================================

-- ── mgx_co_pri_cos ─ 12 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_co_pri_cos (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_co_pri_cos
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "emp_no" text,
  ADD COLUMN IF NOT EXISTS "tipo" numeric,
  ADD COLUMN IF NOT EXISTS "ruta" text,
  ADD COLUMN IF NOT EXISTS "nit_pre" text,
  ADD COLUMN IF NOT EXISTS "interno" numeric,
  ADD COLUMN IF NOT EXISTS "cod_cta" text,
  ADD COLUMN IF NOT EXISTS "activo" numeric,
  ADD COLUMN IF NOT EXISTS "observa" text,
  ADD COLUMN IF NOT EXISTS "ctaller" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_co_pri_cos_codigo ON mgx_co_pri_cos ("empresa", "codigo");
ALTER TABLE mgx_co_pri_cos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_co_pri_cos TO service_role;
COMMENT ON TABLE mgx_co_pri_cos IS 'Espejo de emp{N}co.pri_cos de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_co_pri_cta ─ 45 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_co_pri_cta (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_co_pri_cta
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "tipo" numeric,
  ADD COLUMN IF NOT EXISTS "estado" numeric,
  ADD COLUMN IF NOT EXISTS "nivel" numeric,
  ADD COLUMN IF NOT EXISTS "nat_cue" numeric,
  ADD COLUMN IF NOT EXISTS "man_ter" numeric,
  ADD COLUMN IF NOT EXISTS "man_ban" numeric,
  ADD COLUMN IF NOT EXISTS "man_cos" numeric,
  ADD COLUMN IF NOT EXISTS "man_ciu" numeric,
  ADD COLUMN IF NOT EXISTS "man_suc" numeric,
  ADD COLUMN IF NOT EXISTS "cta_cal" numeric,
  ADD COLUMN IF NOT EXISTS "cta_aju" numeric,
  ADD COLUMN IF NOT EXISTS "cue_aju" text,
  ADD COLUMN IF NOT EXISTS "cue_cor" text,
  ADD COLUMN IF NOT EXISTS "niv_cta" numeric,
  ADD COLUMN IF NOT EXISTS "por_cal" numeric,
  ADD COLUMN IF NOT EXISTS "min_cal" numeric,
  ADD COLUMN IF NOT EXISTS "cierre" numeric,
  ADD COLUMN IF NOT EXISTS "actual" numeric,
  ADD COLUMN IF NOT EXISTS "chequera" numeric,
  ADD COLUMN IF NOT EXISTS "chefinal" numeric,
  ADD COLUMN IF NOT EXISTS "con_fin" numeric,
  ADD COLUMN IF NOT EXISTS "dinamica" text,
  ADD COLUMN IF NOT EXISTS "tip_cta" numeric,
  ADD COLUMN IF NOT EXISTS "crudoter" numeric,
  ADD COLUMN IF NOT EXISTS "norete" text,
  ADD COLUMN IF NOT EXISTS "tipo_cta" numeric,
  ADD COLUMN IF NOT EXISTS "referencia" text,
  ADD COLUMN IF NOT EXISTS "presu" numeric,
  ADD COLUMN IF NOT EXISTS "controla" numeric,
  ADD COLUMN IF NOT EXISTS "tipp_cta" numeric,
  ADD COLUMN IF NOT EXISTS "man_pry" numeric,
  ADD COLUMN IF NOT EXISTS "mon_ext" numeric,
  ADD COLUMN IF NOT EXISTS "cod_mon" text,
  ADD COLUMN IF NOT EXISTS "ctsp" numeric,
  ADD COLUMN IF NOT EXISTS "man_fca" numeric,
  ADD COLUMN IF NOT EXISTS "norma" numeric,
  ADD COLUMN IF NOT EXISTS "cod_gni" text,
  ADD COLUMN IF NOT EXISTS "man_dif" numeric,
  ADD COLUMN IF NOT EXISTS "man_acf" numeric,
  ADD COLUMN IF NOT EXISTS "suspende" numeric,
  ADD COLUMN IF NOT EXISTS "iformu" numeric,
  ADD COLUMN IF NOT EXISTS "ctarepo" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_co_pri_cta_codigo ON mgx_co_pri_cta ("empresa", "codigo");
ALTER TABLE mgx_co_pri_cta ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_co_pri_cta TO service_role;
COMMENT ON TABLE mgx_co_pri_cta IS 'Espejo de emp{N}co.pri_cta de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_co_pri_ter ─ 159 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_co_pri_ter (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_co_pri_ter
  ADD COLUMN IF NOT EXISTS "nit" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "cod_cla" text,
  ADD COLUMN IF NOT EXISTS "cod_ter" text,
  ADD COLUMN IF NOT EXISTS "cc_repr" text,
  ADD COLUMN IF NOT EXISTS "cod_ciu" text,
  ADD COLUMN IF NOT EXISTS "representante" text,
  ADD COLUMN IF NOT EXISTS "direccion" text,
  ADD COLUMN IF NOT EXISTS "telefonos" text,
  ADD COLUMN IF NOT EXISTS "correo" text,
  ADD COLUMN IF NOT EXISTS "estado" numeric,
  ADD COLUMN IF NOT EXISTS "auto" numeric,
  ADD COLUMN IF NOT EXISTS "dias" numeric,
  ADD COLUMN IF NOT EXISTS "por_des" numeric,
  ADD COLUMN IF NOT EXISTS "observa" text,
  ADD COLUMN IF NOT EXISTS "web" text,
  ADD COLUMN IF NOT EXISTS "fec_ing" date,
  ADD COLUMN IF NOT EXISTS "fax" text,
  ADD COLUMN IF NOT EXISTS "cli_int" numeric,
  ADD COLUMN IF NOT EXISTS "gra_con" numeric,
  ADD COLUMN IF NOT EXISTS "feccons" date,
  ADD COLUMN IF NOT EXISTS "apa_aer" text,
  ADD COLUMN IF NOT EXISTS "cod_tem" text,
  ADD COLUMN IF NOT EXISTS "cod_ace" text,
  ADD COLUMN IF NOT EXISTS "ref_come" text,
  ADD COLUMN IF NOT EXISTS "ref_ban" text,
  ADD COLUMN IF NOT EXISTS "vendedor" text,
  ADD COLUMN IF NOT EXISTS "jefe_ventas" text,
  ADD COLUMN IF NOT EXISTS "resp_fac" text,
  ADD COLUMN IF NOT EXISTS "resp_car" text,
  ADD COLUMN IF NOT EXISTS "prod_ser" text,
  ADD COLUMN IF NOT EXISTS "resolucion" text,
  ADD COLUMN IF NOT EXISTS "prioridad" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ven" text,
  ADD COLUMN IF NOT EXISTS "cod_zon" text,
  ADD COLUMN IF NOT EXISTS "cod_suc" text,
  ADD COLUMN IF NOT EXISTS "codcli" text,
  ADD COLUMN IF NOT EXISTS "raz_soc" text,
  ADD COLUMN IF NOT EXISTS "tip_cli" numeric,
  ADD COLUMN IF NOT EXISTS "prove" numeric,
  ADD COLUMN IF NOT EXISTS "cliente" numeric,
  ADD COLUMN IF NOT EXISTS "empleado" numeric,
  ADD COLUMN IF NOT EXISTS "todos" numeric,
  ADD COLUMN IF NOT EXISTS "ret_ica" numeric,
  ADD COLUMN IF NOT EXISTS "dias_cxc" numeric,
  ADD COLUMN IF NOT EXISTS "ret_iva" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tcl" text,
  ADD COLUMN IF NOT EXISTS "cod_tid" text,
  ADD COLUMN IF NOT EXISTS "representa" text,
  ADD COLUMN IF NOT EXISTS "jefe_venta" text,
  ADD COLUMN IF NOT EXISTS "nitter" text,
  ADD COLUMN IF NOT EXISTS "esvendedor" numeric,
  ADD COLUMN IF NOT EXISTS "comision" numeric,
  ADD COLUMN IF NOT EXISTS "nombre1" text,
  ADD COLUMN IF NOT EXISTS "nombre2" text,
  ADD COLUMN IF NOT EXISTS "apellido1" text,
  ADD COLUMN IF NOT EXISTS "apellido2" text,
  ADD COLUMN IF NOT EXISTS "tip_per" numeric,
  ADD COLUMN IF NOT EXISTS "tel_fax" text,
  ADD COLUMN IF NOT EXISTS "ret_ven" numeric,
  ADD COLUMN IF NOT EXISTS "ric_ven" numeric,
  ADD COLUMN IF NOT EXISTS "riv_ven" numeric,
  ADD COLUMN IF NOT EXISTS "ret_com" numeric,
  ADD COLUMN IF NOT EXISTS "ric_com" numeric,
  ADD COLUMN IF NOT EXISTS "riv_com" numeric,
  ADD COLUMN IF NOT EXISTS "cod_lis" text,
  ADD COLUMN IF NOT EXISTS "dis_cart" numeric,
  ADD COLUMN IF NOT EXISTS "cupocxc" numeric,
  ADD COLUMN IF NOT EXISTS "cod_cta" text,
  ADD COLUMN IF NOT EXISTS "afiliado" numeric,
  ADD COLUMN IF NOT EXISTS "fev_rfa" date,
  ADD COLUMN IF NOT EXISTS "claveweb" text,
  ADD COLUMN IF NOT EXISTS "activoweb" numeric,
  ADD COLUMN IF NOT EXISTS "crt_vet" text,
  ADD COLUMN IF NOT EXISTS "cri_vet" text,
  ADD COLUMN IF NOT EXISTS "criv_vet" text,
  ADD COLUMN IF NOT EXISTS "crt_com" text,
  ADD COLUMN IF NOT EXISTS "criv_com" text,
  ADD COLUMN IF NOT EXISTS "fec_nac" date,
  ADD COLUMN IF NOT EXISTS "cod_mpa" text,
  ADD COLUMN IF NOT EXISTS "cta_arv" text,
  ADD COLUMN IF NOT EXISTS "res_com" numeric,
  ADD COLUMN IF NOT EXISTS "res_ven" numeric,
  ADD COLUMN IF NOT EXISTS "crs_ven" text,
  ADD COLUMN IF NOT EXISTS "crs_com" text,
  ADD COLUMN IF NOT EXISTS "dct_fin" numeric,
  ADD COLUMN IF NOT EXISTS "tip_des" numeric,
  ADD COLUMN IF NOT EXISTS "ccree" numeric,
  ADD COLUMN IF NOT EXISTS "vcree" numeric,
  ADD COLUMN IF NOT EXISTS "ctc_cre" text,
  ADD COLUMN IF NOT EXISTS "ctv_cre" text,
  ADD COLUMN IF NOT EXISTS "pv" numeric,
  ADD COLUMN IF NOT EXISTS "pd" numeric,
  ADD COLUMN IF NOT EXISTS "pr" numeric,
  ADD COLUMN IF NOT EXISTS "pe" numeric,
  ADD COLUMN IF NOT EXISTS "df" numeric,
  ADD COLUMN IF NOT EXISTS "con_tax" numeric,
  ADD COLUMN IF NOT EXISTS "nl4mil" numeric,
  ADD COLUMN IF NOT EXISTS "concons" text,
  ADD COLUMN IF NOT EXISTS "nltaxvat" numeric,
  ADD COLUMN IF NOT EXISTS "nl2xmec" numeric,
  ADD COLUMN IF NOT EXISTS "bretagencia" numeric,
  ADD COLUMN IF NOT EXISTS "tip4xmil" numeric,
  ADD COLUMN IF NOT EXISTS "ivaingresos" numeric,
  ADD COLUMN IF NOT EXISTS "irembolsos" numeric,
  ADD COLUMN IF NOT EXISTS "i4ivaingresos" numeric,
  ADD COLUMN IF NOT EXISTS "conivaingre" text,
  ADD COLUMN IF NOT EXISTS "iva4milingresos" numeric,
  ADD COLUMN IF NOT EXISTS "cod_lcp" text,
  ADD COLUMN IF NOT EXISTS "tel_movil" text,
  ADD COLUMN IF NOT EXISTS "codpros" text,
  ADD COLUMN IF NOT EXISTS "tip_clie" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tpr" text,
  ADD COLUMN IF NOT EXISTS "cod_epr" text,
  ADD COLUMN IF NOT EXISTS "cod_tep" text,
  ADD COLUMN IF NOT EXISTS "userpre" text,
  ADD COLUMN IF NOT EXISTS "userlib" text,
  ADD COLUMN IF NOT EXISTS "fecpre" date,
  ADD COLUMN IF NOT EXISTS "feclib" date,
  ADD COLUMN IF NOT EXISTS "ori_prs" numeric,
  ADD COLUMN IF NOT EXISTS "zfranca" numeric,
  ADD COLUMN IF NOT EXISTS "put" numeric,
  ADD COLUMN IF NOT EXISTS "esmedico" numeric,
  ADD COLUMN IF NOT EXISTS "espaciente" numeric,
  ADD COLUMN IF NOT EXISTS "afondo" numeric,
  ADD COLUMN IF NOT EXISTS "sexo" numeric,
  ADD COLUMN IF NOT EXISTS "nivelescolar" numeric,
  ADD COLUMN IF NOT EXISTS "estrato" numeric,
  ADD COLUMN IF NOT EXISTS "nivelingreso" numeric,
  ADD COLUMN IF NOT EXISTS "estadoc" numeric,
  ADD COLUMN IF NOT EXISTS "mujcabeza" numeric,
  ADD COLUMN IF NOT EXISTS "ocupacion" numeric,
  ADD COLUMN IF NOT EXISTS "sector" text,
  ADD COLUMN IF NOT EXISTS "tipcon" numeric,
  ADD COLUMN IF NOT EXISTS "activo" numeric,
  ADD COLUMN IF NOT EXISTS "jornada" numeric,
  ADD COLUMN IF NOT EXISTS "pacargo" numeric,
  ADD COLUMN IF NOT EXISTS "ciu_ced" text,
  ADD COLUMN IF NOT EXISTS "fec_iep" date,
  ADD COLUMN IF NOT EXISTS "sueldo" numeric,
  ADD COLUMN IF NOT EXISTS "cod_car" text,
  ADD COLUMN IF NOT EXISTS "msalarial" numeric,
  ADD COLUMN IF NOT EXISTS "tipperfe" numeric,
  ADD COLUMN IF NOT EXISTS "tipregfe" numeric,
  ADD COLUMN IF NOT EXISTS "correofe" text,
  ADD COLUMN IF NOT EXISTS "movfe" text,
  ADD COLUMN IF NOT EXISTS "correor" text,
  ADD COLUMN IF NOT EXISTS "cod_pai" text,
  ADD COLUMN IF NOT EXISTS "res_rut" text,
  ADD COLUMN IF NOT EXISTS "tri_rut" text,
  ADD COLUMN IF NOT EXISTS "matricula" text,
  ADD COLUMN IF NOT EXISTS "cod_postal" text,
  ADD COLUMN IF NOT EXISTS "dctomax" numeric,
  ADD COLUMN IF NOT EXISTS "fhingreso" timestamp,
  ADD COLUMN IF NOT EXISTS "tenvio" numeric,
  ADD COLUMN IF NOT EXISTS "tenviofe" numeric,
  ADD COLUMN IF NOT EXISTS "ret_icacs" numeric,
  ADD COLUMN IF NOT EXISTS "cta_icacs" text;
CREATE INDEX IF NOT EXISTS idx_mgx_co_pri_ter_nit ON mgx_co_pri_ter ("empresa", "nit");
ALTER TABLE mgx_co_pri_ter ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_co_pri_ter TO service_role;
COMMENT ON TABLE mgx_co_pri_ter IS 'Espejo de emp{N}co.pri_ter de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_co_cabeza ─ 42 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_co_cabeza (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_co_cabeza
  ADD COLUMN IF NOT EXISTS "ano_doc" text,
  ADD COLUMN IF NOT EXISTS "per_doc" text,
  ADD COLUMN IF NOT EXISTS "tip_doc" text,
  ADD COLUMN IF NOT EXISTS "num_doc" text,
  ADD COLUMN IF NOT EXISTS "fin" text,
  ADD COLUMN IF NOT EXISTS "fecha" date,
  ADD COLUMN IF NOT EXISTS "descrip" text,
  ADD COLUMN IF NOT EXISTS "usuario" text,
  ADD COLUMN IF NOT EXISTS "prote" numeric,
  ADD COLUMN IF NOT EXISTS "total" numeric,
  ADD COLUMN IF NOT EXISTS "factura" text,
  ADD COLUMN IF NOT EXISTS "empre" text,
  ADD COLUMN IF NOT EXISTS "solu" text,
  ADD COLUMN IF NOT EXISTS "tot_cre" numeric,
  ADD COLUMN IF NOT EXISTS "tot_deb" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ban" text,
  ADD COLUMN IF NOT EXISTS "radicado" text,
  ADD COLUMN IF NOT EXISTS "girado" numeric,
  ADD COLUMN IF NOT EXISTS "cheque" text,
  ADD COLUMN IF NOT EXISTS "sol_afe" text,
  ADD COLUMN IF NOT EXISTS "tip_afe" text,
  ADD COLUMN IF NOT EXISTS "mov_afe" text,
  ADD COLUMN IF NOT EXISTS "cod_ven" text,
  ADD COLUMN IF NOT EXISTS "fac_not" text,
  ADD COLUMN IF NOT EXISTS "f_pago" numeric,
  ADD COLUMN IF NOT EXISTS "otroter" text,
  ADD COLUMN IF NOT EXISTS "fec_pos" date,
  ADD COLUMN IF NOT EXISTS "indicador" numeric,
  ADD COLUMN IF NOT EXISTS "usercreo" text,
  ADD COLUMN IF NOT EXISTS "fhedicion" timestamp,
  ADD COLUMN IF NOT EXISTS "fhcreacion" timestamp,
  ADD COLUMN IF NOT EXISTS "plantilla" numeric,
  ADD COLUMN IF NOT EXISTS "nomplantilla" text,
  ADD COLUMN IF NOT EXISTS "ori_mov" numeric,
  ADD COLUMN IF NOT EXISTS "ter_ali" text,
  ADD COLUMN IF NOT EXISTS "ter_rec" text,
  ADD COLUMN IF NOT EXISTS "nom_rec" text,
  ADD COLUMN IF NOT EXISTS "fec_hora" timestamp,
  ADD COLUMN IF NOT EXISTS "cod_mon" text,
  ADD COLUMN IF NOT EXISTS "td_niif" numeric,
  ADD COLUMN IF NOT EXISTS "tc_niif" numeric;
ALTER TABLE mgx_co_cabeza ADD COLUMN IF NOT EXISTS llave_doc text GENERATED ALWAYS AS (coalesce("ano_doc", '') || '|' || coalesce("per_doc", '') || '|' || coalesce("tip_doc", '') || '|' || coalesce("num_doc", '')) STORED;
CREATE INDEX IF NOT EXISTS idx_mgx_co_cabeza_llave_doc ON mgx_co_cabeza ("empresa", "llave_doc");
CREATE INDEX IF NOT EXISTS idx_mgx_co_cabeza_fecha ON mgx_co_cabeza ("empresa", "fecha");
ALTER TABLE mgx_co_cabeza ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_co_cabeza TO service_role;
COMMENT ON TABLE mgx_co_cabeza IS 'Espejo de emp{N}co.cabeza de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_co_cuerpo ─ 51 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_co_cuerpo (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_co_cuerpo
  ADD COLUMN IF NOT EXISTS "ano_doc" text,
  ADD COLUMN IF NOT EXISTS "per_doc" text,
  ADD COLUMN IF NOT EXISTS "tip_doc" text,
  ADD COLUMN IF NOT EXISTS "num_doc" text,
  ADD COLUMN IF NOT EXISTS "ini" text,
  ADD COLUMN IF NOT EXISTS "fin" text,
  ADD COLUMN IF NOT EXISTS "item" numeric,
  ADD COLUMN IF NOT EXISTS "cod_cta" text,
  ADD COLUMN IF NOT EXISTS "debito" numeric,
  ADD COLUMN IF NOT EXISTS "credito" numeric,
  ADD COLUMN IF NOT EXISTS "concepto" text,
  ADD COLUMN IF NOT EXISTS "cod_cos" text,
  ADD COLUMN IF NOT EXISTS "nit_ter" text,
  ADD COLUMN IF NOT EXISTS "cheque" text,
  ADD COLUMN IF NOT EXISTS "base" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ciu" text,
  ADD COLUMN IF NOT EXISTS "cod_ban" text,
  ADD COLUMN IF NOT EXISTS "cod_suc" text,
  ADD COLUMN IF NOT EXISTS "doc_rel" text,
  ADD COLUMN IF NOT EXISTS "marca" numeric,
  ADD COLUMN IF NOT EXISTS "porcen" numeric,
  ADD COLUMN IF NOT EXISTS "valor" numeric,
  ADD COLUMN IF NOT EXISTS "doc_cru" text,
  ADD COLUMN IF NOT EXISTS "dias" numeric,
  ADD COLUMN IF NOT EXISTS "fec_ven" date,
  ADD COLUMN IF NOT EXISTS "fecha" date,
  ADD COLUMN IF NOT EXISTS "nom_cta" text,
  ADD COLUMN IF NOT EXISTS "nom_ter" text,
  ADD COLUMN IF NOT EXISTS "nit_alt" text,
  ADD COLUMN IF NOT EXISTS "per_cru" text,
  ADD COLUMN IF NOT EXISTS "cod_pry" text,
  ADD COLUMN IF NOT EXISTS "nom_pry" text,
  ADD COLUMN IF NOT EXISTS "saldo" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ext" text,
  ADD COLUMN IF NOT EXISTS "nom_ext" text,
  ADD COLUMN IF NOT EXISTS "numero" numeric,
  ADD COLUMN IF NOT EXISTS "est_reg" numeric,
  ADD COLUMN IF NOT EXISTS "val_mod" numeric,
  ADD COLUMN IF NOT EXISTS "deb_ext" numeric,
  ADD COLUMN IF NOT EXISTS "cre_ext" numeric,
  ADD COLUMN IF NOT EXISTS "rcontrol" numeric,
  ADD COLUMN IF NOT EXISTS "tasa" numeric,
  ADD COLUMN IF NOT EXISTS "factura" text,
  ADD COLUMN IF NOT EXISTS "referencia" text,
  ADD COLUMN IF NOT EXISTS "cod_mon" text,
  ADD COLUMN IF NOT EXISTS "nom_mon" text,
  ADD COLUMN IF NOT EXISTS "cod_cfc" text,
  ADD COLUMN IF NOT EXISTS "nom_cfc" text,
  ADD COLUMN IF NOT EXISTS "norma" numeric,
  ADD COLUMN IF NOT EXISTS "cantidad" numeric;
ALTER TABLE mgx_co_cuerpo ADD COLUMN IF NOT EXISTS llave_doc text GENERATED ALWAYS AS (coalesce("ano_doc", '') || '|' || coalesce("per_doc", '') || '|' || coalesce("tip_doc", '') || '|' || coalesce("num_doc", '')) STORED;
CREATE INDEX IF NOT EXISTS idx_mgx_co_cuerpo_llave_doc ON mgx_co_cuerpo ("empresa", "llave_doc");
CREATE INDEX IF NOT EXISTS idx_mgx_co_cuerpo_cod_cta ON mgx_co_cuerpo ("empresa", "cod_cta");
ALTER TABLE mgx_co_cuerpo ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_co_cuerpo TO service_role;
COMMENT ON TABLE mgx_co_cuerpo IS 'Espejo de emp{N}co.cuerpo de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_obs_liq ─ 4 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_obs_liq (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_obs_liq
  ADD COLUMN IF NOT EXISTS "observacion" text,
  ADD COLUMN IF NOT EXISTS "num_doc" text,
  ADD COLUMN IF NOT EXISTS "cod_epl" text;
ALTER TABLE mgx_no_obs_liq ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_obs_liq TO service_role;
COMMENT ON TABLE mgx_no_obs_liq IS 'Espejo de emp{N}no.obs_liq de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_pri_car ─ 18 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_pri_car (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_pri_car
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "salario" numeric,
  ADD COLUMN IF NOT EXISTS "val_dia" numeric,
  ADD COLUMN IF NOT EXISTS "diashab" numeric,
  ADD COLUMN IF NOT EXISTS "diasvac" numeric,
  ADD COLUMN IF NOT EXISTS "bas_pro" numeric,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "noimpri" numeric,
  ADD COLUMN IF NOT EXISTS "nfrea" numeric,
  ADD COLUMN IF NOT EXISTS "sinvaca" numeric,
  ADD COLUMN IF NOT EXISTS "activo" numeric,
  ADD COLUMN IF NOT EXISTS "presupuesto" numeric,
  ADD COLUMN IF NOT EXISTS "hor_lab" numeric,
  ADD COLUMN IF NOT EXISTS "tjornada" numeric,
  ADD COLUMN IF NOT EXISTS "baspro" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_no_pri_car_codigo ON mgx_no_pri_car ("empresa", "codigo");
ALTER TABLE mgx_no_pri_car ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_pri_car TO service_role;
COMMENT ON TABLE mgx_no_pri_car IS 'Espejo de emp{N}no.pri_car de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_pri_con ─ 123 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_pri_con (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_pri_con
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "tipo" numeric,
  ADD COLUMN IF NOT EXISTS "auto" numeric,
  ADD COLUMN IF NOT EXISTS "cta_con" text,
  ADD COLUMN IF NOT EXISTS "clasec" numeric,
  ADD COLUMN IF NOT EXISTS "formula" text,
  ADD COLUMN IF NOT EXISTS "nit_ben" text,
  ADD COLUMN IF NOT EXISTS "isalud" numeric,
  ADD COLUMN IF NOT EXISTS "ipension" numeric,
  ADD COLUMN IF NOT EXISTS "p_empre" numeric,
  ADD COLUMN IF NOT EXISTS "p_emple" numeric,
  ADD COLUMN IF NOT EXISTS "p_aporte" numeric,
  ADD COLUMN IF NOT EXISTS "irfuente" numeric,
  ADD COLUMN IF NOT EXISTS "per_aplica" numeric,
  ADD COLUMN IF NOT EXISTS "iembargos" numeric,
  ADD COLUMN IF NOT EXISTS "iemb_jud" numeric,
  ADD COLUMN IF NOT EXISTS "icaja" numeric,
  ADD COLUMN IF NOT EXISTS "isena" numeric,
  ADD COLUMN IF NOT EXISTS "iicbf" numeric,
  ADD COLUMN IF NOT EXISTS "iarp" numeric,
  ADD COLUMN IF NOT EXISTS "icesan" numeric,
  ADD COLUMN IF NOT EXISTS "iin_ces" numeric,
  ADD COLUMN IF NOT EXISTS "isub_tra" numeric,
  ADD COLUMN IF NOT EXISTS "iprima" numeric,
  ADD COLUMN IF NOT EXISTS "ivaca" numeric,
  ADD COLUMN IF NOT EXISTS "activo" numeric,
  ADD COLUMN IF NOT EXISTS "ifondo" numeric,
  ADD COLUMN IF NOT EXISTS "aplanilla" numeric,
  ADD COLUMN IF NOT EXISTS "clasi" numeric,
  ADD COLUMN IF NOT EXISTS "apl_cti" numeric,
  ADD COLUMN IF NOT EXISTS "hor_ini" text,
  ADD COLUMN IF NOT EXISTS "hor_fin" text,
  ADD COLUMN IF NOT EXISTS "val_con" numeric,
  ADD COLUMN IF NOT EXISTS "acumus" numeric,
  ADD COLUMN IF NOT EXISTS "isalario" numeric,
  ADD COLUMN IF NOT EXISTS "idias" numeric,
  ADD COLUMN IF NOT EXISTS "iibc" numeric,
  ADD COLUMN IF NOT EXISTS "dvaca" numeric,
  ADD COLUMN IF NOT EXISTS "tip_con" numeric,
  ADD COLUMN IF NOT EXISTS "subcla" numeric,
  ADD COLUMN IF NOT EXISTS "det_bas" numeric,
  ADD COLUMN IF NOT EXISTS "siapl" numeric,
  ADD COLUMN IF NOT EXISTS "esbase" numeric,
  ADD COLUMN IF NOT EXISTS "a_nom" numeric,
  ADD COLUMN IF NOT EXISTS "a_vac" numeric,
  ADD COLUMN IF NOT EXISTS "a_liq" numeric,
  ADD COLUMN IF NOT EXISTS "base_pres" numeric,
  ADD COLUMN IF NOT EXISTS "a_primas" numeric,
  ADD COLUMN IF NOT EXISTS "incapaci" numeric,
  ADD COLUMN IF NOT EXISTS "req_cco" numeric,
  ADD COLUMN IF NOT EXISTS "apl_pila" numeric,
  ADD COLUMN IF NOT EXISTS "dias" numeric,
  ADD COLUMN IF NOT EXISTS "iesap" numeric,
  ADD COLUMN IF NOT EXISTS "iminis" numeric,
  ADD COLUMN IF NOT EXISTS "a_ces" numeric,
  ADD COLUMN IF NOT EXISTS "a_int" numeric,
  ADD COLUMN IF NOT EXISTS "no_suma" numeric,
  ADD COLUMN IF NOT EXISTS "cont_pres" numeric,
  ADD COLUMN IF NOT EXISTS "noreactiva" numeric,
  ADD COLUMN IF NOT EXISTS "linca" numeric,
  ADD COLUMN IF NOT EXISTS "prom_vaca" numeric,
  ADD COLUMN IF NOT EXISTS "ifsubs" numeric,
  ADD COLUMN IF NOT EXISTS "dct_cesan" numeric,
  ADD COLUMN IF NOT EXISTS "dct_icesan" numeric,
  ADD COLUMN IF NOT EXISTS "dct_primas" numeric,
  ADD COLUMN IF NOT EXISTS "indemniza" numeric,
  ADD COLUMN IF NOT EXISTS "tretencion" numeric,
  ADD COLUMN IF NOT EXISTS "redondear" numeric,
  ADD COLUMN IF NOT EXISTS "redondearbase" numeric,
  ADD COLUMN IF NOT EXISTS "anticipo" numeric,
  ADD COLUMN IF NOT EXISTS "conalt" text,
  ADD COLUMN IF NOT EXISTS "desnomfac" numeric,
  ADD COLUMN IF NOT EXISTS "a_extra" numeric,
  ADD COLUMN IF NOT EXISTS "nosefactura" numeric,
  ADD COLUMN IF NOT EXISTS "basepara" numeric,
  ADD COLUMN IF NOT EXISTS "ded_pres" numeric,
  ADD COLUMN IF NOT EXISTS "exc_dev" numeric,
  ADD COLUMN IF NOT EXISTS "itemce" numeric,
  ADD COLUMN IF NOT EXISTS "especial" numeric,
  ADD COLUMN IF NOT EXISTS "rt2" numeric,
  ADD COLUMN IF NOT EXISTS "rt1" numeric,
  ADD COLUMN IF NOT EXISTS "por_inter" numeric,
  ADD COLUMN IF NOT EXISTS "ucon" numeric,
  ADD COLUMN IF NOT EXISTS "ord_liq" numeric,
  ADD COLUMN IF NOT EXISTS "ilicencia" numeric,
  ADD COLUMN IF NOT EXISTS "eximprfinal" numeric,
  ADD COLUMN IF NOT EXISTS "cvacacion" numeric,
  ADD COLUMN IF NOT EXISTS "afecesan" numeric,
  ADD COLUMN IF NOT EXISTS "prestacion" numeric,
  ADD COLUMN IF NOT EXISTS "aplidias" numeric,
  ADD COLUMN IF NOT EXISTS "ad1393" numeric,
  ADD COLUMN IF NOT EXISTS "cinterno" numeric,
  ADD COLUMN IF NOT EXISTS "vacom" numeric,
  ADD COLUMN IF NOT EXISTS "rbase" numeric,
  ADD COLUMN IF NOT EXISTS "itemce2" numeric,
  ADD COLUMN IF NOT EXISTS "item2276" text,
  ADD COLUMN IF NOT EXISTS "item2020" text,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "rfteud" numeric,
  ADD COLUMN IF NOT EXISTS "cod_cne" text,
  ADD COLUMN IF NOT EXISTS "hextra" numeric,
  ADD COLUMN IF NOT EXISTS "saladicional" numeric,
  ADD COLUMN IF NOT EXISTS "apl_glob" numeric,
  ADD COLUMN IF NOT EXISTS "distsal" numeric,
  ADD COLUMN IF NOT EXISTS "dbob" numeric,
  ADD COLUMN IF NOT EXISTS "cfondo" numeric,
  ADD COLUMN IF NOT EXISTS "ctafondo" text,
  ADD COLUMN IF NOT EXISTS "ctaempr" text,
  ADD COLUMN IF NOT EXISTS "porcen" numeric,
  ADD COLUMN IF NOT EXISTS "ctafondo2" text,
  ADD COLUMN IF NOT EXISTS "concep" text,
  ADD COLUMN IF NOT EXISTS "concep2" text,
  ADD COLUMN IF NOT EXISTS "otronit" text,
  ADD COLUMN IF NOT EXISTS "rp1" numeric,
  ADD COLUMN IF NOT EXISTS "rp2" numeric,
  ADD COLUMN IF NOT EXISTS "tincapa" numeric,
  ADD COLUMN IF NOT EXISTS "cod_the" text,
  ADD COLUMN IF NOT EXISTS "diasdnom" numeric,
  ADD COLUMN IF NOT EXISTS "licend" numeric,
  ADD COLUMN IF NOT EXISTS "orden" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_no_pri_con_codigo ON mgx_no_pri_con ("empresa", "codigo");
ALTER TABLE mgx_no_pri_con ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_pri_con TO service_role;
COMMENT ON TABLE mgx_no_pri_con IS 'Espejo de emp{N}no.pri_con de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_pri_ctr ─ 9 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_pri_ctr (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_pri_ctr
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "riesgo" numeric,
  ADD COLUMN IF NOT EXISTS "cen_trab" text,
  ADD COLUMN IF NOT EXISTS "cla_tar" numeric,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "activo" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_no_pri_ctr_codigo ON mgx_no_pri_ctr ("empresa", "codigo");
ALTER TABLE mgx_no_pri_ctr ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_pri_ctr TO service_role;
COMMENT ON TABLE mgx_no_pri_ctr IS 'Espejo de emp{N}no.pri_ctr de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_pri_dpt ─ 6 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_pri_dpt (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_pri_dpt
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "cod_cli" text,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp;
CREATE INDEX IF NOT EXISTS idx_mgx_no_pri_dpt_codigo ON mgx_no_pri_dpt ("empresa", "codigo");
ALTER TABLE mgx_no_pri_dpt ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_pri_dpt TO service_role;
COMMENT ON TABLE mgx_no_pri_dpt IS 'Espejo de emp{N}no.pri_dpt de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_pri_epr ─ 31 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_pri_epr (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_pri_epr
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "direccion" text,
  ADD COLUMN IF NOT EXISTS "telefonos" text,
  ADD COLUMN IF NOT EXISTS "nit" text,
  ADD COLUMN IF NOT EXISTS "cod_cos" text,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "afondo" numeric,
  ADD COLUMN IF NOT EXISTS "codpago" text,
  ADD COLUMN IF NOT EXISTS "cod_ciu" text,
  ADD COLUMN IF NOT EXISTS "estado" numeric,
  ADD COLUMN IF NOT EXISTS "nit_epr" text,
  ADD COLUMN IF NOT EXISTS "nombre1" text,
  ADD COLUMN IF NOT EXISTS "idioma" text,
  ADD COLUMN IF NOT EXISTS "moneda" text,
  ADD COLUMN IF NOT EXISTS "idsoftware" text,
  ADD COLUMN IF NOT EXISTS "softwaresc" text,
  ADD COLUMN IF NOT EXISTS "ambiente" numeric,
  ADD COLUMN IF NOT EXISTS "nme" numeric,
  ADD COLUMN IF NOT EXISTS "certificado" text,
  ADD COLUMN IF NOT EXISTS "clavecerti" text,
  ADD COLUMN IF NOT EXISTS "fecfin" date,
  ADD COLUMN IF NOT EXISTS "requestws_urlh" text,
  ADD COLUMN IF NOT EXISTS "requestws_urlp" text,
  ADD COLUMN IF NOT EXISTS "testsetid" text,
  ADD COLUMN IF NOT EXISTS "ine" text,
  ADD COLUMN IF NOT EXISTS "ina" text,
  ADD COLUMN IF NOT EXISTS "auto" text,
  ADD COLUMN IF NOT EXISTS "pinsoft" text;
CREATE INDEX IF NOT EXISTS idx_mgx_no_pri_epr_codigo ON mgx_no_pri_epr ("empresa", "codigo");
ALTER TABLE mgx_no_pri_epr ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_pri_epr TO service_role;
COMMENT ON TABLE mgx_no_pri_epr IS 'Espejo de emp{N}no.pri_epr de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_pri_est ─ 3 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_pri_est (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_pri_est
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text;
CREATE INDEX IF NOT EXISTS idx_mgx_no_pri_est_codigo ON mgx_no_pri_est ("empresa", "codigo");
ALTER TABLE mgx_no_pri_est ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_pri_est TO service_role;
COMMENT ON TABLE mgx_no_pri_est IS 'Espejo de emp{N}no.pri_est de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_pri_gpa ─ 20 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_pri_gpa (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_pri_gpa
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "cod_sun" text,
  ADD COLUMN IF NOT EXISTS "tipo" numeric,
  ADD COLUMN IF NOT EXISTS "provision" numeric,
  ADD COLUMN IF NOT EXISTS "liquida" numeric,
  ADD COLUMN IF NOT EXISTS "sinseg" numeric,
  ADD COLUMN IF NOT EXISTS "tip_gpa" numeric,
  ADD COLUMN IF NOT EXISTS "ibc_min" numeric,
  ADD COLUMN IF NOT EXISTS "aux" numeric,
  ADD COLUMN IF NOT EXISTS "pbseso" numeric,
  ADD COLUMN IF NOT EXISTS "tipoliqui" numeric,
  ADD COLUMN IF NOT EXISTS "segtotal" numeric,
  ADD COLUMN IF NOT EXISTS "sppm" numeric,
  ADD COLUMN IF NOT EXISTS "baspro" numeric,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "maxvw" numeric,
  ADD COLUMN IF NOT EXISTS "iprod" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_no_pri_gpa_codigo ON mgx_no_pri_gpa ("empresa", "codigo");
ALTER TABLE mgx_no_pri_gpa ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_pri_gpa TO service_role;
COMMENT ON TABLE mgx_no_pri_gpa IS 'Espejo de emp{N}no.pri_gpa de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_pri_per ─ 38 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_pri_per (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_pri_per
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "fec_ini" date,
  ADD COLUMN IF NOT EXISTS "fec_fin" date,
  ADD COLUMN IF NOT EXISTS "cod_tno" text,
  ADD COLUMN IF NOT EXISTS "fec_pag" date,
  ADD COLUMN IF NOT EXISTS "est_per" numeric,
  ADD COLUMN IF NOT EXISTS "subper" numeric,
  ADD COLUMN IF NOT EXISTS "finov" date,
  ADD COLUMN IF NOT EXISTS "ffnov" date,
  ADD COLUMN IF NOT EXISTS "ctiempo" numeric,
  ADD COLUMN IF NOT EXISTS "cod_gpa" text,
  ADD COLUMN IF NOT EXISTS "prima" numeric,
  ADD COLUMN IF NOT EXISTS "cod_epr" text,
  ADD COLUMN IF NOT EXISTS "d_nomina" text,
  ADD COLUMN IF NOT EXISTS "d_tiempo" text,
  ADD COLUMN IF NOT EXISTS "pcesan" numeric,
  ADD COLUMN IF NOT EXISTS "d_cesa" text,
  ADD COLUMN IF NOT EXISTS "d_primas" text,
  ADD COLUMN IF NOT EXISTS "aicesa" numeric,
  ADD COLUMN IF NOT EXISTS "liquida" numeric,
  ADD COLUMN IF NOT EXISTS "d_intereses" text,
  ADD COLUMN IF NOT EXISTS "liqinteres" numeric,
  ADD COLUMN IF NOT EXISTS "pinca" numeric,
  ADD COLUMN IF NOT EXISTS "d_inca" text,
  ADD COLUMN IF NOT EXISTS "d_planilla" text,
  ADD COLUMN IF NOT EXISTS "p_consigna" numeric,
  ADD COLUMN IF NOT EXISTS "d_consigna" text,
  ADD COLUMN IF NOT EXISTS "fec_proi" date,
  ADD COLUMN IF NOT EXISTS "fec_prof" date,
  ADD COLUMN IF NOT EXISTS "facturada" numeric,
  ADD COLUMN IF NOT EXISTS "extra" numeric,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "dsfinal" text,
  ADD COLUMN IF NOT EXISTS "reliquip" numeric,
  ADD COLUMN IF NOT EXISTS "disweb" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_no_pri_per_codigo ON mgx_no_pri_per ("empresa", "codigo");
ALTER TABLE mgx_no_pri_per ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_pri_per TO service_role;
COMMENT ON TABLE mgx_no_pri_per IS 'Espejo de emp{N}no.pri_per de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_cabeza ─ 75 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_cabeza (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_cabeza
  ADD COLUMN IF NOT EXISTS "ano_doc" text,
  ADD COLUMN IF NOT EXISTS "per_doc" text,
  ADD COLUMN IF NOT EXISTS "tip_doc" text,
  ADD COLUMN IF NOT EXISTS "num_doc" text,
  ADD COLUMN IF NOT EXISTS "fin" text,
  ADD COLUMN IF NOT EXISTS "fecha" date,
  ADD COLUMN IF NOT EXISTS "descrip" text,
  ADD COLUMN IF NOT EXISTS "usuario" text,
  ADD COLUMN IF NOT EXISTS "prote" numeric,
  ADD COLUMN IF NOT EXISTS "total" numeric,
  ADD COLUMN IF NOT EXISTS "empre" text,
  ADD COLUMN IF NOT EXISTS "solu" text,
  ADD COLUMN IF NOT EXISTS "cod_epl" text,
  ADD COLUMN IF NOT EXISTS "cod_per" text,
  ADD COLUMN IF NOT EXISTS "cod_epr" text,
  ADD COLUMN IF NOT EXISTS "cod_gtu" text,
  ADD COLUMN IF NOT EXISTS "fec_fin" date,
  ADD COLUMN IF NOT EXISTS "usercreo" text,
  ADD COLUMN IF NOT EXISTS "tipo" numeric,
  ADD COLUMN IF NOT EXISTS "recargo" numeric,
  ADD COLUMN IF NOT EXISTS "sueldo" numeric,
  ADD COLUMN IF NOT EXISTS "per_ini" date,
  ADD COLUMN IF NOT EXISTS "per_fin" date,
  ADD COLUMN IF NOT EXISTS "per_disi" date,
  ADD COLUMN IF NOT EXISTS "per_disf" date,
  ADD COLUMN IF NOT EXISTS "per_noi" date,
  ADD COLUMN IF NOT EXISTS "per_nof" date,
  ADD COLUMN IF NOT EXISTS "dias_cau" numeric,
  ADD COLUMN IF NOT EXISTS "dias_dine" numeric,
  ADD COLUMN IF NOT EXISTS "dias" numeric,
  ADD COLUMN IF NOT EXISTS "dias_nom" numeric,
  ADD COLUMN IF NOT EXISTS "dias_sus" numeric,
  ADD COLUMN IF NOT EXISTS "apl_nove" numeric,
  ADD COLUMN IF NOT EXISTS "final" numeric,
  ADD COLUMN IF NOT EXISTS "fhedicion" timestamp,
  ADD COLUMN IF NOT EXISTS "fhcreacion" timestamp,
  ADD COLUMN IF NOT EXISTS "contralq" text,
  ADD COLUMN IF NOT EXISTS "suscontrat" numeric,
  ADD COLUMN IF NOT EXISTS "tneto" numeric,
  ADD COLUMN IF NOT EXISTS "fcesan" date,
  ADD COLUMN IF NOT EXISTS "fcesanf" date,
  ADD COLUMN IF NOT EXISTS "fprmas" date,
  ADD COLUMN IF NOT EXISTS "fprmasf" date,
  ADD COLUMN IF NOT EXISTS "basecesa" numeric,
  ADD COLUMN IF NOT EXISTS "dia_fes" numeric,
  ADD COLUMN IF NOT EXISTS "dia_hab" numeric,
  ADD COLUMN IF NOT EXISTS "dias_tra" numeric,
  ADD COLUMN IF NOT EXISTS "fec_ing" date,
  ADD COLUMN IF NOT EXISTS "cod_mtc" text,
  ADD COLUMN IF NOT EXISTS "cod_car" text,
  ADD COLUMN IF NOT EXISTS "cod_tco" text,
  ADD COLUMN IF NOT EXISTS "observa" text,
  ADD COLUMN IF NOT EXISTS "ori_mov" numeric,
  ADD COLUMN IF NOT EXISTS "doc_con" text,
  ADD COLUMN IF NOT EXISTS "resolucion" text,
  ADD COLUMN IF NOT EXISTS "equipo" text,
  ADD COLUMN IF NOT EXISTS "facturado" numeric,
  ADD COLUMN IF NOT EXISTS "generado" numeric,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "plantilla" numeric,
  ADD COLUMN IF NOT EXISTS "nomplantilla" text,
  ADD COLUMN IF NOT EXISTS "pendientes" numeric,
  ADD COLUMN IF NOT EXISTS "diaacumular" numeric,
  ADD COLUMN IF NOT EXISTS "diaparciales" numeric,
  ADD COLUMN IF NOT EXISTS "nom_epr" text,
  ADD COLUMN IF NOT EXISTS "novcontra" text,
  ADD COLUMN IF NOT EXISTS "dnom" numeric,
  ADD COLUMN IF NOT EXISTS "diasvalor" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ips" text,
  ADD COLUMN IF NOT EXISTS "cod_cie" text,
  ADD COLUMN IF NOT EXISTS "cod_cos" text,
  ADD COLUMN IF NOT EXISTS "doc_rel" text,
  ADD COLUMN IF NOT EXISTS "cod_esi" text;
ALTER TABLE mgx_no_cabeza ADD COLUMN IF NOT EXISTS llave_doc text GENERATED ALWAYS AS (coalesce("ano_doc", '') || '|' || coalesce("per_doc", '') || '|' || coalesce("tip_doc", '') || '|' || coalesce("num_doc", '')) STORED;
CREATE INDEX IF NOT EXISTS idx_mgx_no_cabeza_llave_doc ON mgx_no_cabeza ("empresa", "llave_doc");
CREATE INDEX IF NOT EXISTS idx_mgx_no_cabeza_fecha ON mgx_no_cabeza ("empresa", "fecha");
ALTER TABLE mgx_no_cabeza ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_cabeza TO service_role;
COMMENT ON TABLE mgx_no_cabeza IS 'Espejo de emp{N}no.cabeza de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_no_cuerpo ─ 116 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_no_cuerpo (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_no_cuerpo
  ADD COLUMN IF NOT EXISTS "ano_doc" text,
  ADD COLUMN IF NOT EXISTS "per_doc" text,
  ADD COLUMN IF NOT EXISTS "tip_doc" text,
  ADD COLUMN IF NOT EXISTS "num_doc" text,
  ADD COLUMN IF NOT EXISTS "ini" text,
  ADD COLUMN IF NOT EXISTS "fin" numeric,
  ADD COLUMN IF NOT EXISTS "item" numeric,
  ADD COLUMN IF NOT EXISTS "valor" numeric,
  ADD COLUMN IF NOT EXISTS "detalle" text,
  ADD COLUMN IF NOT EXISTS "cod_con" text,
  ADD COLUMN IF NOT EXISTS "cantidad" numeric,
  ADD COLUMN IF NOT EXISTS "fec_ini" date,
  ADD COLUMN IF NOT EXISTS "cuotas" numeric,
  ADD COLUMN IF NOT EXISTS "saldo" numeric,
  ADD COLUMN IF NOT EXISTS "mensual" numeric,
  ADD COLUMN IF NOT EXISTS "ctamens" numeric,
  ADD COLUMN IF NOT EXISTS "fec_fin" date,
  ADD COLUMN IF NOT EXISTS "periodo" text,
  ADD COLUMN IF NOT EXISTS "cod_epl" text,
  ADD COLUMN IF NOT EXISTS "abonos" numeric,
  ADD COLUMN IF NOT EXISTS "c_nomina" text,
  ADD COLUMN IF NOT EXISTS "sbase" numeric,
  ADD COLUMN IF NOT EXISTS "dias" numeric,
  ADD COLUMN IF NOT EXISTS "p_patro" numeric,
  ADD COLUMN IF NOT EXISTS "v_patro" numeric,
  ADD COLUMN IF NOT EXISTS "cod_gtu" text,
  ADD COLUMN IF NOT EXISTS "ori" numeric,
  ADD COLUMN IF NOT EXISTS "rn" numeric,
  ADD COLUMN IF NOT EXISTS "ed" numeric,
  ADD COLUMN IF NOT EXISTS "en" numeric,
  ADD COLUMN IF NOT EXISTS "hedd" numeric,
  ADD COLUMN IF NOT EXISTS "hedn" numeric,
  ADD COLUMN IF NOT EXISTS "hrnd" numeric,
  ADD COLUMN IF NOT EXISTS "hernd" numeric,
  ADD COLUMN IF NOT EXISTS "hor_ini" text,
  ADD COLUMN IF NOT EXISTS "hor_fin" text,
  ADD COLUMN IF NOT EXISTS "ta" numeric,
  ADD COLUMN IF NOT EXISTS "vdomi" numeric,
  ADD COLUMN IF NOT EXISTS "horas" numeric,
  ADD COLUMN IF NOT EXISTS "cod_doc" text,
  ADD COLUMN IF NOT EXISTS "fec_ven" date,
  ADD COLUMN IF NOT EXISTS "fijo" numeric,
  ADD COLUMN IF NOT EXISTS "suspen" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tur" text,
  ADD COLUMN IF NOT EXISTS "tip_des" numeric,
  ADD COLUMN IF NOT EXISTS "cod_can" text,
  ADD COLUMN IF NOT EXISTS "referencia" text,
  ADD COLUMN IF NOT EXISTS "cod_gpa" text,
  ADD COLUMN IF NOT EXISTS "cod_ctr" text,
  ADD COLUMN IF NOT EXISTS "fec_dis1" date,
  ADD COLUMN IF NOT EXISTS "fef_dis2" date,
  ADD COLUMN IF NOT EXISTS "val_fes" numeric,
  ADD COLUMN IF NOT EXISTS "est_emp" numeric,
  ADD COLUMN IF NOT EXISTS "cod_car" text,
  ADD COLUMN IF NOT EXISTS "cod_tco" text,
  ADD COLUMN IF NOT EXISTS "cod_epr" text,
  ADD COLUMN IF NOT EXISTS "sueldo" numeric,
  ADD COLUMN IF NOT EXISTS "observa" text,
  ADD COLUMN IF NOT EXISTS "cod_cos" text,
  ADD COLUMN IF NOT EXISTS "cod_tct" text,
  ADD COLUMN IF NOT EXISTS "nom_con" text,
  ADD COLUMN IF NOT EXISTS "nom_gtu" text,
  ADD COLUMN IF NOT EXISTS "nom_doc" text,
  ADD COLUMN IF NOT EXISTS "nom_tur" text,
  ADD COLUMN IF NOT EXISTS "nom_can" text,
  ADD COLUMN IF NOT EXISTS "nom_gpa" text,
  ADD COLUMN IF NOT EXISTS "nom_ctr" text,
  ADD COLUMN IF NOT EXISTS "nom_car" text,
  ADD COLUMN IF NOT EXISTS "nom_tco" text,
  ADD COLUMN IF NOT EXISTS "nom_epr" text,
  ADD COLUMN IF NOT EXISTS "nom_os" text,
  ADD COLUMN IF NOT EXISTS "nom_fij" text,
  ADD COLUMN IF NOT EXISTS "nom_es" text,
  ADD COLUMN IF NOT EXISTS "nom_emp" text,
  ADD COLUMN IF NOT EXISTS "nom_apt" text,
  ADD COLUMN IF NOT EXISTS "nom_lab" text,
  ADD COLUMN IF NOT EXISTS "nom_fam" text,
  ADD COLUMN IF NOT EXISTS "nom_act" text,
  ADD COLUMN IF NOT EXISTS "nom_pag" text,
  ADD COLUMN IF NOT EXISTS "nom_arp" text,
  ADD COLUMN IF NOT EXISTS "nom_bar" text,
  ADD COLUMN IF NOT EXISTS "nom_caj" text,
  ADD COLUMN IF NOT EXISTS "nom_cco" text,
  ADD COLUMN IF NOT EXISTS "nom_conf" text,
  ADD COLUMN IF NOT EXISTS "nom_dli" text,
  ADD COLUMN IF NOT EXISTS "nom_dpt" text,
  ADD COLUMN IF NOT EXISTS "nom_edu" text,
  ADD COLUMN IF NOT EXISTS "nom_tct" text,
  ADD COLUMN IF NOT EXISTS "nom_epl" text,
  ADD COLUMN IF NOT EXISTS "nom_cos" text,
  ADD COLUMN IF NOT EXISTS "per_sus" text,
  ADD COLUMN IF NOT EXISTS "contrato" text,
  ADD COLUMN IF NOT EXISTS "por_cesan" numeric,
  ADD COLUMN IF NOT EXISTS "por_primas" numeric,
  ADD COLUMN IF NOT EXISTS "por_inter" numeric,
  ADD COLUMN IF NOT EXISTS "por_vaca" numeric,
  ADD COLUMN IF NOT EXISTS "cod_arp" text,
  ADD COLUMN IF NOT EXISTS "cod_fon" text,
  ADD COLUMN IF NOT EXISTS "nom_fon" text,
  ADD COLUMN IF NOT EXISTS "cod_sal" text,
  ADD COLUMN IF NOT EXISTS "cod_pen" text,
  ADD COLUMN IF NOT EXISTS "cod_dpt" text,
  ADD COLUMN IF NOT EXISTS "cod_ciu" text,
  ADD COLUMN IF NOT EXISTS "nom_pry" text,
  ADD COLUMN IF NOT EXISTS "cod_pry" text,
  ADD COLUMN IF NOT EXISTS "intereses" numeric,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "aprendiz" numeric,
  ADD COLUMN IF NOT EXISTS "doc_rel" text,
  ADD COLUMN IF NOT EXISTS "cod_tsa" text,
  ADD COLUMN IF NOT EXISTS "cod_cie" text,
  ADD COLUMN IF NOT EXISTS "nom_cie" text,
  ADD COLUMN IF NOT EXISTS "fecsus" date,
  ADD COLUMN IF NOT EXISTS "apre_prod" numeric;
ALTER TABLE mgx_no_cuerpo ADD COLUMN IF NOT EXISTS llave_doc text GENERATED ALWAYS AS (coalesce("ano_doc", '') || '|' || coalesce("per_doc", '') || '|' || coalesce("tip_doc", '') || '|' || coalesce("num_doc", '')) STORED;
CREATE INDEX IF NOT EXISTS idx_mgx_no_cuerpo_llave_doc ON mgx_no_cuerpo ("empresa", "llave_doc");
CREATE INDEX IF NOT EXISTS idx_mgx_no_cuerpo_cod_epl ON mgx_no_cuerpo ("empresa", "cod_epl");
ALTER TABLE mgx_no_cuerpo ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_no_cuerpo TO service_role;
COMMENT ON TABLE mgx_no_cuerpo IS 'Espejo de emp{N}no.cuerpo de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_det_lpr ─ 9 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_det_lpr (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_det_lpr
  ADD COLUMN IF NOT EXISTS "cod_lis" text,
  ADD COLUMN IF NOT EXISTS "cod_ref" text,
  ADD COLUMN IF NOT EXISTS "precio" numeric,
  ADD COLUMN IF NOT EXISTS "utilidad" numeric,
  ADD COLUMN IF NOT EXISTS "pre_cos" numeric,
  ADD COLUMN IF NOT EXISTS "iva" numeric,
  ADD COLUMN IF NOT EXISTS "precioiva" numeric,
  ADD COLUMN IF NOT EXISTS "minimo" numeric;
ALTER TABLE mgx_in_det_lpr ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_det_lpr TO service_role;
COMMENT ON TABLE mgx_in_det_lpr IS 'Espejo de emp{N}in.det_lpr de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_mgx_csc ─ 10 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_mgx_csc (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_mgx_csc
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "conse" text,
  ADD COLUMN IF NOT EXISTS "iniciales" text,
  ADD COLUMN IF NOT EXISTS "actual" numeric,
  ADD COLUMN IF NOT EXISTS "ancho" numeric,
  ADD COLUMN IF NOT EXISTS "multiconse" numeric,
  ADD COLUMN IF NOT EXISTS "acuano" numeric,
  ADD COLUMN IF NOT EXISTS "acuper" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_in_mgx_csc_codigo ON mgx_in_mgx_csc ("empresa", "codigo");
ALTER TABLE mgx_in_mgx_csc ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_mgx_csc TO service_role;
COMMENT ON TABLE mgx_in_mgx_csc IS 'Espejo de emp{N}in.mgx_csc de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_bod ─ 22 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_bod (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_bod
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "direccion" text,
  ADD COLUMN IF NOT EXISTS "telefonos" text,
  ADD COLUMN IF NOT EXISTS "encargado" text,
  ADD COLUMN IF NOT EXISTS "actualiza" numeric,
  ADD COLUMN IF NOT EXISTS "cod_enc" text,
  ADD COLUMN IF NOT EXISTS "cod_suc" text,
  ADD COLUMN IF NOT EXISTS "pv" numeric,
  ADD COLUMN IF NOT EXISTS "cod_lis" text,
  ADD COLUMN IF NOT EXISTS "cod_cos" text,
  ADD COLUMN IF NOT EXISTS "qpc" text,
  ADD COLUMN IF NOT EXISTS "cod_ciu" text,
  ADD COLUMN IF NOT EXISTS "tipor" numeric,
  ADD COLUMN IF NOT EXISTS "qsquema" text,
  ADD COLUMN IF NOT EXISTS "qbd" text,
  ADD COLUMN IF NOT EXISTS "ipserver" text,
  ADD COLUMN IF NOT EXISTS "gru_pos" text,
  ADD COLUMN IF NOT EXISTS "binterna" numeric,
  ADD COLUMN IF NOT EXISTS "activa" numeric,
  ADD COLUMN IF NOT EXISTS "bconsig" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_bod_codigo ON mgx_in_pri_bod ("empresa", "codigo");
ALTER TABLE mgx_in_pri_bod ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_bod TO service_role;
COMMENT ON TABLE mgx_in_pri_bod IS 'Espejo de emp{N}in.pri_bod de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_col ─ 3 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_col (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_col
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_col_codigo ON mgx_in_pri_col ("empresa", "codigo");
ALTER TABLE mgx_in_pri_col ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_col TO service_role;
COMMENT ON TABLE mgx_in_pri_col IS 'Espejo de emp{N}in.pri_col de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_gru ─ 30 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_gru (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_gru
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "cta_inv" text,
  ADD COLUMN IF NOT EXISTS "cta_cos" text,
  ADD COLUMN IF NOT EXISTS "cta_ret" text,
  ADD COLUMN IF NOT EXISTS "cta_ing" text,
  ADD COLUMN IF NOT EXISTS "int_con" numeric,
  ADD COLUMN IF NOT EXISTS "serial" numeric,
  ADD COLUMN IF NOT EXISTS "man_can" numeric,
  ADD COLUMN IF NOT EXISTS "cta_dev" text,
  ADD COLUMN IF NOT EXISTS "cta_dec" text,
  ADD COLUMN IF NOT EXISTS "ret_ven" text,
  ADD COLUMN IF NOT EXISTS "dec_ant" text,
  ADD COLUMN IF NOT EXISTS "dev_ant" text,
  ADD COLUMN IF NOT EXISTS "cta_ant" text,
  ADD COLUMN IF NOT EXISTS "cta_mp" text,
  ADD COLUMN IF NOT EXISTS "cta_ppr" text,
  ADD COLUMN IF NOT EXISTS "cta_mpr" text,
  ADD COLUMN IF NOT EXISTS "cta_izf" text,
  ADD COLUMN IF NOT EXISTS "cdv_czf" text,
  ADD COLUMN IF NOT EXISTS "cta_dfc" text,
  ADD COLUMN IF NOT EXISTS "cta_dfv" text,
  ADD COLUMN IF NOT EXISTS "ivacosto" numeric,
  ADD COLUMN IF NOT EXISTS "cta_riv" text,
  ADD COLUMN IF NOT EXISTS "avnr" numeric,
  ADD COLUMN IF NOT EXISTS "cta_vnr" text,
  ADD COLUMN IF NOT EXISTS "cta_obs" text,
  ADD COLUMN IF NOT EXISTS "cta_ivi" text,
  ADD COLUMN IF NOT EXISTS "cta_idi" text;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_gru_codigo ON mgx_in_pri_gru ("empresa", "codigo");
ALTER TABLE mgx_in_pri_gru ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_gru TO service_role;
COMMENT ON TABLE mgx_in_pri_gru IS 'Espejo de emp{N}in.pri_gru de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_lin ─ 4 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_lin (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_lin
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "pv" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_lin_codigo ON mgx_in_pri_lin ("empresa", "codigo");
ALTER TABLE mgx_in_pri_lin ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_lin TO service_role;
COMMENT ON TABLE mgx_in_pri_lin IS 'Espejo de emp{N}in.pri_lin de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_lis ─ 5 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_lis (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_lis
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "tipo" numeric,
  ADD COLUMN IF NOT EXISTS "estado" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_lis_codigo ON mgx_in_pri_lis ("empresa", "codigo");
ALTER TABLE mgx_in_pri_lis ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_lis TO service_role;
COMMENT ON TABLE mgx_in_pri_lis IS 'Espejo de emp{N}in.pri_lis de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_mov ─ 90 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_mov (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_mov
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "apl_cos" numeric,
  ADD COLUMN IF NOT EXISTS "apl_can" numeric,
  ADD COLUMN IF NOT EXISTS "apl_ven" numeric,
  ADD COLUMN IF NOT EXISTS "apl_cre" numeric,
  ADD COLUMN IF NOT EXISTS "apl_dis" numeric,
  ADD COLUMN IF NOT EXISTS "apl_des" numeric,
  ADD COLUMN IF NOT EXISTS "cal_iva" numeric,
  ADD COLUMN IF NOT EXISTS "cal_uti" numeric,
  ADD COLUMN IF NOT EXISTS "int_con" numeric,
  ADD COLUMN IF NOT EXISTS "can_aju" numeric,
  ADD COLUMN IF NOT EXISTS "revi_ter" numeric,
  ADD COLUMN IF NOT EXISTS "mov_con" text,
  ADD COLUMN IF NOT EXISTS "frm_cal" text,
  ADD COLUMN IF NOT EXISTS "acum" numeric,
  ADD COLUMN IF NOT EXISTS "listaterceros" text,
  ADD COLUMN IF NOT EXISTS "tipodefpagos" numeric,
  ADD COLUMN IF NOT EXISTS "bod_pre" text,
  ADD COLUMN IF NOT EXISTS "tip_prod" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ifc" text,
  ADD COLUMN IF NOT EXISTS "decimales" numeric,
  ADD COLUMN IF NOT EXISTS "cod_lis" text,
  ADD COLUMN IF NOT EXISTS "costeo" numeric,
  ADD COLUMN IF NOT EXISTS "factura" numeric,
  ADD COLUMN IF NOT EXISTS "ord_cos" numeric,
  ADD COLUMN IF NOT EXISTS "cod_fpa" text,
  ADD COLUMN IF NOT EXISTS "mensaje" text,
  ADD COLUMN IF NOT EXISTS "cod_cos" text,
  ADD COLUMN IF NOT EXISTS "ccartera" numeric,
  ADD COLUMN IF NOT EXISTS "tra_cos" numeric,
  ADD COLUMN IF NOT EXISTS "mod_fec" numeric,
  ADD COLUMN IF NOT EXISTS "disponible" numeric,
  ADD COLUMN IF NOT EXISTS "ctacxc" text,
  ADD COLUMN IF NOT EXISTS "mue_sald" numeric,
  ADD COLUMN IF NOT EXISTS "mconta" text,
  ADD COLUMN IF NOT EXISTS "boddes" text,
  ADD COLUMN IF NOT EXISTS "nit_pre" text,
  ADD COLUMN IF NOT EXISTS "forpred" text,
  ADD COLUMN IF NOT EXISTS "cos_pos" numeric,
  ADD COLUMN IF NOT EXISTS "emp_des" text,
  ADD COLUMN IF NOT EXISTS "mov_cie" text,
  ADD COLUMN IF NOT EXISTS "cotiza" numeric,
  ADD COLUMN IF NOT EXISTS "tbase" numeric,
  ADD COLUMN IF NOT EXISTS "terpre" text,
  ADD COLUMN IF NOT EXISTS "con_ot" numeric,
  ADD COLUMN IF NOT EXISTS "movdev" text,
  ADD COLUMN IF NOT EXISTS "qcolor" numeric,
  ADD COLUMN IF NOT EXISTS "mprede" numeric,
  ADD COLUMN IF NOT EXISTS "solofpago" numeric,
  ADD COLUMN IF NOT EXISTS "mbas" numeric,
  ADD COLUMN IF NOT EXISTS "bcosteo" numeric,
  ADD COLUMN IF NOT EXISTS "vtfact" numeric,
  ADD COLUMN IF NOT EXISTS "cod_suc" text,
  ADD COLUMN IF NOT EXISTS "pdescrip" numeric,
  ADD COLUMN IF NOT EXISTS "rcredito" numeric,
  ADD COLUMN IF NOT EXISTS "apl_com" numeric,
  ADD COLUMN IF NOT EXISTS "vniif" numeric,
  ADD COLUMN IF NOT EXISTS "dnifdcto" text,
  ADD COLUMN IF NOT EXISTS "acumcosto" numeric,
  ADD COLUMN IF NOT EXISTS "mpretercos" numeric,
  ADD COLUMN IF NOT EXISTS "pcartera" numeric,
  ADD COLUMN IF NOT EXISTS "tip_del" numeric,
  ADD COLUMN IF NOT EXISTS "tipotofe" numeric,
  ADD COLUMN IF NOT EXISTS "mod_dias" numeric,
  ADD COLUMN IF NOT EXISTS "grupos" text,
  ADD COLUMN IF NOT EXISTS "tipprofe" numeric,
  ADD COLUMN IF NOT EXISTS "aprofe" numeric,
  ADD COLUMN IF NOT EXISTS "preg_fe" numeric,
  ADD COLUMN IF NOT EXISTS "rconcep" numeric,
  ADD COLUMN IF NOT EXISTS "versionubl" text,
  ADD COLUMN IF NOT EXISTS "cod_toe" text,
  ADD COLUMN IF NOT EXISTS "dtransporte" numeric,
  ADD COLUMN IF NOT EXISTS "importmasv" numeric,
  ADD COLUMN IF NOT EXISTS "mov_not" text,
  ADD COLUMN IF NOT EXISTS "pmp" numeric,
  ADD COLUMN IF NOT EXISTS "tcitem" numeric,
  ADD COLUMN IF NOT EXISTS "redorete" numeric,
  ADD COLUMN IF NOT EXISTS "diasp" numeric,
  ADD COLUMN IF NOT EXISTS "msja" text,
  ADD COLUMN IF NOT EXISTS "mod_cos" numeric,
  ADD COLUMN IF NOT EXISTS "mov_web" numeric,
  ADD COLUMN IF NOT EXISTS "apldfc" numeric,
  ADD COLUMN IF NOT EXISTS "mensaje2" text,
  ADD COLUMN IF NOT EXISTS "ode" numeric,
  ADD COLUMN IF NOT EXISTS "cod_pry" text,
  ADD COLUMN IF NOT EXISTS "cod_ter" text,
  ADD COLUMN IF NOT EXISTS "forpred2" text,
  ADD COLUMN IF NOT EXISTS "tipca" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_mov_codigo ON mgx_in_pri_mov ("empresa", "codigo");
ALTER TABLE mgx_in_pri_mov ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_mov TO service_role;
COMMENT ON TABLE mgx_in_pri_mov IS 'Espejo de emp{N}in.pri_mov de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_ref ─ 64 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_ref (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_ref
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "ref_cod" text,
  ADD COLUMN IF NOT EXISTS "sto_min" numeric,
  ADD COLUMN IF NOT EXISTS "sto_max" numeric,
  ADD COLUMN IF NOT EXISTS "iva" numeric,
  ADD COLUMN IF NOT EXISTS "c_venta" text,
  ADD COLUMN IF NOT EXISTS "dcto_max" numeric,
  ADD COLUMN IF NOT EXISTS "cod_gru" text,
  ADD COLUMN IF NOT EXISTS "cod_und" text,
  ADD COLUMN IF NOT EXISTS "f_venta" date,
  ADD COLUMN IF NOT EXISTS "f_compra" date,
  ADD COLUMN IF NOT EXISTS "v_venta" numeric,
  ADD COLUMN IF NOT EXISTS "v_compra" numeric,
  ADD COLUMN IF NOT EXISTS "p_compra" text,
  ADD COLUMN IF NOT EXISTS "cod_civ" text,
  ADD COLUMN IF NOT EXISTS "can_com" numeric,
  ADD COLUMN IF NOT EXISTS "cod_lin" text,
  ADD COLUMN IF NOT EXISTS "fec_ing" date,
  ADD COLUMN IF NOT EXISTS "peso" numeric,
  ADD COLUMN IF NOT EXISTS "foto" text,
  ADD COLUMN IF NOT EXISTS "tipo" numeric,
  ADD COLUMN IF NOT EXISTS "v_costo" numeric,
  ADD COLUMN IF NOT EXISTS "p_venta" numeric,
  ADD COLUMN IF NOT EXISTS "p_terminado" numeric,
  ADD COLUMN IF NOT EXISTS "pro_com" text,
  ADD COLUMN IF NOT EXISTS "pre_cos" numeric,
  ADD COLUMN IF NOT EXISTS "cod_sgr" text,
  ADD COLUMN IF NOT EXISTS "cod_tal" text,
  ADD COLUMN IF NOT EXISTS "cod_col" text,
  ADD COLUMN IF NOT EXISTS "cod_eta" text,
  ADD COLUMN IF NOT EXISTS "observa" text,
  ADD COLUMN IF NOT EXISTS "activa" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tcf" text,
  ADD COLUMN IF NOT EXISTS "rexterna" numeric,
  ADD COLUMN IF NOT EXISTS "sincronizado" numeric,
  ADD COLUMN IF NOT EXISTS "cod_mar" text,
  ADD COLUMN IF NOT EXISTS "anoref" text,
  ADD COLUMN IF NOT EXISTS "mesref" text,
  ADD COLUMN IF NOT EXISTS "consemes" text,
  ADD COLUMN IF NOT EXISTS "man_lot" numeric,
  ADD COLUMN IF NOT EXISTS "avnr" numeric,
  ADD COLUMN IF NOT EXISTS "porvnr" numeric,
  ADD COLUMN IF NOT EXISTS "valvnr" numeric,
  ADD COLUMN IF NOT EXISTS "tipvnr" numeric,
  ADD COLUMN IF NOT EXISTS "cod_mod" text,
  ADD COLUMN IF NOT EXISTS "equmed" numeric,
  ADD COLUMN IF NOT EXISTS "districos" numeric,
  ADD COLUMN IF NOT EXISTS "timpcon" numeric,
  ADD COLUMN IF NOT EXISTS "impcon" numeric,
  ADD COLUMN IF NOT EXISTS "pvcomb" numeric,
  ADD COLUMN IF NOT EXISTS "gfa" numeric,
  ADD COLUMN IF NOT EXISTS "cod_gif" text,
  ADD COLUMN IF NOT EXISTS "ipropio" numeric,
  ADD COLUMN IF NOT EXISTS "cod_gec" text,
  ADD COLUMN IF NOT EXISTS "aiva" numeric,
  ADD COLUMN IF NOT EXISTS "icniva" numeric,
  ADD COLUMN IF NOT EXISTS "impuestos" numeric,
  ADD COLUMN IF NOT EXISTS "imprven" numeric,
  ADD COLUMN IF NOT EXISTS "nserial" text,
  ADD COLUMN IF NOT EXISTS "roperativa" numeric,
  ADD COLUMN IF NOT EXISTS "cod_mai" text,
  ADD COLUMN IF NOT EXISTS "cod_uns" text;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_ref_codigo ON mgx_in_pri_ref ("empresa", "codigo");
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_ref_ref_cod ON mgx_in_pri_ref ("empresa", "ref_cod");
ALTER TABLE mgx_in_pri_ref ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_ref TO service_role;
COMMENT ON TABLE mgx_in_pri_ref IS 'Espejo de emp{N}in.pri_ref de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_sgr ─ 3 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_sgr (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_sgr
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_sgr_codigo ON mgx_in_pri_sgr ("empresa", "codigo");
ALTER TABLE mgx_in_pri_sgr ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_sgr TO service_role;
COMMENT ON TABLE mgx_in_pri_sgr IS 'Espejo de emp{N}in.pri_sgr de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_tal ─ 3 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_tal (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_tal
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_tal_codigo ON mgx_in_pri_tal ("empresa", "codigo");
ALTER TABLE mgx_in_pri_tal ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_tal TO service_role;
COMMENT ON TABLE mgx_in_pri_tal IS 'Espejo de emp{N}in.pri_tal de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_pri_und ─ 4 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_pri_und (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_pri_und
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nombre" text,
  ADD COLUMN IF NOT EXISTS "cod_cun" text;
CREATE INDEX IF NOT EXISTS idx_mgx_in_pri_und_codigo ON mgx_in_pri_und ("empresa", "codigo");
ALTER TABLE mgx_in_pri_und ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_pri_und TO service_role;
COMMENT ON TABLE mgx_in_pri_und IS 'Espejo de emp{N}in.pri_und de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_cabeza ─ 156 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_cabeza (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_cabeza
  ADD COLUMN IF NOT EXISTS "ano_doc" text,
  ADD COLUMN IF NOT EXISTS "per_doc" text,
  ADD COLUMN IF NOT EXISTS "tip_doc" text,
  ADD COLUMN IF NOT EXISTS "num_doc" text,
  ADD COLUMN IF NOT EXISTS "fin" text,
  ADD COLUMN IF NOT EXISTS "fecha" timestamp,
  ADD COLUMN IF NOT EXISTS "descrip" text,
  ADD COLUMN IF NOT EXISTS "usuario" text,
  ADD COLUMN IF NOT EXISTS "prote" numeric,
  ADD COLUMN IF NOT EXISTS "total" numeric,
  ADD COLUMN IF NOT EXISTS "empre" text,
  ADD COLUMN IF NOT EXISTS "solu" text,
  ADD COLUMN IF NOT EXISTS "nit_ter" text,
  ADD COLUMN IF NOT EXISTS "dias" numeric,
  ADD COLUMN IF NOT EXISTS "fec_ven" date,
  ADD COLUMN IF NOT EXISTS "factura" text,
  ADD COLUMN IF NOT EXISTS "cod_fpa" text,
  ADD COLUMN IF NOT EXISTS "subtotal" numeric,
  ADD COLUMN IF NOT EXISTS "tot_des" numeric,
  ADD COLUMN IF NOT EXISTS "tot_iva" numeric,
  ADD COLUMN IF NOT EXISTS "tot_ret" numeric,
  ADD COLUMN IF NOT EXISTS "doc_dev" text,
  ADD COLUMN IF NOT EXISTS "fletes" numeric,
  ADD COLUMN IF NOT EXISTS "cod_cco" text,
  ADD COLUMN IF NOT EXISTS "observa" text,
  ADD COLUMN IF NOT EXISTS "ord_com" text,
  ADD COLUMN IF NOT EXISTS "est_mov" numeric,
  ADD COLUMN IF NOT EXISTS "diferencia" numeric,
  ADD COLUMN IF NOT EXISTS "con_fis" numeric,
  ADD COLUMN IF NOT EXISTS "cerrada" numeric,
  ADD COLUMN IF NOT EXISTS "mdias" numeric,
  ADD COLUMN IF NOT EXISTS "cod_epl" text,
  ADD COLUMN IF NOT EXISTS "num_req" text,
  ADD COLUMN IF NOT EXISTS "plazo" text,
  ADD COLUMN IF NOT EXISTS "cod_vig" text,
  ADD COLUMN IF NOT EXISTS "cod_pue" text,
  ADD COLUMN IF NOT EXISTS "mov_con" text,
  ADD COLUMN IF NOT EXISTS "tot_ica" numeric,
  ADD COLUMN IF NOT EXISTS "iva_desc" numeric,
  ADD COLUMN IF NOT EXISTS "iva_pagar" numeric,
  ADD COLUMN IF NOT EXISTS "por_desc" numeric,
  ADD COLUMN IF NOT EXISTS "por_pagar" numeric,
  ADD COLUMN IF NOT EXISTS "por_rete" numeric,
  ADD COLUMN IF NOT EXISTS "por_ica" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ues" text,
  ADD COLUMN IF NOT EXISTS "cod_pes" text,
  ADD COLUMN IF NOT EXISTS "usercreo" text,
  ADD COLUMN IF NOT EXISTS "fhcreacion" timestamp,
  ADD COLUMN IF NOT EXISTS "fhedicion" timestamp,
  ADD COLUMN IF NOT EXISTS "plantilla" numeric,
  ADD COLUMN IF NOT EXISTS "nomplantilla" text,
  ADD COLUMN IF NOT EXISTS "cod_ven" text,
  ADD COLUMN IF NOT EXISTS "ori_mov" numeric,
  ADD COLUMN IF NOT EXISTS "cod_suc" text,
  ADD COLUMN IF NOT EXISTS "por_iva" numeric,
  ADD COLUMN IF NOT EXISTS "fhautoriza" timestamp,
  ADD COLUMN IF NOT EXISTS "anticipo" numeric,
  ADD COLUMN IF NOT EXISTS "pedido" text,
  ADD COLUMN IF NOT EXISTS "ord_pro" text,
  ADD COLUMN IF NOT EXISTS "motivo" text,
  ADD COLUMN IF NOT EXISTS "num_oco" text,
  ADD COLUMN IF NOT EXISTS "otr_obser" text,
  ADD COLUMN IF NOT EXISTS "base" numeric,
  ADD COLUMN IF NOT EXISTS "dir_env" text,
  ADD COLUMN IF NOT EXISTS "iva_sim" numeric,
  ADD COLUMN IF NOT EXISTS "por_isim" numeric,
  ADD COLUMN IF NOT EXISTS "cod_lis" text,
  ADD COLUMN IF NOT EXISTS "por_comi" numeric,
  ADD COLUMN IF NOT EXISTS "tip_tras" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tve" text,
  ADD COLUMN IF NOT EXISTS "cod_caj" text,
  ADD COLUMN IF NOT EXISTS "pagado" numeric,
  ADD COLUMN IF NOT EXISTS "cambio" numeric,
  ADD COLUMN IF NOT EXISTS "capitalizacion" numeric,
  ADD COLUMN IF NOT EXISTS "terflete" text,
  ADD COLUMN IF NOT EXISTS "cod_bod" text,
  ADD COLUMN IF NOT EXISTS "axf" text,
  ADD COLUMN IF NOT EXISTS "axs" text,
  ADD COLUMN IF NOT EXISTS "cod_pry" text,
  ADD COLUMN IF NOT EXISTS "cod_den" text,
  ADD COLUMN IF NOT EXISTS "fec_req" date,
  ADD COLUMN IF NOT EXISTS "sincronizado" numeric,
  ADD COLUMN IF NOT EXISTS "fhsincro" timestamp,
  ADD COLUMN IF NOT EXISTS "cod_prs" text,
  ADD COLUMN IF NOT EXISTS "cod_ect" text,
  ADD COLUMN IF NOT EXISTS "cod_mec" text,
  ADD COLUMN IF NOT EXISTS "estado" numeric,
  ADD COLUMN IF NOT EXISTS "fentrega" date,
  ADD COLUMN IF NOT EXISTS "usuentrega" text,
  ADD COLUMN IF NOT EXISTS "dcglobal" numeric,
  ADD COLUMN IF NOT EXISTS "cod_pv" text,
  ADD COLUMN IF NOT EXISTS "fleteiva" numeric,
  ADD COLUMN IF NOT EXISTS "padmon" numeric,
  ADD COLUMN IF NOT EXISTS "vadmon" numeric,
  ADD COLUMN IF NOT EXISTS "pimprev" numeric,
  ADD COLUMN IF NOT EXISTS "vimprev" numeric,
  ADD COLUMN IF NOT EXISTS "putilidad" numeric,
  ADD COLUMN IF NOT EXISTS "vutilidad" numeric,
  ADD COLUMN IF NOT EXISTS "ret_cree" numeric,
  ADD COLUMN IF NOT EXISTS "por_cree" numeric,
  ADD COLUMN IF NOT EXISTS "por_dfi" numeric,
  ADD COLUMN IF NOT EXISTS "cod_mon" text,
  ADD COLUMN IF NOT EXISTS "des_fin" numeric,
  ADD COLUMN IF NOT EXISTS "obsercon" text,
  ADD COLUMN IF NOT EXISTS "oferta" text,
  ADD COLUMN IF NOT EXISTS "alcance" text,
  ADD COLUMN IF NOT EXISTS "anticipos" numeric,
  ADD COLUMN IF NOT EXISTS "rete_ser" numeric,
  ADD COLUMN IF NOT EXISTS "por_tsr" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tcs" text,
  ADD COLUMN IF NOT EXISTS "facflete" text,
  ADD COLUMN IF NOT EXISTS "tot_inc" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ciu" text,
  ADD COLUMN IF NOT EXISTS "autorizada" numeric,
  ADD COLUMN IF NOT EXISTS "vtasa" numeric,
  ADD COLUMN IF NOT EXISTS "tot_ext" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tfa" text,
  ADD COLUMN IF NOT EXISTS "base2" numeric,
  ADD COLUMN IF NOT EXISTS "tot_aiu" numeric,
  ADD COLUMN IF NOT EXISTS "tot_icm" numeric,
  ADD COLUMN IF NOT EXISTS "taxes" numeric,
  ADD COLUMN IF NOT EXISTS "gastos" numeric,
  ADD COLUMN IF NOT EXISTS "ingresos" numeric,
  ADD COLUMN IF NOT EXISTS "n4xcmil" numeric,
  ADD COLUMN IF NOT EXISTS "cningre" numeric,
  ADD COLUMN IF NOT EXISTS "vagencia" numeric,
  ADD COLUMN IF NOT EXISTS "suc_cxp" text,
  ADD COLUMN IF NOT EXISTS "saldo" numeric,
  ADD COLUMN IF NOT EXISTS "tipo" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ter" text,
  ADD COLUMN IF NOT EXISTS "tot_imp" numeric,
  ADD COLUMN IF NOT EXISTS "qtipo" numeric,
  ADD COLUMN IF NOT EXISTS "afavor" numeric,
  ADD COLUMN IF NOT EXISTS "por_seg" numeric,
  ADD COLUMN IF NOT EXISTS "val_seg" numeric,
  ADD COLUMN IF NOT EXISTS "iva_seg" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tga" text,
  ADD COLUMN IF NOT EXISTS "otorigen" text,
  ADD COLUMN IF NOT EXISTS "useraprobo" text,
  ADD COLUMN IF NOT EXISTS "tot_icon" numeric,
  ADD COLUMN IF NOT EXISTS "costoimpot" numeric,
  ADD COLUMN IF NOT EXISTS "poriva" numeric,
  ADD COLUMN IF NOT EXISTS "cod_mtd" text,
  ADD COLUMN IF NOT EXISTS "codtip" text,
  ADD COLUMN IF NOT EXISTS "baserete" numeric,
  ADD COLUMN IF NOT EXISTS "cod_toe" text,
  ADD COLUMN IF NOT EXISTS "fec_pif" date,
  ADD COLUMN IF NOT EXISTS "fec_pff" date,
  ADD COLUMN IF NOT EXISTS "fec_camb" date,
  ADD COLUMN IF NOT EXISTS "cod_tcm" text,
  ADD COLUMN IF NOT EXISTS "cod_uts" text,
  ADD COLUMN IF NOT EXISTS "fec_fin" date,
  ADD COLUMN IF NOT EXISTS "num_cont" text,
  ADD COLUMN IF NOT EXISTS "por_icas" numeric,
  ADD COLUMN IF NOT EXISTS "ica_serv" numeric;
ALTER TABLE mgx_in_cabeza ADD COLUMN IF NOT EXISTS llave_doc text GENERATED ALWAYS AS (coalesce("ano_doc", '') || '|' || coalesce("per_doc", '') || '|' || coalesce("tip_doc", '') || '|' || coalesce("num_doc", '')) STORED;
CREATE INDEX IF NOT EXISTS idx_mgx_in_cabeza_llave_doc ON mgx_in_cabeza ("empresa", "llave_doc");
CREATE INDEX IF NOT EXISTS idx_mgx_in_cabeza_fecha ON mgx_in_cabeza ("empresa", "fecha");
ALTER TABLE mgx_in_cabeza ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_cabeza TO service_role;
COMMENT ON TABLE mgx_in_cabeza IS 'Espejo de emp{N}in.cabeza de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_in_cuerpo ─ 112 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_in_cuerpo (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_in_cuerpo
  ADD COLUMN IF NOT EXISTS "ano_doc" text,
  ADD COLUMN IF NOT EXISTS "per_doc" text,
  ADD COLUMN IF NOT EXISTS "tip_doc" text,
  ADD COLUMN IF NOT EXISTS "num_doc" text,
  ADD COLUMN IF NOT EXISTS "ini" text,
  ADD COLUMN IF NOT EXISTS "fin" text,
  ADD COLUMN IF NOT EXISTS "item" numeric,
  ADD COLUMN IF NOT EXISTS "valor" numeric,
  ADD COLUMN IF NOT EXISTS "detalle" text,
  ADD COLUMN IF NOT EXISTS "cod_ref" text,
  ADD COLUMN IF NOT EXISTS "cod_bod" text,
  ADD COLUMN IF NOT EXISTS "cantidad" numeric,
  ADD COLUMN IF NOT EXISTS "pre_cos" numeric,
  ADD COLUMN IF NOT EXISTS "pre_ven" numeric,
  ADD COLUMN IF NOT EXISTS "pre_cre" numeric,
  ADD COLUMN IF NOT EXISTS "pre_dis" numeric,
  ADD COLUMN IF NOT EXISTS "dcto" numeric,
  ADD COLUMN IF NOT EXISTS "iva" numeric,
  ADD COLUMN IF NOT EXISTS "subtotal" numeric,
  ADD COLUMN IF NOT EXISTS "tot_des" numeric,
  ADD COLUMN IF NOT EXISTS "tot_iva" numeric,
  ADD COLUMN IF NOT EXISTS "ret_fue" numeric,
  ADD COLUMN IF NOT EXISTS "tot_ret" numeric,
  ADD COLUMN IF NOT EXISTS "fec_ven" date,
  ADD COLUMN IF NOT EXISTS "sistema" numeric,
  ADD COLUMN IF NOT EXISTS "diferencia" numeric,
  ADD COLUMN IF NOT EXISTS "ajustado" numeric,
  ADD COLUMN IF NOT EXISTS "dif_inv" numeric,
  ADD COLUMN IF NOT EXISTS "fisico" numeric,
  ADD COLUMN IF NOT EXISTS "cod_cco" text,
  ADD COLUMN IF NOT EXISTS "cod_epl" text,
  ADD COLUMN IF NOT EXISTS "proveedor" text,
  ADD COLUMN IF NOT EXISTS "fec_com" date,
  ADD COLUMN IF NOT EXISTS "iva_desc" numeric,
  ADD COLUMN IF NOT EXISTS "iva_pagar" numeric,
  ADD COLUMN IF NOT EXISTS "nom_bod" text,
  ADD COLUMN IF NOT EXISTS "nom_ref" text,
  ADD COLUMN IF NOT EXISTS "nom_cco" text,
  ADD COLUMN IF NOT EXISTS "nom_za" text,
  ADD COLUMN IF NOT EXISTS "nom_epl" text,
  ADD COLUMN IF NOT EXISTS "bod_des" text,
  ADD COLUMN IF NOT EXISTS "ord_pro" text,
  ADD COLUMN IF NOT EXISTS "cod_und" text,
  ADD COLUMN IF NOT EXISTS "doc_rel" text,
  ADD COLUMN IF NOT EXISTS "nit_ter" text,
  ADD COLUMN IF NOT EXISTS "nom_ter" text,
  ADD COLUMN IF NOT EXISTS "cod_coc" text,
  ADD COLUMN IF NOT EXISTS "nom_coc" text,
  ADD COLUMN IF NOT EXISTS "fletes" numeric,
  ADD COLUMN IF NOT EXISTS "flete" numeric,
  ADD COLUMN IF NOT EXISTS "fisico2" numeric,
  ADD COLUMN IF NOT EXISTS "areas" text,
  ADD COLUMN IF NOT EXISTS "detallem" text,
  ADD COLUMN IF NOT EXISTS "cod_bodd" text,
  ADD COLUMN IF NOT EXISTS "nom_fap" text,
  ADD COLUMN IF NOT EXISTS "cod_fap" text,
  ADD COLUMN IF NOT EXISTS "nom_ref2" text,
  ADD COLUMN IF NOT EXISTS "lote" text,
  ADD COLUMN IF NOT EXISTS "area" text,
  ADD COLUMN IF NOT EXISTS "nom_cos" text,
  ADD COLUMN IF NOT EXISTS "nom_ser" text,
  ADD COLUMN IF NOT EXISTS "cod_ser" text,
  ADD COLUMN IF NOT EXISTS "tpeso" numeric,
  ADD COLUMN IF NOT EXISTS "cod_lis" text,
  ADD COLUMN IF NOT EXISTS "nom_lis" text,
  ADD COLUMN IF NOT EXISTS "cod_cta" text,
  ADD COLUMN IF NOT EXISTS "mascostos" numeric,
  ADD COLUMN IF NOT EXISTS "por_inc" numeric,
  ADD COLUMN IF NOT EXISTS "tot_inc" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ciu" text,
  ADD COLUMN IF NOT EXISTS "nom_ciu" text,
  ADD COLUMN IF NOT EXISTS "num_srl" text,
  ADD COLUMN IF NOT EXISTS "stasa" numeric,
  ADD COLUMN IF NOT EXISTS "imglobal" numeric,
  ADD COLUMN IF NOT EXISTS "val_ext" numeric,
  ADD COLUMN IF NOT EXISTS "subtmext" numeric,
  ADD COLUMN IF NOT EXISTS "por_aiu" numeric,
  ADD COLUMN IF NOT EXISTS "tot_aiu" numeric,
  ADD COLUMN IF NOT EXISTS "val_gra" numeric,
  ADD COLUMN IF NOT EXISTS "val_ngr" numeric,
  ADD COLUMN IF NOT EXISTS "val_iva" numeric,
  ADD COLUMN IF NOT EXISTS "val_icn" numeric,
  ADD COLUMN IF NOT EXISTS "cod_pry" text,
  ADD COLUMN IF NOT EXISTS "nom_pry" text,
  ADD COLUMN IF NOT EXISTS "cod_suc" text,
  ADD COLUMN IF NOT EXISTS "nom_suc" text,
  ADD COLUMN IF NOT EXISTS "adicional" numeric,
  ADD COLUMN IF NOT EXISTS "fletei" numeric,
  ADD COLUMN IF NOT EXISTS "seguroi" numeric,
  ADD COLUMN IF NOT EXISTS "aranceli" numeric,
  ADD COLUMN IF NOT EXISTS "por_ara" numeric,
  ADD COLUMN IF NOT EXISTS "seg_mlo" numeric,
  ADD COLUMN IF NOT EXISTS "ara_mlo" numeric,
  ADD COLUMN IF NOT EXISTS "oga_min" numeric,
  ADD COLUMN IF NOT EXISTS "oga_mlo" numeric,
  ADD COLUMN IF NOT EXISTS "bas_ara" numeric,
  ADD COLUMN IF NOT EXISTS "tot_fle" numeric,
  ADD COLUMN IF NOT EXISTS "tot_ara" numeric,
  ADD COLUMN IF NOT EXISTS "tot_seg" numeric,
  ADD COLUMN IF NOT EXISTS "pre_net" numeric,
  ADD COLUMN IF NOT EXISTS "tot_ica" numeric,
  ADD COLUMN IF NOT EXISTS "obsequio" numeric,
  ADD COLUMN IF NOT EXISTS "costoimpo" numeric,
  ADD COLUMN IF NOT EXISTS "cod_fgt" text,
  ADD COLUMN IF NOT EXISTS "nom_fgt" text,
  ADD COLUMN IF NOT EXISTS "fec_ini" date,
  ADD COLUMN IF NOT EXISTS "cod_ede" text,
  ADD COLUMN IF NOT EXISTS "nom_ede" text,
  ADD COLUMN IF NOT EXISTS "codciv" text,
  ADD COLUMN IF NOT EXISTS "cod_tcs" text,
  ADD COLUMN IF NOT EXISTS "nom_tcs" text;
ALTER TABLE mgx_in_cuerpo ADD COLUMN IF NOT EXISTS llave_doc text GENERATED ALWAYS AS (coalesce("ano_doc", '') || '|' || coalesce("per_doc", '') || '|' || coalesce("tip_doc", '') || '|' || coalesce("num_doc", '')) STORED;
CREATE INDEX IF NOT EXISTS idx_mgx_in_cuerpo_llave_doc ON mgx_in_cuerpo ("empresa", "llave_doc");
CREATE INDEX IF NOT EXISTS idx_mgx_in_cuerpo_cod_ref ON mgx_in_cuerpo ("empresa", "cod_ref");
ALTER TABLE mgx_in_cuerpo ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_in_cuerpo TO service_role;
COMMENT ON TABLE mgx_in_cuerpo IS 'Espejo de emp{N}in.cuerpo de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- ── mgx_rh_pri_epl ─ 163 columnas de MGX
CREATE TABLE IF NOT EXISTS mgx_rh_pri_epl (
  empresa         text NOT NULL,
  ide             integer NOT NULL,
  sincronizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa, ide)
);
ALTER TABLE mgx_rh_pri_epl
  ADD COLUMN IF NOT EXISTS "codigo" text,
  ADD COLUMN IF NOT EXISTS "nomcom" text,
  ADD COLUMN IF NOT EXISTS "sexo" numeric,
  ADD COLUMN IF NOT EXISTS "fec_nac" date,
  ADD COLUMN IF NOT EXISTS "direccion" text,
  ADD COLUMN IF NOT EXISTS "telefonos" text,
  ADD COLUMN IF NOT EXISTS "fec_ing" date,
  ADD COLUMN IF NOT EXISTS "foto" text,
  ADD COLUMN IF NOT EXISTS "cod_arp" text,
  ADD COLUMN IF NOT EXISTS "cod_car" text,
  ADD COLUMN IF NOT EXISTS "cod_fon" text,
  ADD COLUMN IF NOT EXISTS "sueldo" numeric,
  ADD COLUMN IF NOT EXISTS "aux_tra" numeric,
  ADD COLUMN IF NOT EXISTS "cod_sal" text,
  ADD COLUMN IF NOT EXISTS "cod_pen" text,
  ADD COLUMN IF NOT EXISTS "lib_mil" text,
  ADD COLUMN IF NOT EXISTS "distrito" text,
  ADD COLUMN IF NOT EXISTS "cod_ciu" text,
  ADD COLUMN IF NOT EXISTS "cod_cos" text,
  ADD COLUMN IF NOT EXISTS "cod_esc" text,
  ADD COLUMN IF NOT EXISTS "fec_ret" date,
  ADD COLUMN IF NOT EXISTS "correo" text,
  ADD COLUMN IF NOT EXISTS "cod_caj" text,
  ADD COLUMN IF NOT EXISTS "cod_tco" text,
  ADD COLUMN IF NOT EXISTS "cod_tsa" text,
  ADD COLUMN IF NOT EXISTS "cod_epr" text,
  ADD COLUMN IF NOT EXISTS "cod_tsn" text,
  ADD COLUMN IF NOT EXISTS "epl_req" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tur" text,
  ADD COLUMN IF NOT EXISTS "est_epl" numeric,
  ADD COLUMN IF NOT EXISTS "est_act" numeric,
  ADD COLUMN IF NOT EXISTS "duracion" numeric,
  ADD COLUMN IF NOT EXISTS "actual" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tes" text,
  ADD COLUMN IF NOT EXISTS "ano_exp" numeric,
  ADD COLUMN IF NOT EXISTS "estatura" numeric,
  ADD COLUMN IF NOT EXISTS "peso" numeric,
  ADD COLUMN IF NOT EXISTS "anteojos" numeric,
  ADD COLUMN IF NOT EXISTS "calzado" numeric,
  ADD COLUMN IF NOT EXISTS "tp" text,
  ADD COLUMN IF NOT EXISTS "vehiculo" numeric,
  ADD COLUMN IF NOT EXISTS "licencia" text,
  ADD COLUMN IF NOT EXISTS "categoria" numeric,
  ADD COLUMN IF NOT EXISTS "cla_lib" numeric,
  ADD COLUMN IF NOT EXISTS "expedida" text,
  ADD COLUMN IF NOT EXISTS "trabaja" numeric,
  ADD COLUMN IF NOT EXISTS "empresa_mgx" text,
  ADD COLUMN IF NOT EXISTS "fec_asp" date,
  ADD COLUMN IF NOT EXISTS "car_asp" text,
  ADD COLUMN IF NOT EXISTS "registro" text,
  ADD COLUMN IF NOT EXISTS "camisa" text,
  ADD COLUMN IF NOT EXISTS "pantalon" text,
  ADD COLUMN IF NOT EXISTS "cod_pro" text,
  ADD COLUMN IF NOT EXISTS "ciu_exp" text,
  ADD COLUMN IF NOT EXISTS "ciu_res" text,
  ADD COLUMN IF NOT EXISTS "otra_ciu" text,
  ADD COLUMN IF NOT EXISTS "ubi_arc" text,
  ADD COLUMN IF NOT EXISTS "barrios" text,
  ADD COLUMN IF NOT EXISTS "cod_ese" text,
  ADD COLUMN IF NOT EXISTS "cod_bar" text,
  ADD COLUMN IF NOT EXISTS "apellidos2" text,
  ADD COLUMN IF NOT EXISTS "apellidos" text,
  ADD COLUMN IF NOT EXISTS "nombres2" text,
  ADD COLUMN IF NOT EXISTS "nombres" text,
  ADD COLUMN IF NOT EXISTS "por_rete" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tip" text,
  ADD COLUMN IF NOT EXISTS "p_arp" numeric,
  ADD COLUMN IF NOT EXISTS "aux_vi" numeric,
  ADD COLUMN IF NOT EXISTS "aux_ali" numeric,
  ADD COLUMN IF NOT EXISTS "sindicato" numeric,
  ADD COLUMN IF NOT EXISTS "cod_gtu" text,
  ADD COLUMN IF NOT EXISTS "ta" numeric,
  ADD COLUMN IF NOT EXISTS "boni" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tno" text,
  ADD COLUMN IF NOT EXISTS "cesantias" numeric,
  ADD COLUMN IF NOT EXISTS "est_emp" numeric,
  ADD COLUMN IF NOT EXISTS "base_rete" numeric,
  ADD COLUMN IF NOT EXISTS "tip_ide" text,
  ADD COLUMN IF NOT EXISTS "cod_gpa" text,
  ADD COLUMN IF NOT EXISTS "man_ext" numeric,
  ADD COLUMN IF NOT EXISTS "b_arp" numeric,
  ADD COLUMN IF NOT EXISTS "b_pen" numeric,
  ADD COLUMN IF NOT EXISTS "b_sal" numeric,
  ADD COLUMN IF NOT EXISTS "cta_ban" text,
  ADD COLUMN IF NOT EXISTS "cod_alte" text,
  ADD COLUMN IF NOT EXISTS "seg_soc" numeric,
  ADD COLUMN IF NOT EXISTS "riesgo" numeric,
  ADD COLUMN IF NOT EXISTS "tide" text,
  ADD COLUMN IF NOT EXISTS "contrato" numeric,
  ADD COLUMN IF NOT EXISTS "tip_sal" numeric,
  ADD COLUMN IF NOT EXISTS "fec_uva" date,
  ADD COLUMN IF NOT EXISTS "aux_men" numeric,
  ADD COLUMN IF NOT EXISTS "cod_dpt" text,
  ADD COLUMN IF NOT EXISTS "fec_aum" date,
  ADD COLUMN IF NOT EXISTS "fec_rein" date,
  ADD COLUMN IF NOT EXISTS "fe_dis1" date,
  ADD COLUMN IF NOT EXISTS "fe_dis2" date,
  ADD COLUMN IF NOT EXISTS "cod_ctr" text,
  ADD COLUMN IF NOT EXISTS "cont_actu" text,
  ADD COLUMN IF NOT EXISTS "marcado" numeric,
  ADD COLUMN IF NOT EXISTS "fec_cau" date,
  ADD COLUMN IF NOT EXISTS "fec_uce" date,
  ADD COLUMN IF NOT EXISTS "fec_upr" date,
  ADD COLUMN IF NOT EXISTS "aprendiz" numeric,
  ADD COLUMN IF NOT EXISTS "cod_tct" text,
  ADD COLUMN IF NOT EXISTS "extran" numeric,
  ADD COLUMN IF NOT EXISTS "nosalud" numeric,
  ADD COLUMN IF NOT EXISTS "nopension" numeric,
  ADD COLUMN IF NOT EXISTS "ciu_viv" text,
  ADD COLUMN IF NOT EXISTS "base_primas" numeric,
  ADD COLUMN IF NOT EXISTS "base_vaca" numeric,
  ADD COLUMN IF NOT EXISTS "base_cesan" numeric,
  ADD COLUMN IF NOT EXISTS "cod_stc" text,
  ADD COLUMN IF NOT EXISTS "bretencion" numeric,
  ADD COLUMN IF NOT EXISTS "met_retencion" numeric,
  ADD COLUMN IF NOT EXISTS "vivienda" numeric,
  ADD COLUMN IF NOT EXISTS "sal_edu" numeric,
  ADD COLUMN IF NOT EXISTS "relevo" numeric,
  ADD COLUMN IF NOT EXISTS "produccion" numeric,
  ADD COLUMN IF NOT EXISTS "comision" numeric,
  ADD COLUMN IF NOT EXISTS "observa" text,
  ADD COLUMN IF NOT EXISTS "teralterno" text,
  ADD COLUMN IF NOT EXISTS "fhc" timestamp,
  ADD COLUMN IF NOT EXISTS "fhe" timestamp,
  ADD COLUMN IF NOT EXISTS "enliquidacion" numeric,
  ADD COLUMN IF NOT EXISTS "cond_ter" numeric,
  ADD COLUMN IF NOT EXISTS "dec_mpre" numeric,
  ADD COLUMN IF NOT EXISTS "decpcargo" numeric,
  ADD COLUMN IF NOT EXISTS "apre_prod" numeric,
  ADD COLUMN IF NOT EXISTS "saliseg" numeric,
  ADD COLUMN IF NOT EXISTS "cod_pry" text,
  ADD COLUMN IF NOT EXISTS "tip_cami" text,
  ADD COLUMN IF NOT EXISTS "tip_calz" text,
  ADD COLUMN IF NOT EXISTS "tip_pan" text,
  ADD COLUMN IF NOT EXISTS "tippen" numeric,
  ADD COLUMN IF NOT EXISTS "temexte" numeric,
  ADD COLUMN IF NOT EXISTS "fecradext" date,
  ADD COLUMN IF NOT EXISTS "firete" date,
  ADD COLUMN IF NOT EXISTS "ffrete" date,
  ADD COLUMN IF NOT EXISTS "podep" numeric,
  ADD COLUMN IF NOT EXISTS "cod_ban" text,
  ADD COLUMN IF NOT EXISTS "fec_exp" date,
  ADD COLUMN IF NOT EXISTS "telcorpo" text,
  ADD COLUMN IF NOT EXISTS "estuact" numeric,
  ADD COLUMN IF NOT EXISTS "estudioac" text,
  ADD COLUMN IF NOT EXISTS "cod_get" text,
  ADD COLUMN IF NOT EXISTS "cod_est" text,
  ADD COLUMN IF NOT EXISTS "quevehicu" text,
  ADD COLUMN IF NOT EXISTS "lugarestud" text,
  ADD COLUMN IF NOT EXISTS "tipovivi" numeric,
  ADD COLUMN IF NOT EXISTS "ciu_asp" text,
  ADD COLUMN IF NOT EXISTS "cod_pai" text,
  ADD COLUMN IF NOT EXISTS "fec_expl" date,
  ADD COLUMN IF NOT EXISTS "fec_venl" date,
  ADD COLUMN IF NOT EXISTS "cod_mpa" text,
  ADD COLUMN IF NOT EXISTS "novcont" numeric,
  ADD COLUMN IF NOT EXISTS "porsalud" numeric,
  ADD COLUMN IF NOT EXISTS "tel_movil" text,
  ADD COLUMN IF NOT EXISTS "salin100" numeric,
  ADD COLUMN IF NOT EXISTS "cod_are" text,
  ADD COLUMN IF NOT EXISTS "tipoestu" numeric,
  ADD COLUMN IF NOT EXISTS "modtra" numeric;
CREATE INDEX IF NOT EXISTS idx_mgx_rh_pri_epl_codigo ON mgx_rh_pri_epl ("empresa", "codigo");
ALTER TABLE mgx_rh_pri_epl ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_rh_pri_epl TO service_role;
COMMENT ON TABLE mgx_rh_pri_epl IS 'Espejo de emp{N}rh.pri_epl de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.';

-- =============================================================================
-- 2. Catálogo de pares y bitácora de corridas
-- =============================================================================

CREATE TABLE IF NOT EXISTS mgx_tablas (
  empresa                text NOT NULL,
  modulo                 text NOT NULL,
  tabla                  text NOT NULL,
  activa                 boolean NOT NULL DEFAULT true,
  estrategia             text NOT NULL
                         CHECK (estrategia IN ('reemplazo','incremental_edicion','incremental_documento')),
  ultimo_ide             integer,
  ultima_edicion         timestamp,
  ultima_corrida_at      timestamptz,
  filas                  bigint,
  filas_origen_estimadas bigint,
  estado                 text NOT NULL DEFAULT 'nunca'
                         CHECK (estado IN ('nunca','ok','pendiente','corriendo','error')),
  fase                   text,
  error                  text,
  aviso                  text,
  corrida_id             bigint,
  PRIMARY KEY (empresa, modulo, tabla)
);
ALTER TABLE mgx_tablas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_tablas TO service_role;
COMMENT ON TABLE mgx_tablas IS 'Un par (empresa, tabla) de MGX por fila: cómo se sincroniza (estrategia, editable), hasta dónde llegó (ultimo_ide, ultima_edicion) y cómo terminó la última vez. activa=false lo saca de las corridas.';

CREATE TABLE IF NOT EXISTS mgx_corridas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  iniciada_at    timestamptz NOT NULL DEFAULT now(),
  actualizada_at timestamptz NOT NULL DEFAULT now(),
  terminada_at   timestamptz,
  origen         text NOT NULL CHECK (origen IN ('manual','script')),
  usuario_email  text,
  alcance        jsonb,
  filas          bigint NOT NULL DEFAULT 0,
  estado         text NOT NULL DEFAULT 'corriendo'
                 CHECK (estado IN ('corriendo','ok','error','parcial')),
  error          text
);
CREATE INDEX IF NOT EXISTS idx_mgx_corridas_iniciada ON mgx_corridas (iniciada_at DESC);
ALTER TABLE mgx_corridas ENABLE ROW LEVEL SECURITY;
GRANT ALL ON mgx_corridas TO service_role;
COMMENT ON TABLE mgx_corridas IS 'Bitácora de sincronizaciones de MGX, una fila por corrida (desde la pantalla o por script). Una en «corriendo» con actualizada_at reciente bloquea otra.';

INSERT INTO mgx_tablas (empresa, modulo, tabla, estrategia, filas_origen_estimadas) VALUES
  ('emp0', 'co', 'pri_cos', 'reemplazo', 666),
  ('emp2', 'co', 'pri_cos', 'reemplazo', 185),
  ('emp3', 'co', 'pri_cos', 'reemplazo', 59),
  ('emp8', 'co', 'pri_cos', 'reemplazo', 233),
  ('emp10', 'co', 'pri_cos', 'reemplazo', 0),
  ('emp11', 'co', 'pri_cos', 'reemplazo', 560),
  ('emp12', 'co', 'pri_cos', 'reemplazo', 0),
  ('emp0', 'co', 'pri_cta', 'reemplazo', 1527),
  ('emp2', 'co', 'pri_cta', 'reemplazo', 1223),
  ('emp3', 'co', 'pri_cta', 'reemplazo', 1208),
  ('emp8', 'co', 'pri_cta', 'reemplazo', 1031),
  ('emp10', 'co', 'pri_cta', 'reemplazo', 0),
  ('emp11', 'co', 'pri_cta', 'reemplazo', 1150),
  ('emp12', 'co', 'pri_cta', 'reemplazo', 0),
  ('emp0', 'co', 'pri_ter', 'reemplazo', 6657),
  ('emp2', 'co', 'pri_ter', 'reemplazo', 3214),
  ('emp3', 'co', 'pri_ter', 'reemplazo', 2566),
  ('emp8', 'co', 'pri_ter', 'reemplazo', 5028),
  ('emp10', 'co', 'pri_ter', 'reemplazo', 0),
  ('emp11', 'co', 'pri_ter', 'reemplazo', 6677),
  ('emp12', 'co', 'pri_ter', 'reemplazo', 0),
  ('emp0', 'co', 'cabeza', 'incremental_edicion', 426764),
  ('emp2', 'co', 'cabeza', 'reemplazo', 24291),
  ('emp3', 'co', 'cabeza', 'reemplazo', 11591),
  ('emp8', 'co', 'cabeza', 'incremental_edicion', 114672),
  ('emp10', 'co', 'cabeza', 'reemplazo', 0),
  ('emp11', 'co', 'cabeza', 'reemplazo', 18616),
  ('emp12', 'co', 'cabeza', 'reemplazo', 0),
  ('emp0', 'co', 'cuerpo', 'incremental_documento', 16237731),
  ('emp2', 'co', 'cuerpo', 'incremental_documento', 383332),
  ('emp3', 'co', 'cuerpo', 'incremental_documento', 80086),
  ('emp8', 'co', 'cuerpo', 'incremental_documento', 345042),
  ('emp10', 'co', 'cuerpo', 'reemplazo', 0),
  ('emp11', 'co', 'cuerpo', 'incremental_documento', 1133900),
  ('emp12', 'co', 'cuerpo', 'reemplazo', 0),
  ('emp0', 'no', 'obs_liq', 'reemplazo', 0),
  ('emp2', 'no', 'obs_liq', 'reemplazo', 0),
  ('emp3', 'no', 'obs_liq', 'reemplazo', 0),
  ('emp8', 'no', 'obs_liq', 'reemplazo', 0),
  ('emp11', 'no', 'obs_liq', 'reemplazo', 0),
  ('emp0', 'no', 'pri_car', 'reemplazo', 79),
  ('emp2', 'no', 'pri_car', 'reemplazo', 0),
  ('emp3', 'no', 'pri_car', 'reemplazo', 35),
  ('emp8', 'no', 'pri_car', 'reemplazo', 41),
  ('emp11', 'no', 'pri_car', 'reemplazo', 44),
  ('emp0', 'no', 'pri_con', 'reemplazo', 238),
  ('emp2', 'no', 'pri_con', 'reemplazo', 302),
  ('emp3', 'no', 'pri_con', 'reemplazo', 263),
  ('emp8', 'no', 'pri_con', 'reemplazo', 172),
  ('emp11', 'no', 'pri_con', 'reemplazo', 164),
  ('emp0', 'no', 'pri_ctr', 'reemplazo', 0),
  ('emp2', 'no', 'pri_ctr', 'reemplazo', 0),
  ('emp3', 'no', 'pri_ctr', 'reemplazo', 0),
  ('emp8', 'no', 'pri_ctr', 'reemplazo', 0),
  ('emp11', 'no', 'pri_ctr', 'reemplazo', 0),
  ('emp0', 'no', 'pri_dpt', 'reemplazo', 0),
  ('emp2', 'no', 'pri_dpt', 'reemplazo', 0),
  ('emp3', 'no', 'pri_dpt', 'reemplazo', 0),
  ('emp8', 'no', 'pri_dpt', 'reemplazo', 0),
  ('emp11', 'no', 'pri_dpt', 'reemplazo', 0),
  ('emp0', 'no', 'pri_epr', 'reemplazo', 0),
  ('emp2', 'no', 'pri_epr', 'reemplazo', 0),
  ('emp3', 'no', 'pri_epr', 'reemplazo', 0),
  ('emp8', 'no', 'pri_epr', 'reemplazo', 0),
  ('emp11', 'no', 'pri_epr', 'reemplazo', 0),
  ('emp0', 'no', 'pri_est', 'reemplazo', 0),
  ('emp2', 'no', 'pri_est', 'reemplazo', 0),
  ('emp3', 'no', 'pri_est', 'reemplazo', 0),
  ('emp8', 'no', 'pri_est', 'reemplazo', 0),
  ('emp11', 'no', 'pri_est', 'reemplazo', 0),
  ('emp0', 'no', 'pri_gpa', 'reemplazo', 0),
  ('emp2', 'no', 'pri_gpa', 'reemplazo', 0),
  ('emp3', 'no', 'pri_gpa', 'reemplazo', 0),
  ('emp8', 'no', 'pri_gpa', 'reemplazo', 0),
  ('emp11', 'no', 'pri_gpa', 'reemplazo', 0),
  ('emp0', 'no', 'pri_per', 'reemplazo', 1001),
  ('emp2', 'no', 'pri_per', 'reemplazo', 916),
  ('emp3', 'no', 'pri_per', 'reemplazo', 397),
  ('emp8', 'no', 'pri_per', 'reemplazo', 456),
  ('emp11', 'no', 'pri_per', 'reemplazo', 292),
  ('emp0', 'no', 'cabeza', 'reemplazo', 34364),
  ('emp2', 'no', 'cabeza', 'reemplazo', 4238),
  ('emp3', 'no', 'cabeza', 'reemplazo', 632),
  ('emp8', 'no', 'cabeza', 'reemplazo', 1995),
  ('emp11', 'no', 'cabeza', 'reemplazo', 0),
  ('emp0', 'no', 'cuerpo', 'incremental_documento', 1199749),
  ('emp2', 'no', 'cuerpo', 'incremental_documento', 128177),
  ('emp3', 'no', 'cuerpo', 'reemplazo', 4264),
  ('emp8', 'no', 'cuerpo', 'reemplazo', 37500),
  ('emp11', 'no', 'cuerpo', 'reemplazo', 0),
  ('emp0', 'in', 'det_lpr', 'reemplazo', 0),
  ('emp0', 'in', 'mgx_csc', 'reemplazo', 0),
  ('emp0', 'in', 'pri_bod', 'reemplazo', 0),
  ('emp0', 'in', 'pri_col', 'reemplazo', 50),
  ('emp0', 'in', 'pri_gru', 'reemplazo', 44),
  ('emp0', 'in', 'pri_lin', 'reemplazo', 0),
  ('emp0', 'in', 'pri_lis', 'reemplazo', 0),
  ('emp0', 'in', 'pri_mov', 'reemplazo', 79),
  ('emp0', 'in', 'pri_ref', 'reemplazo', 3385),
  ('emp0', 'in', 'pri_sgr', 'reemplazo', 0),
  ('emp0', 'in', 'pri_tal', 'reemplazo', 28),
  ('emp0', 'in', 'pri_und', 'reemplazo', 0),
  ('emp0', 'in', 'cabeza', 'incremental_edicion', 197447),
  ('emp0', 'in', 'cuerpo', 'incremental_documento', 379244),
  ('emp0', 'rh', 'pri_epl', 'reemplazo', 3272),
  ('emp2', 'rh', 'pri_epl', 'reemplazo', 303),
  ('emp3', 'rh', 'pri_epl', 'reemplazo', 37),
  ('emp8', 'rh', 'pri_epl', 'reemplazo', 66),
  ('emp11', 'rh', 'pri_epl', 'reemplazo', 1651)
ON CONFLICT (empresa, modulo, tabla) DO UPDATE
   SET filas_origen_estimadas = EXCLUDED.filas_origen_estimadas;

-- =============================================================================
-- 3. Funciones de escritura (solo service_role, con lista blanca)
-- =============================================================================

-- Lista blanca: solo las tablas espejo, nunca el catálogo ni otra tabla.
CREATE OR REPLACE FUNCTION mgx_tabla_permitida(p_tabla text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$ SELECT p_tabla = ANY (ARRAY['mgx_co_pri_cos', 'mgx_co_pri_cta', 'mgx_co_pri_ter', 'mgx_co_cabeza', 'mgx_co_cuerpo', 'mgx_no_obs_liq', 'mgx_no_pri_car', 'mgx_no_pri_con', 'mgx_no_pri_ctr', 'mgx_no_pri_dpt', 'mgx_no_pri_epr', 'mgx_no_pri_est', 'mgx_no_pri_gpa', 'mgx_no_pri_per', 'mgx_no_cabeza', 'mgx_no_cuerpo', 'mgx_in_det_lpr', 'mgx_in_mgx_csc', 'mgx_in_pri_bod', 'mgx_in_pri_col', 'mgx_in_pri_gru', 'mgx_in_pri_lin', 'mgx_in_pri_lis', 'mgx_in_pri_mov', 'mgx_in_pri_ref', 'mgx_in_pri_sgr', 'mgx_in_pri_tal', 'mgx_in_pri_und', 'mgx_in_cabeza', 'mgx_in_cuerpo', 'mgx_rh_pri_epl']) $$;

-- Columnas que se escriben: todas menos las generadas y sincronizado_at.
CREATE OR REPLACE FUNCTION mgx_columnas(p_tabla text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT array_agg(a.attname::text ORDER BY a.attnum)
    FROM pg_attribute a
   WHERE a.attrelid = p_tabla::regclass
     AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attgenerated = '' AND a.attidentity = ''
     AND a.attname <> 'sincronizado_at'
$$;

-- Reemplazo de una empresa entera, por lotes: el primero (p_primero) borra.
CREATE OR REPLACE FUNCTION mgx_reemplazar(p_tabla text, p_empresa text, p_filas jsonb, p_primero boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cols text;
  v_n    integer;
BEGIN
  IF NOT mgx_tabla_permitida(p_tabla) THEN
    RAISE EXCEPTION 'Tabla no permitida para MGX: %', p_tabla;
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_filas) e WHERE e->>'empresa' IS DISTINCT FROM p_empresa) THEN
    RAISE EXCEPTION 'Hay filas de otra empresa en el lote de % (%)', p_tabla, p_empresa;
  END IF;
  SELECT string_agg(quote_ident(c), ', ') INTO v_cols FROM unnest(mgx_columnas(p_tabla)) c;
  IF p_primero THEN
    EXECUTE format('DELETE FROM %I WHERE empresa = $1', p_tabla) USING p_empresa;
  END IF;
  EXECUTE format('INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::%I, $1)',
                 p_tabla, v_cols, v_cols, p_tabla) USING p_filas;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Altas y cambios por (empresa, ide). Devuelve {filas, nuevas}.
CREATE OR REPLACE FUNCTION mgx_upsert(p_tabla text, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cols   text;
  v_set    text;
  v_filas  integer;
  v_nuevas integer;
BEGIN
  IF NOT mgx_tabla_permitida(p_tabla) THEN
    RAISE EXCEPTION 'Tabla no permitida para MGX: %', p_tabla;
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;
  SELECT string_agg(quote_ident(c), ', '),
         string_agg(format('%1$I = EXCLUDED.%1$I', c), ', ') FILTER (WHERE c NOT IN ('empresa','ide'))
    INTO v_cols, v_set
    FROM unnest(mgx_columnas(p_tabla)) c;
  EXECUTE format(
    'WITH ins AS (INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::%I, $1)
       ON CONFLICT (empresa, ide) DO UPDATE SET %s, sincronizado_at = now()
       RETURNING (xmax = 0) AS nueva)
     SELECT count(*)::int, count(*) FILTER (WHERE nueva)::int FROM ins',
    p_tabla, v_cols, v_cols, p_tabla, v_set) INTO v_filas, v_nuevas USING p_filas;
  RETURN jsonb_build_object('filas', v_filas, 'nuevas', v_nuevas);
END;
$$;

-- Documentos completos: borra los de p_llaves y escribe lo que traiga p_filas.
-- Un documento sin filas en el lote queda borrado (MGX le quitó los ítems).
CREATE OR REPLACE FUNCTION mgx_reemplazar_documentos(p_tabla text, p_empresa text, p_llaves text[], p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cols      text;
  v_borradas  integer;
  v_insertadas integer;
BEGIN
  IF NOT mgx_tabla_permitida(p_tabla) THEN
    RAISE EXCEPTION 'Tabla no permitida para MGX: %', p_tabla;
  END IF;
  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;
  -- Una fila de otro documento o de otra empresa quedaría duplicada: se revierte.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_filas) e
     WHERE e->>'empresa' IS DISTINCT FROM p_empresa
        OR (coalesce(e->>'ano_doc','') || '|' || coalesce(e->>'per_doc','') || '|' ||
            coalesce(e->>'tip_doc','') || '|' || coalesce(e->>'num_doc','')) <> ALL (p_llaves)
  ) THEN
    RAISE EXCEPTION 'El lote de % trae filas fuera de los documentos pedidos', p_tabla;
  END IF;
  SELECT string_agg(quote_ident(c), ', ') INTO v_cols FROM unnest(mgx_columnas(p_tabla)) c;
  EXECUTE format('DELETE FROM %I WHERE empresa = $1 AND llave_doc = ANY ($2)', p_tabla)
    USING p_empresa, p_llaves;
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  EXECUTE format('INSERT INTO %I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::%I, $1)',
                 p_tabla, v_cols, v_cols, p_tabla) USING p_filas;
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  RETURN jsonb_build_object('borradas', v_borradas, 'insertadas', v_insertadas);
END;
$$;

-- Para la reconciliación por script: los ide guardados en un rango, y el borrado de sobrantes.
CREATE OR REPLACE FUNCTION mgx_ides(p_tabla text, p_empresa text, p_desde integer, p_hasta integer)
RETURNS integer[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE v integer[];
BEGIN
  IF NOT mgx_tabla_permitida(p_tabla) THEN
    RAISE EXCEPTION 'Tabla no permitida para MGX: %', p_tabla;
  END IF;
  EXECUTE format('SELECT coalesce(array_agg(ide ORDER BY ide), ''{}'') FROM %I WHERE empresa = $1 AND ide > $2 AND ide <= $3', p_tabla)
    INTO v USING p_empresa, p_desde, p_hasta;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION mgx_borrar(p_tabla text, p_empresa text, p_ides integer[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE v integer;
BEGIN
  IF NOT mgx_tabla_permitida(p_tabla) THEN
    RAISE EXCEPTION 'Tabla no permitida para MGX: %', p_tabla;
  END IF;
  EXECUTE format('DELETE FROM %I WHERE empresa = $1 AND ide = ANY ($2)', p_tabla) USING p_empresa, p_ides;
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION mgx_contar(p_tabla text, p_empresa text)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE v bigint;
BEGIN
  IF NOT mgx_tabla_permitida(p_tabla) THEN
    RAISE EXCEPTION 'Tabla no permitida para MGX: %', p_tabla;
  END IF;
  EXECUTE format('SELECT count(*) FROM %I WHERE empresa = $1', p_tabla) INTO v USING p_empresa;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION mgx_tabla_permitida(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mgx_columnas(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mgx_reemplazar(text, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mgx_upsert(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mgx_reemplazar_documentos(text, text, text[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mgx_ides(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mgx_borrar(text, text, integer[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION mgx_contar(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mgx_tabla_permitida(text) TO service_role;
GRANT EXECUTE ON FUNCTION mgx_columnas(text) TO service_role;
GRANT EXECUTE ON FUNCTION mgx_reemplazar(text, text, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION mgx_upsert(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION mgx_reemplazar_documentos(text, text, text[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION mgx_ides(text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION mgx_borrar(text, text, integer[]) TO service_role;
GRANT EXECUTE ON FUNCTION mgx_contar(text, text) TO service_role;

-- =============================================================================
-- 4. Vistas del documento de MGX, sobre el espejo y con empresa
-- =============================================================================

CREATE OR REPLACE VIEW mgx_v_co_cabeza AS
SELECT empresa, ano_doc, per_doc, tip_doc, num_doc, fecha, descrip, usercreo, fhedicion, fhcreacion
  FROM mgx_co_cabeza;
GRANT SELECT ON mgx_v_co_cabeza TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_cuerpo AS
SELECT empresa, ano_doc, per_doc, tip_doc, num_doc, item, cod_cta, debito, credito, concepto, cod_cos,
       nit_ter, cheque, base, doc_rel, porcen, doc_cru, dias, fec_ven, norma
  FROM mgx_co_cuerpo;
GRANT SELECT ON mgx_v_co_cuerpo TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_movimientos AS
SELECT cabeza.empresa, cabeza.ano_doc, cabeza.per_doc, cabeza.tip_doc, cabeza.num_doc, cabeza.fecha,
       pri_cta.codigo AS cod_cta, pri_cta.nombre AS nom_cta, pri_cta.nat_cue,
       upper(cuerpo.concepto) AS concepto, cuerpo.cod_cos, cuerpo.nit_ter, cuerpo.doc_rel,
       cuerpo.base, cuerpo.porcen, cuerpo.credito, cuerpo.debito, cuerpo.norma
  FROM mgx_co_cabeza cabeza
  JOIN mgx_co_cuerpo cuerpo ON cuerpo.empresa = cabeza.empresa AND cuerpo.llave_doc = cabeza.llave_doc
  JOIN mgx_co_pri_cta pri_cta ON pri_cta.empresa = cuerpo.empresa AND pri_cta.codigo = cuerpo.cod_cta;
GRANT SELECT ON mgx_v_co_movimientos TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_pri_cos AS
SELECT empresa, codigo, nombre FROM mgx_co_pri_cos;
GRANT SELECT ON mgx_v_co_pri_cos TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_pri_cta AS
SELECT empresa, codigo, nombre, tipo, nat_cue FROM mgx_co_pri_cta;
GRANT SELECT ON mgx_v_co_pri_cta TO service_role;

CREATE OR REPLACE VIEW mgx_v_co_pri_ter AS
SELECT empresa, nit, nombre, direccion, telefonos, correo, fax, cod_ciu, apa_aer, representante, estado, prod_ser
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
       cuerpo.est_emp
  FROM mgx_no_cabeza cabeza
  JOIN mgx_no_cuerpo cuerpo   ON cuerpo.empresa = cabeza.empresa AND cuerpo.llave_doc = cabeza.llave_doc
  JOIN mgx_no_pri_con pri_con ON pri_con.empresa = cabeza.empresa AND pri_con.codigo = cuerpo.cod_con
  JOIN mgx_rh_pri_epl pri_epl ON pri_epl.empresa = cabeza.empresa AND pri_epl.codigo = cuerpo.cod_epl
  JOIN mgx_no_pri_per pri_per ON pri_per.empresa = cabeza.empresa AND pri_per.codigo = cabeza.cod_per
  JOIN mgx_no_pri_gpa pri_gpa ON pri_gpa.empresa = cabeza.empresa AND pri_gpa.codigo = pri_per.cod_gpa
  JOIN mgx_no_pri_epr pri_epr ON pri_epr.empresa = cabeza.empresa AND pri_epr.codigo = pri_epl.cod_epr
  JOIN mgx_no_pri_dpt pri_dpt ON pri_dpt.empresa = cabeza.empresa AND pri_dpt.codigo = pri_epl.cod_dpt
 WHERE cabeza.tip_doc = '03'
   AND pri_con.tipo >= 1 AND pri_con.tipo <= 2;
GRANT SELECT ON mgx_v_no_nomina TO service_role;

CREATE OR REPLACE VIEW mgx_v_in_catalogo AS
SELECT pri_ref.empresa, pri_ref.ref_cod, pri_ref.nombre, pri_ref.cod_gru, pri_ref.cod_und,
       pri_und.nombre AS nom_und, pri_gru.nombre AS nom_gru, pri_gru.cta_inv, pri_ref.cod_sgr,
       pri_sgr.nombre AS nom_sgr, pri_ref.cod_lin, pri_lin.nombre AS nom_lin, pri_ref.activa
  FROM mgx_in_pri_ref pri_ref
  LEFT JOIN mgx_in_pri_gru pri_gru ON pri_gru.empresa = pri_ref.empresa AND pri_gru.codigo = pri_ref.cod_gru
  LEFT JOIN mgx_in_pri_sgr pri_sgr ON pri_sgr.empresa = pri_ref.empresa AND pri_sgr.codigo = pri_ref.cod_sgr
  LEFT JOIN mgx_in_pri_lin pri_lin ON pri_lin.empresa = pri_ref.empresa AND pri_lin.codigo = pri_ref.cod_lin
  LEFT JOIN mgx_in_pri_und pri_und ON pri_und.empresa = pri_ref.empresa AND pri_und.codigo = pri_ref.cod_und;
GRANT SELECT ON mgx_v_in_catalogo TO service_role;

CREATE OR REPLACE VIEW mgx_v_in_bodegas AS
SELECT empresa, codigo, nombre, direccion, telefonos FROM mgx_in_pri_bod;
GRANT SELECT ON mgx_v_in_bodegas TO service_role;

CREATE OR REPLACE VIEW mgx_v_in_unidades AS
SELECT empresa, codigo, nombre FROM mgx_in_pri_und;
GRANT SELECT ON mgx_v_in_unidades TO service_role;

COMMIT;
