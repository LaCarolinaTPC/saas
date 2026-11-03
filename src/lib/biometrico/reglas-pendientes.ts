/**
 * Filtros configurables de los «pendientes por clasificar» automáticos.
 *
 * Deciden **a quién** registra la tarea `ausentismo.pendientes`, **qué días**
 * corre y **desde qué hora** según el tipo de día (lunes a viernes, sábado,
 * domingo, festivo). Se editan en Marcaciones › «Sin despacho» › «Configurar
 * filtros». La sección «Vista previa» usa este mismo `evaluarReglas` para
 * mostrar el resultado de cualquier día sin escribir nada.
 *
 * Antes la regla era fija: sin viaje que haya salido **y** sin huella, solo de
 * lunes a viernes no festivos. `REGLAS_POR_OMISION` la reproduce exactamente
 * (lo verifica `reglas-pendientes.test.ts`), así que sin filtros guardados todo
 * sigue como era. `cedulasReglaActual` conserva esa regla fija solo para
 * comparar.
 *
 * PURO: ni base ni red. Lo importan también componentes de cliente.
 */
import { diaIso, esFestivo } from "@/lib/tesoreria/calendario-pago";
// Relativos a propósito, como en `auto-pendientes.ts`: las pruebas corren con `tsx --test`.
import { HORA_POR_OMISION, minutosDeHora } from "./auto-pendientes";
import { diasEntreIso, type Esperado, type ResumenDia } from "./dia";
import { hora } from "./formato";

/**
 * La clave en `app_settings` donde viven los filtros (texto JSON). Conserva el
 * nombre de cuando estaban en prueba para no perder lo ya guardado.
 */
export const CLAVE_REGLAS = "ausentismo.pendientes_reglas_prueba";

export type TipoDia = "habil" | "sabado" | "domingo" | "festivo";
export type OrigenEsperado = Esperado["origen"];

export const TIPOS_DIA: TipoDia[] = ["habil", "sabado", "domingo", "festivo"];
export const ORIGENES: OrigenEsperado[] = ["despacho", "historico", "vehiculo", "maestro"];

export const ETIQUETA_TIPO_DIA: Record<TipoDia, string> = {
  habil: "Lunes a viernes",
  sabado: "Sábado",
  domingo: "Domingo",
  festivo: "Festivo",
};

export const ETIQUETA_ORIGEN: Record<OrigenEsperado, string> = {
  despacho: "Despacho del día (GEMA lo registró en ese bus)",
  historico: "Conductor habitual del bus (últimos 45 días)",
  vehiculo: "Conductor fijo del bus en el maestro",
  maestro: "Solo plantilla (conductor activo, sin programación)",
};

export interface ReglaDia {
  activo: boolean;
  /** «HH:MM»: desde esta hora correría ese tipo de día. */
  hora: string;
}

export interface ReglasPendientes {
  version: 1;
  criterio: {
    /** Cuenta no haber pasado la huella (o haberla pasado tarde). */
    sinHuella: boolean;
    /** Cuenta no tener viaje que haya salido (o que el primero saliera tarde). */
    sinDespacho: boolean;
    /** `y`: tienen que faltar todos los marcados; `o`: basta con uno. */
    combinar: "y" | "o";
  };
  /** Una huella después de esta hora cuenta como «sin huella». Null = sin límite. */
  horaLimiteHuella: string | null;
  /** Un primer viaje después de esta hora cuenta como «sin despacho». Null = sin límite. */
  horaLimiteDespacho: string | null;
  /** Quien tiene viajes asignados que aún no salen cuenta como «sin despacho». */
  incluirPorSalir: boolean;
  dias: Record<TipoDia, ReglaDia>;
  /** Por qué se esperaba a la persona: solo se registran los orígenes encendidos. */
  origenes: Record<OrigenEsperado, boolean>;
  /** Excluye a quien lleva MÁS de N días sin rodar (vacaciones, inactivo…). Null = sin límite. */
  maxDiasSinRodar: number | null;
  /** Incluye a quien no rodó ni una vez en la ventana del histórico. */
  incluirNuncaRodo: boolean;
}

