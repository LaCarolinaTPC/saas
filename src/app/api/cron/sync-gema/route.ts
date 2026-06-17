import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSync } from "@/lib/gema/sync";

// El sync se ejecuta en Node (mysql2 no corre en edge) y puede tardar en el
// backfill inicial.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Fecha desde la que se carga el histórico operacional (decisión: 2026+).
const BACKFILL_DESDE = "2026-01-01";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
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

  // Rango operacional: desde el último día sincronizado (con solape de 1 día
  // para reprocesar cierres tardíos) o backfill completo si nunca corrió.
  let from = url.get("from");
  if (!from) {
    const db = createAdminClient();
    const { data } = await db
      .from("gema_sync_state")
      .select("last_synced_date")
      .eq("dataset", "cierres")
      .maybeSingle();
    from = (data?.last_synced_date as string | null) ?? BACKFILL_DESDE;
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
