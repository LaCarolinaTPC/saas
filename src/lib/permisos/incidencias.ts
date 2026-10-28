/**
 * Incidencias y métricas de permisos (migración
 * `20261028183002_metricas_e_incidencias_de_permisos.sql`). Puro: decide qué
 * anotar y lo agrupa; escribir es de `registro.ts`.
 *
 * Mientras corren los dos sistemas, cada chequeo real se evalúa con el que
 * decide y con el otro. Lo que difiere es una divergencia:
 *  - «perdido»: el viejo deja y el nuevo no. Con esto abierto no se pasa al nuevo.
 *  - «ganado»: el nuevo deja de más.
 */
import { puede, type PermisosEfectivos } from "./motor";
import type { Motor } from "./fuente";

export type TipoIncidencia =
  | "divergencia_perdido"
  | "divergencia_ganado"
  | "denegado"
  | "error_lectura"
  | "error_lectura_nuevo"
  | "sin_perfil"
  | "sin_tipo"
  | "sombra_teorica";

export type Severidad = "alta" | "media" | "baja";

/** Quién preguntó: el proxy (ruta), el servidor (páginas y actions), /api o el MCP. */
export type OrigenChequeo = "proxy" | "server" | "api" | "api_externa" | "sombra";

export type EstadoIncidencia = "abierta" | "revisada" | "resuelta" | "ignorada";

export const SEVERIDAD: Record<TipoIncidencia, Severidad> = {
  divergencia_perdido: "alta",
  error_lectura: "alta",
  divergencia_ganado: "media",
  error_lectura_nuevo: "media",
  sin_perfil: "media",
  sin_tipo: "media",
  sombra_teorica: "media",
  denegado: "baja",
};

export const ETIQUETA_TIPO: Record<TipoIncidencia, string> = {
  divergencia_perdido: "Perdería acceso",
  divergencia_ganado: "Ganaría acceso",
  denegado: "Acceso denegado",
  error_lectura: "Error leyendo permisos",
  error_lectura_nuevo: "Error leyendo el sistema nuevo",
  sin_perfil: "Sin perfil",
  sin_tipo: "Sin rol válido",
  sombra_teorica: "Diferencia en la comparación periódica",
};

export interface Incidencia {
  tipo: TipoIncidencia;
  userId: string | null;
  email?: string | null;
  clave: string;
  origen: OrigenChequeo;
  ruta?: string | null;
  viejo?: boolean | null;
  nuevo?: boolean | null;
  /** null si ni siquiera se pudo leer el interruptor. */
  motor: Motor | null;
  rolViejo?: string | null;
  rolesNuevos?: string[];
  detalle?: Record<string, unknown>;
}

export interface Chequeo {
  dia: string;
  motor: Motor;
  origen: OrigenChequeo;
  clave: string;
  /** Lo que respondió cada sistema; null si no se evaluó. */
  viejo: boolean | null;
  nuevo: boolean | null;
  /** Lo que decidió (el del motor activo). */
  decide: boolean;
  /** Solo los guardianes (exigir…, proxy, /api) cuentan como denegación real. */
  esGuardia: boolean;
}

/** Una incidencia por problema distinto: mismo tipo, persona, permiso y origen. */
export function huellaIncidencia(i: Pick<Incidencia, "tipo" | "userId" | "clave" | "origen">): string {
  return [i.tipo, i.userId ?? "-", i.clave, i.origen].join("|");
}

/** Los permisos de los dos sistemas para un usuario, o null el que no se pudo leer. */
export interface Contraste {
  viejo: PermisosEfectivos | null;
  nuevo: PermisosEfectivos | null;
}

/**
 * Evalúa una clave con los dos sistemas. `decide` es siempre la del motor
 * activo: el otro solo se mira. Lo que gana el admin al pasar a super es
 * esperado y no es divergencia.
 */
export function evaluar(
  decideEf: PermisosEfectivos,
  c: Contraste | null,
  clave: string,
  evaluarCon: (ef: PermisosEfectivos, clave: string) => boolean = puede
): { decide: boolean; viejo: boolean | null; nuevo: boolean | null; divergencia: "perdido" | "ganado" | null } {
  const decide = evaluarCon(decideEf, clave);
  const viejo = c?.viejo ? evaluarCon(c.viejo, clave) : null;
  const nuevo = c?.nuevo ? evaluarCon(c.nuevo, clave) : null;
  let divergencia: "perdido" | "ganado" | null = null;
  if (viejo !== null && nuevo !== null && viejo !== nuevo) {
    if (viejo) divergencia = "perdido";
    else if (!c!.viejo!.super) divergencia = "ganado";
  }
  return { decide, viejo, nuevo, divergencia };
}

