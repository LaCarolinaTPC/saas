/**
 * El SQL de las tablas espejo, del catálogo, de las funciones de escritura y
 * de las vistas. PURO: lo usa `scripts/mgx-generar-migracion.mts`, que le pasa
 * las columnas leídas de MGX, y se prueba sin base.
 *
 * Por qué generado y no escrito a mano: son 31 tablas, alguna con 163
 * columnas, y MGX puede agregar columnas. El generador emite siempre
 * `ADD COLUMN IF NOT EXISTS` por columna, así una migración nueva generada
 * contra el esquema de mañana solo agrega lo que falte. Nunca borra ni cambia
 * tipos: eso se decide a mano.
 */

import { TABLAS, MODULOS, nombreEspejo, type Modulo, type Empresa } from "./catalogo";
import { tipoDestino, nombreEnEspejo, COLUMNAS_DOCUMENTO, type ColumnaMeta } from "./limpieza";
import { tieneLlaveDocumento, type Estrategia } from "./plan";

/** Columnas que agrega Gestivo: no pueden venir de MGX. */
export const COLUMNAS_PROPIAS = ["empresa", "sincronizado_at", "llave_doc"] as const;

export interface TablaMeta {
  modulo: Modulo;
  tabla: string;
  /** Unión de las columnas de todas las empresas, en el orden de la primera. */
  columnas: ColumnaMeta[];
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Todas las tablas espejo, en orden estable: la lista blanca de las funciones. */
export function todasLasEspejo(): string[] {
  return MODULOS.flatMap((m) => TABLAS[m].map((t) => nombreEspejo(m, t)));
}

/**
 * La unión de columnas de una tabla a través de las empresas. Falla si una
 * misma columna tiene tipos de destino distintos: eso no se resuelve solo.
 */
export function unirColumnas(porEmpresa: Record<string, readonly ColumnaMeta[]>): ColumnaMeta[] {
  const salida: ColumnaMeta[] = [];
  const vistos = new Map<string, { tipo: string; empresa: string }>();
  for (const [empresa, columnas] of Object.entries(porEmpresa)) {
    for (const c of columnas) {
      const destino = tipoDestino(c.tipo);
      const ya = vistos.get(c.nombre);
      if (ya) {
        if (ya.tipo !== destino) {
          throw new Error(
            `La columna «${c.nombre}» es ${ya.tipo} en ${ya.empresa} y ${destino} en ${empresa}: hay que decidir a mano.`
          );
        }
        continue;
      }
      vistos.set(c.nombre, { tipo: destino, empresa });
      salida.push(c);
    }
  }
  return salida;
}

function sqlTipo(c: ColumnaMeta): string {
  return tipoDestino(c.tipo);
}

/**
 * Índices para la sincronización (`llave_doc`), los cruces de las vistas y la
 * consulta más probable de cada cuerpo. Pocos A PROPÓSITO en los cuerpos: cada
 * índice se mantiene en cada una de las 16 millones de inserciones de la carga
 * inicial y ocupa gigas. Otro índice se agrega en una migración cuando haya una
 * consulta real que lo pida.
 */
function indices(t: TablaMeta): string[][] {
  const nombres = new Set(t.columnas.map((c) => c.nombre));
  const salida: string[][] = [];
  if (tieneLlaveDocumento([...nombres])) salida.push(["empresa", "llave_doc"]);
  if (t.tabla === "cuerpo") {
    const porModulo: Record<string, string> = { co: "cod_cta", no: "cod_epl", in: "cod_ref" };
    const c = porModulo[t.modulo];
    if (c && nombres.has(c)) salida.push(["empresa", c]);
    return salida;
  }
  if (nombres.has("fecha")) salida.push(["empresa", "fecha"]);
  if (nombres.has("codigo")) salida.push(["empresa", "codigo"]);
  if (t.tabla === "pri_ref" && nombres.has("ref_cod")) salida.push(["empresa", "ref_cod"]);
  if (t.tabla === "pri_ter" && nombres.has("nit")) salida.push(["empresa", "nit"]);
  return salida;
}

export function sqlTablaEspejo(tOrigen: TablaMeta, descripcion?: string): string {
  const nombre = nombreEspejo(tOrigen.modulo, tOrigen.tabla);
  // Las columnas que chocan con las de Gestivo van renombradas (ver limpieza.ts).
  const t: TablaMeta = { ...tOrigen, columnas: tOrigen.columnas.map((c) => ({ ...c, nombre: nombreEnEspejo(c.nombre) })) };
  for (const c of t.columnas) {
    if ((COLUMNAS_PROPIAS as readonly string[]).includes(c.nombre)) {
      throw new Error(`${t.modulo}.${t.tabla} trae una columna «${c.nombre}», que Gestivo usa para sí.`);
    }
  }
  if (!t.columnas.some((c) => c.nombre === "ide")) {
    throw new Error(`${t.modulo}.${t.tabla} no tiene ide.`);
  }

  const lineas: string[] = [];
  lineas.push(`-- ── ${nombre} ─ ${t.columnas.length} columnas de MGX`);
  lineas.push(`CREATE TABLE IF NOT EXISTS ${nombre} (`);
  lineas.push(`  empresa         text NOT NULL,`);
  lineas.push(`  ide             integer NOT NULL,`);
  lineas.push(`  sincronizado_at timestamptz NOT NULL DEFAULT now(),`);
  lineas.push(`  PRIMARY KEY (empresa, ide)`);
  lineas.push(`);`);

  const otras = t.columnas.filter((c) => c.nombre !== "ide");
  if (otras.length) {
    lineas.push(`ALTER TABLE ${nombre}`);
    lineas.push(
      otras.map((c) => `  ADD COLUMN IF NOT EXISTS ${q(c.nombre)} ${sqlTipo(c)}`).join(",\n") + ";"
    );
  }

  if (tieneLlaveDocumento(t.columnas.map((c) => c.nombre))) {
    const partes = COLUMNAS_DOCUMENTO.map((c) => `coalesce(${q(c)}, '')`).join(" || '|' || ");
    lineas.push(
      `ALTER TABLE ${nombre} ADD COLUMN IF NOT EXISTS llave_doc text GENERATED ALWAYS AS (${partes}) STORED;`
    );
  }

  for (const cols of indices(t)) {
    const idx = `idx_${nombre}_${cols.filter((c) => c !== "empresa").join("_")}`.slice(0, 63);
    lineas.push(`CREATE INDEX IF NOT EXISTS ${idx} ON ${nombre} (${cols.map(q).join(", ")});`);
  }

  lineas.push(`ALTER TABLE ${nombre} ENABLE ROW LEVEL SECURITY;`);
  lineas.push(`GRANT ALL ON ${nombre} TO service_role;`);
  lineas.push(
    `COMMENT ON TABLE ${nombre} IS ${lit(
      descripcion ??
        `Espejo de emp{N}${t.modulo}.${t.tabla} de MGX (todas las empresas; ver «empresa»). Textos sin relleno de espacios y fechas centinela (año < 1900) en NULL. La escribe solo la sincronización de MGX.`
    )};`
  );
  return lineas.join("\n");
}

/** Catálogo de pares y bitácora de corridas. */
export function sqlCatalogo(): string {
  return `CREATE TABLE IF NOT EXISTS mgx_tablas (
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
COMMENT ON TABLE mgx_corridas IS 'Bitácora de sincronizaciones de MGX, una fila por corrida (desde la pantalla o por script). Una en «corriendo» con actualizada_at reciente bloquea otra.';`;
}

export interface SemillaPar {
  empresa: Empresa;
  modulo: Modulo;
  tabla: string;
  estrategia: Estrategia;
  filas: number;
}

export function sqlCatalogoSemilla(pares: readonly SemillaPar[]): string {
  if (!pares.length) return "";
  const valores = pares
    .map((p) => `  (${lit(p.empresa)}, ${lit(p.modulo)}, ${lit(p.tabla)}, ${lit(p.estrategia)}, ${p.filas})`)
    .join(",\n");
  return `INSERT INTO mgx_tablas (empresa, modulo, tabla, estrategia, filas_origen_estimadas) VALUES
${valores}
ON CONFLICT (empresa, modulo, tabla) DO UPDATE
   SET filas_origen_estimadas = EXCLUDED.filas_origen_estimadas;`;
}

/**
 * Las funciones de escritura. Las tres resuelven las columnas del catálogo de
 * Postgres (como `gema_reemplazar_dia`), así una columna nueva en el espejo
 * entra sola, y comparten la misma lista blanca de tablas.
 */
export function sqlFunciones(): string {
  const lista = `ARRAY[${todasLasEspejo().map(lit).join(", ")}]`;
  return `-- Lista blanca: solo las tablas espejo, nunca el catálogo ni otra tabla.
CREATE OR REPLACE FUNCTION mgx_tabla_permitida(p_tabla text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$ SELECT p_tabla = ANY (${lista}) $$;

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
GRANT EXECUTE ON FUNCTION mgx_contar(text, text) TO service_role;`;
}

/**
 * Las vistas del documento de MGX, recreadas sobre el espejo y con `empresa`.
 * Las definiciones son las de MGX (leídas el 2026-10-21 con pg_get_viewdef)
 * con tres cambios: llevan `empresa` y cruzan por ella; los `rtrim` sobran
 * porque el espejo ya guarda los textos sin relleno; y no tienen ORDER BY,
 * que sobre 16 millones de filas solo estorba. Cabeza y cuerpo cruzan por
 * `llave_doc` (con separador), que es más estricta que la concatenación de MGX.
 *
 * Una diferencia a propósito: el catálogo cruza con LEFT JOIN a líneas,
 * subgrupos y unidades. En MGX es INNER, y como La Carolina no tiene ninguna
 * línea cargada, `vcatalogo` sale vacía allá.
 */
export function sqlVistas(): string {
  const vistas: [string, string][] = [
    [
      "mgx_v_co_cabeza",
      `SELECT empresa, ano_doc, per_doc, tip_doc, num_doc, fecha, descrip, usercreo, fhedicion, fhcreacion
  FROM mgx_co_cabeza`,
    ],
    [
      "mgx_v_co_cuerpo",
      `SELECT empresa, ano_doc, per_doc, tip_doc, num_doc, item, cod_cta, debito, credito, concepto, cod_cos,
       nit_ter, cheque, base, doc_rel, porcen, doc_cru, dias, fec_ven, norma
  FROM mgx_co_cuerpo`,
    ],
    [
      "mgx_v_co_movimientos",
      `SELECT cabeza.empresa, cabeza.ano_doc, cabeza.per_doc, cabeza.tip_doc, cabeza.num_doc, cabeza.fecha,
       pri_cta.codigo AS cod_cta, pri_cta.nombre AS nom_cta, pri_cta.nat_cue,
       upper(cuerpo.concepto) AS concepto, cuerpo.cod_cos, cuerpo.nit_ter, cuerpo.doc_rel,
       cuerpo.base, cuerpo.porcen, cuerpo.credito, cuerpo.debito, cuerpo.norma
  FROM mgx_co_cabeza cabeza
  JOIN mgx_co_cuerpo cuerpo ON cuerpo.empresa = cabeza.empresa AND cuerpo.llave_doc = cabeza.llave_doc
  JOIN mgx_co_pri_cta pri_cta ON pri_cta.empresa = cuerpo.empresa AND pri_cta.codigo = cuerpo.cod_cta`,
    ],
    ["mgx_v_co_pri_cos", `SELECT empresa, codigo, nombre FROM mgx_co_pri_cos`],
    ["mgx_v_co_pri_cta", `SELECT empresa, codigo, nombre, tipo, nat_cue FROM mgx_co_pri_cta`],
    [
      "mgx_v_co_pri_ter",
      `SELECT empresa, nit, nombre, direccion, telefonos, correo, fax, cod_ciu, apa_aer, representante, estado, prod_ser
  FROM mgx_co_pri_ter`,
    ],
    [
      "mgx_v_no_nomina",
      `SELECT cabeza.empresa, cabeza.num_doc, cabeza.fecha, pri_epl.codigo AS cod_epl, pri_epl.nomcom AS nom_epl,
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
   AND pri_con.tipo >= 1 AND pri_con.tipo <= 2`,
    ],
    [
      "mgx_v_in_catalogo",
      `SELECT pri_ref.empresa, pri_ref.ref_cod, pri_ref.nombre, pri_ref.cod_gru, pri_ref.cod_und,
       pri_und.nombre AS nom_und, pri_gru.nombre AS nom_gru, pri_gru.cta_inv, pri_ref.cod_sgr,
       pri_sgr.nombre AS nom_sgr, pri_ref.cod_lin, pri_lin.nombre AS nom_lin, pri_ref.activa
  FROM mgx_in_pri_ref pri_ref
  LEFT JOIN mgx_in_pri_gru pri_gru ON pri_gru.empresa = pri_ref.empresa AND pri_gru.codigo = pri_ref.cod_gru
  LEFT JOIN mgx_in_pri_sgr pri_sgr ON pri_sgr.empresa = pri_ref.empresa AND pri_sgr.codigo = pri_ref.cod_sgr
  LEFT JOIN mgx_in_pri_lin pri_lin ON pri_lin.empresa = pri_ref.empresa AND pri_lin.codigo = pri_ref.cod_lin
  LEFT JOIN mgx_in_pri_und pri_und ON pri_und.empresa = pri_ref.empresa AND pri_und.codigo = pri_ref.cod_und`,
    ],
    ["mgx_v_in_bodegas", `SELECT empresa, codigo, nombre, direccion, telefonos FROM mgx_in_pri_bod`],
    ["mgx_v_in_unidades", `SELECT empresa, codigo, nombre FROM mgx_in_pri_und`],
  ];
  return vistas
    .map(
      ([nombre, sql]) =>
        `CREATE OR REPLACE VIEW ${nombre} AS\n${sql};\nGRANT SELECT ON ${nombre} TO service_role;`
    )
    .join("\n\n");
}

/** Los nombres de las vistas, para documentarlas y probarlas. */
export const VISTAS = [
  "mgx_v_co_cabeza", "mgx_v_co_cuerpo", "mgx_v_co_movimientos", "mgx_v_co_pri_cos", "mgx_v_co_pri_cta",
  "mgx_v_co_pri_ter", "mgx_v_no_nomina", "mgx_v_in_catalogo", "mgx_v_in_bodegas", "mgx_v_in_unidades",
] as const;
