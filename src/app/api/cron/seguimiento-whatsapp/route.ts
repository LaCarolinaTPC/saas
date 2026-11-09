import { NextRequest, NextResponse } from "next/server";
import { ejecutarSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Seguimiento a quien no responde en WhatsApp («¿sigues interesado?» y marcar
 * para GH). Lo corre cada 15 minutos la tarea programada
 * «comunicaciones.seguimiento» desde el latido; esta ruta es el respaldo para
 * una tarea programada de Coolify (`*\/15 * * * *`, ver docs/coolify-crons.md).
 * Se llama con `Authorization: Bearer <CRON_SECRET>`. Correr las dos no
 * duplica envíos: cada conversación se reserva antes de enviar.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // Falla cerrado: sin CRON_SECRET configurado nadie puede dispararlo.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const r = await ejecutarSeguimiento();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron seguimiento-whatsapp]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