/** La regla que corre hoy, escrita como parámetros. */
export const REGLAS_POR_OMISION: ReglasPendientes = {
  version: 1,
  criterio: { sinHuella: true, sinDespacho: true, combinar: "y" },
  horaLimiteHuella: null,
  horaLimiteDespacho: null,
  incluirPorSalir: false,
  dias: {
    habil: { activo: true, hora: HORA_POR_OMISION },
    sabado: { activo: false, hora: HORA_POR_OMISION },
    domingo: { activo: false, hora: HORA_POR_OMISION },
    festivo: { activo: false, hora: HORA_POR_OMISION },
  },
  origenes: { despacho: true, historico: true, vehiculo: true, maestro: true },
  maxDiasSinRodar: null,
  incluirNuncaRodo: true,
};

/**
 * Copia profunda de las reglas por omisión (para no compartir objetos). Con
 * `horaHabil` —la hora que tiene hoy configurada el proceso real— la regla de
 * lunes a viernes arranca en esa hora, y así «por omisión» es de verdad lo que
 * hace hoy Gestivo.
 */
export function reglasPorOmision(horaHabil?: string | null): ReglasPendientes {
  const r = JSON.parse(JSON.stringify(REGLAS_POR_OMISION)) as ReglasPendientes;
  if (horaHabil && minutosDeHora(horaHabil) !== null) r.dias.habil.hora = horaHabil.trim();
  return r;
}

// ── Lectura y validación ─────────────────────────────────────────────────────

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function bool(v: unknown, omision: boolean): boolean {
  return typeof v === "boolean" ? v : omision;
}

function horaO(v: unknown, omision: string): string {
  return typeof v === "string" && minutosDeHora(v) !== null ? v.trim() : omision;
}

function horaONull(v: unknown): string | null {
  return typeof v === "string" && minutosDeHora(v) !== null ? v.trim() : null;
}

function enteroONull(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

/**
 * Lee lo guardado en `app_settings`. Nunca lanza: un JSON dañado o incompleto
 * se completa con la regla actual, campo por campo, para que la pantalla no se
 * caiga por un valor mal escrito.
 */
export function parsearReglas(
  texto: string | null | undefined,
  horaHabil?: string | null
): ReglasPendientes {
  const r = reglasPorOmision(horaHabil);
  if (!texto) return r;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return r;
  }
  const o = obj(crudo);
  if (!o) return r;

  const c = obj(o.criterio);
  if (c) {
    r.criterio.sinHuella = bool(c.sinHuella, r.criterio.sinHuella);
    r.criterio.sinDespacho = bool(c.sinDespacho, r.criterio.sinDespacho);
    r.criterio.combinar = c.combinar === "o" ? "o" : "y";
  }
  // Sin ningún criterio la regla no significa nada: se vuelve a la actual.
  if (!r.criterio.sinHuella && !r.criterio.sinDespacho) {
    r.criterio.sinHuella = true;
    r.criterio.sinDespacho = true;
  }
  r.horaLimiteHuella = horaONull(o.horaLimiteHuella);
  r.horaLimiteDespacho = horaONull(o.horaLimiteDespacho);
  r.incluirPorSalir = bool(o.incluirPorSalir, r.incluirPorSalir);

  const d = obj(o.dias);
  if (d) {
    for (const t of TIPOS_DIA) {
      const x = obj(d[t]);
      if (!x) continue;
      r.dias[t] = { activo: bool(x.activo, r.dias[t].activo), hora: horaO(x.hora, r.dias[t].hora) };
    }
  }
  const og = obj(o.origenes);
  if (og) for (const k of ORIGENES) r.origenes[k] = bool(og[k], r.origenes[k]);

  r.maxDiasSinRodar = enteroONull(o.maxDiasSinRodar);
  r.incluirNuncaRodo = bool(o.incluirNuncaRodo, r.incluirNuncaRodo);
  return r;
}

/**
 * Valida lo que manda la pantalla antes de guardarlo. Devuelve el error para
 * mostrar, o null si sirve. Es estricta (a diferencia de `parsearReglas`, que
 * perdona): lo que se guarda tiene que ser exactamente lo que se ve.
 */
