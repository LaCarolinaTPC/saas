/**
 * Alertas de los indicadores de selección (24-nov-2026). PURO.
 *
 * Umbrales configurables (Selección › Tiempos y reglas › «Alertas del reporte
 * diario») para avisarle a Gestión Humana, en el reporte diario y en
 * Candidatos › Indicadores, cuándo conviene revisar los anuncios, las
 * promociones o el proceso. Un umbral en 0 (o vacío) apaga esa alerta; en las
 * de máximo, 100.
 */
import type { Indicadores } from "@/lib/comunicaciones/indicadores";
import { CAUSAS_PRESELECCION } from "@/lib/contratacion/constants";
import type { IndicadoresSeleccion } from "./indicadores";
import type { IndicadoresRespuesta } from "./indicadores-respuesta";

export interface DefinicionAlerta {
  clave: string;
  /** Clave del ajuste. */
  ajuste: string;
  etiqueta: string;
  /** «min»: alerta si queda por debajo; «max»: si pasa por encima. */
  tipo: "min" | "max";
  unidad: "numero" | "porcentaje";
  porDefecto: number;
  accion: string;
  /** Necesita los datos de ayer (solo en el reporte diario). */
  deAyer?: boolean;
}

export const DEFINICIONES_ALERTAS: DefinicionAlerta[] = [
  { clave: "aspirantes_ayer", ajuste: "alerta_aspirantes_ayer_min", etiqueta: "Aspirantes nuevos ayer", tipo: "min", unidad: "numero", porDefecto: 2, deAyer: true, accion: "Revisar que los anuncios sigan publicados y activos." },
  { clave: "aspirantes_dia", ajuste: "alerta_aspirantes_dia_min", etiqueta: "Aspirantes nuevos por día (promedio del periodo)", tipo: "min", unidad: "numero", porDefecto: 5, accion: "Llegan pocos aspirantes: reforzar o renovar los anuncios y promociones, o abrir otro canal." },
  { clave: "registro", ajuste: "alerta_registro_min", etiqueta: "Conversaciones de aspirantes que quedan como candidato", tipo: "min", unidad: "porcentaje", porDefecto: 30, accion: "Escriben pero no se registran: aclarar en el anuncio los requisitos y el salario, y revisar el inicio del chat." },
  { clave: "respuesta", ajuste: "alerta_respuesta_min", etiqueta: "Aspirantes que responden", tipo: "min", unidad: "porcentaje", porDefecto: 50, accion: "Muchos no contestan: revisar el primer mensaje y la hora en que salen los anuncios." },
  { clave: "preseleccion", ajuste: "alerta_preseleccion_min", etiqueta: "Pasan la preselección (llegan a «Citado»)", tipo: "min", unidad: "porcentaje", porDefecto: 25, accion: "Pocos cumplen los requisitos: el anuncio está atrayendo perfiles que no sirven; precisar edad, licencia C2/C3 y zona." },
  { clave: "cierre_perfil", ajuste: "alerta_cierre_perfil_max", etiqueta: "Cierres por no cumplir el perfil", tipo: "max", unidad: "porcentaje", porDefecto: 40, accion: "La mayoría se cierra por el perfil: segmentar mejor la promoción (zona, licencia, edad)." },
  { clave: "asistencia", ajuste: "alerta_asistencia_min", etiqueta: "Asistencia a la prueba de manejo", tipo: "min", unidad: "porcentaje", porDefecto: 60, accion: "Faltan a la prueba: reforzar recordatorios y revisar horario y lugar de la cita." },
  { clave: "contratados", ajuste: "alerta_contratados_min", etiqueta: "Contratados en el periodo", tipo: "min", unidad: "numero", porDefecto: 4, accion: "Se contrata poco: revisar en el embudo en qué etapa se pierden los aspirantes." },
  { clave: "canal_sin_contratos", ajuste: "alerta_canal_sin_contratos_min", etiqueta: "Canal con al menos estos aspirantes y ningún contratado", tipo: "min", unidad: "numero", porDefecto: 20, accion: "Ese canal trae gente pero no contratos: revisar o pausar esa promoción." },
  { clave: "mensajes_ayer", ajuste: "alerta_mensajes_ayer_min", etiqueta: "Mensajes de WhatsApp recibidos ayer", tipo: "min", unidad: "numero", porDefecto: 1, deAyer: true, accion: "No llegó ningún mensaje: revisar que WhatsApp y los anuncios estén funcionando." },
];

export type Umbrales = Record<string, number | null>;

