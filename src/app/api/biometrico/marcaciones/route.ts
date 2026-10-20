/**
 * POST /api/biometrico/marcaciones
 *
 * Recibe un lote de marcaciones del agente del biométrico (ops/agente-biometrico).
 * Es el único endpoint de ESCRITURA autenticado por secreto compartido, así que
 * exige `BIOMETRICO_SECRET` siempre (ver src/lib/biometrico/auth.ts).
 *
 * Cuerpo:
 *   { agente, personas?: [{ pin, userid, cardNo, nombre, apellido, departamentoId }],
 *     marcaciones: [{ id?, pin, momento, deviceId, deviceName, deviceSn,
 *                     verificado, punto, recibidoAt? }] }
 *
 * `id` es `acc_monitor_log.id` y solo lo trae la vía Access. **Sin `id` la
 * marcación viene del lector por el SDK**, y entonces `deviceSn` es
 * obligatorio: la identidad pasa a ser `(deviceSn, pin, momento)`. Un lote no
 * puede mezclar las dos vías. `recibidoAt` (hora del PC del agente) es
 * opcional y sirve para medir la latencia y el reloj del lector.
 *
 * `marcaciones: []` es válido y útil: sirve de latido (deja fila en
 * `biometrico_envios`) y para subir el espejo de personas sin nada nuevo.
 *
 * El lote se acepta o se rechaza ENTERO: ver el comentario de
 * src/lib/biometrico/lote.ts.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirSecretoBiometrico, ipDeLaPeticion } from "@/lib/biometrico/auth";
import { ingresarLote } from "@/lib/biometrico/ingesta";
import { validarLote } from "@/lib/biometrico/lote";

export const runtime = "nodejs";
// La carga histórica son ~108 lotes de 2.000; cada uno hace 4 upserts de 500.
// 300 s es el máximo del plan Hobby de Vercel y sobra de largo por lote.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rechazo = exigirSecretoBiometrico(request);
  if (rechazo) return rechazo;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "El cuerpo no es JSON válido." },
      { status: 400 }
    );
  }

  const validacion = validarLote(body);
  if (!validacion.ok) {
    // No se guarda nada: el agente no avanza su marca y puede reintentar el
    // mismo rango cuando se corrija el origen.
    return NextResponse.json(
      { ok: false, error: validacion.error },
      { status: validacion.estado }
    );
  }

  try {
    const resumen = await ingresarLote(createAdminClient(), validacion.lote, {
      ip: ipDeLaPeticion(request),
    });
    return NextResponse.json({
      ok: true,
      recibidas: resumen.recibidas,
      nuevas: resumen.nuevas,
      // Ya estaban (las trajo el equipo) y este envío les puso su id_zk.
      completadas: resumen.completadas,
      repetidas: resumen.repetidas,
      // El agente sigue desde aquí. Si el lote venía vacío son null y el
      // agente conserva los que ya tenía.
      ultimo_id: resumen.ultimoId,
      ultimo_momento: resumen.ultimoMomento,
      personas: resumen.personas,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("[biometrico] marcaciones:", mensaje);
    // El detalle también quedó en biometrico_envios.error, que es lo que lee
    // la pantalla de Marcaciones para avisar.
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 });
  }
}
