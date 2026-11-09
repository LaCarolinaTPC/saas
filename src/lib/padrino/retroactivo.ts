/**
 * Publicación retroactiva de una versión de la política (funciones puras).
 *
 * Cuando una versión se publica con una fecha pasada, los referidos que
 * ingresaron desde esa fecha pasan a ella: se recalcula su esquema y se
 * rehacen sus hitos. Lo ya aprobado o pagado con la versión anterior se
 * respeta y se descuenta de lo que manda la nueva; si la nueva paga más, la
 * diferencia queda en hitos (o en un hito de ajuste) y si paga menos, la
 * diferencia que no alcance a descontarse queda como sobrepago para revisión
 * manual (no hay hitos negativos).
 *
 * La simulación (`simularRetroactivo`) y la publicación (`aplicarRetroactivo`)
 * usan estas mismas funciones: lo que se simula es lo que se aplica.
 */
import { estadoReferidoPorHitos, proyectarHitos, type HechosPermanencia, type OpcionesHito, type ResultadoProyeccion } from "./hitos";
import { ESTADOS_DECISION, type HitoBeneficiario } from "./reglas";

export type Beneficiario = "padrino" | "referido";
const BENEFICIARIOS: Beneficiario[] = ["padrino", "referido"];

// ── Qué le pasa a cada referido ─────────────────────────────────────────────

/** Ya contratados (tienen o tuvieron hitos). */
const CONTRATADOS = new Set(["contratado", "en_seguimiento", "completado", "terminado"]);
/** Todavía no contratados y abiertos: se revalidan con la versión nueva. */
const POR_CONTRATAR = new Set([...ESTADOS_DECISION, "elegible"]);

export type AccionRetroactiva = "rehacer" | "revalidar" | "sin_cambio";

/**
 * - Contratado que ingresó desde `fecha`: pasa a la versión nueva y se
 *   rehacen sus hitos.
 * - Abierto sin contratar: se revalida con la versión nueva (ingresará hoy o
 *   después, así que al contratar ya le corresponde).
 * - Los demás (anulados, cerrados, contratados antes de la fecha): sin cambio.
 */
export function accionRetroactiva(r: { estado: string; anulado: boolean; fechaIngreso: string | null }, fecha: string): AccionRetroactiva {
  if (r.anulado) return "sin_cambio";
  if (CONTRATADOS.has(r.estado)) return r.fechaIngreso && r.fechaIngreso >= fecha ? "rehacer" : "sin_cambio";
  if (POR_CONTRATAR.has(r.estado)) return "revalidar";
  return "sin_cambio";
}

// ── Conciliación de hitos ───────────────────────────────────────────────────

export interface HitoExistente {
  id: string;
  numero: number;
  beneficiario: Beneficiario;
  valor: number;
  estado: string;
  fecha_causacion: string;
  descripcion: string;
}

/** Hito de la versión nueva tal como se guarda: con su valor neto de lo ya pagado. */
export interface HitoNuevo {
  numero: number;
  meses: number;
  descripcion: string;
  beneficiario: Beneficiario;
  valor: number;
  requiere_desempeno: boolean;
  fechaCausacion: string;
  /** Si es un ajuste, el número del hito de la versión nueva al que corresponde. */
  ajusteDe: number | null;
}

export interface Conciliacion {
  /** Aprobados, pagados y rechazados: no se tocan. */
  conservar: HitoExistente[];
  /** Filas reemplazables que se reescriben con un hito de la versión nueva (misma clave). */
  actualizar: (HitoNuevo & { id: string })[];
  /** Hitos nuevos sin fila que reutilizar. */
  insertar: HitoNuevo[];
  /** Filas reemplazables que la versión nueva no tiene: quedan canceladas. */
  cancelar: string[];
  /** Lo aprobado o pagado de más con la versión anterior, por beneficiario. */
  sobrepago: Record<Beneficiario, number>;
  notas: string[];
}

/** No se tocan: ya se pagaron o aprobaron, o alguien los rechazó. */
const FIRMES = new Set(["aprobado", "pagado"]);
const conservado = (estado: string) => FIRMES.has(estado) || estado === "rechazado";
const clave = (numero: number, b: Beneficiario) => `${numero}|${b}`;

