/**
 * Profesiograma (SST) — periodicidad de los exámenes médicos ocupacionales
 * periódicos por empresa y cargo. Parte PURA: se prueba con `npm run test:sst`.
 *
 * Fuente: «PROFESIOGRAMA DE METROPO TRANSP-METRORECAUDOS-ANAYA GIRALDO ALINEADO
 * A PROC REINTEGRO LAB.xlsx» (Chess Consultorías para la ARL, actualizado el
 * 05/10/2025), columna «Periodicidad del EMO (Res 1843)» de las hojas LA
 * CAROLINA, METRORECAUDOS y ANAYA GIRALDO Y CIA. Regla del documento:
 * administrativo cada 36 meses, administrativo-operativo cada 24 y operativo
 * cada 12.
 *
 * El profesiograma vigente vive en la tabla `sst_profesiograma` (se sube el
 * Excel nuevo o se edita en la pestaña Profesiograma del módulo). Esta
 * constante es la versión del 05/10/2025: con ella se sembró la tabla y es la
 * que se usa si la migración 20261109213335 no está aplicada. Todas las funciones
 * reciben la tabla a usar (por defecto, esta).
 *
 * La periodicidad que asigna es una sugerencia: el concepto médico de cada
 * examen puede cambiarla.
 */
import { PERIODICIDAD_DEFECTO, type GrupoExamen, type PersonaExamen } from "./examenes";

export const PROFESIOGRAMA_FECHA = "2025-10-05";

export const EMPRESAS_PROFESIOGRAMA = [
  { key: "la_carolina", label: "La Carolina" },
  { key: "metrorecaudo", label: "Metrorecaudo" },
  { key: "anaya_giraldo", label: "Anaya Giraldo" },
] as const;
export type EmpresaProfesiograma = (typeof EMPRESAS_PROFESIOGRAMA)[number]["key"];

/** El «proceso» del profesiograma: el filtro «Proceso» del módulo. */
export const TIPOS_CARGO = [
  { key: "admon", label: "Administrativo", meses: 36 },
  { key: "admon_oper", label: "Administrativo-operativo", meses: 24 },
  { key: "oper", label: "Operativo", meses: 12 },
] as const;
export type TipoCargo = (typeof TIPOS_CARGO)[number]["key"];
export const esTipoCargo = (v: unknown): v is TipoCargo => TIPOS_CARGO.some((t) => t.key === v);
export const esEmpresaProfesiograma = (v: unknown): v is EmpresaProfesiograma => EMPRESAS_PROFESIOGRAMA.some((e) => e.key === v);
export const etiquetaTipoCargo = (k: string | null | undefined) => TIPOS_CARGO.find((t) => t.key === k)?.label ?? "Fuera del profesiograma";

export interface CargoProfesiograma {
  cargo: string;
  meses: number;
  tipo: TipoCargo;
}

export type TablaProfesiograma = Record<EmpresaProfesiograma, readonly CargoProfesiograma[]>;

const A = (cargo: string): CargoProfesiograma => ({ cargo, meses: 36, tipo: "admon" });
const AO = (cargo: string): CargoProfesiograma => ({ cargo, meses: 24, tipo: "admon_oper" });
const O = (cargo: string): CargoProfesiograma => ({ cargo, meses: 12, tipo: "oper" });

/** Los cargos tal como están en el Excel (con sus erratas: la búsqueda las corrige). */
export const PROFESIOGRAMA: TablaProfesiograma = {
  la_carolina: [
    A("Gerente General"),
    A("Gerente Administrativo y Financiero"),
    A("Gerente Operativo"),
    A("Subgerente General"),
    A("Subgerente Administrativa y financiera"),
    A("Director Administrativo y Financiero"),
    A("Director de Contabilidad"),
    A("Director de analisis de datos estrategicos"),
    A("Asistente de gerencia"),
    A("Asistente Contable"),
    A("Gestor de Control Interno"),
    A("Auxiliar de Gestion Humana"),
    A("Cajero"),
    A("Asistente de Tesoreria"),
    A("Abogado"),
    A("Auxliar de Tesoreria"),
    A("Director de Getión Humana"),
    A("Coordinador de Compras"),
    A("Coordinador Contable"),
    A("Auxiliar contable"),
    A("Coordinadora de bienestar y comunicaciones"),
    A("Instructor de Conduccion"),
    A("Liquidador de Nomina"),
    A("Recepcionista"),
    A("Coordinadora SST"),
    A("Aprendiz Sena"),
    AO("Mensajero"),
    AO("Inspector de Patio"),
    AO("Supervisor de Mantenimiento"),
    AO("Inspector de lavado de busetas"),
    O("Auxiliar de ruta"),
    AO("Director Operativo"),
    AO("Coordinador Operativo"),
    AO("Auxiliar Operativo"),
    AO("Auxiliar de almacen"),
    A("Asistente Operativo"),
    O("Auxiliar de Mantenimiento"),
    O("Tecnico electrico de Sensor y camaras"),
    O("Tecnico electrico de Sensor"),
    O("Aprendiz sistemas"),
    O("Director de mantenimiento"),
    O("Conductor -  Cobrador"),
    O("Auxliar de Oficios Varios -oficina"),
    O("Auxliar de oficios Varios-Patio"),
  ],
  metrorecaudo: [
    A("Gerente General"),
    A("Gerente Administrativo"),
    A("Director administrativo y financiero"),
    A("Cajero"),
    A("Asistente de Tesoreria"),
    A("Auxliar de Tesoreria"),
  ],
  anaya_giraldo: [
    A("Gerente General"),
    A("Gerente Administrativo"),
    A("Asistente administrativa y contable"),
    O("Vigilante"),
    O("Escolta"),
  ],
};

