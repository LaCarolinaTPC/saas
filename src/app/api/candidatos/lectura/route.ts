import { NextRequest, NextResponse } from "next/server";
import { LECTURAS_FICHA } from "./lecturas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lecturas de la ficha del proceso (27-nov-2026). Va por ruta y no por server
 * action porque las actions de una página van en fila: al abrir la ficha eran
 * ~9 en fila. POST { fn, args } con una de LECTURAS_FICHA; cada función revisa
 * los permisos de quien llama.
 */
export async function POST(req: NextRequest) {
  let cuerpo: { fn?: unknown; args?: unknown };
  try {
    cuerpo = (await req.json()) as { fn?: unknown; args?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Pedido no válido." }, { status: 400 });
  }
  const nombre = typeof cuerpo.fn === "string" ? cuerpo.fn : "";
  if (!Object.prototype.hasOwnProperty.call(LECTURAS_FICHA, nombre)) return NextResponse.json({ ok: false, error: "Lectura no permitida." }, { status: 400 });
  const args = Array.isArray(cuerpo.args) ? cuerpo.args.slice(0, 3) : [];
  try {
    const fn = LECTURAS_FICHA[nombre as keyof typeof LECTURAS_FICHA] as (...a: unknown[]) => Promise<unknown>;
    const r = await fn(...args);
    return NextResponse.json({ ok: true, r: r ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "No se pudo leer." }, { status: 500 });
  }
}
