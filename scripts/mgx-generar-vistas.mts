// Escribe en una migración ya creada SOLO las vistas de MGX (mgx_v_*), sin
// tocar tablas espejo, funciones ni catálogo, y sin conectarse a MGX.
//
//   npm run migracion:nueva -- "vistas de mgx para el mcp"
//   npm run mgx:generar-vistas -- supabase/migrations/<archivo>.sql
//
// Para cuando cambian las vistas y no las tablas (por ejemplo, al exponer una
// columna más al MCP). La fuente única del SQL sigue siendo sqlVistas() en
// src/lib/mgx/esquema.ts, la misma que usa mgx:generar-migracion.
//
// Igual que el generador grande, se niega a escribir en un archivo que ya
// tenga SQL: una migración aplicada no se edita.

import { readFileSync, writeFileSync } from "node:fs";

async function main() {
  const { sqlVistas, VISTAS } = await import("../src/lib/mgx/esquema");

  const archivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!archivo) throw new Error("Falta la ruta de la migración (créela antes con npm run migracion:nueva).");

  const actual = readFileSync(archivo, "utf8");
  const conSql = actual.split(/\r?\n/).some((l) => l.trim() && !l.trim().startsWith("--"));
  if (conSql) throw new Error(`${archivo} ya tiene SQL. Cree una migración nueva con npm run migracion:nueva.`);

  const titulo = actual.split(/\r?\n/)[0]?.replace(/^--\s*/, "").trim() || "vistas de mgx";
  const sql = `-- ${titulo}
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

${sqlVistas()}

COMMIT;
`;
  writeFileSync(archivo, sql, "utf8");
  console.log(`${archivo}: ${VISTAS.length} vistas escritas.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
