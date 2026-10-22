import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPRESAS,
  expandirAlcance,
  nombreEspejo,
  parValido,
  TABLAS,
} from "./catalogo";
import { limpiarFila, limpiarValor, llaveDocumento, llaveIndiceMgx, tipoDestino } from "./limpieza";
import {
  avanzarMarca,
  calcularVentana,
  columnaEdicion,
  decidirEstrategia,
  UMBRAL_REEMPLAZO,
} from "./plan";
import { partirDocumentos, partirPorBytes } from "./lotes";
import {
  sqlCatalogoSemilla,
  sqlFunciones,
  sqlTablaEspejo,
  sqlVistas,
  todasLasEspejo,
  unirColumnas,
  columnasDeVistas,
  PREFIJO_VISTAS_ORIGINALES,
  VISTAS,
} from "./esquema";

// ── Catálogo ─────────────────────────────────────────────────────────────────

test("son 31 tablas base y 109 pares empresa × tabla", () => {
  const tablas = Object.values(TABLAS).reduce((s, l) => s + l.length, 0);
  assert.equal(tablas, 31);
  assert.equal(todasLasEspejo().length, 31);
  // co en 7 empresas (5 tablas), no en 5 (11), in solo emp0 (14), rh en 5 (1).
  assert.equal(expandirAlcance().length, 7 * 5 + 5 * 11 + 14 + 5 * 1);
});

test("expandirAlcance filtra por empresa, módulo y tabla", () => {
  assert.deepEqual(
    expandirAlcance({ empresa: "emp10" }).map((p) => p.modulo),
    ["co", "co", "co", "co", "co"],
    "emp10 solo tiene contable"
  );
  assert.equal(expandirAlcance({ empresa: "emp0" }).length, 5 + 11 + 14 + 1);
  assert.deepEqual(expandirAlcance({ modulo: "in" }).map((p) => p.empresa).filter((e, i, a) => a.indexOf(e) === i), ["emp0"]);
  assert.deepEqual(expandirAlcance({ empresa: "emp3", modulo: "co", tabla: "cuerpo" }), [
    { empresa: "emp3", modulo: "co", tabla: "cuerpo" },
  ]);
  // Una tabla que no es del módulo pedido no aparece.
  assert.deepEqual(expandirAlcance({ modulo: "rh", tabla: "cuerpo" }), []);
});

test("en cada empresa y módulo, la cabeza va antes que el cuerpo y los maestros antes de los dos", () => {
  const co = expandirAlcance({ empresa: "emp0", modulo: "co" }).map((p) => p.tabla);
  assert.deepEqual(co, ["pri_cos", "pri_cta", "pri_ter", "cabeza", "cuerpo"]);
  const no = expandirAlcance({ empresa: "emp0", modulo: "no" }).map((p) => p.tabla);
  assert.ok(no.indexOf("cabeza") < no.indexOf("cuerpo"));
  assert.ok(no.indexOf("pri_per") < no.indexOf("cabeza"));
});

test("parValido rechaza lo que no existe en MGX (no se confía en el cliente)", () => {
  assert.ok(parValido({ empresa: "emp0", modulo: "in", tabla: "cuerpo" }));
  assert.ok(!parValido({ empresa: "emp2", modulo: "in", tabla: "cuerpo" }), "emp2 no tiene inventarios");
  assert.ok(!parValido({ empresa: "emp0", modulo: "co", tabla: "mgx_tablas" }));
  assert.ok(!parValido({ empresa: "emp99", modulo: "co", tabla: "cuerpo" }));
  assert.ok(!parValido({ empresa: "emp0", modulo: "co", tabla: "cuerpo; drop table x" }));
  assert.ok(!parValido({}));
});

test("nombres del espejo", () => {
  assert.equal(nombreEspejo("co", "cuerpo"), "mgx_co_cuerpo");
  assert.equal(nombreEspejo("in", "mgx_csc"), "mgx_in_mgx_csc");
  assert.equal(EMPRESAS.length, 7);
});

// ── Limpieza ─────────────────────────────────────────────────────────────────

