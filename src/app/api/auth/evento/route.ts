import { NextRequest, NextResponse } from "next/server";
import { logTesoreriaAudit, type AccionAudit } from "@/lib/devengados/audit";
import { createClient } from "@/lib/supabase/server";

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
  password_recuperacion_solicitada: "password_recuperacion_solicitada",
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
    // Con sesión, el correo es el de la sesión: el que manda el navegador se
    // ignora (antes cualquiera podía firmar un evento a nombre de otro). Sin
    // sesión (intento fallido, recuperación) solo existe el declarado, y queda
    // marcado como tal en el detalle.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const declarado = body.email?.trim().toLowerCase().slice(0, 200) ?? null;
    await logTesoreriaAudit({
      accion,
      modulo: "seguridad",
      resultado: accion === "login_fallido" ? "fallido" : "exitoso",
      userEmailOverride: user?.email ?? declarado,
      detalle: user ? {} : { email_declarado_sin_sesion: true },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
