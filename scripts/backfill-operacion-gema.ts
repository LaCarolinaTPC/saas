// Carga histórica de la operación de GEMA tal cual: timbradas descontadas,
// tickets transfer, anotaciones de viaje y planilla de cumplimientos.
//
// La corrida diaria del cron solo repasa los últimos días; este script llena
// el histórico mes a mes. Reemplaza cada día completo, así que se puede
// repetir sin duplicar.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     npx tsx --tsconfig tsconfig.json scripts/backfill-operacion-gema.ts [desde] [hasta]
//
// Por defecto desde 2026-01-01 hasta hoy. Las credenciales de GEMA se leen de
// .env.local.

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { closeGemaPool } = await import("../src/lib/gema/client");
  const {
    syncTimbradasDescontadas,
    syncTicketsTransfer,
    syncAnotacionesViajes,
    syncCumplimientos,
    syncHistoricoDespacho,
  } = await import("../src/lib/gema/sync");

  const hoy = new Date().toISOString().slice(0, 10);
  const desde = process.argv[2] ?? "2026-01-01";
  const hasta = process.argv[3] ?? hoy;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }

  const db = createAdminClient();
  const datasets = [
    syncTimbradasDescontadas,
    syncTicketsTransfer,
    syncAnotacionesViajes,
    syncCumplimientos,
    syncHistoricoDespacho,
  ];
  let errores = 0;

  for (let inicioMes = desde; inicioMes <= hasta; ) {
    const fecha = new Date(`${inicioMes}T00:00:00Z`);
    const finMes = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const fin = finMes < hasta ? finMes : hasta;

    for (const sync of datasets) {
      const inicio = Date.now();
      try {
        const r = await sync(db, inicioMes, fin);
        console.log(`${inicioMes}…${fin}  ${r.dataset.padEnd(22)} ${String(r.rows).padStart(7)} filas  ${Math.round((Date.now() - inicio) / 1000)} s`);
      } catch (e) {
        errores++;
        console.error(`${inicioMes}…${fin}  ${sync.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
    inicioMes = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  }

  await closeGemaPool();
  if (errores) {
    console.error(`\nTerminó con ${errores} error(es). Repetir es seguro: cada día se reemplaza completo.`);
    process.exit(1);
  }
  console.log("\nCarga histórica completa.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
