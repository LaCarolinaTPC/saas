// Reglas puras del control de cámaras y sensores: validación de lo que manda el
// formulario, semáforo entre el conteo del sensor (DFS Optocontrol) y el aforo
// contado en el video, y las reglas con que se migra el histórico del Forms
// (fechas mal digitadas, nombres con la Ñ dañada, cruce del conductor con GEMA).
// Sin base de datos ni React: las usan la Server Action, la pantalla, el script
// de migración y las pruebas.

export type Elemento = "camara" | "sensor";
export const ELEMENTOS: Elemento[] = ["camara", "sensor"];
export const ELEMENTO_LABEL: Record<Elemento, string> = { camara: "Cámara", sensor: "Sensor" };

export type ConductorOrigen = "gema_viaje" | "gema_dia" | "formulario" | "ambiguo" | "sin_cruce";
export const CONDUCTOR_ORIGEN_LABEL: Record<ConductorOrigen, string> = {
  gema_viaje: "GEMA (viaje)",
  gema_dia: "GEMA (día)",
  formulario: "Digitado",
  ambiguo: "Ambiguo",
  sin_cruce: "Sin cruce",
};

export interface TipoNovedad {
  clave: string;
  elemento: Elemento;
  nombre: string;
  es_falla: boolean;
  sin_conteo: boolean;
  activo: boolean;
  orden: number;
}

export const MAX_OBSERVACIONES = 1000;
/** Conteo máximo creíble de un viaje; el Forms trae un DFS de 6.767. */
export const MAX_CONTEO = 1000;
/** Días hacia atrás desde los que el formulario avisa que la fecha es vieja. */
export const DIAS_AVISO_FECHA = 30;
export const VIAJE_RE = /^([1-9][0-9]?|C\.U)$/;

// ── Semáforo DFS vs aforo ────────────────────────────────────────────────────

/** Hasta aquí la diferencia es normal: ≤ 3 pasajeros o ≤ 5 % del aforo. */
export const UMBRAL_OK_PASAJEROS = 3;
export const UMBRAL_OK_PCT = 5;
/** Por encima de esto es crítico; entre medio, alerta. */
export const UMBRAL_ALERTA_PCT = 15;

export type NivelDiferencia = "ok" | "alerta" | "critico" | "sin_dato";

export const NIVEL_LABEL: Record<NivelDiferencia, string> = {
  ok: "Cuadra",
  alerta: "Revisar",
  critico: "Descuadre",
  sin_dato: "Sin dato",
};

export const NIVEL_COLOR: Record<NivelDiferencia, { fuerte: string; suave: string; texto: string }> = {
  ok: { fuerte: "#059669", suave: "#D1FAE5", texto: "#065F46" },
  alerta: { fuerte: "#D97706", suave: "#FEF3C7", texto: "#92400E" },
  critico: { fuerte: "#DC2626", suave: "#FEE2E2", texto: "#991B1B" },
  sin_dato: { fuerte: "#94A3B8", suave: "#F1F5F9", texto: "#475569" },
};

export interface Diferencia {
  /** conteo − aforo: positivo si el conteo cuenta de más. */
  diferencia: number | null;
  /** |diferencia| sobre el aforo, en %; null si el aforo es 0. */
  porcentaje: number | null;
  nivel: NivelDiferencia;
}

/**
 * Compara un conteo (DFS del sensor o timbradas de caja) contra el aforo, que
 * es el conteo hecho a ojo sobre el video y por eso la referencia.
 */
export function compararConAforo(conteo: number | null | undefined, aforo: number | null | undefined): Diferencia {
  if (conteo == null || aforo == null) return { diferencia: null, porcentaje: null, nivel: "sin_dato" };
  const diferencia = conteo - aforo;
  const abs = Math.abs(diferencia);
  const porcentaje = aforo > 0 ? Math.round((abs / aforo) * 1000) / 10 : null;
  if (abs <= UMBRAL_OK_PASAJEROS || (porcentaje != null && porcentaje <= UMBRAL_OK_PCT)) {
    return { diferencia, porcentaje, nivel: "ok" };
  }
  if (porcentaje != null && porcentaje <= UMBRAL_ALERTA_PCT) return { diferencia, porcentaje, nivel: "alerta" };
  return { diferencia, porcentaje, nivel: "critico" };
}

// ── Validación del formulario ────────────────────────────────────────────────

export interface RevisionEntrada {
  fechaViaje: string;
  vehiculoCodigo: string;
  viaje: string;
  elemento: string;
  tipoNovedad: string;
  dfsOptocontrol?: number | string | null;
  aforo?: number | string | null;
  observaciones?: string | null;
}

