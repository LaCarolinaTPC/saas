/**
 * Reporte diario de selección por correo para Gestión Humana (24-nov-2026). PURO.
 *
 * Usa exactamente los mismos cálculos que Candidatos › Indicadores
 * (IndicadoresSeleccion, los del chat y los de respuesta), con los mismos
 * nombres, para que el correo y la pantalla digan lo mismo: lo de ayer y los
 * últimos 30 días (hasta ayer). El enlace abre la pantalla con ese periodo.
 */
import type { Indicadores } from "@/lib/comunicaciones/indicadores";
import type { IndicadoresSeleccion } from "./indicadores";
import type { IndicadoresRespuesta } from "./indicadores-respuesta";
import { evaluarAlertas, type Alerta, type Umbrales } from "./alertas-indicadores";

export interface PeriodoReporte {
  ind: IndicadoresSeleccion;
  chat: Indicadores | null;
  resp: IndicadoresRespuesta | null;
}

export interface DatosReporte {
  /** Ayer (AAAA-MM-DD, Bogotá). */
  dia: string;
  ayer: PeriodoReporte;
  /** Últimos 30 días hasta ayer. */
  mes: PeriodoReporte;
  /** Dirección de la aplicación, para los enlaces. */
  url: string;
  /** Umbrales de las alertas (Tiempos y reglas); sin ellos, no hay alertas. */
  umbrales?: Umbrales;
  /** Los que están hoy en «Listo para contratar» (25-nov-2026): esperan la revisión y el visto bueno. */
  listos?: ListoParaContratar[];
}

export interface ListoParaContratar {
  nombre: string;
  cedula: string;
  /** Días que lleva en la etapa. */
  dias: number;
  /** Ya tiene el visto bueno: solo falta pasarlo a «Contratado». */
  conVistoBueno: boolean;
}

const diasEnTexto = (n: number) => (n <= 0 ? "desde hoy" : n === 1 ? "hace 1 día" : `hace ${n} días`);

/** Las alertas del reporte: lo de ayer y los últimos 30 días contra los umbrales. */
export function alertasDelReporte(d: DatosReporte): Alerta[] {
  if (!d.umbrales) return [];
  return evaluarAlertas({ ind: d.mes.ind, chat: d.mes.chat, resp: d.mes.resp, ayer: { ind: d.ayer.ind, chat: d.ayer.chat } }, d.umbrales);
}

