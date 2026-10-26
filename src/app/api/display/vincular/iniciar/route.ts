import { NextRequest, NextResponse } from "next/server";
import { iniciarVinculacion, ipDe, limiteIniciar } from "@/lib/pantalla/dispositivos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

/**
 * El televisor pide un código de vinculación de 6 dígitos. Sin autenticación:
 * el código no da acceso a nada hasta que alguien con el módulo `pantalla` lo
 * teclea en Gestivo. Limitado por IP para que un TV en bucle no llene la tabla.
 *
 * POST → 200 { codigo, tokenTv, expiraEnSeg } · 429 · 500
 */
export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  if (!limiteIniciar.permite(ip ?? "sin-ip")) {
    return NextResponse.json({ error: "Demasiadas solicitudes. Intente en un minuto." }, { status: 429, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await iniciarVinculacion(ip), { headers: SIN_CACHE });
  } catch (e) {
    console.error("[pantalla] iniciar vinculación:", e);
    return NextResponse.json({ error: "No se pudo generar un código." }, { status: 500, headers: SIN_CACHE });
  }
}