export interface RevisionValidada {
  fechaViaje: string;
  vehiculoCodigo: string;
  viaje: string;
  elemento: Elemento;
  tipoNovedad: string;
  conFalla: boolean;
  dfsOptocontrol: number | null;
  aforo: number | null;
  observaciones: string | null;
  /** Avisos que no impiden guardar (fecha vieja). */
  avisos: string[];
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function esFechaIso(s: string): boolean {
  if (!FECHA_ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

function leerConteo(valor: number | string | null | undefined, nombre: string): number | null {
  if (valor == null || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  if (!Number.isInteger(n) || n < 0) throw new Error(`${nombre} debe ser un número entero de 0 en adelante.`);
  if (n > MAX_CONTEO) throw new Error(`${nombre} de ${n} no es creíble para un viaje (máximo ${MAX_CONTEO}).`);
  return n;
}

/**
 * Valida y normaliza una revisión. `hoy` es la fecha de Colombia en ISO.
 * La cámara exige DFS y aforo salvo que el tipo sea sin conteo (no bajó
 * información, bus varado); en el sensor los conteos son opcionales.
 */
export function validarRevision(entrada: RevisionEntrada, tipos: TipoNovedad[], hoy: string): RevisionValidada {
  const fechaViaje = String(entrada.fechaViaje ?? "").trim();
  if (!esFechaIso(fechaViaje)) throw new Error("La fecha del viaje no es válida.");
  if (fechaViaje > hoy) throw new Error("La fecha del viaje no puede ser futura.");

  const vehiculoCodigo = String(entrada.vehiculoCodigo ?? "").trim();
  if (!/^\d{1,5}$/.test(vehiculoCodigo)) throw new Error("Elija el vehículo.");

  const viaje = String(entrada.viaje ?? "").trim().toUpperCase();
  if (!VIAJE_RE.test(viaje)) throw new Error("El número de viaje debe ser de 1 a 99 o C.U.");

  const elemento = String(entrada.elemento ?? "") as Elemento;
  if (!ELEMENTOS.includes(elemento)) throw new Error("Indique si revisó la cámara o el sensor.");

  const tipo = tipos.find((t) => t.clave === entrada.tipoNovedad);
  if (!tipo || !tipo.activo) throw new Error("Elija el tipo de novedad.");
  if (tipo.elemento !== elemento) throw new Error(`«${tipo.nombre}» no es una novedad de ${ELEMENTO_LABEL[elemento].toLowerCase()}.`);

  let dfsOptocontrol = leerConteo(entrada.dfsOptocontrol, "El DFS Optocontrol");
  let aforo = leerConteo(entrada.aforo, "El aforo");
  if (tipo.sin_conteo) {
    dfsOptocontrol = null;
    aforo = null;
  } else if (elemento === "camara") {
    if (dfsOptocontrol == null) throw new Error("Escriba el DFS Optocontrol del viaje.");
    if (aforo == null) throw new Error("Escriba el aforo contado en el video.");
  }

  const observaciones = (entrada.observaciones ?? "").trim();
  if (observaciones.length > MAX_OBSERVACIONES) {
    throw new Error(`Las observaciones pasan de ${MAX_OBSERVACIONES} caracteres.`);
  }

  const avisos: string[] = [];
  const dias = diasEntre(fechaViaje, hoy);
  if (dias > DIAS_AVISO_FECHA) avisos.push(`El viaje es de hace ${dias} días.`);

  return {
    fechaViaje, vehiculoCodigo, viaje, elemento, tipoNovedad: tipo.clave, conFalla: tipo.es_falla,
    dfsOptocontrol, aforo, observaciones: observaciones || null, avisos,
  };
}

// ── Histórico del Forms ──────────────────────────────────────────────────────

/**
 * Normaliza un nombre para compararlo: sin tildes, mayúsculas, espacios
 * simples. La Ñ, sana o dañada en el Excel ("BOLA�OS"), se compara como N.
 */
export function normalizarNombre(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[�Ññ]/g, "N")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Marcador con que Mantenimiento cargó filas sin saber el conductor. */
export function esNombreReal(s: string | null | undefined): boolean {
  const n = normalizarNombre(s);
  return n.length > 0 && !n.includes("SIN CONDUCTOR");
}

export interface FechaHistorico {
  fecha: string;
  /** La fecha traía la «R» de revisión repetida. */
  repetida: boolean;
  /** Se cambió: día y mes invertidos, año mal escrito o se tomó la del envío. */
  corregida: boolean;
}

const iso = (y: number, m: number, d: number): string | null => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return esFechaIso(s) ? s : null;
};

/**
 * Lee la «Fecha Novedad» del Forms. Llega como fecha de Excel o como texto
 * d/m/aaaa, a veces con una «R» al final y con errores de digitación
 * ("15/7/0206", "18/82026"). `enviado` es la hora de inicio del Forms en ISO
 * (aaaa-mm-dd), que acota la fecha: el viaje no puede ser posterior al envío.
 * Si la fecha cae después del envío se prueba con día y mes invertidos; si
 * tampoco sirve se usa la fecha del envío. null si no hay con qué.
 */
export function parsearFechaHistorico(valor: unknown, enviado: string | null): FechaHistorico | null {
  let repetida = false;
  let corregida = false;
  let candidatas: string[] = [];

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const y = valor.getUTCFullYear(), m = valor.getUTCMonth() + 1, d = valor.getUTCDate();
    // Excel ya interpretó el texto como m/d: la alternativa es invertirlo.
    candidatas = [iso(y, m, d), iso(y, d, m)].filter((x): x is string => !!x);
  } else if (typeof valor === "string") {
    let t = valor.trim().toUpperCase();
    if (/\d\s*R$/.test(t)) {
      repetida = true;
      t = t.replace(/\s*R$/, "").trim();
    }
    let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) {
      // "18/82026": falta la barra entre mes y año.
      const pegado = t.match(/^(\d{1,2})\/(\d{1,2})(\d{4})$/);
      if (pegado) {
        m = pegado;
        corregida = true;
      }
    }
    if (m) {
      const d = Number(m[1]), mes = Number(m[2]);
      let y = Number(m[3]);
      const anioEnvio = enviado ? Number(enviado.slice(0, 4)) : null;
      if (anioEnvio != null && (y > anioEnvio || anioEnvio - y > 1)) {
        // "0206", "2027" mal tecleado: se toma el año del envío. Un año menos
        // se respeta (revisión en enero de un viaje de diciembre).
        y = anioEnvio;
        corregida = true;
      }
      candidatas = [iso(y, mes, d), iso(y, d, mes)].filter((x): x is string => !!x);
    }
  }

  const valida = (f: string) => !enviado || (f <= enviado && diasEntre(f, enviado) <= 400);
  const [primera, ...resto] = candidatas;
  if (primera && valida(primera)) return { fecha: primera, repetida, corregida };
  const alterna = resto.find(valida);
  if (alterna) return { fecha: alterna, repetida, corregida: true };
  if (enviado && esFechaIso(enviado)) return { fecha: enviado, repetida, corregida: true };
  return null;
}

export interface ViajeGema {
  numero: number;
  viaje: number | null;
  conductorCedula: string | null;
  conductorNombre: string | null;
}

export interface ConductorResuelto {
  origen: ConductorOrigen;
  cedula: string | null;
  nombre: string | null;
  despachoNumero: number | null;
  alertas: string[];
}

/**
 * Decide el conductor de una revisión con los viajes del bus ese día en GEMA:
 * 1. el viaje con ese número → gema_viaje;
 * 2. si no está, y el bus tuvo un solo conductor ese día → gema_dia;
 *    varios conductores → ambiguo;
 * 3. sin viajes en GEMA, el nombre digitado (resuelto aparte en el maestro).
 * Si el nombre digitado no coincide con el de GEMA, gana GEMA con alerta.
 */
export function resolverConductor(
  viajesDelBus: ViajeGema[],
  viaje: string,
  nombreDigitado: string | null,
  maestro: { cedula: string; nombre: string } | null,
): ConductorResuelto {
  const alertas: string[] = [];
  const digitado = esNombreReal(nombreDigitado) ? normalizarNombre(nombreDigitado) : null;
  const comparar = (nombreGema: string | null) => {
    if (digitado && nombreGema && normalizarNombre(nombreGema) !== digitado) alertas.push("conductor_distinto");
  };

  if (viajesDelBus.length > 0) {
    const exacto = /^\d+$/.test(viaje) ? viajesDelBus.find((v) => v.viaje === Number(viaje)) : undefined;
    if (exacto) {
      comparar(exacto.conductorNombre);
      return {
        origen: "gema_viaje", cedula: exacto.conductorCedula, nombre: exacto.conductorNombre,
        despachoNumero: exacto.numero, alertas,
      };
    }
    alertas.push("viaje_no_existe");
    const cedulas = new Set(viajesDelBus.map((v) => v.conductorCedula).filter(Boolean));
    if (cedulas.size === 1) {
      const v = viajesDelBus.find((x) => x.conductorCedula)!;
      comparar(v.conductorNombre);
      return { origen: "gema_dia", cedula: v.conductorCedula, nombre: v.conductorNombre, despachoNumero: null, alertas };
    }
    if (cedulas.size > 1) {
      // Si el nombre digitado es uno de los conductores del día, se toma ese.
      const delDia = digitado
        ? viajesDelBus.find((v) => normalizarNombre(v.conductorNombre) === digitado)
        : undefined;
      if (delDia) {
        return { origen: "gema_dia", cedula: delDia.conductorCedula, nombre: delDia.conductorNombre, despachoNumero: null, alertas };
      }
      return { origen: "ambiguo", cedula: null, nombre: digitado ? nombreDigitado!.trim() : null, despachoNumero: null, alertas };
    }
  } else {
    alertas.push("sin_viajes_gema");
  }

  if (maestro) return { origen: "formulario", cedula: maestro.cedula, nombre: maestro.nombre, despachoNumero: null, alertas };
  return { origen: "sin_cruce", cedula: null, nombre: digitado ? nombreDigitado!.trim() : null, despachoNumero: null, alertas };
}