export function validarReglas(r: ReglasPendientes): string | null {
  if (!r || typeof r !== "object") return "Reglas vacías.";
  if (!r.criterio || (!r.criterio.sinHuella && !r.criterio.sinDespacho)) {
    return "Marca al menos un criterio: sin huella o sin despacho.";
  }
  if (r.criterio.combinar !== "y" && r.criterio.combinar !== "o") {
    return "La combinación debe ser «y» u «o».";
  }
  for (const [nombre, v] of [
    ["La hora límite de huella", r.horaLimiteHuella],
    ["La hora límite de despacho", r.horaLimiteDespacho],
  ] as const) {
    if (v !== null && minutosDeHora(v) === null) return nombre + " debe tener la forma HH:MM.";
  }
  for (const t of TIPOS_DIA) {
    const x = r.dias?.[t];
    if (!x || typeof x.activo !== "boolean" || minutosDeHora(x.hora) === null) {
      return "La hora de " + ETIQUETA_TIPO_DIA[t].toLowerCase() + " debe tener la forma HH:MM.";
    }
  }
  for (const k of ORIGENES) {
    if (typeof r.origenes?.[k] !== "boolean") return "Falta indicar el origen «" + k + "».";
  }
  if (!ORIGENES.some((k) => r.origenes[k])) return "Deja encendido al menos un origen del esperado.";
  if (r.maxDiasSinRodar !== null && !(Number.isInteger(r.maxDiasSinRodar) && r.maxDiasSinRodar >= 0)) {
    return "Los días sin rodar deben ser un número entero mayor o igual a cero.";
  }
  if (typeof r.incluirPorSalir !== "boolean" || typeof r.incluirNuncaRodo !== "boolean") {
    return "Opciones incompletas.";
  }
  return null;
}

// ── Tipo de día ──────────────────────────────────────────────────────────────

/** Festivo manda sobre el día de la semana: un lunes festivo es «festivo». */
export function tipoDeDia(fecha: string): TipoDia {
  if (esFestivo(fecha)) return "festivo";
  const d = diaIso(fecha);
  if (d === 7) return "domingo";
  if (d === 6) return "sabado";
  return "habil";
}