/** El bloque de alertas (también lo usa Candidatos › Indicadores con el mismo estilo). */
export function htmlAlertas(alertas: Alerta[]): string {
  if (!alertas.length) {
    return `<div style="border:1px solid #A7F3D0;background:#ECFDF5;border-radius:14px;padding:12px 16px;margin:0 0 14px;font-size:13px;color:#065F46">Sin alertas: todos los indicadores están dentro de los umbrales.</div>`;
  }
  const filas = alertas
    .map(
      (a) => `<tr><td style="padding:8px 0;border-top:1px solid #FECACA;vertical-align:top">
  <div style="font-size:13px;font-weight:600;color:#991B1B">${esc(a.titulo)}: ${esc(a.valor)} <span style="font-weight:400;color:#B91C1C">(${esc(a.umbral)})</span></div>
  <div style="font-size:12px;color:#7F1D1D;margin-top:2px">${esc(a.accion)}</div>
</td></tr>`
    )
    .join("");
  return `<div style="border:1px solid #FECACA;background:#FEF2F2;border-radius:14px;padding:12px 16px;margin:0 0 14px">
  <div style="font-size:15px;font-weight:700;color:#991B1B">⚠ ${alertas.length} ${alertas.length === 1 ? "alerta" : "alertas"} para revisar</div>
  <div style="font-size:12px;color:#B91C1C;margin:2px 0 6px">Indicadores fuera de los umbrales de Selección › Tiempos y reglas › «Alertas del reporte diario».</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${filas}</table>
</div>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-CO"));
const pct = (n: number, base: number) => (base > 0 ? `${Math.round((n / base) * 100)} %` : "—");

export function fechaLargaReporte(dia: string): string {
  return new Date(`${dia}T12:00:00-05:00`).toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** «25 oct. 2026». */
export function fechaCortaReporte(dia: string): string {
  return new Date(`${dia}T12:00:00-05:00`).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });
}

/** Enlace a Indicadores con el periodo del bloque. */
export function enlaceIndicadores(url: string, desde: string, hasta: string): string {
  return `${url.replace(/\/$/, "")}/candidatos/indicadores?desde=${desde}&hasta=${hasta}`;
}

// ── Piezas del HTML (estilos en línea: los programas de correo no leen CSS) ──

const C = { texto: "#0F172A", gris: "#64748B", borde: "#E2E8F0", fondo: "#F8FAFC", primario: "#4F46E5", alerta: "#DC2626", ok: "#059669" };

function cifras(items: { etiqueta: string; valor: string; nota?: string }[]): string {
  const celdas = items
    .map(
      (i) => `<td style="padding:4px;width:${Math.floor(100 / items.length)}%;vertical-align:top">
  <div style="border:1px solid ${C.borde};background:${C.fondo};border-radius:10px;padding:10px 12px">
    <div style="font-size:12px;color:${C.gris}">${esc(i.etiqueta)}</div>
    <div style="font-size:22px;font-weight:700;color:${C.texto};margin-top:4px">${esc(i.valor)}</div>
    ${i.nota ? `<div style="font-size:11px;color:${C.gris};margin-top:4px">${esc(i.nota)}</div>` : ""}
  </div></td>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr>${celdas}</tr></table>`;
}

function barras(filas: { etiqueta: string; n: number; detalle?: string }[], total: number, color: string = C.primario): string {
  if (!filas.length) return `<p style="font-size:13px;color:${C.gris};margin:4px 0">— Sin datos en el periodo.</p>`;
  const max = Math.max(total, ...filas.map((f) => f.n), 1);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px">${filas
    .map(
      (f) => `<tr>
  <td style="padding:4px 8px 4px 0;color:${C.texto};width:42%">${esc(f.etiqueta)}${f.detalle ? `<div style="font-size:11px;color:${C.gris}">${esc(f.detalle)}</div>` : ""}</td>
  <td style="padding:4px 0;width:40%"><div style="background:#EEF2FF;border-radius:4px;height:12px"><div style="background:${color};border-radius:4px;height:12px;width:${Math.max(f.n > 0 ? 2 : 0, Math.round((f.n / max) * 100))}%"></div></div></td>
  <td style="padding:4px 0 4px 8px;color:${C.texto};white-space:nowrap;text-align:right"><b>${fmt(f.n)}</b> <span style="color:${C.gris}">${total > 0 ? pct(f.n, total) : ""}</span></td>
</tr>`
    )
    .join("")}</table>`;
}

function seccion(titulo: string, ayuda: string | null, cuerpo: string): string {
  return `<div style="border:1px solid ${C.borde};border-radius:14px;padding:14px 16px;margin:0 0 14px">
  <div style="font-size:15px;font-weight:600;color:${C.texto}">${esc(titulo)}</div>
  ${ayuda ? `<div style="font-size:12px;color:${C.gris};margin-top:2px">${esc(ayuda)}</div>` : ""}
  <div style="margin-top:10px">${cuerpo}</div>
</div>`;
}

const sub = (t: string) => `<div style="font-size:13px;font-weight:600;color:${C.gris};margin:12px 0 6px">${esc(t)}</div>`;

// ── El reporte ───────────────────────────────────────────────────────────────

