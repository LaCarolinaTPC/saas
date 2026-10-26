import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/padrino/datos";
import { DATASETS_GPS, runGps, type DatasetGps } from "@/lib/gema/gps";

// mysql2 no corre en edge. 300 s es el máximo del plan Hobby de Vercel.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Tiempo para EMPEZAR días nuevos; el resto de los 300 s es margen para
// terminar el día en curso (un día de eventos son cuatro consultas a GEMA y
// un reemplazo de ~4.400 filas). Solo importa si el cron estuvo caído varios
// días y se pone al día: una noche normal tarda menos de un minuto.
const PRESUPUESTO_MS = Number(process.env.GPS_CRON_BUDGET_MS ?? 230_000);

/**
 * Cron diario del GPS de GEMA (vercel.json, 10:00 UTC = 5:00 am de Colombia,
 * después de los crons de GEMA y MGX para no cargar la base de GEMA a la vez).
 * Trae SOLO lo reciente de kilometraje, bloqueos del sensor y eventos del GPS.
 * El histórico se carga una vez desde un equipo con `npm run gps:carga-inicial`
 * (ver docs/gps-gema.md).
 *
 * Exige CRON_SECRET SIEMPRE: si falta en Vercel, rechaza en vez de quedar
 * abierto. `?solo=km|bloqueos|eventos` corre un solo dataset (para probar).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const soloParam = request.nextUrl.searchParams.get("solo");
  if (soloParam && !DATASETS_GPS.includes(soloParam as DatasetGps)) {
    return NextResponse.json({ error: `solo debe ser uno de: ${DATASETS_GPS.join(", ")}` }, { status: 400 });
  }
  const solo = (soloParam as DatasetGps | null) ?? undefined;

  const t0 = Date.now();
  try {
    const hoy = hoyBogota();
    const resultados = await runGps(createAdminClient(), hoy, t0 + PRESUPUESTO_MS, solo);
    const errores = resultados.filter((r) => r.error);
    return NextResponse.json(
      {
        ok: errores.length === 0,
        hoy,
        segundos: Math.round((Date.now() - t0) / 1000),
        resultados,
      },
      { status: errores.length ? 207 : 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron sync-gps]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