export function empresaDeGrupo(grupo: GrupoExamen): EmpresaProfesiograma {
  if (grupo === "metrorecaudo") return "metrorecaudo";
  if (grupo === "anaya_giraldo") return "anaya_giraldo";
  return "la_carolina";
}

/** Cargo comparable: sin tildes, signos ni mayúsculas, con las erratas del Excel corregidas. */
export function normalizarCargo(cargo: string): string {
  return cargo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bauxliar\b/g, "auxiliar")
    .replace(/\baux\b/g, "auxiliar")
    .replace(/\bgetion\b/g, "gestion")
    .replace(/\b(coordinador|subgerente|director|asistente)a\b/g, "$1")
    .replace(/\badministrativa\b/g, "administrativo")
    .replace(/\bfinanciera\b/g, "financiero")
    .replace(/\b(y|de|del|la|el)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Indice = Map<EmpresaProfesiograma, { clave: string; c: CargoProfesiograma }[]>;
const indices = new WeakMap<TablaProfesiograma, Indice>();

function indiceDe(tabla: TablaProfesiograma): Indice {
  let i = indices.get(tabla);
  if (!i) {
    i = new Map(EMPRESAS_PROFESIOGRAMA.map((e) => [e.key, (tabla[e.key] ?? []).map((c) => ({ clave: normalizarCargo(c.cargo), c }))]));
    indices.set(tabla, i);
  }
  return i;
}

export interface PeriodicidadSugerida {
  meses: number;
  /** El cargo del profesiograma con que coincidió; null = no está y se usó el valor por defecto. */
  cargo: CargoProfesiograma | null;
}

/** «Conductor - Cobrador» si el profesiograma lo trae; si no, operativo de 12 meses. */
const CONDUCTOR_POR_DEFECTO: CargoProfesiograma = { cargo: "Conductor - Cobrador", meses: 12, tipo: "oper" };

/**
 * Periodicidad según el profesiograma. Conductores y reubicados son
 * «Conductor - Cobrador». Para los demás: coincidencia exacta del cargo y, si
 * no, la más larga contenida en él (o que lo contenga). Sin coincidencia:
 * PERIODICIDAD_DEFECTO (12, lo más frecuente, para no dejar a nadie sin examen).
 */
export function periodicidadPorCargo(
  cargo: string | null | undefined,
  grupo: GrupoExamen,
  tabla: TablaProfesiograma = PROFESIOGRAMA
): PeriodicidadSugerida {
  const empresa = empresaDeGrupo(grupo);
  const lista = indiceDe(tabla).get(empresa) ?? [];
  if (grupo === "conductores" || grupo === "reubicados") {
    const conductor = lista.find((x) => x.clave === "conductor cobrador")?.c ?? CONDUCTOR_POR_DEFECTO;
    // Un reubicado con cargo propio (p. ej. «Auxiliar de ruta») toma el de su cargo.
    if (grupo === "conductores" || !cargo?.trim()) return { meses: conductor.meses, cargo: conductor };
  }
  const clave = cargo ? normalizarCargo(cargo) : "";
  if (!clave) return { meses: PERIODICIDAD_DEFECTO, cargo: null };
  const exacto = lista.find((x) => x.clave === clave);
  if (exacto) return { meses: exacto.c.meses, cargo: exacto.c };
  const parcial = lista
    .filter((x) => x.clave.length >= 5 && (clave.includes(x.clave) || x.clave.includes(clave)))
    .sort((a, b) => b.clave.length - a.clave.length)[0];
  if (parcial) return { meses: parcial.c.meses, cargo: parcial.c };
  return { meses: PERIODICIDAD_DEFECTO, cargo: null };
}

/** Proceso (administrativo, mixto, operativo) de un cargo; null = fuera del profesiograma. */
export const tipoPorCargo = (cargo: string | null | undefined, grupo: GrupoExamen, tabla: TablaProfesiograma = PROFESIOGRAMA) =>
  periodicidadPorCargo(cargo, grupo, tabla).cargo?.tipo ?? null;

// ── Cambios de una versión a otra ──────────────────────────────────────────

export interface CambioCargo {
  empresa: EmpresaProfesiograma;
  cargo: string;
  antes: CargoProfesiograma | null;
  despues: CargoProfesiograma | null;
}

/** Qué cargos se agregan, se quitan o cambian de periodicidad o proceso. */
export function compararProfesiogramas(actual: TablaProfesiograma, nuevo: TablaProfesiograma): CambioCargo[] {
  const out: CambioCargo[] = [];
  for (const { key: empresa } of EMPRESAS_PROFESIOGRAMA) {
    const a = new Map((actual[empresa] ?? []).map((c) => [normalizarCargo(c.cargo), c]));
    const n = new Map((nuevo[empresa] ?? []).map((c) => [normalizarCargo(c.cargo), c]));
    for (const [k, c] of n) {
      const prev = a.get(k);
      if (!prev) out.push({ empresa, cargo: c.cargo, antes: null, despues: c });
      else if (prev.meses !== c.meses || prev.tipo !== c.tipo) out.push({ empresa, cargo: c.cargo, antes: prev, despues: c });
    }
    for (const [k, c] of a) if (!n.has(k)) out.push({ empresa, cargo: c.cargo, antes: c, despues: null });
  }
  return out;
}

export interface PersonaAfectada {
  cedula: string;
  nombre: string;
  cargo: string | null;
  grupo: GrupoExamen;
  /** La periodicidad que tiene hoy en el control. */
  actual: number;
  /** La que le da el profesiograma nuevo. */
  nueva: number;
  /** Tenía la del profesiograma anterior (no la ajustó el médico): se propone marcada. */
  sugerida: boolean;
}

/**
 * Personas activas del control a las que el profesiograma nuevo les cambia la
 * periodicidad. Se proponen marcadas solo las que tenían la del anterior.
 */
export function personasAfectadas(
  personas: readonly PersonaExamen[],
  antes: TablaProfesiograma,
  despues: TablaProfesiograma
): PersonaAfectada[] {
  const out: PersonaAfectada[] = [];
  for (const p of personas) {
    if (!p.activo) continue;
    const viejo = periodicidadPorCargo(p.cargo, p.grupo, antes).meses;
    const nueva = periodicidadPorCargo(p.cargo, p.grupo, despues).meses;
    if (nueva === p.periodicidadMeses || nueva === viejo) continue;
    out.push({ cedula: p.cedula, nombre: p.nombre, cargo: p.cargo, grupo: p.grupo, actual: p.periodicidadMeses, nueva, sugerida: p.periodicidadMeses === viejo });
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Valida una tabla editada a mano o leída del Excel antes de guardarla. */
export function validarTablaProfesiograma(t: unknown): { ok: true; tabla: TablaProfesiograma } | { ok: false; error: string } {
  if (!t || typeof t !== "object") return { ok: false, error: "Profesiograma vacío." };
  const tabla = {} as Record<EmpresaProfesiograma, CargoProfesiograma[]>;
  let total = 0;
  for (const { key, label } of EMPRESAS_PROFESIOGRAMA) {
    const lista = (t as Record<string, unknown>)[key];
    if (!Array.isArray(lista)) return { ok: false, error: `Falta la lista de cargos de ${label}.` };
    const vistos = new Set<string>();
    tabla[key] = [];
    for (const c of lista as Record<string, unknown>[]) {
      const cargo = typeof c?.cargo === "string" ? c.cargo.trim().replace(/\s+/g, " ") : "";
      if (!cargo) return { ok: false, error: `Hay un cargo sin nombre en ${label}.` };
      if (cargo.length > 150) return { ok: false, error: `El cargo «${cargo.slice(0, 40)}…» es demasiado largo.` };
      const meses = Number(c.meses);
      if (!Number.isInteger(meses) || meses < 6 || meses > 60) return { ok: false, error: `«${cargo}» (${label}): la periodicidad debe ser de 6 a 60 meses.` };
      if (!esTipoCargo(c.tipo)) return { ok: false, error: `«${cargo}» (${label}): elija el proceso.` };
      const k = normalizarCargo(cargo);
      if (vistos.has(k)) return { ok: false, error: `«${cargo}» está repetido en ${label}.` };
      vistos.add(k);
      tabla[key].push({ cargo, meses, tipo: c.tipo });
    }
    total += tabla[key].length;
  }
  if (total === 0) return { ok: false, error: "El profesiograma no tiene cargos." };
  return { ok: true, tabla };
}
