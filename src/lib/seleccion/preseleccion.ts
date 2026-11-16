/**
 * Semáforo de preselección (requerimientos B1 y B2). Funciones puras: reciben
 * los datos del aspirante y las reglas configuradas y deciden, requisito por
 * requisito, verde, rojo o pendiente. No descartan a nadie: un rojo solo
 * propone el cierre, que confirma una persona.
 */
import {
  CAUSAS_PRESELECCION,
  type ColorSemaforo,
  type RequisitoPreseleccion,
  type ResultadoPreseleccionGuardado,
  type ResultadoRequisito,
} from "@/lib/contratacion/constants";
import type { ResumenRunt } from "@/lib/verificacion/proveedores";

export interface ReglasPreseleccion {
  edadMinima: number;
  edadMaxima: number;
  ciudades: string[];
  licencias: string[];
  simitTope: number;
  experienciaMeses: number;
  /** Meses de vigencia que le deben quedar a la licencia según el RUNT; 0 = basta con que no esté vencida. */
  licenciaVigenciaMinimaMeses: number;
}

/** Valores de la reunión con GH (2026-11-10); se cambian en seleccion_ajustes. */
export const REGLAS_POR_DEFECTO: ReglasPreseleccion = {
  edadMinima: 20,
  edadMaxima: 57,
  ciudades: ["Barranquilla", "Soledad"],
  licencias: ["C2", "C3"],
  simitTope: 3_000_000,
  experienciaMeses: 6,
  licenciaVigenciaMinimaMeses: 0,
};

export interface DatosPreseleccion {
  edad: number | null;
  ciudad: string | null;
  dispuestoTraslado: boolean | null;
  licencia: string | null;
  licenciaVerificada: boolean;
  /** Licencia según el RUNT (consulta de Croma); null si no se ha consultado. Manda sobre lo declarado. */
  licenciaRunt?: ResumenRunt | null;
  /** Estado del SIMIT tal como está en el proceso: ok | deuda | acuerdo_pago | pendiente | null. */
  simitEstado: string | null;
  /** Total de comparendos; null = no consultado. */
  simitValor: number | null;
  /** true si el valor vino de una consulta (Croma) o lo registró GH; false si lo declaró el aspirante. */
  simitVerificado: boolean;
  experienciaMeses: number | null;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

/** Minúsculas, sin tildes, sin signos: para comparar ciudades escritas a mano. */
export function normalizarTexto(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lleva «c 2», «C-2», «categoría c2» o «C2 y B1» a la lista de categorías. */
export function categoriasDeLicencia(texto: string | null): string[] {
  if (!texto) return [];
  const encontradas = texto.toUpperCase().match(/\b([ABC])\s*-?\s*([123])\b/g) ?? [];
  return [...new Set(encontradas.map((c) => c.replace(/[^ABC123]/g, "")))];
}

export function evaluarEdad(edad: number | null, r: ReglasPreseleccion): ResultadoRequisito {
  if (edad == null || !Number.isFinite(edad)) return { color: "pendiente", motivo: "Falta la edad.", origen: null };
  if (edad < r.edadMinima || edad > r.edadMaxima) {
    return { color: "rojo", motivo: `${edad} años: fuera del rango de ${r.edadMinima} a ${r.edadMaxima}.`, origen: "declarado" };
  }
  return { color: "verde", motivo: `${edad} años.`, origen: "declarado" };
}

/** Distancia de edición (Levenshtein), para tolerar faltas en nombres de ciudad. */
export function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = temp;
    }
  }
  return fila[b.length];
}

/** ¿El texto nombra esa ciudad? Tolera una o dos faltas («soleda», «barraquilla»). */
export function nombraCiudad(texto: string, ciudad: string): boolean {
  const t = normalizarTexto(texto);
  const z = normalizarTexto(ciudad);
  if (!t || !z) return false;
  if (t.includes(z)) return true;
  const tolerancia = z.length >= 9 ? 2 : 1;
  return t.split(" ").some((palabra) => palabra.length >= 4 && distancia(palabra, z) <= tolerancia);
}

