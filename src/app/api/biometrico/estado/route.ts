/**
 * GET /api/biometrico/estado
 *
 * Lo que el agente del biométrico pregunta antes de leer la base del equipo:
 * hasta qué `id` de `acc_monitor_log` llegó Gestivo. La marca de avance vive
 * aquí y no en el PC, así que una corrida que muere a mitad no deja nada
 * adelantado y la carga histórica es reanudable sola.
 *
 * El proxy (src/proxy.ts) deja pasar todo /api sin sesión: esta ruta se
 * autentica sola con el secreto del agente.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirSecretoBiometrico } from "@/lib/biometrico/auth";
import { leerEstado } from "@/lib/biometrico/ingesta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rechazo = exigirSecretoBiometrico(request);
  if (rechazo) return rechazo;

  try {
    const estado = await leerEstado(createAdminClient());
    return NextResponse.json({
      ok: true,
      // El agente lee `id > ultimo_id`. En null (base vacía) manda desde el principio.
      ultimo_id: estado.ultimoId,
      ultimo_momento: estado.ultimoMomento,
      personas_actualizadas_at: estado.personasActualizadasAt,
      ultimo_envio_at: estado.ultimoEnvioAt,
      // Para que el agente pueda avisar si el reloj del PC se corrió.
      servidor_at: new Date().toISOString(),
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[biometrico] estado:", mensaje);
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
