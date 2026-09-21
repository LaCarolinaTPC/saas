import { NextRequest, NextResponse } from "next/server";
import { consolidarAbiertos } from "@/lib/financiera/consolidacion";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Consolidación diaria de Financiera: agrega `ingreso_tercero` a mes por
 * vehículo y propietario para los meses no cerrados y cierra los que el
 * marcador de GEMA ya pasó (acta 2026-09-18, puntos 13 y 14).
 *
 * En producción NO tiene entrada propia en vercel.json: el plan Hobby admite
 * dos crons y ya están ocupados (sync-gema y riesgo-conductores). La corrida
 * diaria la dispara el propio cron de sync-gema al terminar, que es además el
 * orden correcto: primero llega el cierre del día de GEMA, después se
 * consolida. Esta ruta queda para invocarla a mano o desde otro programador:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/financiera-consolidar
 *
 * Es idempotente: correrla dos veces da el mismo resultado.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const r = await consolidarAbiertos("cron");
    return NextResponse.json({
      ok: true,
      marcaGema: r.marcaGema,
      consolidados: r.periodos.filter((p) => !p.omitido).map((p) => p.periodo),
      cerrados: r.cerrados,
      periodos: r.periodos,
      duracionMs: r.duracionMs,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[cron financiera-consolidar]", e);
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