export function evaluarResidencia(ciudad: string | null, traslado: boolean | null, r: ReglasPreseleccion): ResultadoRequisito {
  const c = ciudad?.trim() ? normalizarTexto(ciudad) : "";
  const enZona = c !== "" && r.ciudades.some((z) => nombraCiudad(c, z));
  if (enZona) return { color: "verde", motivo: `Vive en ${ciudad!.trim()}.`, origen: "declarado" };
  if (traslado === true) {
    return { color: "verde", motivo: `${c ? `Vive en ${ciudad!.trim()}` : "Ciudad sin dato"}; dispuesto a trasladarse.`, origen: "declarado" };
  }
  if (c && traslado === false) {
    return { color: "rojo", motivo: `Vive en ${ciudad!.trim()} y no está dispuesto a trasladarse.`, origen: "declarado" };
  }
  if (c) return { color: "pendiente", motivo: `Vive en ${ciudad!.trim()}: falta saber si se traslada.`, origen: "declarado" };
  return { color: "pendiente", motivo: "Falta la ciudad donde vive.", origen: null };
}

/** «2025-03-10» → «10 de marzo de 2025». */
function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/** Suma meses a una fecha AAAA-MM-DD (sin zona horaria). */
function sumarMeses(iso: string, meses: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + meses);
  return d.toISOString().slice(0, 10);
}

/**
 * Licencia según el RUNT: rojo si no tiene licencia, si no tiene ninguna de
 * las categorías aceptadas, si la que tiene está cancelada o suspendida, o si
 * está vencida (o le quedan menos meses de los pedidos). La vigencia ya no se
 * le pregunta al aspirante: sale de aquí.
 */
export function evaluarLicenciaRunt(runt: ResumenRunt, r: ReglasPreseleccion, ahora: Date = new Date()): ResultadoRequisito {
  const origen = "verificado" as const;
  if (runt.registrado === false) {
    return { color: "pendiente", motivo: "La cédula no aparece en el RUNT: hay que confirmar el número con el aspirante.", origen };
  }
  if (!runt.tieneLicencia || runt.categorias.length === 0) {
    return { color: "rojo", motivo: "No tiene licencia de conducción en el RUNT.", origen };
  }
  const aceptadas = runt.categorias.filter((c) => r.licencias.includes(c.categoria));
  if (aceptadas.length === 0) {
    const tiene = [...new Set(runt.categorias.map((c) => c.categoria))].join(", ");
    return { color: "rojo", motivo: `En el RUNT tiene licencia ${tiene}: se pide ${r.licencias.join(" o ")}.`, origen };
  }
  const activas = aceptadas.filter((c) => c.activa);
  if (activas.length === 0) {
    return { color: "rojo", motivo: `La licencia ${aceptadas[0].categoria} aparece cancelada, suspendida o retenida en el RUNT.`, origen };
  }
  // La que más dura; sin fecha cuenta como vigente (el RUNT no siempre la trae).
  const sinFecha = activas.find((c) => !c.vence);
  if (sinFecha) return { color: "verde", motivo: `Licencia ${sinFecha.categoria} en el RUNT (sin fecha de vencimiento).`, origen };
  const mejor = [...activas].sort((a, b) => b.vence!.localeCompare(a.vence!))[0];
  const hoy = ahora.toISOString().slice(0, 10);
  if (mejor.vence! < hoy) {
    return { color: "rojo", motivo: `Licencia ${mejor.categoria} vencida desde el ${fechaLarga(mejor.vence!)} según el RUNT.`, origen };
  }
  if (r.licenciaVigenciaMinimaMeses > 0 && mejor.vence! < sumarMeses(hoy, r.licenciaVigenciaMinimaMeses)) {
    return {
      color: "rojo",
      motivo: `Licencia ${mejor.categoria} vence el ${fechaLarga(mejor.vence!)}: se piden al menos ${r.licenciaVigenciaMinimaMeses} meses de vigencia.`,
      origen,
    };
  }
  return { color: "verde", motivo: `Licencia ${mejor.categoria} vigente hasta el ${fechaLarga(mejor.vence!)} (RUNT).`, origen };
}

