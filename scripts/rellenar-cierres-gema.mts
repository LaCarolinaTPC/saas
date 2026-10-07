/**
 * Vuelve a traer de GEMA los cierres de un rango de fechas (cierres_diarios),
 * con los valores en plata que la sincronización actual sí trae.
 *
 * Para qué: los cierres de enero a mayo de 2026 se cargaron el 2026-06-17 con
 * una versión anterior de la sincronización y quedaron sin cédula, bruto,
 * salario bruto/neto, ahorro ni anticipo (solo viajes y timbradas). El
 * Análisis de liquidación y la Liquidación del conductor los necesitan.
 *
 * Uso (desde la raíz del proyecto):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/rellenar-cierres-gema.mts 2026-01-01 2026-05-31
 *
 * - Es idempotente: actualiza cada cierre por (cod_conductor, fecha, ruta),
 *   igual que la sincronización nocturna; no duplica.
 * - Va mes a mes: el procedimiento de GEMA responde mejor a rangos cortos.
 * - Restaura al final el marcador de `gema_sync_state` (dataset cierres). La
 *   sincronización nocturna arranca desde ese marcador: si quedara en el último
 *   día del relleno, la noche siguiente volvería a sincronizar todo desde ahí.
 *
 * Lee .env.local (Supabase y credenciales de GEMA) y escribe en la base.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archivo = [".env.local", ".env"].map((n) => path.join(RAIZ, n)).find(existsSync);
if (!archivo) throw new Error("No hay .env.local ni .env en la raíz del proyecto.");
for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
  if (!linea || linea.startsWith("#") || !linea.includes("=")) continue;
  const i = linea.indexOf("=");
  process.env[linea.slice(0, i).trim()] ??= linea.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

// Después de cargar el entorno: los módulos leen process.env al importarse.
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { syncCierres } = await import("../src/lib/gema/sync");

const [ini, fin] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(ini ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(fin ?? "") || ini > fin) {
  console.log("Uso: rellenar-cierres-gema.mts <desde AAAA-MM-DD> <hasta AAAA-MM-DD>");
  process.exit(1);
}

const db = createAdminClient();
const { data: antes, error } = await db.from("gema_sync_state").select("*").eq("dataset", "cierres").single();
if (error || !antes) throw new Error(`No se pudo leer el marcador de cierres: ${error?.message}`);
console.log(`Marcador de cierres antes: ${antes.last_synced_date}`);

try {
  for (let d = ini; d <= fin; ) {
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    const finMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const hasta = finMes < fin ? finMes : fin;
    const r = await syncCierres(db, d, hasta);
    console.log(`  ${d} → ${hasta}: ${r.rows} cierres${r.error ? ` · error: ${r.error}` : ""}`);
    d = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }
} finally {
  await db
    .from("gema_sync_state")
    .update({
      last_synced_date: antes.last_synced_date,
      rows_synced: antes.rows_synced,
      status: antes.status,
      error: antes.error,
      last_run_at: antes.last_run_at,
    })
    .eq("dataset", "cierres");
  console.log(`Marcador restaurado: ${antes.last_synced_date}`);
}

// Comprobación: cuántos cierres del rango siguen sin salario.
const { count } = await db
  .from("cierres_diarios")
  .select("*", { count: "exact", head: true })
  .gte("fecha", ini)
  .lte("fecha", fin)
  .is("salario_neto_dia", null);
console.log(`Cierres del rango que siguen sin salario neto: ${count ?? "?"}`);