export interface FilaIncidencia {
  huella: string;
  tipo: TipoIncidencia;
  severidad: Severidad;
  user_id: string | null;
  email: string | null;
  rol_viejo: string | null;
  roles_nuevos: string[];
  clave: string;
  origen: OrigenChequeo;
  ruta: string | null;
  viejo: boolean | null;
  nuevo: boolean | null;
  motor: Motor | null;
  veces: number;
  detalle: Record<string, unknown>;
}

/** Agrupa por huella: lo repetido dentro de un volcado va una vez con `veces`. */
export function agruparIncidencias(lista: Incidencia[]): FilaIncidencia[] {
  const m = new Map<string, FilaIncidencia>();
  for (const i of lista) {
    const h = huellaIncidencia(i);
    const previa = m.get(h);
    if (previa) {
      previa.veces += 1;
      previa.ruta = i.ruta ?? previa.ruta;
      continue;
    }
    m.set(h, {
      huella: h,
      tipo: i.tipo,
      severidad: SEVERIDAD[i.tipo],
      user_id: i.userId,
      email: i.email ?? null,
      rol_viejo: i.rolViejo ?? null,
      roles_nuevos: i.rolesNuevos ?? [],
      clave: i.clave,
      origen: i.origen,
      ruta: i.ruta ?? null,
      viejo: i.viejo ?? null,
      nuevo: i.nuevo ?? null,
      motor: i.motor,
      veces: 1,
      detalle: i.detalle ?? {},
    });
  }
  return [...m.values()];
}

export interface FilaMetrica {
  dia: string;
  motor: Motor;
  origen: OrigenChequeo;
  clave: string;
  chequeos: number;
  comparados: number;
  coinciden: number;
  perdidos: number;
  ganados: number;
  denegados: number;
}

export function agruparMetricas(chequeos: Chequeo[]): FilaMetrica[] {
  const m = new Map<string, FilaMetrica>();
  for (const c of chequeos) {
    const k = [c.dia, c.motor, c.origen, c.clave].join("|");
    let f = m.get(k);
    if (!f) {
      f = { dia: c.dia, motor: c.motor, origen: c.origen, clave: c.clave, chequeos: 0, comparados: 0, coinciden: 0, perdidos: 0, ganados: 0, denegados: 0 };
      m.set(k, f);
    }
    f.chequeos += 1;
    if (c.viejo !== null && c.nuevo !== null) {
      f.comparados += 1;
      if (c.viejo === c.nuevo) f.coinciden += 1;
      else if (c.viejo) f.perdidos += 1;
      else f.ganados += 1;
    }
    if (c.esGuardia && !c.decide) f.denegados += 1;
  }
  return [...m.values()];
}

// ── Lectura: resumen para la pantalla y el script ────────────────────────────

/** Criterio para pasar al sistema nuevo (ver la pestaña «Sistema»). */
export const LISTO_DIAS = 14;
export const LISTO_COINCIDENCIA_MIN = 0.999;

export interface ResumenMetricas {
  chequeos: number;
  comparados: number;
  coinciden: number;
  perdidos: number;
  ganados: number;
  denegados: number;
  /** null si no hubo nada comparado. */
  coincidencia: number | null;
}

export function resumir(filas: Pick<FilaMetrica, "chequeos" | "comparados" | "coinciden" | "perdidos" | "ganados" | "denegados">[]): ResumenMetricas {
  const r = { chequeos: 0, comparados: 0, coinciden: 0, perdidos: 0, ganados: 0, denegados: 0 };
  for (const f of filas) {
    r.chequeos += Number(f.chequeos);
    r.comparados += Number(f.comparados);
    r.coinciden += Number(f.coinciden);
    r.perdidos += Number(f.perdidos);
    r.ganados += Number(f.ganados);
    r.denegados += Number(f.denegados);
  }
  return { ...r, coincidencia: r.comparados ? r.coinciden / r.comparados : null };
}

/** ¿Listo para pasar? Sin perdidos abiertos y coincidencia suficiente. */
export function listoParaNuevo(resumen: ResumenMetricas, perdidosAbiertos: number): { listo: boolean; motivo: string | null } {
  if (perdidosAbiertos > 0) return { listo: false, motivo: `${perdidosAbiertos} incidencia(s) de acceso perdido sin resolver.` };
  if (resumen.coincidencia === null) return { listo: false, motivo: "Todavía no hay chequeos comparados." };
  if (resumen.coincidencia < LISTO_COINCIDENCIA_MIN) {
    return { listo: false, motivo: `Coincidencia ${(resumen.coincidencia * 100).toFixed(2)} % (mínimo ${LISTO_COINCIDENCIA_MIN * 100} %).` };
  }
  return { listo: true, motivo: null };
}