/** ¿Dijo que no tiene licencia de conducción? («no tengo licencia», «ninguna», «sin pase»). En trámite no cuenta. */
export function diceQueNoTieneLicencia(texto: string | null): boolean {
  if (!texto) return false;
  const t = normalizarTexto(texto);
  if (/tramite|sacando|renovando|refrend/.test(t)) return false;
  return /\b(ninguna|no tengo|no tiene|sin licencia|sin pase|no cuento con)\b/.test(t);
}

export function evaluarLicencia(
  licencia: string | null,
  verificada: boolean,
  r: ReglasPreseleccion,
  runt: ResumenRunt | null = null,
  ahora: Date = new Date()
): ResultadoRequisito {
  if (runt) return evaluarLicenciaRunt(runt, r, ahora);
  const cats = categoriasDeLicencia(licencia);
  if (cats.length === 0 && diceQueNoTieneLicencia(licencia)) {
    return { color: "rojo", motivo: "Dice que no tiene licencia de conducción.", origen: "declarado" };
  }
  if (cats.length === 0) return { color: "pendiente", motivo: "Falta la categoría de la licencia.", origen: null };
  const origen = verificada ? "verificado" : "declarado";
  const aceptada = cats.find((c) => r.licencias.includes(c));
  if (aceptada) {
    return { color: "verde", motivo: `Licencia ${aceptada}${verificada ? ", verificada en el RUNT" : ""}.`, origen };
  }
  return { color: "rojo", motivo: `Licencia ${cats.join(", ")}: se pide ${r.licencias.join(" o ")}.`, origen };
}

export function evaluarSimit(
  estado: string | null,
  valor: number | null,
  verificado: boolean,
  r: ReglasPreseleccion
): ResultadoRequisito {
  const origen = verificado ? "verificado" : "declarado";
  // «Deuda» sin valor digitado no alcanza para decidir.
  if ((estado === "deuda" || estado === "acuerdo_pago") && !verificado && !(valor && valor > 0)) {
    return { color: "pendiente", motivo: "Tiene deuda en el SIMIT: falta el valor.", origen };
  }
  if (valor != null && Number.isFinite(valor) && (verificado || estado === "ok" || estado === "deuda" || estado === "acuerdo_pago")) {
    if (valor > r.simitTope) return { color: "rojo", motivo: `${pesos(valor)} en comparendos: supera el tope de ${pesos(r.simitTope)}.`, origen };
    return { color: "verde", motivo: valor === 0 ? "Sin comparendos." : `${pesos(valor)} en comparendos.`, origen };
  }
  if (estado === "ok") return { color: "verde", motivo: "Sin deuda en el SIMIT.", origen };
  return { color: "pendiente", motivo: "Falta consultar el SIMIT.", origen: null };
}

/** Evalúa los 4 requisitos. `ahora` se inyecta para poder probarlo. */
export function evaluarPreseleccion(
  d: DatosPreseleccion,
  r: ReglasPreseleccion = REGLAS_POR_DEFECTO,
  ahora: Date = new Date()
): ResultadoPreseleccionGuardado {
  const res: Record<RequisitoPreseleccion, ResultadoRequisito> = {
    edad: evaluarEdad(d.edad, r),
    residencia: evaluarResidencia(d.ciudad, d.dispuestoTraslado, r),
    licencia: evaluarLicencia(d.licencia, d.licenciaVerificada, r, d.licenciaRunt ?? null, ahora),
    simit: evaluarSimit(d.simitEstado, d.simitValor, d.simitVerificado, r),
  };
  const orden: RequisitoPreseleccion[] = ["edad", "residencia", "licencia", "simit"];
  const incumplido = orden.find((k) => res[k].color === "rojo") ?? null;
  const colores: ColorSemaforo[] = orden.map((k) => res[k].color);
  const global = incumplido ? "no_cumple" : colores.every((c) => c === "verde") ? "pasa" : "incompleto";
  return { ...res, global, incumplido, evaluado_at: ahora.toISOString() };
}

