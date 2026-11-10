/**
 * Mantiene la tabla `permisos` igual al catálogo del código (catalogo.ts):
 * lo nuevo se crea, lo cambiado se actualiza, lo retirado queda obsoleto y las
 * acciones nuevas las heredan los roles que ya tenían ese nivel (la decisión es
 * pura y vive en `sincronizar.ts`). Aquí solo se lee, se escribe y se recuerda
 * la huella de lo último sincronizado.
 */
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingValue, setSettingValue } from "@/lib/settings";
import { PERMISOS } from "./catalogo";
import { huella, planCatalogo, type PermisoBd, type RolPermiso } from "./sincronizar";

type Db = ReturnType<typeof createAdminClient>;

const CLAVE_HUELLA_CATALOGO = "permisos.huella_catalogo";

const falla = (que: string, e: { message: string } | null) => {
  if (e) throw new Error(`${que}: ${e.message}`);
};

/** Lee una tabla entera, de a 1000 filas. */
async function todo<T>(db: Db, tabla: string, columnas = "*"): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from(tabla).select(columnas).range(desde, desde + 999);
    falla(`leer ${tabla}`, error);
    salida.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return salida;
  }
}

async function enLotes<T>(filas: T[], hacer: (lote: T[]) => PromiseLike<{ error: { message: string } | null }>, que: string) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await hacer(filas.slice(i, i + 500));
    falla(que, error);
  }
}

/** Deja la tabla `permisos` igual al código. Solo trabaja si el catálogo cambió. */
export async function sincronizarCatalogo(opciones: { forzar?: boolean } = {}, db: Db = createAdminClient()) {
  const h = huella(PERMISOS);
  if (!opciones.forzar && (await getSettingValue(CLAVE_HUELLA_CATALOGO)) === h) return null;

  const [existentes, rolPermisos] = await Promise.all([
    todo<PermisoBd>(db, "permisos", "clave, modulo, funcion, accion, nivel, etiqueta, sensible, solo_super, obsoleto"),
    todo<RolPermiso>(db, "rol_permisos", "rol, permiso"),
  ]);
  const plan = planCatalogo(PERMISOS, existentes, rolPermisos);
  // Primero la herencia: si algo se corta a la mitad, la siguiente pasada vuelve
  // a ver el permiso como nuevo y la completa.
  await enLotes(plan.herencia, (l) => db.from("rol_permisos").upsert(l, { onConflict: "rol,permiso", ignoreDuplicates: true }), "heredar permisos");
  const ahora = new Date().toISOString();
  await enLotes(plan.guardar.map((p) => ({ ...p, updated_at: ahora })), (l) => db.from("permisos").upsert(l, { onConflict: "clave" }), "guardar permisos");
  if (plan.obsoletar.length) {
    const { error } = await db.from("permisos").update({ obsoleto: true, updated_at: ahora }).in("clave", plan.obsoletar);
    falla("marcar obsoletos", error);
  }
  await setSettingValue(CLAVE_HUELLA_CATALOGO, h);
  return { guardados: plan.guardar.length, obsoletos: plan.obsoletar.length, heredados: plan.herencia.length };
}

let ultimaRevision = 0;
let enCurso: Promise<void> | null = null;

/**
 * Catálogo al día tras un despliegue que agregue o cambie permisos. Se agenda
 * después de responder desde getCurrentPermissions; como mucho una vez por
 * minuto por proceso, y la huella evita trabajo si nada cambió. Nunca lanza.
 */
export function mantenerCatalogoAlDia(): void {
  if (enCurso || Date.now() - ultimaRevision < 60_000) return;
  ultimaRevision = Date.now();
  const tarea = async () => {
    enCurso = (async () => {
      try {
        await sincronizarCatalogo();
      } catch (e) {
        console.error("[permisos] catálogo:", e instanceof Error ? e.message : e);
      } finally {
        enCurso = null;
      }
    })();
    await enCurso;
  };
  try {
    after(tarea);
  } catch {
    // Fuera de una petición (scripts, pruebas): no se agenda.
  }
}