test("los textos pierden el relleno de la derecha, no el de la izquierda", () => {
  assert.equal(limpiarValor("SIC0400002          ", "character varying"), "SIC0400002");
  assert.equal(limpiarValor("27 ", "character varying"), "27");
  assert.equal(limpiarValor("  A1  ", "character"), "  A1");
  assert.equal(limpiarValor("", "character varying"), "", "vacío no es NULL");
  assert.equal(limpiarValor("   ", "text"), "");
  assert.equal(limpiarValor(null, "text"), null);
});

test("las fechas centinela de MGX se guardan NULL; las reales, tal cual", () => {
  assert.equal(limpiarValor("0001-01-01", "date"), null);
  assert.equal(limpiarValor("0100-01-01", "date"), null);
  assert.equal(limpiarValor("1001-01-01 00:00:00", "timestamp without time zone"), null);
  assert.equal(limpiarValor("1900-01-01", "date"), "1900-01-01", "1900 ya es una fecha válida");
  assert.equal(
    limpiarValor("2026-10-20 15:55:49.540478", "timestamp without time zone"),
    "2026-10-20 15:55:49.540478"
  );
  assert.equal(limpiarValor("no es fecha", "date"), null);
});

test("los numéricos viajan como texto, sin perder decimales; los enteros como número", () => {
  assert.equal(limpiarValor("201744413.39", "numeric"), "201744413.39");
  assert.equal(limpiarValor("0.000000", "numeric"), "0.000000");
  assert.equal(limpiarValor("", "numeric"), null);
  assert.equal(limpiarValor(17095897, "integer"), 17095897);
  assert.equal(limpiarValor("42", "integer"), 42);
});

test("limpiarFila agrega la empresa, limpia cada columna y descarta lo desconocido", () => {
  const f = limpiarFila(
    { ide: 10, num_doc: "CR-1   ", fecha: "0001-01-01", valor: "5.00", extra: "x" },
    [
      { nombre: "ide", tipo: "integer" },
      { nombre: "num_doc", tipo: "character varying" },
      { nombre: "fecha", tipo: "date" },
      { nombre: "valor", tipo: "numeric" },
      { nombre: "cantidad", tipo: "numeric" },
    ],
    "emp0"
  );
  assert.deepEqual(f, { empresa: "emp0", ide: 10, num_doc: "CR-1", fecha: null, valor: "5.00", cantidad: null });
});

test("llave de documento: con separador en Gestivo, sin él como la indexa MGX", () => {
  const f = { ano_doc: "2025", per_doc: "09", tip_doc: "14 ", num_doc: "CXP20250900510   " };
  assert.equal(llaveDocumento(f), "2025|09|14|CXP20250900510");
  assert.equal(llaveIndiceMgx(f), "20250914CXP20250900510");
  // Dos documentos distintos que sin separador darían lo mismo.
  const a = { ano_doc: "2025", per_doc: "09", tip_doc: "1", num_doc: "4X" };
  const b = { ano_doc: "2025", per_doc: "09", tip_doc: "14", num_doc: "X" };
  assert.equal(llaveIndiceMgx(a), llaveIndiceMgx(b));
  assert.notEqual(llaveDocumento(a), llaveDocumento(b));
});

test("tipoDestino falla con un tipo que no conoce", () => {
  assert.equal(tipoDestino("character varying"), "text");
  assert.equal(tipoDestino("timestamp without time zone"), "timestamp");
  assert.throws(() => tipoDestino("bytea"), /no contemplado/);
});

// ── Estrategia ───────────────────────────────────────────────────────────────

const COLS_CUERPO = ["ano_doc", "per_doc", "tip_doc", "num_doc", "item", "ide"];
const COLS_CABEZA = ["ano_doc", "per_doc", "tip_doc", "num_doc", "fecha", "fhedicion", "fhcreacion", "ide"];

