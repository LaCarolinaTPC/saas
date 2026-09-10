import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ejecutarCorrida } from "@/lib/riesgo/corrida";
import { guardarCorrida, guardarCorridaFallida } from "@/lib/riesgo/persistir";
import { auditarCorrida } from "@/lib/riesgo/auditoria";
import { hoyBogota } from "@/lib/riesgo/fechas";

// El cálculo en sí son décimas de segundo; el tiempo se va en bajar las cinco
// fuentes (los cierres desde 2025-10-01 son decenas de miles de filas, de mil
// en mil). 300s es el máximo del plan y sobra con holgura.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Cron diario del análisis predictivo de riesgo por conductor (configurado en
 * vercel.json, después del de GEMA para entrenar sobre datos ya
 * sincronizados). Vercel envía `Authorization: Bearer <CRON_SECRET>`.
 *
 * También se puede invocar a mano con ?corte=YYYY-MM-DD para recalcular un
 * corte concreto; cada invocación deja una corrida nueva, nunca sobrescribe.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const corteParam = request.nextUrl.searchParams.get("corte");
  const corte = /^\d{4}-\d{2}-\d{2}$/.test(corteParam ?? "") ? corteParam! : hoyBogota();

  try {
    const { resultado } = await ejecutarCorrida(createAdminClient(), { corte });
    const corridaId = await guardarCorrida(resultado, {
      origen: "cron",
      ejecutadaPorEmail: null,
    });
    await auditarCorrida({
      corridaId,
      corte,
      origen: "cron",
      observaciones: resultado.observaciones,
      conductores: resultado.puntuados.length,
      duracionMs: resultado.duracionMs,
      emailOverride: "cron",
    });

    return NextResponse.json({
      ok: true,
      corridaId,
      corte,
      observaciones: resultado.observaciones,
      conductores: resultado.puntuados.length,
      resumen: resultado.resumen,
      auc: {
        retiro: resultado.modelos.retiro.auc,
        novedad: resultado.modelos.novedad.auc,
      },
      duracionMs: resultado.duracionMs,
    });
  } catch (e) {
    // Un fallo silencioso dejaría la pantalla mostrando un corte viejo como si
    // fuera de hoy: la corrida fallida queda registrada y auditada.
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[cron riesgo-conductores]", e);
    await guardarCorridaFallida(corte, mensaje, { origen: "cron", ejecutadaPorEmail: null });
    await auditarCorrida({
      corridaId: null,
      corte,
      origen: "cron",
      resultado: "fallido",
      error: mensaje,
      emailOverride: "cron",
    });
    return NextResponse.json({ ok: false, corte, error: mensaje }, { status: 500 });
  }
}
