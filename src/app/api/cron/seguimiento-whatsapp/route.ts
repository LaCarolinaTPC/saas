import { NextRequest, NextResponse } from "next/server";
import { ejecutarSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Seguimiento a quien no responde en WhatsApp («¿sigues interesado?» y marcar
 * para GH). Es el ÚNICO disparador: lo llama cada 15 minutos la tarea
 * programada de Coolify (`*\/15 * * * *`, ver docs/coolify-crons.md). No va en
 * el latido (TV o páginas abiertas) para que no envíe WhatsApp desde cualquier
 * equipo con Gestivo abierto, incluidos los de desarrollo.
 * Se llama con `Authorization: Bearer <CRON_SECRET>`. Cada conversación se
 * reserva antes de enviar, así que dos llamadas a la vez no duplican envíos.
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