test("decidirEstrategia con los casos reales de MGX", () => {
  assert.equal(
    decidirEstrategia({ modulo: "co", tabla: "cuerpo", columnas: COLS_CUERPO, filas: 16_237_462 }).estrategia,
    "incremental_documento"
  );
  assert.equal(
    decidirEstrategia({ modulo: "co", tabla: "cabeza", columnas: COLS_CABEZA, filas: 426_764 }).estrategia,
    "incremental_edicion"
  );
  // no.cuerpo tiene `fhe`, pero muerto desde 2016: se re-trae por su cabeza.
  assert.equal(
    decidirEstrategia({ modulo: "no", tabla: "cuerpo", columnas: [...COLS_CUERPO, "fhe"], filas: 1_199_487 }).estrategia,
    "incremental_documento"
  );
  // Chica aunque tenga fecha de edición: se recarga, y así refleja los borrados.
  assert.equal(
    decidirEstrategia({ modulo: "no", tabla: "pri_per", columnas: ["codigo", "fhe", "ide"], filas: 1001 }).estrategia,
    "reemplazo"
  );
  assert.equal(
    decidirEstrategia({ modulo: "co", tabla: "cabeza", columnas: COLS_CABEZA, filas: 0 }).estrategia,
    "reemplazo",
    "emp10 vacía"
  );
  // Grande y sin edición fiable: no queda otra que recargar.
  assert.equal(
    decidirEstrategia({ modulo: "rh", tabla: "pri_epl", columnas: ["codigo", "fhe", "ide"], filas: UMBRAL_REEMPLAZO }).estrategia,
    "reemplazo"
  );
  assert.throws(() => decidirEstrategia({ modulo: "co", tabla: "x", columnas: ["a"], filas: 1 }), /no tiene columna ide/);
});

test("columnaEdicion prefiere fhedicion y desconfía de las marcadas", () => {
  assert.equal(columnaEdicion({ modulo: "co", tabla: "cabeza", columnas: COLS_CABEZA }), "fhedicion");
  assert.equal(columnaEdicion({ modulo: "no", tabla: "pri_con", columnas: ["fhe", "fhc"] }), "fhe");
  assert.equal(columnaEdicion({ modulo: "rh", tabla: "pri_epl", columnas: ["fhe"] }), null);
  assert.equal(columnaEdicion({ modulo: "co", tabla: "cuerpo", columnas: COLS_CUERPO }), null);
});

test("calcularVentana: la primera vez trae todo y no mira ediciones", () => {
  assert.deepEqual(calcularVentana({ ultimo_ide: null, ultima_edicion: null }), {
    desdeIde: 0,
    desdeEdicion: null,
    primeraVez: true,
  });
});

test("calcularVentana repasa 24 horas hacia atrás desde la última edición", () => {
  const v = calcularVentana({ ultimo_ide: 440_033, ultima_edicion: "2026-10-20 15:55:49.540478" });
  assert.equal(v.desdeIde, 440_033);
  assert.equal(v.desdeEdicion, "2026-10-19 15:55:49");
  assert.equal(v.primeraVez, false);
});

test("avanzarMarca toma la mayor, ignorando centinelas y fechas del futuro", () => {
  const ahora = new Date(Date.UTC(2026, 9, 21, 12, 0, 0));
  const filas = [
    { fhedicion: "0001-01-01 00:00:00" },
    { fhedicion: "2026-10-20 10:00:00" },
    { fhedicion: "2031-01-01 00:00:00" },
    { fhedicion: "2026-10-21 08:30:00.25" },
    { fhedicion: null },
  ];
  assert.equal(avanzarMarca("2026-10-19 00:00:00", filas, "fhedicion", ahora), "2026-10-21 08:30:00.25");
  // Nunca retrocede.
  assert.equal(avanzarMarca("2026-10-22 00:00:00", filas, "fhedicion", ahora), "2026-10-22 00:00:00");
  assert.equal(avanzarMarca(null, [], "fhedicion", ahora), null);
});

// ── Lotes ────────────────────────────────────────────────────────────────────

test("partirPorBytes respeta el tope de bytes y el de filas", () => {
  const filas = Array.from({ length: 10 }, (_, i) => ({ ide: i, texto: "x".repeat(90) }));
  const porBytes = partirPorBytes(filas, 350, 1000);
  assert.ok(porBytes.every((l) => JSON.stringify(l).length <= 350 + l.length));
  assert.equal(porBytes.flat().length, 10);
  assert.deepEqual(partirPorBytes(filas, 1e9, 4).map((l) => l.length), [4, 4, 2]);
  assert.deepEqual(partirPorBytes([], 100, 10), []);
  // Una fila más grande que el tope va sola, no se pierde.
  assert.equal(partirPorBytes([{ t: "x".repeat(500) }], 100, 10).length, 1);
});