/**
 * Concilia los hitos que tiene el referido con los de la versión nueva.
 *
 * Por beneficiario, lo ya aprobado o pagado es un saldo a favor que cubre los
 * hitos nuevos en orden: un hito cubierto no se crea; uno cubierto en parte
 * queda por la diferencia. Si la clave (número, beneficiario) del hito nuevo
 * la ocupa una fila conservada, va como hito de ajuste con otro número y la
 * misma fecha. Un hito rechazado se respeta: su par en la versión nueva no se
 * crea. Las filas pendientes, por aprobar, no causadas o canceladas se
 * reescriben con la versión nueva, y las que sobran se cancelan.
 */
export function conciliarHitos(existentes: HitoExistente[], nuevos: HitoBeneficiario[], version: string): Conciliacion {
  const conservar = existentes.filter((e) => conservado(e.estado));
  const reemplazables = new Map(existentes.filter((e) => !conservado(e.estado)).map((e) => [clave(e.numero, e.beneficiario), e]));
  const ocupadas = new Map(conservar.map((e) => [clave(e.numero, e.beneficiario), e]));
  let siguiente = Math.max(0, ...existentes.map((e) => e.numero), ...nuevos.map((n) => n.numero)) + 1;

  const actualizar: Conciliacion["actualizar"] = [];
  const insertar: HitoNuevo[] = [];
  const usadas = new Set<string>();
  const sobrepago: Record<Beneficiario, number> = { padrino: 0, referido: 0 };
  const notas: string[] = [];

  for (const b of BENEFICIARIOS) {
    let saldo = conservar.filter((e) => e.beneficiario === b && FIRMES.has(e.estado)).reduce((s, e) => s + e.valor, 0);
    for (const h of nuevos.filter((n) => n.beneficiario === b).sort((x, y) => x.numero - y.numero)) {
      const ocupada = ocupadas.get(clave(h.numero, b));
      if (ocupada?.estado === "rechazado") {
        notas.push(`Hito ${h.numero} (${b}): se rechazó con la versión anterior; se mantiene el rechazo.`);
        continue;
      }
      const cubre = Math.min(saldo, h.valor);
      saldo -= cubre;
      const resto = h.valor - cubre;
      if (resto <= 0) {
        notas.push(`Hito ${h.numero} (${b}): ya cubierto por lo aprobado o pagado con la versión anterior.`);
        continue;
      }
      const fila: HitoNuevo = {
        numero: h.numero,
        meses: h.meses,
        descripcion: cubre ? `${h.descripcion} (menos lo ya pagado)` : h.descripcion,
        beneficiario: b,
        valor: resto,
        requiere_desempeno: h.requiere_desempeno,
        fechaCausacion: h.fechaCausacion!,
        ajusteDe: null,
      };
      if (ocupada) {
        const descripcion = `Ajuste ${version}: ${h.descripcion}`;
        // Si ya se aplicó antes, el ajuste tiene su fila: se reescribe (idempotente).
        const previo = [...reemplazables.entries()].find(([k, e]) => !usadas.has(k) && e.beneficiario === b && e.descripcion === descripcion);
        // Si no, un número mayor que todos los existentes: nunca choca con una fila.
        const numero = previo ? previo[1].numero : siguiente++;
        if (previo) {
          actualizar.push({ ...fila, numero, descripcion, ajusteDe: h.numero, id: previo[1].id });
          usadas.add(previo[0]);
        } else insertar.push({ ...fila, numero, descripcion, ajusteDe: h.numero });
        notas.push(`Hito ${h.numero} (${b}): ya se había aprobado o pagado ${ocupada.valor.toLocaleString("es-CO")}; ajuste de ${resto.toLocaleString("es-CO")} (hito ${numero}).`);
        continue;
      }
      const reusar = usadas.has(clave(h.numero, b)) ? undefined : reemplazables.get(clave(h.numero, b));
      if (reusar) {
        actualizar.push({ ...fila, id: reusar.id });
        usadas.add(clave(h.numero, b));
      } else insertar.push(fila);
    }
    if (saldo > 0) {
      sobrepago[b] = saldo;
      notas.push(`Se aprobó o pagó ${saldo.toLocaleString("es-CO")} de más al ${b} con la versión anterior: revíselo a mano.`);
    }
  }
  const cancelar = [...reemplazables.entries()].filter(([k, e]) => !usadas.has(k) && e.estado !== "cancelado").map(([, e]) => e.id);
  return { conservar, actualizar, insertar, cancelar, sobrepago, notas };
}

