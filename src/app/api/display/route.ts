import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/operativo/constants";
import { firmarMedios, identificarDispositivo } from "@/lib/pantalla/dispositivos";
import { datosParaWidgets } from "@/lib/pantalla/datos";
import { refsDeMedios, tiposDeWidget, validarPresentacion } from "@/lib/pantalla/modelo";
import type { RespuestaDisplay } from "@/lib/pantalla/tipos-display";
import { correrTareasVencidas } from "@/lib/tareas/ejecutor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

/**
 * Lo que muestra un televisor: su presentación PUBLICADA, las URLs firmadas de
 * los medios que usa y los datos de sus widgets. Se autentica con la clave del
 * dispositivo en el header `x-display-key`; el TV consulta cada minuto.
 *
 * 200 RespuestaDisplay · 401 { error } (sin clave, inválida o revocada) · 500
 */
export async function GET(req: NextRequest) {
  const dispositivo = await identificarDispositivo(req);
  if (!dispositivo) {
    return NextResponse.json({ error: "Clave de pantalla inválida o revocada." }, { status: 401, headers: SIN_CACHE });
  }

  // Un televisor encendido también late (estilo wp-cron, ver src/lib/tareas):
  // está prendido todo el día aunque nadie tenga Gestivo abierto. Va después
  // de responder, para no demorar la pantalla.
  after(() => correrTareasVencidas());

  const hoy = hoyBogota();
  const base: RespuestaDisplay = {
    ok: true,
    generadoAt: new Date().toISOString(),
    hoy,
    dispositivo: { nombre: dispositivo.nombre },
    version: 0,
    presentacion: null,
    medios: {},
    datos: { hoy },
  };
  if (!dispositivo.presentacionId) return NextResponse.json(base, { headers: SIN_CACHE });

  const { data, error } = await createAdminClient()
    .from("pantalla_presentaciones")
    .select("publicada, version")
    .eq("id", dispositivo.presentacionId)
    .maybeSingle();
  if (error) {
    console.error("[pantalla] leer presentación:", error);
    return NextResponse.json({ error: "No se pudo leer la presentación." }, { status: 500, headers: SIN_CACHE });
  }
  const presentacion = data?.publicada ? validarPresentacion(data.publicada) : null;
  if (!presentacion || presentacion.diapositivas.length === 0) {
    return NextResponse.json({ ...base, version: (data?.version as number) ?? 0 }, { headers: SIN_CACHE });
  }

  const [datos, medios] = await Promise.all([
    datosParaWidgets(tiposDeWidget(presentacion), hoy),
    firmarMedios(refsDeMedios(presentacion)),
  ]);
  return NextResponse.json(
    { ...base, version: (data?.version as number) ?? 0, presentacion, medios, datos } satisfies RespuestaDisplay,
    { headers: SIN_CACHE }
  );
}