/** Suma (o resta) días a una fecha ISO, sin zona horaria. */
export function sumarDiasIso(fecha: string, n: number): string {
  const t = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * El día más reciente, hasta `hasta` inclusive, que es de ese tipo. Para los
 * atajos del calendario («último domingo», «último festivo»). Busca un año
 * hacia atrás, que siempre trae festivos.
 */
export function ultimoDeTipo(hasta: string, tipo: TipoDia): string | null {
  for (let i = 0; i <= 366; i++) {
    const f = sumarDiasIso(hasta, -i);
    if (tipoDeDia(f) === tipo) return f;
  }
  return null;
}

// ── Evaluación ───────────────────────────────────────────────────────────────

export interface CandidatoPrueba {
  cedula: string;
  nombre: string;
  codigo: string | null;
  bus: string | null;
  origen: OrigenEsperado;
  /** Primera huella del día, «HH:MM» en hora de Colombia. */
  huella: string | null;
  /** Hora del primer viaje que salió, «HH:MM». */
  primerDespacho: string | null;
  porSalir: boolean;
  /** Días desde la última vez que rodó; null si no rodó en la ventana. */
  diasSinRodar: number | null;
  /** Por qué cumple: «sin huella», «huella 07:42 (límite 06:00)»… */
  motivos: string[];
  /** La regla actual también lo registra. */
  tambienActual: boolean;
  /** Ya tiene un «pendiente por clasificar» ese día. */
  yaTienePendiente: boolean;
}

export interface ExcluidoPrueba {
  cedula: string;
  nombre: string;
  codigo: string | null;
  origen: OrigenEsperado;
  /** Qué lo dejó fuera. */
  razon: string;
}

export interface ResultadoPrueba {
  fecha: string;
  tipoDia: TipoDia;
  /** La regla está encendida para este tipo de día. */
  diaActivo: boolean;
  horaCorte: string;
  candidatos: CandidatoPrueba[];
  /** Cumplían el criterio, pero un filtro (origen, días sin rodar) los sacó. */
  excluidos: ExcluidoPrueba[];
  /** La regla fija anterior los registraba y estos filtros no, con la razón. */
  soloActual: ExcluidoPrueba[];
  /**
   * Esperados (sin novedad resuelta) que NO cumplen el criterio: hay evidencia
   * de que vinieron —rodaron, pasaron la huella a tiempo— o tienen turno por
   * salir. Un pendiente automático suyo sobra y la limpieza lo retira. Los que
   * quedaron fuera por un filtro (origen, días sin rodar) NO están aquí: eso es
   * configuración, no evidencia, y no borra nada.
   */
  noCumplen: string[];
  conteos: { candidatos: number; coinciden: number; soloPrueba: number; soloActual: number };
}

/**
 * A quién registra la regla de HOY, sobre el mismo resumen. Gemela de
 * `candidatosAPendiente` en `data.ts` (que es de servidor y no se puede
 * importar aquí); la prueba de `REGLAS_POR_OMISION` vigila que no se separen.
 */
export function cedulasReglaActual(resumen: ResumenDia): Set<string> {
  return new Set(resumen.sinDespacho.filter((f) => !f.marco).map((f) => f.cedula.trim()));
}

/**
 * ¿Haber rodado (a cualquier hora) basta para que alguien NO cumpla los
 * filtros? Lo usa la limpieza cuando solo sabe quién rodó (Registro del día),
 * sin el resumen completo: solo en ese caso puede retirar el pendiente de quien
 * rodó sin contradecir a los filtros.
 *
 * Es así cuando el despacho es obligatorio en el criterio (solo él, o los dos
 * con «Y») y no hay hora límite de despacho —con límite, un viaje tardío sigue
 * contando como falta, y sin la hora no se puede saber—.
 */
export function rodarDescarta(reglas: ReglasPendientes): boolean {
  const c = reglas.criterio;
  return c.sinDespacho && reglas.horaLimiteDespacho === null && (c.combinar === "y" || !c.sinHuella);
}

function minutosDeDespacho(h: string | null | undefined): number | null {
  return h ? minutosDeHora(h.slice(0, 5)) : null;
}

function porNombre(a: { nombre: string; cedula: string }, b: { nombre: string; cedula: string }) {
  return (a.nombre || a.cedula).localeCompare(b.nombre || b.cedula, "es");
}

/**
 * Arma la lista simulada del día con las reglas dadas.
 *
 * Se evalúa aunque el tipo de día esté apagado (`diaActivo = false`): así se
 * puede ver cómo quedaría un domingo antes de encenderlo. La hora de corte NO
 * recorta nada: con los datos que hay, dice a quién registraría al correr.
 */
export function evaluarReglas(entrada: {
  fecha: string;
  reglas: ReglasPendientes;
  resumen: ResumenDia;
  /** Cédula → último día que rodó (`esperadosDelDia().ultimoDiaRodado`). */
  ultimoDiaRodado: ReadonlyMap<string, string>;
  /** Cédulas que ya tienen un «pendiente por clasificar» ese día. */
  conPendiente: Iterable<string>;
}): ResultadoPrueba {
  const { fecha, reglas, resumen, ultimoDiaRodado } = entrada;
  const tipoDia = tipoDeDia(fecha);
  const regDia = reglas.dias[tipoDia];
  const actual = cedulasReglaActual(resumen);
  const pendientes = new Set<string>();
  for (const c of entrada.conPendiente) if (c) pendientes.add(String(c).trim());

  const huellaPorCedula = new Map<string, string>();
  for (const m of resumen.marcaron) huellaPorCedula.set(m.cedula.trim(), m.primera);

  const limHuella = minutosDeHora(reglas.horaLimiteHuella);
  const limDespacho = minutosDeHora(reglas.horaLimiteDespacho);

  // El universo: todo esperado sin novedad ya resuelta (las tres listas).
  type Fila = Esperado & { primerViajeHora: string | null; porSalir: boolean };
  const universo: Fila[] = [
    ...resumen.trabajaron.map((f) => ({ ...f, primerViajeHora: f.primerViaje.hora, porSalir: false })),
    ...resumen.porSalir.map((f) => ({ ...f, primerViajeHora: null, porSalir: true })),
    ...resumen.sinDespacho.map((f) => ({ ...f, primerViajeHora: null, porSalir: false })),
  ];

  const candidatos: CandidatoPrueba[] = [];
  const excluidos: ExcluidoPrueba[] = [];
  const noCumple = new Map<string, string>();
  const vistas = new Set<string>();

  for (const f of universo) {
    const cedula = (f.cedula ?? "").trim();
    if (!cedula || vistas.has(cedula)) continue;
    vistas.add(cedula);

    // Huella.
    const primera = huellaPorCedula.get(cedula) ?? null;
    const huella = primera ? hora(primera) : null;
    const minHuella = huella ? minutosDeHora(huella) : null;
    let faltaHuella = false;
    let motivoHuella = "";
    let razonHuella = "";
    if (!huella) {
      faltaHuella = true;
      motivoHuella = "sin huella";
    } else if (limHuella !== null && minHuella !== null && minHuella > limHuella) {
      faltaHuella = true;
      motivoHuella = "huella " + huella + " (límite " + reglas.horaLimiteHuella + ")";
    } else {
      razonHuella = "pasó la huella a las " + huella;
    }

    // Despacho.
    const despacho = f.primerViajeHora ? f.primerViajeHora.slice(0, 5) : null;
    const minDespacho = minutosDeDespacho(f.primerViajeHora);
    let faltaDespacho = false;
    let motivoDespacho = "";
    let razonDespacho = "";
    if (despacho) {
      if (limDespacho !== null && minDespacho !== null && minDespacho > limDespacho) {
        faltaDespacho = true;
        motivoDespacho = "primer despacho " + despacho + " (límite " + reglas.horaLimiteDespacho + ")";
      } else {
        razonDespacho = "salió a rodar a las " + despacho;
      }
    } else if (f.porSalir) {
      if (reglas.incluirPorSalir) {
        faltaDespacho = true;
        motivoDespacho = "viaje asignado que aún no sale";
      } else {
        razonDespacho = "tiene viaje por salir";
      }
    } else {
      faltaDespacho = true;
      motivoDespacho = "sin despacho";
    }

    // Combinación.
    const partes: { falta: boolean; motivo: string; razon: string }[] = [];
    if (reglas.criterio.sinHuella) partes.push({ falta: faltaHuella, motivo: motivoHuella, razon: razonHuella });
    if (reglas.criterio.sinDespacho) partes.push({ falta: faltaDespacho, motivo: motivoDespacho, razon: razonDespacho });
    const cumple =
      reglas.criterio.combinar === "y" ? partes.every((p) => p.falta) : partes.some((p) => p.falta);

    if (!cumple) {
      noCumple.set(cedula, partes.filter((p) => !p.falta).map((p) => p.razon).join(" y "));
      continue;
    }

    const ultimo = ultimoDiaRodado.get(cedula) ?? null;
    const diasSinRodar = ultimo ? Math.max(0, diasEntreIso(ultimo, fecha)) : null;
    const base = { cedula, nombre: f.nombre, codigo: f.codigo, origen: f.origen };

    // Filtros.
    let razon: string | null = null;
    if (!reglas.origenes[f.origen]) {
      razon = "origen apagado: " + ETIQUETA_ORIGEN[f.origen].toLowerCase();
    } else if (diasSinRodar === null && !reglas.incluirNuncaRodo) {
      razon = "no ha rodado en la ventana del histórico";
    } else if (
      diasSinRodar !== null &&
      reglas.maxDiasSinRodar !== null &&
      diasSinRodar > reglas.maxDiasSinRodar
    ) {
      razon = "lleva " + diasSinRodar + " días sin rodar (máximo " + reglas.maxDiasSinRodar + ")";
    }
    if (razon) {
      excluidos.push({ ...base, razon });
      continue;
    }

    candidatos.push({
      ...base,
      bus: f.bus,
      huella,
      primerDespacho: despacho,
      porSalir: f.porSalir,
      diasSinRodar,
      motivos: partes.filter((p) => p.falta).map((p) => p.motivo),
      tambienActual: actual.has(cedula),
      yaTienePendiente: pendientes.has(cedula),
    });
  }

  const enPrueba = new Set(candidatos.map((c) => c.cedula));
  const excluidosPor = new Map(excluidos.map((e) => [e.cedula, e.razon]));
  const soloActual: ExcluidoPrueba[] = [];
  for (const f of resumen.sinDespacho) {
    const cedula = f.cedula.trim();
    if (!actual.has(cedula) || enPrueba.has(cedula)) continue;
    soloActual.push({
      cedula,
      nombre: f.nombre,
      codigo: f.codigo,
      origen: f.origen,
      razon: excluidosPor.get(cedula) ?? (noCumple.get(cedula) || "no cumple el criterio"),
    });
  }

  candidatos.sort(porNombre);
  excluidos.sort(porNombre);
  soloActual.sort(porNombre);
  const coinciden = candidatos.filter((c) => c.tambienActual).length;
  return {
    fecha,
    tipoDia,
    diaActivo: regDia.activo,
    horaCorte: regDia.hora,
    candidatos,
    excluidos,
    soloActual,
    noCumplen: [...noCumple.keys()].sort(),
    conteos: {
      candidatos: candidatos.length,
      coinciden,
      soloPrueba: candidatos.length - coinciden,
      soloActual: soloActual.length,
    },
  };
}
