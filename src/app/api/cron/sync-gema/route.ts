import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSync } from "@/lib/gema/sync";

// El sync se ejecuta en Node (mysql2 no corre en edge) y puede tardar en el
// backfill inicial. puntos_virtuales mueve ~90.000 filas/día, así que una
// corrida con varios días pendientes no cabe en 300s; 800 es el máximo de
// Fluid Compute en el plan Pro.
export const runtime = "nodejs";
export const maxDuration = 800;
export const dynamic = "force-dynamic";

// Fecha desde la que se carga el histórico operacional (decisión: 2026+).
const BACKFILL_DESDE = "2026-01-01";

// Los datos operacionales de GEMA se modifican después de creados (recaudos
// extemporáneos, ajustes de liquidación), así que cada corrida re-sincroniza
// siempre esta ventana hacia atrás. Los upserts hacen que reprocesar sea
// idempotente: actualiza lo que cambió sin duplicar ni borrar.
const LOOKBACK_DIAS = Number(process.env.GEMA_SYNC_LOOKBACK_DIAS ?? 45);

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoHaceDias(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Cron diario (configurado en vercel.json). Vercel envía el header
 * `Authorization: Bearer <CRON_SECRET>`. También se puede invocar a mano con
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD para forzar un rango concreto.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = request.nextUrl.searchParams;
  const to = url.get("to") ?? hoyISO();

  // Rango operacional: siempre re-sincroniza los últimos LOOKBACK_DIAS (los
  // recaudos e históricos se modifican después de creados), y más atrás si
  // los cierres de GEMA van más atrasados que eso. Backfill si nunca corrió.
  let from = url.get("from");
  if (!from) {
    const db = createAdminClient();
    const { data } = await db
      .from("gema_sync_state")
      .select("last_synced_date")
      .eq("dataset", "cierres")
      .maybeSingle();
    const marcador = (data?.last_synced_date as string | null) ?? BACKFILL_DESDE;
    const lookback = isoHaceDias(LOOKBACK_DIAS);
    from = marcador < lookback ? marcador : lookback;
    if (from < BACKFILL_DESDE) from = BACKFILL_DESDE;
  }
  const fromDate: string = from;

  try {
    const results = await runSync(fromDate, to);
    const errores = results.filter((r) => r.error);
    return NextResponse.json(
      { ok: errores.length === 0, rango: { from: fromDate, to }, results },
      { status: errores.length ? 207 : 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
