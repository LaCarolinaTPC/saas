/**
 * Refresco del despacho del día, para que algo externo lo mantenga al día cada
 * pocos minutos sin depender del cron de Vercel.
 *
 * ## Por qué existe
 *
 * El cron de GEMA corre **una vez al día** (03:00 Colombia) y el plan Hobby de
 * Vercel no admite más ni más seguido. El día operativo va de las 03:55 a las
 * 16:40, así que la pantalla de Marcaciones necesita el despacho fresco durante
 * toda la jornada. Ya se refresca al abrirla si tiene más de 15 minutos
 * (`src/lib/gema/despacho-al-dia.ts`), pero eso le cobra ~2,6 s a quien la
 * abre. Si algo lo llama cada 15 minutos, la pantalla siempre lo encuentra
 * fresco y carga de una.
 *
 * ## Quién lo llama
 *
 * Cualquiera que tenga el secreto y pueda hacer un GET cada 15 minutos. Hoy lo
 * hace el **agente del biométrico** del PC de ZKAccess, que ya llama a Gestivo
 * cada 10 minutos: no hubo que montar nada nuevo ni configurarle otro secreto.
 * Sirve igual el Programador de tareas de Windows con `curl`, un servicio de
 * cron externo, o `pg_cron` del Supabase autoalojado.
 *
 * Es **idempotente y barato de más**: si el dato ya está fresco no toca GEMA y
 * responde en ~100 ms. Así que llamarlo cada minuto tampoco haría daño.
 *
 * Se autentica con `BIOMETRICO_SECRET`, el mismo del agente y por la misma
 * razón: es una máquina de la red de la empresa, sin sesión. Exige el secreto
 * SIEMPRE (503 si no está configurado), como los demás endpoints de máquina.
 */
import { NextRequest, NextResponse } from "next/server";
import { exigirSecretoBiometrico } from "@/lib/biometrico/auth";
import { hoyBogota } from "@/lib/operativo/constants";
import { refrescarDespachoDelDia } from "@/lib/gema/despacho-al-dia";

// mysql2 no corre en edge. 60 s sobra: el refresco medido tarda ~2,6 s.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rechazo = exigirSecretoBiometrico(request);
  if (rechazo) return rechazo;

  const hoy = hoyBogota();

  // `?forzar=1` salta la ventana de 15 minutos, para probar a mano.
  const forzar = request.nextUrl.searchParams.get("forzar") === "1";

  const r = await refrescarDespachoDelDia(hoy, hoy, { forzar });

  // `refrescarDespachoDelDia` nunca lanza: un fallo de GEMA viene en `error` y
  // se responde 207, para que quien lo llama lo vea en su bitácora sin tratarlo
  // como un error de autenticación o de ruta.
  return NextResponse.json(
    { ok: !r.error, fecha: hoy, ...r },
    { status: r.error ? 207 : 200 }
  );
}