export function armarReporteDiario(d: DatosReporte, o: { desarrollo: boolean }): { asunto: string; texto: string; html: string } {
  const { ayer, mes } = d;
  const a = ayer.ind;
  const m = mes.ind;
  const v = ayer.chat?.volumen;
  const vm = mes.chat?.volumen;
  const fecha = fechaLargaReporte(d.dia);
  const prefijo = o.desarrollo ? "[PRUEBAS] " : "";
  const alertas = alertasDelReporte(d);
  const asunto = `${prefijo}${alertas.length ? `⚠ ${alertas.length} ${alertas.length === 1 ? "alerta" : "alertas"} · ` : ""}Selección: reporte del ${fecha}`;
  const enlaceAyer = enlaceIndicadores(d.url, a.rango.desde, a.rango.hasta);
  const enlaceMes = enlaceIndicadores(d.url, m.rango.desde, m.rango.hasta);

  const bloqueAyer = seccion(
    `Ayer, ${fecha}`,
    null,
    cifras([
      { etiqueta: "Aspirantes nuevos", valor: fmt(a.aspirantes), nota: "Procesos creados" },
      { etiqueta: "Contratados", valor: fmt(a.contratadosEnPeriodo) },
      { etiqueta: "Mensajes recibidos", valor: fmt(v?.recibidos), nota: v ? `${fmt(v.conversacionesNuevas)} conversaciones nuevas` : undefined },
      { etiqueta: "Mensajes enviados", valor: fmt(v?.enviados), nota: v ? `Asistente ${fmt(v.enviadosPor.asistente)} · GH ${fmt(v.enviadosPor.gestionHumana)}` : undefined },
    ])
  );

  const listos = d.listos ?? [];
  const enlaceListos = `${d.url}/candidatos?estado=listo_contratar`;
  const bloqueListos = listos.length
    ? seccion(
        `Listos para contratar · ${listos.length}`,
        "Cumplen todo para contratar. Falta revisarlos, dar el visto bueno y pasarlos a «Contratado».",
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px">${listos
          .map(
            (l) => `<tr>
  <td style="padding:4px 8px 4px 0;color:${C.texto}">${esc(l.nombre)} <span style="color:${C.gris}">· CC ${esc(l.cedula)}</span></td>
  <td style="padding:4px 0;color:${l.conVistoBueno ? C.ok : C.gris};white-space:nowrap">${l.conVistoBueno ? "Con visto bueno" : "Falta el visto bueno"}</td>
  <td style="padding:4px 0 4px 8px;color:${l.dias >= 2 ? C.alerta : C.gris};white-space:nowrap;text-align:right">${esc(diasEnTexto(l.dias))}</td>
</tr>`
          )
          .join("")}</table><p style="font-size:12px;margin:8px 0 0"><a href="${esc(enlaceListos)}" style="color:${C.primario}">Verlos en Candidatos</a></p>`
      )
    : "";

  const resumenMes = cifras([
    { etiqueta: "Aspirantes", valor: fmt(m.aspirantes), nota: "Procesos creados en el periodo" },
    { etiqueta: "En curso", valor: fmt(m.enCurso) },
    { etiqueta: "Contratados", valor: fmt(m.contratados), nota: m.aspirantes ? `${pct(m.contratados, m.aspirantes)} de los aspirantes` : undefined },
    { etiqueta: "Cerrados", valor: fmt(m.cerrados), nota: m.aspirantes ? `${pct(m.cerrados, m.aspirantes)} de los aspirantes` : undefined },
  ]);

  const embudo = seccion(
    "Embudo",
    "Cuántos llegaron a cada etapa (o la pasaron). El porcentaje es sobre todos los aspirantes del periodo.",
    `${barras(m.embudo, m.aspirantes)}${sub("Dónde están hoy")}${barras(
      m.porEtapa.filter((f) => f.n > 0),
      m.aspirantes
    )}`
  );

  const cierres = seccion(
    "Por qué se cerraron",
    "Causa registrada al cerrar el proceso.",
    m.causasCierre.length ? barras(m.causasCierre, m.cerrados, C.alerta) : `<p style="font-size:13px;color:${C.gris};margin:4px 0">— Ningún proceso del periodo se ha cerrado.</p>`
  );

  const canal = seccion(
    "Por dónde llegaron (campañas)",
    "Aspirantes por canal de postulación y cuántos terminaron contratados.",
    barras(
      m.porCanal.map((c) => ({ etiqueta: c.etiqueta, n: c.n, detalle: `${fmt(c.contratados)} contratados (${pct(c.contratados, c.n)})` })),
      m.aspirantes
    )
  );

  const mensajes = vm
    ? seccion(
        "Mensajes de WhatsApp",
        "Conversaciones y mensajes del periodo.",
        cifras([
          { etiqueta: "Conversaciones nuevas", valor: fmt(vm.conversacionesNuevas) },
          { etiqueta: "Mensajes recibidos", valor: fmt(vm.recibidos) },
          { etiqueta: "Mensajes enviados", valor: fmt(vm.enviados) },
        ]) +
          sub("Enviados por") +
          barras(
            [
              { etiqueta: "Asistente de IA", n: vm.enviadosPor.asistente },
              { etiqueta: "Gestión Humana", n: vm.enviadosPor.gestionHumana },
              { etiqueta: "Plantillas", n: vm.enviadosPor.plantilla },
              { etiqueta: "Automáticos (recordatorios, citas)", n: vm.enviadosPor.automatico },
            ],
            vm.enviados
          )
      )
    : "";

  const r = mes.resp;
  const respuesta = r
    ? seccion(
        "¿Responden los aspirantes?",
        "Conversaciones a las que les escribimos y hasta qué pregunta del asistente llegaron.",
        cifras([
          { etiqueta: "Conversaciones", valor: fmt(r.base), nota: "Aspirantes a los que les escribimos" },
          { etiqueta: "Nos respondieron", valor: r.pctRespondieron == null ? "—" : `${Math.round(r.pctRespondieron)} %`, nota: `${fmt(r.respondieron)} de ${fmt(r.base)}` },
        ]) +
          sub("Hasta qué pregunta llegaron") +
          barras(r.preguntas, r.base)
      )
    : "";

  const pie = `<p style="font-size:12px;color:${C.gris};margin:16px 0 0">
  Las mismas cifras están en Gestivo › Candidatos › Indicadores:
  <a href="${esc(enlaceAyer)}" style="color:${C.primario}">ayer</a> ·
  <a href="${esc(enlaceMes)}" style="color:${C.primario}">últimos 30 días</a>.
  Sin los aspirantes del chat de prueba. Los destinatarios se cambian en esa misma pantalla.
</p>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
<div style="max-width:680px;margin:0 auto;padding:16px;font-family:Segoe UI,Arial,sans-serif;color:${C.texto}">
  ${o.desarrollo ? `<p style="background:#FEF3C7;color:#92400E;border-radius:8px;padding:8px 12px;font-size:12px">Correo de pruebas (entorno de desarrollo).</p>` : ""}
  <div style="font-size:20px;font-weight:700">Indicadores de selección</div>
  <div style="font-size:13px;color:${C.gris};margin:2px 0 14px">Reporte diario · ${esc(fecha)}</div>
  ${d.umbrales ? htmlAlertas(alertas) : ""}
  ${bloqueListos}
  ${bloqueAyer}
  ${seccion(`Últimos 30 días`, `Aspirantes cuyo proceso empezó del ${fechaCortaReporte(m.rango.desde)} al ${fechaCortaReporte(m.rango.hasta)}.`, resumenMes)}
  ${embudo}
  ${cierres}
  ${canal}
  ${mensajes}
  ${respuesta}
  ${pie}
</div></body></html>`;

  const lineas = [
    `${prefijo}Indicadores de selección — ${fecha}`,
    "",
    ...(alertas.length ? [`ALERTAS (${alertas.length}):`, ...alertas.map((a) => `  ⚠ ${a.titulo}: ${a.valor} (${a.umbral}). ${a.accion}`), ""] : d.umbrales ? ["Sin alertas: todo dentro de los umbrales.", ""] : []),
    ...(listos.length
      ? [`LISTOS PARA CONTRATAR (${listos.length}): falta revisarlos, dar el visto bueno y contratarlos.`, ...listos.map((l) => `  ${l.nombre} (CC ${l.cedula}) · ${l.conVistoBueno ? "con visto bueno" : "falta el visto bueno"} · ${diasEnTexto(l.dias)}`), `  ${enlaceListos}`, ""]
      : []),
    `AYER: ${fmt(a.aspirantes)} aspirantes nuevos, ${fmt(a.contratadosEnPeriodo)} contratados, ${fmt(v?.recibidos)} mensajes recibidos, ${fmt(v?.enviados)} enviados.`,
    "",
    `ÚLTIMOS 30 DÍAS (${fechaCortaReporte(m.rango.desde)} a ${fechaCortaReporte(m.rango.hasta)}): ${fmt(m.aspirantes)} aspirantes, ${fmt(m.enCurso)} en curso, ${fmt(m.contratados)} contratados, ${fmt(m.cerrados)} cerrados.`,
    "",
    "Embudo (llegaron a cada etapa):",
    ...m.embudo.map((f) => `  ${f.etiqueta}: ${fmt(f.n)} (${pct(f.n, m.aspirantes)})`),
    "",
    "Por qué se cerraron:",
    ...(m.causasCierre.length ? m.causasCierre.map((f) => `  ${f.etiqueta}: ${fmt(f.n)}`) : ["  Ninguno."]),
    "",
    "Por canal:",
    ...m.porCanal.map((c) => `  ${c.etiqueta}: ${fmt(c.n)} aspirantes, ${fmt(c.contratados)} contratados`),
    "",
    `Ver en Gestivo: ${enlaceMes}`,
  ];
  return { asunto, texto: lineas.join("\n"), html };
}
