import { NextRequest, NextResponse } from "next/server";
import { logTesoreriaAudit, type AccionAudit } from "@/lib/devengados/audit";

/**
 * Bitácora de eventos de sesión (inicio, intento fallido, cierre, cambio de
 * contraseña). Se registra en tesoreria_audit_log con módulo "seguridad";
 * la IP y el equipo se toman de la petición en el servidor.
 */
const EVENTOS: Record<string, AccionAudit> = {
  login_exitoso: "login_exitoso",
  login_fallido: "login_fallido",
  cierre_sesion: "cierre_sesion",
  cambio_password: "cambio_password",
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      tipo?: string;
      email?: string;
    };
    const accion = body.tipo ? EVENTOS[body.tipo] : undefined;
    if (!accion) {
      return NextResponse.json({ error: "Evento no válido" }, { status: 400 });
    }
    await logTesoreriaAudit({
      accion,
      modulo: "seguridad",
      resultado: accion === "login_fallido" ? "fallido" : "exitoso",
      userEmailOverride: body.email?.trim().toLowerCase().slice(0, 200) ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