/** Causa de cierre propuesta para un semáforo en rojo. */
export function causaPropuesta(r: Pick<ResultadoPreseleccionGuardado, "incumplido">): string | null {
  return r.incumplido ? CAUSAS_PRESELECCION[r.incumplido] : null;
}

/** B2: la experiencia se pide pero no bloquea; con menos de lo pedido queda la carta laboral pendiente. */
export function cartaLaboralPendiente(experienciaMeses: number | null, r: ReglasPreseleccion = REGLAS_POR_DEFECTO): boolean {
  return experienciaMeses == null || experienciaMeses < r.experienciaMeses;
}

/**
 * ¿El proceso puede pasar solo de preselección a antecedentes? Solo con los 4
 * en verde, la autorización de datos aceptada y estando en preselección.
 */
export function debeAvanzarAAntecedentes(p: { estado: string; autorizacion_datos?: string | null }, r: ResultadoPreseleccionGuardado): boolean {
  return p.estado === "pendiente" && p.autorizacion_datos === "si" && r.global === "pasa";
}

/**
 * ¿Se consulta el SIMIT? Solo con autorización, cédula, sin valor consultado
 * y si lo declarado no descarta antes (para no gastar consultas).
 */
export function debeConsultarSimit(
  p: { cedula: string | null; autorizacion_datos?: string | null; simitConsultado: boolean },
  r: ResultadoPreseleccionGuardado
): boolean {
  if (p.autorizacion_datos !== "si" || !p.cedula?.trim() || p.simitConsultado) return false;
  return r.edad.color !== "rojo" && r.residencia.color !== "rojo" && r.licencia.color !== "rojo";
}

/**
 * ¿Se consulta la licencia en el RUNT? Con autorización y cédula, si no se ha
 * consultado y si lo declarado no descarta antes por edad o residencia. Si
 * declaró una categoría que no sirve igual se consulta: el RUNT puede decir otra cosa.
 */
export function debeConsultarRunt(
  p: { cedula: string | null; autorizacion_datos?: string | null; runtConsultado: boolean },
  r: ResultadoPreseleccionGuardado
): boolean {
  if (p.autorizacion_datos !== "si" || !p.cedula?.trim() || p.runtConsultado) return false;
  return r.edad.color !== "rojo" && r.residencia.color !== "rojo";
}

/** Lee las reglas desde las filas de seleccion_ajustes; lo que falte queda con el valor por defecto. */
export function reglasDesdeAjustes(filas: { clave: string; valor: unknown }[]): ReglasPreseleccion {
  const m = new Map(filas.map((f) => [f.clave, f.valor]));
  const num = (k: string, def: number) => {
    const v = Number(m.get(k));
    return Number.isFinite(v) && v > 0 ? v : def;
  };
  const lista = (k: string, def: string[]) => {
    const v = m.get(k);
    return Array.isArray(v) && v.length && v.every((x) => typeof x === "string") ? (v as string[]) : def;
  };
  const d = REGLAS_POR_DEFECTO;
  return {
    edadMinima: num("edad_minima", d.edadMinima),
    edadMaxima: num("edad_maxima", d.edadMaxima),
    ciudades: lista("ciudades", d.ciudades),
    licencias: lista("licencias", d.licencias).map((l) => l.toUpperCase()),
    simitTope: num("simit_tope", d.simitTope),
    experienciaMeses: num("experiencia_meses", d.experienciaMeses),
    // 0 es un valor válido (basta con que no esté vencida).
    licenciaVigenciaMinimaMeses: (() => {
      const v = Number(m.get("licencia_vigencia_minima_meses"));
      return Number.isFinite(v) && v >= 0 ? v : d.licenciaVigenciaMinimaMeses;
    })(),
  };
}