test("partirDocumentos no parte un documento y manda también los vacíos", () => {
  const m = new Map<string, { ide: number }[]>([
    ["a", [{ ide: 1 }, { ide: 2 }, { ide: 3 }]],
    ["b", []],
    ["c", [{ ide: 4 }, { ide: 5 }]],
  ]);
  const lotes = partirDocumentos(m, 1e9, 4);
  assert.deepEqual(lotes.map((l) => l.llaves), [["a", "b"], ["c"]]);
  assert.deepEqual(lotes.map((l) => l.filas.length), [3, 2]);
});

// ── SQL ──────────────────────────────────────────────────────────────────────

test("unirColumnas suma las que faltan en alguna empresa y frena con tipos distintos", () => {
  const u = unirColumnas({
    emp0: [{ nombre: "ide", tipo: "integer" }, { nombre: "valor", tipo: "numeric" }],
    emp2: [
      { nombre: "ide", tipo: "integer" },
      { nombre: "valor", tipo: "numeric" },
      { nombre: "cantidad", tipo: "numeric" },
    ],
  });
  assert.deepEqual(u.map((c) => c.nombre), ["ide", "valor", "cantidad"]);
  assert.throws(
    () =>
      unirColumnas({
        emp0: [{ nombre: "valor", tipo: "numeric" }],
        emp2: [{ nombre: "valor", tipo: "character varying" }],
      }),
    /decidir a mano/
  );
  // varchar y char van al mismo destino: no es un conflicto.
  assert.equal(
    unirColumnas({ a: [{ nombre: "x", tipo: "character" }], b: [{ nombre: "x", tipo: "character varying" }] }).length,
    1
  );
});

