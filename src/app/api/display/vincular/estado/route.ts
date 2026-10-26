import { NextRequest, NextResponse } from "next/server";
import { estadoVinculacion, limiteEstado } from "@/lib/pantalla/dispositivos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

/**
 * El televisor pregunta si ya lo vincularon. El token viaja en el cuerpo (no
 * en la URL, que queda en los registros) y solo lo conoce ese navegador.
 *
 * POST { tokenTv } →
 *   200 { estado: "pendiente", expiraEnSeg }
 *   200 { estado: "completada", clave, dispositivo: { nombre } }   (una sola vez)
 *   404 { estado: "desconocida" }   vencido, inexistente o ya entregado
 *   400 · 429
 */
export async function POST(req: NextRequest) {
  let tokenTv: unknown;
  try {
    tokenTv = ((await req.json()) as { tokenTv?: unknown })?.tokenTv;
  } catch {
    tokenTv = null;
  }
  if (typeof tokenTv !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(tokenTv)) {
    return NextResponse.json({ error: "Falta tokenTv." }, { status: 400, headers: SIN_CACHE });
  }
  if (!limiteEstado.permite(tokenTv)) {
    return NextResponse.json({ error: "Demasiadas solicitudes." }, { status: 429, headers: SIN_CACHE });
  }
  try {
    const r = await estadoVinculacion(tokenTv);
    return NextResponse.json(r, { status: r.estado === "desconocida" ? 404 : 200, headers: SIN_CACHE });
  } catch (e) {
    console.error("[pantalla] estado de vinculación:", e);
    return NextResponse.json({ error: "Error consultando la vinculación." }, { status: 500, headers: SIN_CACHE });
  }
}
