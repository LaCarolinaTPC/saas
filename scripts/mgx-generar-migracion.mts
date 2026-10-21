// Genera el SQL de las tablas espejo de MGX dentro de una migración ya creada.
//
//   npm run migracion:nueva -- "tablas espejo de mgx"
//   npm run mgx:generar-migracion -- supabase/migrations/<archivo>.sql
//   npm run mgx:generar-migracion -- supabase/migrations/<archivo>.sql --desde-json <informe.json>
//
// Lee de MGX (con las credenciales de .env.local) las columnas de las 31
// tablas base en las siete empresas, une las columnas por tabla, decide la
// estrategia de cada par y escribe: tablas espejo, catálogo y su semilla,
// funciones de escritura y vistas. Con --desde-json trabaja sin conexión sobre
// el informe de la inspección (mismo formato que deja mgx-inspeccionar.mjs).
//
// Se niega a escribir en un archivo que ya tenga SQL: una migración aplicada no
// se edita. Si MGX agrega columnas, se crea OTRA migración y se vuelve a
// generar; como todo es IF NOT EXISTS / OR REPLACE, solo agrega lo nuevo.

import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
config({ path: ".env.local", quiet: true });

type Col = { nombre: string; tipo: string };

async function main() {
  const { EMPRESAS, MODULOS, MODULOS_POR_EMPRESA, TABLAS, esquemaOrigen } = await import("../src/lib/mgx/catalogo");
  const { decidirEstrategia } = await import("../src/lib/mgx/plan");
  const { esTipoMgx } = await import("../src/lib/mgx/limpieza");
  const esq = await import("../src/lib/mgx/esquema");

  const args = process.argv.slice(2);
  const archivo = args.find((a) => !a.startsWith("--"));
  const iJson = args.indexOf("--desde-json");
  const json = iJson >= 0 ? args[iJson + 1] : null;
  if (!archivo) throw new Error("Falta la ruta de la migración (créela antes con npm run migracion:nueva).");

  const actual = readFileSync(archivo, "utf8");
  const conSql = actual.split(/\r?\n/).some((l) => l.trim() && !l.trim().startsWith("--"));
  if (conSql) throw new Error(`${archivo} ya tiene SQL. Cree una migración nueva con npm run migracion:nueva.`);

  // ── Metadatos: columnas y filas por esquema.tabla ──────────────────────────
  const columnas = new Map<string, Col[]>();
  const filas = new Map<string, number>();
  if (json) {
    const inf = JSON.parse(readFileSync(json, "utf8")) as {
      objetos: { esquema: string; objeto: string; tipo: string; filas?: number; columnas: { nombre: string; tipo: string }[] }[];
    };
    for (const o of inf.objetos) {
      if (o.tipo !== "BASE TABLE") continue;
      columnas.set(`${o.esquema}.${o.objeto}`, o.columnas.map((c) => ({ nombre: c.nombre, tipo: c.tipo })));
      filas.set(`${o.esquema}.${o.objeto}`, Number(o.filas ?? 0));
    }
  } else {
    const { mgxQuery, closeMgxPool } = await import("../src/lib/mgx/client");
    try {
      const cols = await mgxQuery<{ s: string; t: string; c: string; d: string }>(
        `SELECT table_schema s, table_name t, column_name c, data_type d
           FROM information_schema.columns
          WHERE table_schema LIKE 'emp%' ORDER BY table_schema, table_name, ordinal_position`
      );
      for (const r of cols) {
        const k = `${r.s}.${r.t}`;
        (columnas.get(k) ?? columnas.set(k, []).get(k)!).push({ nombre: r.c, tipo: r.d });
      }
      // Estimado del catálogo: contar 16 millones de filas tarda más de un minuto.
      const est = await mgxQuery<{ s: string; t: string; n: string }>(
        `SELECT n.nspname s, c.relname t, c.reltuples::bigint::text n
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname LIKE 'emp%' AND c.relkind = 'r'`
      );
      for (const r of est) filas.set(`${r.s}.${r.t}`, Math.max(0, Number(r.n)));
    } finally {
      await closeMgxPool();
    }
  }

  // ── Unión de columnas por tabla y estrategia por par ───────────────────────
  const tablasSql: string[] = [];
  const semilla: Parameters<typeof esq.sqlCatalogoSemilla>[0][number][] = [];
  const avisos: string[] = [];
  const resumen: string[] = [];

  for (const modulo of MODULOS) {
    for (const tabla of TABLAS[modulo]) {
      const porEmpresa: Record<string, { nombre: string; tipo: never }[]> = {};
      for (const empresa of EMPRESAS) {
        if (!MODULOS_POR_EMPRESA[empresa].includes(modulo)) continue;
        const k = `${esquemaOrigen(empresa, modulo)}.${tabla}`;
        const cols = columnas.get(k);
        if (!cols) {
          avisos.push(`${k} no aparece en MGX: queda fuera del catálogo.`);
          continue;
        }
        for (const c of cols) {
          if (!esTipoMgx(c.tipo)) throw new Error(`${k}.${c.nombre} es «${c.tipo}»: agregue el tipo a limpieza.ts.`);
        }
        porEmpresa[empresa] = cols as never;
      }
      if (!Object.keys(porEmpresa).length) continue;
      const union = esq.unirColumnas(porEmpresa);
      tablasSql.push(esq.sqlTablaEspejo({ modulo, tabla, columnas: union }));

      for (const empresa of Object.keys(porEmpresa) as (typeof EMPRESAS)[number][]) {
        const k = `${esquemaOrigen(empresa, modulo)}.${tabla}`;
        const n = filas.get(k) ?? 0;
        const { estrategia } = decidirEstrategia({
          modulo,
          tabla,
          columnas: porEmpresa[empresa].map((c) => c.nombre),
          filas: n,
        });
        semilla.push({ empresa, modulo, tabla, estrategia, filas: n });
        if (estrategia !== "reemplazo") resumen.push(`  ${k.padEnd(20)} ${String(n).padStart(10)}  ${estrategia}`);
      }
    }
  }

  const titulo = actual.split(/\r?\n/)[0] || "-- tablas espejo de mgx";
  const sql = `${titulo}
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
-- (${json ? "informe " + json.replace(/^.*[\\/]/, "") : "leído en vivo"}, ${new Date().toISOString().slice(0, 10)}).
-- No se edita a mano: si MGX cambia, se crea otra migración y se regenera.
-- Todo es IF NOT EXISTS / OR REPLACE: correrla dos veces no cambia nada.
--
-- Se aplica a mano en el SQL Editor, entera y de una sola vez. Cada tabla nueva
-- lleva su GRANT a service_role (en esta instalación no se hereda).
--
-- Detalle en docs/mgx-sincronizacion.md.

BEGIN;

-- =============================================================================
-- 1. Tablas espejo (${tablasSql.length})
-- =============================================================================

${tablasSql.join("\n\n")}

-- =============================================================================
-- 2. Catálogo de pares y bitácora de corridas
-- =============================================================================

${esq.sqlCatalogo()}

${esq.sqlCatalogoSemilla(semilla)}

-- =============================================================================
-- 3. Funciones de escritura (solo service_role, con lista blanca)
-- =============================================================================

${esq.sqlFunciones()}

-- =============================================================================
-- 4. Vistas del documento de MGX, sobre el espejo y con empresa
-- =============================================================================

${esq.sqlVistas()}

COMMIT;
`;
  writeFileSync(archivo, sql);

  console.log(`Escrito ${archivo}`);
  console.log(`  ${tablasSql.length} tablas espejo · ${semilla.length} pares en el catálogo · ${esq.VISTAS.length} vistas`);
  console.log(`  pares incrementales:\n${resumen.join("\n")}`);
  for (const a of avisos) console.log(`  AVISO ${a}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
