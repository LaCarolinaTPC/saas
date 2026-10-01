import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/operativo/constants";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";
import { getRevisionTimbradas } from "@/lib/tesoreria/revision-timbradas-data";
import { guardarFotoDia } from "@/lib/tesoreria/revision-timbradas-consolidado-data";
import { DIAS_RECALCULO, fechasDelRango } from "@/lib/tesoreria/revision-timbradas-consolidado";

// Cada día son cuatro lecturas de GEMA en Supabase (unos segundos); diez días
// caben de sobra en el máximo del plan.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Cron diario (vercel.json, después de la sincronización de GEMA): recalcula
 * la revisión de timbradas de los últimos DIAS_RECALCULO días y reescribe su
 * foto, porque GEMA sigue registrando descuentos y recaudos tarde. Así el
 * consolidado ve los pendientes nuevos aunque nadie abra ese día.
 *
 * A mano: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (máximo 62 días) para cargar fotos.
 * Vercel envía `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const ayer = sumarDias(hoyBogota(), -1);
  const hasta = re.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : ayer;
  const desde = re.test(sp.get("desde") ?? "") ? sp.get("desde")! : sumarDias(ayer, -(DIAS_RECALCULO - 1));
  const fechas = fechasDelRango(desde, hasta > ayer ? ayer : hasta).slice(-62);

  const db = createAdminClient();
  const resultado: { fecha: string; porRevisar?: number; error?: string }[] = [];
  for (const fecha of fechas) {
    try {
      const rev = await getRevisionTimbradas(fecha);
      const error = await guardarFotoDia(rev, db);
      resultado.push(error ? { fecha, error } : { fecha, porRevisar: rev.filas.filter((f) => f.estado !== "OK" && f.estado !== "N/A - No Despachado").length });
    } catch (e) {
      resultado.push({ fecha, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const fallidos = resultado.filter((r) => r.error).length;
  return NextResponse.json({ ok: fallidos === 0, dias: resultado.length, fallidos, resultado }, { status: fallidos === resultado.length && resultado.length ? 500 : 200 });
}