/** Los umbrales con sus valores por defecto; 0 o vacío = apagada (100 en las de máximo). */
export function umbralesAlertas(valor: (clave: string) => unknown): Umbrales {
  const out: Umbrales = {};
  for (const d of DEFINICIONES_ALERTAS) {
    const v = valor(d.ajuste);
    const x = v === undefined ? d.porDefecto : v === null || v === "" ? NaN : Number(v);
    const apagada = !Number.isFinite(x) || (d.tipo === "min" ? x <= 0 : x >= 100);
    out[d.clave] = apagada ? null : x;
  }
  return out;
}

export interface Alerta {
  clave: string;
  titulo: string;
  valor: string;
  umbral: string;
  accion: string;
}

const pct = (n: number, base: number) => (base > 0 ? (n / base) * 100 : null);
const f = (x: number, unidad: DefinicionAlerta["unidad"]) => (unidad === "porcentaje" ? `${Math.round(x)} %` : x.toLocaleString("es-CO", { maximumFractionDigits: 1 }));
const PERFIL = new Set<string>([...Object.values(CAUSAS_PRESELECCION), "No se ajusta al perfil"]);

export interface DatosAlertas {
  /** El periodo (en el reporte, los últimos 30 días hasta ayer). */
  ind: IndicadoresSeleccion;
  chat: Indicadores | null;
  resp: IndicadoresRespuesta | null;
  /** Lo de ayer (solo el reporte diario). */
  ayer?: { ind: IndicadoresSeleccion; chat: Indicadores | null } | null;
}

/** Las alertas que se disparan con esos datos. Sin datos suficientes, no alerta. */
export function evaluarAlertas(d: DatosAlertas, u: Umbrales): Alerta[] {
  const out: Alerta[] = [];
  const def = (k: string) => DEFINICIONES_ALERTAS.find((x) => x.clave === k)!;
  const revisar = (k: string, valor: number | null, titulo?: string) => {
    const dd = def(k);
    const umbral = u[k];
    if (umbral == null || valor == null) return;
    if (dd.tipo === "min" ? valor < umbral : valor > umbral) {
      out.push({ clave: k, titulo: titulo ?? dd.etiqueta, valor: f(valor, dd.unidad), umbral: `${dd.tipo === "min" ? "mínimo" : "máximo"} ${f(umbral, dd.unidad)}`, accion: dd.accion });
    }
  };
  const { ind } = d;
  if (d.ayer) {
    revisar("aspirantes_ayer", d.ayer.ind.aspirantes);
    revisar("mensajes_ayer", d.ayer.chat ? d.ayer.chat.volumen.recibidos : null);
  }
  revisar("aspirantes_dia", ind.rango.dias > 0 ? ind.aspirantes / ind.rango.dias : null);
  // Sobre las conversaciones de aspirantes (sin las de otros temas: proveedores, empleados…);
  // sin ese dato, sobre todas las conversaciones nuevas.
  const conv = d.resp?.base ?? d.chat?.volumen.conversacionesNuevas ?? 0;
  revisar("registro", conv >= 10 ? Math.min(100, pct(ind.aspirantes, conv)!) : null);
  revisar("respuesta", d.resp && d.resp.base >= 10 ? d.resp.pctRespondieron : null);
  const citados = ind.embudo.find((x) => x.clave === "citado")?.n ?? null;
  revisar("preseleccion", ind.aspirantes >= 10 && citados != null ? pct(citados, ind.aspirantes) : null);
  const porPerfil = ind.causasCierre.filter((c) => PERFIL.has(c.clave)).reduce((s, c) => s + c.n, 0);
  revisar("cierre_perfil", ind.cerrados >= 10 ? pct(porPerfil, ind.cerrados) : null);
  const a = ind.clave.asistencia;
  revisar("asistencia", a.asistieron + a.noAsistieron >= 5 ? a.pct : null);
  revisar("contratados", ind.contratadosEnPeriodo);
  const minCanal = u.canal_sin_contratos;
  if (minCanal != null) {
    for (const c of ind.porCanal) {
      if (c.clave !== "sin_dato" && c.n >= minCanal && c.contratados === 0) {
        out.push({
          clave: `canal_sin_contratos:${c.clave}`,
          titulo: `«${c.etiqueta}»: ${c.n.toLocaleString("es-CO")} aspirantes y ningún contratado`,
          valor: `${c.n.toLocaleString("es-CO")} aspirantes`,
          umbral: `alerta desde ${minCanal.toLocaleString("es-CO")} sin contratos`,
          accion: def("canal_sin_contratos").accion,
        });
      }
    }
  }
  return out;
}
