import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { etiquetaPar, expandirAlcance } from "@/lib/mgx/catalogo";
import { abrirCorrida, cerrarCorrida, sincronizarPares, type FilaMgxTablas } from "@/lib/mgx/sync";
import { ordenarParaCron } from "@/lib/mgx/cron-reglas";
import { logTesoreriaAudit } from "@/lib/devengados/audit";

// Mismo motor que la pantalla (Tesorería › Parámetros) y la consola
// (npm run mgx:sincronizar): el progreso queda en mgx_tablas después de cada
// lote, así que si una noche no alcanza, la siguiente sigue desde ahí.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Tiempo para EMPEZAR lotes; lo demás de los 300 s es margen para terminar el
// lote en curso y cerrar la corrida. Una corrida diaria completa tarda hoy
// entre 100 y 190 s.
const PRESUPUESTO_MS = Number(process.env.MGX_CRON_BUDGET_MS ?? 240_000);

/**
 * Cron diario de MGX (vercel.json, 09:00 UTC = 4:00 am de Colombia, después de
 * la réplica de MGX de las 2:00 y del cron de GEMA de las 3:00).
 *
 * A diferencia de los crons anteriores, exige CRON_SECRET SIEMPRE: si falta en
 * Vercel, rechaza en vez de quedar abierto a cualquiera.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: estados, error: errEstados } = await db
    .from("mgx_tablas")
    .select("empresa, modulo, tabla, activa, estado, ultima_corrida_at");
  if (errEstados) {
    return NextResponse.json({ ok: false, error: `mgx_tablas: ${errEstados.message}` }, { status: 500 });
  }
  const filas = (estados ?? []) as Pick<FilaMgxTablas, "empresa" | "modulo" | "tabla" | "activa" | "estado" | "ultima_corrida_at">[];
  const inactivas = new Set(filas.filter((f) => !f.activa).map((f) => `${f.empresa}.${f.modulo}.${f.tabla}`));
  const pares = ordenarParaCron(
    expandirAlcance({}).filter((p) => !inactivas.has(`${p.empresa}.${p.modulo}.${p.tabla}`)),
    filas
  );

  let id: number;
  try {
    // Si hay una corrida viva (pantalla o consola), esta noche se salta: dos
    // corridas a la vez se pisarían las marcas.
    id = await abrirCorrida(db, { origen: "cron", usuarioEmail: null, alcance: { cron: true } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("Ya hay una sincronización")) {
      return NextResponse.json({ ok: false, omitida: true, motivo: msg });
    }
    // Cualquier otra cosa (p. ej. falta aplicar la migración del origen
    // «cron») es un error de verdad: que se vea como fallo en Vercel.
    console.error("[cron sync-mgx] abrir corrida:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const t0 = Date.now();
  try {
    const { hechos, pendientes } = await sincronizarPares(db, pares, { deadline: t0 + PRESUPUESTO_MS }, id);
    const errores = hechos.filter((h) => h.error);
    const estado = pendientes.length ? "parcial" : errores.length ? "error" : "ok";
    const detalleErrores = errores.map((h) => `${etiquetaPar(h.par)}: ${h.error}`).join("\n") || null;
    await cerrarCorrida(
      db,
      id,
      estado,
      pendientes.length ? `Faltaron ${pendientes.length} tablas: siguen la próxima noche.${detalleErrores ? `\n${detalleErrores}` : ""}` : detalleErrores
    );
    const filasCopiadas = hechos.reduce((s, h) => s + h.filas, 0);
    await logTesoreriaAudit({
      accion: "sincronizacion_mgx",
      modulo: "sincronizacion",
      resultado: errores.length ? "fallido" : "exitoso",
      userEmailOverride: "cron",
      detalle: {
        corrida: id,
        origen: "cron",
        estado,
        filas: filasCopiadas,
        pendientes: pendientes.length,
        errores: errores.map((h) => ({ tabla: etiquetaPar(h.par), error: h.error })),
      },
    });
    return NextResponse.json(
      {
        ok: estado === "ok",
        corrida: id,
        estado,
        segundos: Math.round((Date.now() - t0) / 1000),
        tablas: hechos.length,
        filas: filasCopiadas,
        pendientes: pendientes.length,
        errores: errores.length,
      },
      { status: estado === "error" ? 207 : 200 }
    );
  } catch (e) {
    // Error de conexión con MGX o de la bitácora: se cierra la corrida.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron sync-mgx]", e);
    await cerrarCorrida(db, id, "error", msg);
    await logTesoreriaAudit({
      accion: "sincronizacion_mgx",
      modulo: "sincronizacion",
      resultado: "fallido",
      userEmailOverride: "cron",
      detalle: { corrida: id, origen: "cron", error: msg },
    });
    return NextResponse.json({ ok: false, corrida: id, error: msg }, { status: 500 });
  }
}
