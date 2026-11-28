"use server";

/**
 * Pantalla «Reconocimiento de ruta» (24-nov-2026): la usa el encargado del
 * reconocimiento (rol «Coordinador de rutas»). Ver exige `reconocimiento.ver`;
 * registrar, citar y terminar, `reconocimiento.editar`. Desde el 27-nov-2026
 * también está en Candidatos › Reconocimiento: con ver o editar Candidatos basta.
 */
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import {
  citarReconocimiento,
  citarVariosReconocimiento,
  finalizarReconocimiento,
  llegadaReconocimiento,
  noContinuaReconocimiento,
  pantallaReconocimiento,
  reabrirReconocimiento,
  registrarRutas,
  type PantallaReconocimiento,
} from "@/lib/seleccion/reconocimiento-servidor";

type Resultado = { ok: boolean; error?: string; texto?: string; envio?: string };
const mal = (e: unknown): Resultado => ({ ok: false, error: e instanceof Error ? e.message : "No se pudo completar." });
const refrescar = () => {
  revalidatePath("/reconocimiento");
  revalidatePath("/candidatos");
  revalidatePath("/candidatos/reconocimiento");
};
const exigirEditor = async () => actorUsuario(await exigirPermiso("reconocimiento.editar", "candidatos.editar"));

export async function datosReconocimiento(incluirPrueba = false): Promise<PantallaReconocimiento> {
  await exigirPermiso("reconocimiento.ver", "candidatos.ver");
  return pantallaReconocimiento({ incluirPrueba });
}

export async function rutasReconocimientoAccion(procesoId: string, salidas: { ruta: string; resultado: "aprendida" | "repetir" }[], observacion: string): Promise<Resultado> {
  try {
    const r = await registrarRutas(String(procesoId), { salidas, observacion }, await exigirEditor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function citarReconocimientoAccion(procesoId: string, fecha: string, hora: string): Promise<Resultado> {
  try {
    const r = await citarReconocimiento(String(procesoId), { fecha, hora }, await exigirEditor());
    refrescar();
    return r.ok ? { ok: true, texto: r.texto, envio: r.envio } : { ok: false, error: r.error };
  } catch (e) {
    return mal(e);
  }
}

/** «Citar a todos»: el mismo día y hora para varios (27-nov-2026). */
export async function citarTodosReconocimientoAccion(procesoIds: string[], fecha: string, hora: string): Promise<Resultado & { citados?: number; fallidos?: { procesoId: string; error: string }[] }> {
  try {
    if (!Array.isArray(procesoIds) || !procesoIds.length) return { ok: false, error: "No hay a quién citar." };
    const r = await citarVariosReconocimiento(procesoIds, { fecha: String(fecha), hora: String(hora) }, await exigirEditor());
    refrescar();
    return { ok: r.citados > 0, citados: r.citados, fallidos: r.fallidos, error: r.citados ? undefined : r.fallidos[0]?.error ?? "No se pudo citar a nadie." };
  } catch (e) {
    return mal(e);
  }
}

export async function llegadaReconocimientoAccion(citaId: string, llego: boolean): Promise<Resultado> {
  try {
    const r = await llegadaReconocimiento(String(citaId), llego, await exigirEditor());
    refrescar();
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    return mal(e);
  }
}

export async function finalizarReconocimientoAccion(procesoId: string, nota: string): Promise<Resultado> {
  try {
    const r = await finalizarReconocimiento(String(procesoId), nota, await exigirEditor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function reabrirReconocimientoAccion(procesoId: string): Promise<Resultado> {
  try {
    const r = await reabrirReconocimiento(String(procesoId), await exigirEditor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function noContinuaReconocimientoAccion(procesoId: string, motivo: string, ruta: string): Promise<Resultado> {
  try {
    const r = await noContinuaReconocimiento(String(procesoId), motivo, ruta || null, await exigirEditor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}
