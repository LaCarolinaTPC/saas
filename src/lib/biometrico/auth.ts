/**
 * Autenticación del agente del biométrico.
 *
 * El agente es una máquina en la red de la empresa, sin sesión de Supabase: se
 * identifica con un secreto compartido (`BIOMETRICO_SECRET`) en
 * `Authorization: Bearer …`.
 *
 * A diferencia de los crons (`src/app/api/cron/*`), que solo exigen el secreto
 * SI la variable está definida, aquí se exige SIEMPRE: sin secreto configurado
 * el endpoint responde 503 y no entra ni una fila. Es un endpoint de ESCRITURA
 * abierto a internet; dejarlo pasar por una variable sin poner sería un hueco.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/** Comparación de tiempo constante. Longitudes distintas = no coincide. */
function sonIguales(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual exige el mismo largo; comparar los largos no filtra el
  // secreto (solo su longitud, que no es el secreto).
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Devuelve la respuesta de rechazo, o null si el agente está autorizado.
 *
 *   503  no hay BIOMETRICO_SECRET configurado (el agente no está habilitado)
 *   401  falta el header o el secreto no coincide
 */
export function exigirSecretoBiometrico(request: Request): NextResponse | null {
  const secreto = process.env.BIOMETRICO_SECRET;
  if (!secreto) {
    console.warn("[biometrico] BIOMETRICO_SECRET sin configurar: se rechaza el envío.");
    return NextResponse.json(
      {
        ok: false,
        error:
          "El agente del biométrico no está habilitado en este servidor: falta configurar BIOMETRICO_SECRET.",
      },
      { status: 503 }
    );
  }

  const cabecera = request.headers.get("authorization") ?? "";
  const enviado = cabecera.toLowerCase().startsWith("bearer ")
    ? cabecera.slice(7).trim()
    : "";

  if (!enviado || !sonIguales(enviado, secreto)) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  return null;
}

/** IP del que llamó, para la bitácora de envíos. */
export function ipDeLaPeticion(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}