// ── Proyección y totales ────────────────────────────────────────────────────

export interface HitoVista {
  numero: number;
  beneficiario: Beneficiario;
  valor: number;
  /** Estado real (filas conservadas o actuales) o proyectado a hoy (nuevas). */
  estado: string;
  fecha: string;
  descripcion: string;
  motivo: string | null;
  /** Fila que se conserva de la versión anterior. */
  conservado?: boolean;
}

/** Estado que tendría el hito si se evaluara hoy. */
const ESTADO_PROYECTADO: Record<ResultadoProyeccion, string> = {
  se_paga: "por_aprobar",
  no_causado: "no_causado",
  cancelado: "cancelado",
  pendiente: "pendiente",
};

/** Los hitos con que quedaría el referido: los conservados y los nuevos, proyectados a `hoy`. */
export function hitosResultantes(
  c: Conciliacion,
  fechaIngreso: string,
  hechos: HechosPermanencia,
  opciones: Omit<OpcionesHito, "beneficiario">,
  hoy: string
): HitoVista[] {
  const nuevos = [...c.actualizar, ...c.insertar];
  const proyectados = proyectarHitos(nuevos, fechaIngreso, hechos, opciones, hoy);
  return [
    ...c.conservar.map((e) => ({ numero: e.numero, beneficiario: e.beneficiario, valor: e.valor, estado: e.estado, fecha: e.fecha_causacion, descripcion: e.descripcion, motivo: null, conservado: true })),
    ...proyectados.map((h) => ({ numero: h.numero, beneficiario: h.beneficiario, valor: h.valor, estado: ESTADO_PROYECTADO[h.resultado], fecha: h.fechaCausacion, descripcion: h.descripcion, motivo: h.motivo })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero || a.beneficiario.localeCompare(b.beneficiario));
}

/**
 * Los hitos que el referido tiene hoy, con los pendientes ya vencidos
 * proyectados a `hoy` con su versión actual: así la comparación con la nueva
 * no depende de si la evaluación diaria ya corrió.
 */
export function hitosActualesProyectados(
  existentes: HitoExistente[],
  fechaIngreso: string,
  hechos: HechosPermanencia,
  opciones: Omit<OpcionesHito, "beneficiario">,
  hoy: string
): HitoVista[] {
  const pendientes = existentes.filter((e) => e.estado === "pendiente").map((e) => ({ ...e, fechaCausacion: e.fecha_causacion }));
  const proyectados = new Map(proyectarHitos(pendientes, fechaIngreso, hechos, opciones, hoy).map((h) => [h.id, h]));
  return existentes
    .map((e) => {
      const p = proyectados.get(e.id);
      return { numero: e.numero, beneficiario: e.beneficiario, valor: e.valor, estado: p ? ESTADO_PROYECTADO[p.resultado] : e.estado, fecha: e.fecha_causacion, descripcion: e.descripcion, motivo: p?.motivo ?? null };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero || a.beneficiario.localeCompare(b.beneficiario));
}

export interface TotalesHitos {
  /** Lo que se pagaría si todo lo que sigue abierto se causa: sin no causados, cancelados ni rechazados. */
  comprometido: number;
  /** Ya causado: por aprobar, aprobado o pagado. */
  causado: number;
  pagado: number;
  padrino: number;
  referido: number;
}

const FUERA = new Set(["no_causado", "cancelado", "rechazado"]);
const CAUSADO = new Set(["por_aprobar", "aprobado", "pagado"]);

export function totalesHitos(hitos: { valor: number; estado: string; beneficiario: Beneficiario }[]): TotalesHitos {
  const vivos = hitos.filter((h) => !FUERA.has(h.estado));
  const suma = (xs: { valor: number }[]) => xs.reduce((s, h) => s + h.valor, 0);
  return {
    comprometido: suma(vivos),
    causado: suma(hitos.filter((h) => CAUSADO.has(h.estado))),
    pagado: suma(hitos.filter((h) => h.estado === "pagado")),
    padrino: suma(vivos.filter((h) => h.beneficiario === "padrino")),
    referido: suma(vivos.filter((h) => h.beneficiario === "referido")),
  };
}

/**
 * Estado del referido después de rehacer sus hitos: sin hitos se queda en
 * Contratado (sin bonificación o bloqueado, con el motivo a la vista); con
 * hitos, el que digan ellos.
 */
export function estadoTrasRehacer(hitos: { estado: string }[]): "contratado" | "en_seguimiento" | "completado" | "terminado" {
  return hitos.length ? estadoReferidoPorHitos(hitos) : "contratado";
}

// ── Vigencia retroactiva ────────────────────────────────────────────────────

/** Una versión reemplazada por otra publicada desde su misma fecha: nunca rigió. */
export const esReemplazada = (v: { vigente_desde: string | null; vigente_hasta: string | null }) =>
  Boolean(v.vigente_desde && v.vigente_hasta && v.vigente_hasta < v.vigente_desde);

// ── Simulación (lo que devuelve el servidor a la pantalla) ──────────────────

export interface FilaRetroactiva {
  referidoId: string;
  referido: { nombre: string | null; cedula: string };
  padrino: { nombre: string | null; cedula: string };
  accion: AccionRetroactiva;
  estado: string;
  estadoNuevo: string;
  fechaIngreso: string | null;
  versionActual: string | null;
  esquemaActual: string;
  esquemaNuevo: string;
  /** Por qué ese esquema (tipo de ingreso, reintegro, sin bonificación). */
  esquemaDato: string;
  sinBonificacion: string | null;
  /** Requisitos que no se cumplen y bloquean: los hitos (contratado) o la elegibilidad (sin contratar). */
  bloqueantes: string[];
  /** Los que no bloquean pero piden observación con la versión nueva. */
  observaciones: string[];
  hitosActuales: HitoVista[];
  hitosNuevos: HitoVista[];
  actual: TotalesHitos;
  nuevo: TotalesHitos;
  /** Sin contratar: lo que pagaría su esquema completo con cada versión. */
  potencial: { actual: number; nuevo: number } | null;
  /** Hitos de ajuste (lo que la nueva paga de más por hitos ya pagados). */
  ajustes: number;
  sobrepago: number;
  notas: string[];
  /** Si no se pudo calcular (p. ej. el proceso ya no existe). */
  error: string | null;
}

export interface SimulacionRetroactiva {
  version: string;
  fecha: string;
  hoy: string;
  /** Versión que queda reemplazada (empieza el mismo día), si alguna. */
  reemplaza: string | null;
  /** Versión que se cierra el día anterior, si alguna. */
  cierra: { version: string; hasta: string } | null;
  filas: FilaRetroactiva[];
  /** Referidos que no cambian (ingresaron antes de la fecha, anulados o cerrados). */
  sinCambio: number;
}

export function resumenRetroactivo(filas: FilaRetroactiva[]) {
  const sumar = (k: "actual" | "nuevo") =>
    filas.reduce(
      (s, f) => ({
        comprometido: s.comprometido + f[k].comprometido,
        causado: s.causado + f[k].causado,
        pagado: s.pagado + f[k].pagado,
        padrino: s.padrino + f[k].padrino,
        referido: s.referido + f[k].referido,
      }),
      { comprometido: 0, causado: 0, pagado: 0, padrino: 0, referido: 0 } as TotalesHitos
    );
  return {
    rehacer: filas.filter((f) => f.accion === "rehacer").length,
    revalidar: filas.filter((f) => f.accion === "revalidar").length,
    cambianEsquema: filas.filter((f) => f.esquemaActual !== f.esquemaNuevo || f.sinBonificacion).length,
    actual: sumar("actual"),
    nuevo: sumar("nuevo"),
    potencial: filas.reduce((s, f) => ({ actual: s.actual + (f.potencial?.actual ?? 0), nuevo: s.nuevo + (f.potencial?.nuevo ?? 0) }), { actual: 0, nuevo: 0 }),
    ajustes: filas.reduce((s, f) => s + f.ajustes, 0),
    sobrepago: filas.reduce((s, f) => s + f.sobrepago, 0),
    conError: filas.filter((f) => f.error).length,
  };
}
