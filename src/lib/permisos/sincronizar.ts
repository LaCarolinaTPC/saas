/**
 * Qué escribir en la base para que quede igual al código, sin escribir nada:
 *
 *  - `planCatalogo`: la tabla `permisos` contra el catálogo. Lo nuevo se crea,
 *    lo cambiado se actualiza, lo retirado queda obsoleto (no se borra) y lo que
 *    vuelve se reactiva. Una acción NUEVA de un módulo o función que ya existía
 *    la reciben los roles que ya tenían ese nivel ahí (quien editaba Ausentismo
 *    recibe «Ausentismo · exportar» si se agrega con nivel `editar`), para que
 *    afinar un módulo no le quite nada a nadie.
 *
 * PURO. `npm run test:permisos`.
 */
import type { Nivel, PermisoDef } from "./catalogo";

export interface PermisoBd {
  clave: string;
  modulo: string;
  funcion: string | null;
  accion: string;
  nivel: Nivel;
  etiqueta: string;
  sensible: boolean;
  solo_super: boolean;
  obsoleto: boolean;
}

export interface RolPermiso {
  rol: string;
  permiso: string;
}

/** Huella corta y estable de cualquier dato serializable (para saber si cambió). */
export function huella(dato: unknown): string {
  const texto = JSON.stringify(dato);
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const aBd = (p: PermisoDef): PermisoBd => ({
  clave: p.clave,
  modulo: p.modulo,
  funcion: p.funcion,
  accion: p.accion,
  nivel: p.nivel,
  etiqueta: p.etiqueta,
  sensible: p.sensible,
  solo_super: p.soloSuper,
  obsoleto: false,
});

const alcance = (p: { modulo: string; funcion: string | null }) => `${p.modulo}|${p.funcion ?? ""}`;

export function planCatalogo(
  catalogo: PermisoDef[],
  existentes: PermisoBd[],
  rolPermisos: RolPermiso[]
): { guardar: PermisoBd[]; obsoletar: string[]; herencia: RolPermiso[] } {
  const enBd = new Map(existentes.map((p) => [p.clave, p]));
  const enCodigo = new Set(catalogo.map((p) => p.clave));

  const guardar: PermisoBd[] = [];
  const nuevos: PermisoDef[] = [];
  for (const p of catalogo) {
    const fila = aBd(p);
    const actual = enBd.get(p.clave);
    if (!actual) nuevos.push(p);
    const cambio = !actual || (Object.keys(fila) as (keyof PermisoBd)[]).some((k) => actual[k] !== fila[k]);
    if (cambio) guardar.push(fila);
  }
  const obsoletar = existentes.filter((p) => !p.obsoleto && !enCodigo.has(p.clave)).map((p) => p.clave);

  // Herencia por nivel: solo hacia acciones nuevas de un alcance que ya existía.
  const vigentes = new Map(existentes.filter((p) => !p.obsoleto && enCodigo.has(p.clave)).map((p) => [p.clave, p]));
  const herencia: RolPermiso[] = [];
  const yaTiene = new Set(rolPermisos.map((x) => `${x.rol}|${x.permiso}`));
  for (const n of nuevos) {
    if (n.nivel === "especial") continue;
    const roles = new Set(
      rolPermisos
        .filter((x) => {
          const p = vigentes.get(x.permiso);
          return p && alcance(p) === alcance(n) && p.nivel === n.nivel;
        })
        .map((x) => x.rol)
    );
    for (const rol of roles) {
      if (!yaTiene.has(`${rol}|${n.clave}`)) herencia.push({ rol, permiso: n.clave });
    }
  }
  return { guardar, obsoletar, herencia };
}
