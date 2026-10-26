// Carga inicial del histórico del GPS de GEMA, desde un equipo y sin límite de
// tiempo: kilometraje, bloqueos del sensor y eventos del GPS (sin los pings).
// El cron /api/cron/sync-gps solo trae lo reciente; el histórico se carga con
// esto una vez.
//
//   npm run gps:carga-inicial
//   npm run gps:carga-inicial -- 2026-01-01 2026-10-25
//   npm run gps:carga-inicial -- 2026-03-14 --solo=eventos      (retomar)
//
// Por defecto desde GPS_HISTORICO_DESDE (2026-01-01) hasta ayer. Reemplaza cada
// día completo (y el kilometraje hace upsert), así que se puede repetir o
// retomar sin duplicar, y no toca los marcadores del cron. Si se corta, imprime
// el comando para seguir desde el último día guardado.
//
// Tiempo medido (2026-10-26, red local): ~6 s por día de eventos, ~1 s por día
// de bloqueos, ~2 s por mes de kilometraje. Desde enero: ~30-50 min en total,
// casi todo en eventos. Las credenciales de GEMA y Supabase se leen de .env.local.

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { closeGemaPool } = await import("../src/lib/gema/client");
  const { DATASETS_GPS, GPS_HISTORICO_DESDE, cargarRangoGps } = await import("../src/lib/gema/gps");
  const { sumarDias } = await import("../src/lib/gema/gps-reglas");
  type Dataset = (typeof DATASETS_GPS)[number];

  const args = process.argv.slice(2);
  const fechas = args.filter((a) => FECHA.test(a));
  const solo = args.find((a) => a.startsWith("--solo="))?.slice("--solo=".length);
  if (solo && !DATASETS_GPS.includes(solo as Dataset)) {
    throw new Error(`--solo debe ser uno de: ${DATASETS_GPS.join(", ")}`);
  }
  const ayer = sumarDias(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()), -1);
  const desde = fechas[0] ?? GPS_HISTORICO_DESDE;
  const hasta = fechas[1] ?? ayer;
  if (desde > hasta) throw new Error(`Rango vacío: ${desde} > ${hasta}`);

  const db = createAdminClient();
  const datasets: readonly Dataset[] = solo ? [solo as Dataset] : DATASETS_GPS;
  console.log(`Carga inicial del GPS de GEMA ${desde} … ${hasta}: ${datasets.join(", ")}\n`);
  const t0 = Date.now();
  try {
    for (let i = 0; i < datasets.length; i++) {
      const d = datasets[i];
      const inicio = Date.now();
      let guardadoHasta: string | null = null;
      try {
        const filas = await cargarRangoGps(db, d, desde, hasta, (texto, hastaDia) => {
          guardadoHasta = hastaDia;
          console.log(`  ${texto}`);
        });
        console.log(`${d}: ${filas.toLocaleString("es-CO")} filas en ${Math.round((Date.now() - inicio) / 1000)} s\n`);
      } catch (e) {
        // Lo ya guardado queda: se retoma desde el día siguiente al último completo.
        const retomar = guardadoHasta ? sumarDias(guardadoHasta, 1) : desde;
        const faltan = datasets.slice(i);
        console.error(`\n${d}: ${e instanceof Error ? e.message : e}`);
        console.error(`Para seguir desde donde quedó:`);
        for (const f of faltan) {
          console.error(`  npm run gps:carga-inicial -- ${f === d ? retomar : desde} ${hasta} --solo=${f}`);
        }
        process.exitCode = 1;
        return;
      }
    }
    console.log(`Listo en ${Math.round((Date.now() - t0) / 60_000)} min.`);
  } finally {
    await closeGemaPool();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
