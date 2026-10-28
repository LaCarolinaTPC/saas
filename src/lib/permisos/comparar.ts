/**
 * Compara, usuario por usuario, el acceso viejo con el nuevo: módulos,
 * funciones, poder editar, evaluar accidentes, rutas y menú. Lo usan las
 * pruebas y `npm run permisos:comparar`.
 *
 * «Perdido» es algo que tenía y ya no tiene: tiene que ser 0. «Ganado» es lo
 * contrario y se revisa (se esperan casi solo los del admin, que antes veía
 * en el menú solo lo de su fila y ahora es super).
 *
 * PURO.
 */
import { NAV_TREE } from "@/lib/constants";
import { FUNCION_POR_VIEJA, MODULO_POR_CLAVE, accionesDe, claveFuncion, claveModulo } from "./catalogo";
import { puede, rutaPermitida, tieneModulo, hrefsDelMenu, type PermisosEfectivos } from "./motor";
import { hrefViejoVisible, rutaViejaPermitida, subsViejas, type AccesoViejo } from "./equivalencia";

export interface Diferencias {
  perdidos: string[];
  ganados: string[];
}

/** Los href del menú de hoy. */
export const HREFS_MENU: string[] = hrefsDelMenu(NAV_TREE);

export function compararAcceso(viejo: AccesoViejo, nuevo: PermisosEfectivos, rutas: string[]): Diferencias {
  const perdidos: string[] = [];
  const ganados: string[] = [];
  const cotejar = (que: string, antes: boolean, ahora: boolean) => {
    if (antes && !ahora) perdidos.push(que);
    if (!antes && ahora) ganados.push(que);
  };

  for (const [m, def] of MODULO_POR_CLAVE) {
    const tiene = viejo.isAdmin || viejo.modulos.includes(m);
    // El admin viejo entraba a todo por el proxy aunque su fila no lo listara.
    cotejar(`modulo:${m}`, tiene, tieneModulo(nuevo, m));
    // Cada acción del módulo: las de nivel `ver` (ver, exportar) las tenía quien
    // tenía el módulo; las de nivel `editar` (editar, crear, eliminar, aprobar,
    // anular…), quien además tenía un rol que edita.
    for (const a of accionesDe(def)) {
      if (a.nivel === "especial" || a.clave === "ver") continue;
      const antes = a.nivel === "ver" ? tiene : viejo.isAdmin || (tiene && viejo.puedeEditar);
      cotejar(`${a.clave}:${m}`, antes, puede(nuevo, claveModulo(m, a.clave)));
    }
  }

  const subs = new Set(subsViejas(viejo));
  for (const [vieja, { modulo, funcion }] of FUNCION_POR_VIEJA) {
    const antes = viejo.isAdmin || subs.has(vieja);
    cotejar(`funcion:${vieja}`, antes, puede(nuevo, claveFuncion(modulo, funcion.clave, "ver")));
  }

  cotejar("evaluar:accidentes", viejo.isAdmin || viejo.evaluaAccidentes, puede(nuevo, "accidentabilidad.evaluar"));

  for (const r of rutas) cotejar(`ruta:${r}`, rutaViejaPermitida(viejo, r), rutaPermitida(nuevo, r));
  for (const h of HREFS_MENU) cotejar(`menu:${h}`, hrefViejoVisible(viejo, h), rutaPermitida(nuevo, h));

  return { perdidos, ganados };
}
