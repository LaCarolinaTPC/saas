import { NextResponse, type NextRequest } from "next/server";
import { enviarReporteDiario } from "@/lib/seleccion/reporte-diario-servidor";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Reporte diario de selección por correo a Gestión Humana (24-nov-2026): lo de
 * ayer y los últimos 30 días, con las mismas cifras de Candidatos ›
 * Indicadores. Vercel lo llama a las 12:00 UTC (7:00 en Bogotá) con
 * `Authorization: Bearer <CRON_SECRET>`; sin el secreto, rechaza.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const r = await enviarReporteDiario().catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  if (!r.ok) console.error("[seleccion] reporte diario:", r.error);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
