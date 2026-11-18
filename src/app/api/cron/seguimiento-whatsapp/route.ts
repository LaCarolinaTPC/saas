import { NextRequest, NextResponse } from "next/server";
import { ejecutarSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { ejecutarReactivacion } from "@/lib/seleccion/reactivacion-ejecutar";
import { sincronizarPlantillas } from "@/lib/seleccion/plantillas";
import {
  lanzarAntecedentesPendientes,
  resolverAntecedentesPendientes,
  resolverPoliciaPendientes,
  resolverRnmcPendientes,
  resolverRuntPendientes,
  resolverSimitPendientes,
} from "@/lib/verificacion/servidor";
import { cerrarNoPreseleccionados } from "@/lib/seleccion/servidor";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Seguimiento a quien no responde en WhatsApp («¿sigues interesado?» y marcar
 * para GH). Es el ÚNICO disparador: lo llama cada 15 minutos el cron de
 * Vercel (`*\/15 * * * *` en vercel.json, ver docs/crons.md). No va en
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
    // Selección de conductores (entrega 1): cada parte por separado, para que
    // un fallo en una no impida las demás ni el seguimiento.
    // Primero el estado de las plantillas, para que la reactivación sepa cuáles ya aprobó Meta.
    const plantillas = await intentar(() => sincronizarPlantillas());
    const [reactivacion, simit, runt, policia, rnmc, antecedentes] = await Promise.all([
      intentar(() => ejecutarReactivacion()),
      intentar(() => resolverSimitPendientes()),
      intentar(() => resolverRuntPendientes()),
      intentar(() => resolverPoliciaPendientes()),
      intentar(() => resolverRnmcPendientes()),
      intentar(() => resolverAntecedentesPendientes()),
    ]);
    // Después de terminar las pendientes, lanza los antecedentes que faltan.
    const lanzados = await intentar(() => lanzarAntecedentesPendientes());
    // Los que no pasaron la preselección (rojo sin cambios un rato) se cierran con su causa.
    const cierres = await intentar(() => cerrarNoPreseleccionados());
    return NextResponse.json({ ok: true, ...r, seleccion: { plantillas, reactivacion, simit, runt, policia, rnmc, antecedentes, lanzados, cierres } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron seguimiento-whatsapp]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function intentar<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    console.error("[cron seguimiento-whatsapp] selección:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
