/**
 * Seguimiento de las solicitudes que Revisión cartulina envía a cámaras: en
 * qué etapa va cada una, qué cuenta la alarma y qué exige el formulario de
 * caja para el recobro. Módulo puro: la pantalla, las acciones y las pruebas
 * usan las mismas reglas.
 *
 * Ciclo: pendiente en cámaras → resuelta → vista en cartulina → (si es
 * recobro) cobrada o no cobrada por caja. El recobro se cobra al conductor del
 * viaje, que ya viene en la solicitud.
 */

export type ResultadoCamaras = "recobro" | "normalidad_timbradas";
export type CobroEstado = "cobrado" | "no_cobrado";

/** Lo que las reglas necesitan de una solicitud. */
export interface SeguimientoSolicitud {
  estado: "pendiente" | "resuelto";
  resultado: ResultadoCamaras | null;
  vistoAt: string | null;
  cobroEstado: CobroEstado | null;
}

export type Etapa = "en_camaras" | "sin_revisar" | "cerrada" | "pendiente_caja" | "cobrado" | "no_cobrado";

export const ETAPA_LABEL: Record<Etapa, string> = {
  en_camaras: "En cámaras",
  sin_revisar: "Respuesta sin revisar",
  cerrada: "Cerrada",
  pendiente_caja: "Pendiente de caja",
  cobrado: "Cobrado",
  no_cobrado: "No cobrado",
};

/**
 * Etapa de la solicitud. Un recobro pasa a caja en cuanto cámaras lo resuelve,
 * sin esperar el visto de cartulina: el cobro no depende de que alguien lo lea.
 */
export function etapaSolicitud(s: SeguimientoSolicitud): Etapa {
  if (s.estado !== "resuelto") return "en_camaras";
  if (s.resultado === "recobro") {
    if (s.cobroEstado === "cobrado") return "cobrado";
    if (s.cobroEstado === "no_cobrado") return "no_cobrado";
    return "pendiente_caja";
  }
  return s.vistoAt ? "cerrada" : "sin_revisar";
}

/** Respuesta de cámaras que nadie en cartulina ha marcado como vista. */
export const esSinVer = (s: SeguimientoSolicitud) => s.estado === "resuelto" && !s.vistoAt;
/** Recobro que caja todavía no ha gestionado. */
export const esPorCobrar = (s: SeguimientoSolicitud) =>
  s.estado === "resuelto" && s.resultado === "recobro" && s.cobroEstado == null;

/**
 * Lo que ve el cajero sin acceso a cartulina: solo los recobros que cámaras ya
 * resolvió, que son los únicos con cobro que registrar.
 */
export const esDeCaja = (s: SeguimientoSolicitud) => s.estado === "resuelto" && s.resultado === "recobro";
export const ETAPAS_CAJA: readonly Etapa[] = ["pendiente_caja", "cobrado", "no_cobrado"];

export interface Alarma {
  sinVer: number;
  porCobrar: number;
}

export function contarAlarma(solicitudes: SeguimientoSolicitud[]): Alarma {
  let sinVer = 0;
  let porCobrar = 0;
  for (const s of solicitudes) {
    if (esSinVer(s)) sinVer++;
    if (esPorCobrar(s)) porCobrar++;
  }
  return { sinVer, porCobrar };
}

/** Texto del aviso; null si no hay nada que avisar. */
export function textoAlarma(a: Alarma): string | null {
  const partes: string[] = [];
  if (a.sinVer > 0) partes.push(`${a.sinVer} respuesta${a.sinVer === 1 ? "" : "s"} de cámaras sin revisar`);
  if (a.porCobrar > 0) partes.push(`${a.porCobrar} recobro${a.porCobrar === 1 ? "" : "s"} sin gestión de caja`);
  return partes.length ? partes.join(" · ") : null;
}

// ── Formulario de caja ───────────────────────────────────────────────────────

export const VALOR_MAXIMO_RECOBRO = 10_000_000;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CobroInput {
  estado: CobroEstado;
  valor?: number | null;
  fecha?: string | null;
  soporte?: string | null;
  motivo?: string | null;
  nota?: string | null;
}

/** Cobro ya validado y normalizado, listo para guardar. */
export interface CobroValido {
  estado: CobroEstado;
  valor: number | null;
  fecha: string | null;
  soporte: string | null;
  motivo: string | null;
  nota: string | null;
}

const limpio = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/**
 * Valida el formulario de caja. Cobrado exige valor en pesos enteros, fecha
 * (entre el día del viaje y hoy) y recibo o soporte; no cobrado exige motivo.
 * Lo que no aplica al estado elegido se descarta, para no guardar un valor
 * viejo en un "no cobrado".
 */
export function validarCobro(
  input: CobroInput,
  ctx: { fechaViaje: string; hoy: string },
): { ok: true; cobro: CobroValido } | { ok: false; error: string } {
  const nota = limpio(input.nota);
  if (nota && nota.length > 500) return { ok: false, error: "La nota no puede pasar de 500 caracteres." };

  if (input.estado === "no_cobrado") {
    const motivo = limpio(input.motivo);
    if (!motivo) return { ok: false, error: "Indique por qué no se cobró." };
    if (motivo.length > 500) return { ok: false, error: "El motivo no puede pasar de 500 caracteres." };
    return { ok: true, cobro: { estado: "no_cobrado", valor: null, fecha: null, soporte: null, motivo, nota } };
  }
  if (input.estado !== "cobrado") return { ok: false, error: "Indique si se cobró o no." };

  const valor = input.valor;
  if (valor == null || !Number.isFinite(valor) || !Number.isInteger(valor) || valor <= 0) {
    return { ok: false, error: "Escriba el valor cobrado en pesos, sin decimales." };
  }
  if (valor > VALOR_MAXIMO_RECOBRO) {
    return { ok: false, error: `El valor no puede pasar de ${VALOR_MAXIMO_RECOBRO.toLocaleString("es-CO")}.` };
  }
  const fecha = limpio(input.fecha);
  if (!fecha || !FECHA_RE.test(fecha)) return { ok: false, error: "Indique la fecha del cobro." };
  if (fecha < ctx.fechaViaje) return { ok: false, error: "La fecha del cobro no puede ser anterior al viaje." };
  if (fecha > ctx.hoy) return { ok: false, error: "La fecha del cobro no puede ser futura." };
  const soporte = limpio(input.soporte);
  if (!soporte) return { ok: false, error: "Escriba el número de recibo o soporte." };
  if (soporte.length > 100) return { ok: false, error: "El soporte no puede pasar de 100 caracteres." };
  return { ok: true, cobro: { estado: "cobrado", valor, fecha, soporte, motivo: null, nota } };
}