test("sqlTablaEspejo: llave (empresa, ide), columnas idempotentes, llave_doc, RLS y GRANT", () => {
  const sql = sqlTablaEspejo({
    modulo: "co",
    tabla: "cuerpo",
    columnas: [
      { nombre: "ano_doc", tipo: "character varying" },
      { nombre: "per_doc", tipo: "character varying" },
      { nombre: "tip_doc", tipo: "character varying" },
      { nombre: "num_doc", tipo: "character varying" },
      { nombre: "debito", tipo: "numeric" },
      { nombre: "fec_ven", tipo: "date" },
      { nombre: "ide", tipo: "integer" },
    ],
  });
  assert.match(sql, /CREATE TABLE IF NOT EXISTS mgx_co_cuerpo \(/);
  assert.match(sql, /PRIMARY KEY \(empresa, ide\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "debito" numeric/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "fec_ven" date/);
  assert.doesNotMatch(sql, /ADD COLUMN IF NOT EXISTS "ide"/, "ide va en el CREATE");
  assert.match(sql, /llave_doc text GENERATED ALWAYS AS \(coalesce\("ano_doc", ''\) \|\| '\|' \|\|/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_mgx_co_cuerpo_llave_doc ON mgx_co_cuerpo \("empresa", "llave_doc"\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /GRANT ALL ON mgx_co_cuerpo TO service_role/);
  assert.doesNotMatch(sql, /DROP/);
});

test("una columna de MGX que se llama como una de Gestivo va renombrada (rh.pri_epl.empresa)", () => {
  const sql = sqlTablaEspejo({
    modulo: "rh",
    tabla: "pri_epl",
    columnas: [{ nombre: "ide", tipo: "integer" }, { nombre: "empresa", tipo: "character varying" }],
  });
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "empresa_mgx" text/);
  assert.doesNotMatch(sql, /ADD COLUMN IF NOT EXISTS "empresa" /);
  const f = limpiarFila({ ide: 1, empresa: "001 " }, [
    { nombre: "ide", tipo: "integer" },
    { nombre: "empresa", tipo: "character varying" },
  ], "emp0");
  assert.deepEqual(f, { ide: 1, empresa_mgx: "001", empresa: "emp0" });
});

test("las funciones de escritura tienen lista blanca y son solo de service_role", () => {
  const sql = sqlFunciones();
  for (const t of todasLasEspejo()) assert.ok(sql.includes(`'${t}'`), t);
  assert.doesNotMatch(sql, /'mgx_tablas'/);
  for (const f of ["mgx_reemplazar(", "mgx_upsert(", "mgx_reemplazar_documentos("]) {
    assert.ok(sql.includes(`CREATE OR REPLACE FUNCTION ${f}`), f);
  }
  assert.match(sql, /REVOKE ALL ON FUNCTION mgx_upsert\(text, jsonb\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION mgx_upsert\(text, jsonb\) TO service_role/);
});

test("las vistas cruzan por empresa y no quedan atadas a emp0 ni ordenadas", () => {
  const sql = sqlVistas();
  for (const v of VISTAS) assert.ok(sql.includes(`CREATE OR REPLACE VIEW ${v} AS`), v);
  assert.doesNotMatch(sql, /emp0/);
  assert.doesNotMatch(sql, /ORDER BY/);
  assert.match(sql, /cuerpo\.empresa = cabeza\.empresa AND cuerpo\.llave_doc = cabeza\.llave_doc/);
  assert.match(sql, /WHERE cabeza\.tip_doc = '03'/);
  assert.match(sql, /LEFT JOIN mgx_in_pri_lin/);
});

test("las 10 vistas del documento solo crecen por el final y las 6 nuevas están completas", () => {
  const sql = sqlVistas();
  assert.equal(VISTAS.length, 16);
  for (const v of VISTAS) assert.ok(sql.includes(`GRANT SELECT ON ${v} TO service_role;`), v);
  // CREATE OR REPLACE VIEW solo admite columnas nuevas al final.
  for (const [v, prefijo] of Object.entries(PREFIJO_VISTAS_ORIGINALES)) {
    assert.ok(sql.includes(`CREATE OR REPLACE VIEW ${v} AS
${prefijo}`), `${v} cambió sus columnas originales`);
  }
  assert.equal(Object.keys(PREFIJO_VISTAS_ORIGINALES).length, 10);
  // Toda vista expuesta al MCP trae su identificador.
  for (const v of VISTAS) {
    const cuerpo = sql.split(`CREATE OR REPLACE VIEW ${v} AS`)[1].split("GRANT SELECT")[0];
    assert.match(cuerpo, /[ .]ide\b|AS id\b/, v);
  }
  assert.match(sql, /AND cuerpo\.cod_ref <> ''/);
  assert.match(sql, /FROM mgx_tablas t/);
  assert.doesNotMatch(sql, /usuario_email/);
});

test("las columnas de cada vista se leen de su SQL", () => {
  const c = columnasDeVistas();
  assert.deepEqual(Object.keys(c).sort(), [...VISTAS].sort());
  assert.deepEqual(c.mgx_v_co_pri_cta, ["empresa", "codigo", "nombre", "tipo", "nat_cue", "estado", "norma", "ide"]);
  assert.equal(c.mgx_v_no_nomina.length, 34);
  assert.ok(c.mgx_v_no_nomina.includes("observa"), "subconsultas entre paréntesis");
  assert.deepEqual(c.mgx_v_no_catalogos, ["empresa", "catalogo", "codigo", "nombre", "activo", "riesgo_arl", "id"]);
  for (const v of VISTAS) assert.equal(new Set(c[v]).size, c[v].length, `${v} repite una columna`);
});

test("la semilla del catálogo es repetible", () => {
  const sql = sqlCatalogoSemilla([{ empresa: "emp0", modulo: "co", tabla: "cuerpo", estrategia: "incremental_documento", filas: 16237462 }]);
  assert.match(sql, /\('emp0', 'co', 'cuerpo', 'incremental_documento', 16237462\)/);
  assert.match(sql, /ON CONFLICT \(empresa, modulo, tabla\) DO UPDATE/);
  assert.doesNotMatch(sql, /estrategia = EXCLUDED/, "no pisa una estrategia cambiada a mano");
  assert.equal(sqlCatalogoSemilla([]), "");
});
