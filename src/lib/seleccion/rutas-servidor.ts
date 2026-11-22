/**
 * Lista de rutas del reconocimiento (tabla seleccion_rutas_reconocimiento,
 * migración 20261121230433). Solo servidor. Sin la migración se usan las rutas
 * de GEMA, sin obligatorias, como antes.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { rutasDeGema } from "@/lib/operativo/rutas-kml";
import { obligatoriasDe, validarNombreRuta, type RutaReconocimiento } from "./rutas";

const TABLA = "seleccion_rutas_reconocimiento";

const ordenar = (rutas: RutaReconocimiento[]) =>
  [...rutas].sort((x, y) => x.orden - y.orden || x.nombre.localeCompare(y.nombre, "es", { numeric: true }));

async function nombresDeGema(): Promise<string[]> {
  try {
    return [...new Set((await rutasDeGema()).map((r) => r.ruta.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

/** La lista configurada; `disponible` es false sin la migración (entonces son las de GEMA). */
export async function leerRutasReconocimiento(): Promise<{ rutas: RutaReconocimiento[]; disponible: boolean }> {
  const { data, error } = await createAdminClient().from(TABLA).select("id, nombre, obligatoria, orden");
  if (error) {
    const gema = await nombresDeGema();
    return { rutas: ordenar(gema.map((nombre) => ({ id: nombre, nombre, obligatoria: false, orden: 0 }))), disponible: false };
  }
  return { rutas: ordenar((data ?? []) as RutaReconocimiento[]), disponible: true };
}

/** Lo que necesita el cálculo del avance: los nombres de las obligatorias. */
export async function rutasObligatorias(): Promise<string[]> {
  return obligatoriasDe((await leerRutasReconocimiento()).rutas);
}

type Resultado = { ok: true } | { ok: false; error: string };
const SIN_TABLA = "Falta aplicar la migración 20261121230433 (rutas del reconocimiento) en el SQL Editor.";

/**
 * Agrega una ruta o corrige una existente. Al cambiarle el nombre, se corrige
 * también en las salidas ya registradas, para que lo aprendido siga contando.
 */
export async function guardarRutaReconocimiento(d: { id?: string | null; nombre: string; obligatoria: boolean }, email: string | null): Promise<Resultado> {
  const { rutas, disponible } = await leerRutasReconocimiento();
  if (!disponible) return { ok: false, error: SIN_TABLA };
  const v = validarNombreRuta(d.nombre, rutas, d.id ?? undefined);
  if (!v.ok) return v;
  const db = createAdminClient();
  const ahora = new Date().toISOString();
  if (!d.id) {
    const orden = Math.max(0, ...rutas.map((r) => r.orden)) + 1;
    const { error } = await db.from(TABLA).insert({ nombre: v.nombre, obligatoria: !!d.obligatoria, orden, actualizado_por: email });
    return error ? { ok: false, error: `No se pudo agregar la ruta (${error.message}).` } : { ok: true };
  }
  const antes = rutas.find((r) => r.id === d.id);
  if (!antes) return { ok: false, error: "La ruta ya no existe: recarga la página." };
  const { error } = await db.from(TABLA).update({ nombre: v.nombre, obligatoria: !!d.obligatoria, actualizado_por: email, updated_at: ahora }).eq("id", d.id);
  if (error) return { ok: false, error: `No se pudo guardar la ruta (${error.message}).` };
  if (antes.nombre !== v.nombre) {
    await db.from("seleccion_reconocimientos_ruta").update({ ruta: v.nombre }).eq("ruta", antes.nombre);
  }
  return { ok: true };
}

/** Quita la ruta de la lista. Las salidas que ya la tenían como aprendida siguen contando. */
export async function eliminarRutaReconocimiento(id: string): Promise<Resultado> {
  const { disponible } = await leerRutasReconocimiento();
  if (!disponible) return { ok: false, error: SIN_TABLA };
  const { error } = await createAdminClient().from(TABLA).delete().eq("id", id);
  return error ? { ok: false, error: `No se pudo quitar la ruta (${error.message}).` } : { ok: true };
}

/** Rutas que GEMA usó en los últimos 45 días y no están en la lista. */
export async function rutasNuevasDeGema(): Promise<string[]> {
  const [{ rutas }, gema] = await Promise.all([leerRutasReconocimiento(), nombresDeGema()]);
  const ya = new Set(rutas.map((r) => r.nombre.trim().toLowerCase()));
  return gema.filter((g) => !ya.has(g.toLowerCase())).sort((x, y) => x.localeCompare(y, "es", { numeric: true }));
}

/** Agrega a la lista las rutas nuevas de GEMA. Devuelve cuántas agregó. */
export async function agregarRutasDeGema(email: string | null): Promise<{ ok: true; agregadas: number } | { ok: false; error: string }> {
  const { rutas, disponible } = await leerRutasReconocimiento();
  if (!disponible) return { ok: false, error: SIN_TABLA };
  const nuevas = await rutasNuevasDeGema();
  if (!nuevas.length) return { ok: true, agregadas: 0 };
  const base = Math.max(0, ...rutas.map((r) => r.orden));
  const { error } = await createAdminClient()
    .from(TABLA)
    .insert(nuevas.map((nombre, i) => ({ nombre, orden: base + i + 1, actualizado_por: email })));
  return error ? { ok: false, error: `No se pudieron agregar (${error.message}).` } : { ok: true, agregadas: nuevas.length };
}
