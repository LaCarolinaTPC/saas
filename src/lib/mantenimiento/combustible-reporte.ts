// Reporte de la previsualización de una carga de combustible: lo que se va a
// subir, archivo por archivo, antes de confirmar. Un solo modelo (tablas con
// columnas tipadas) y tres salidas: PDF, CSV y Markdown, para que digan lo
// mismo. El modelo y el Markdown son puros; el PDF y el CSV se descargan en el
// navegador con los ayudantes de src/lib/exportar.
import type { ResumenArchivo } from "./combustible-data";
import { ALERTA_COMBUSTIBLE_LABEL, type AlertaCombustible } from "./combustible-alertas";
import { CAUSA_CONCILIACION_LABEL, type ConciliacionGema } from "./combustible-conciliacion";
import { cop, decimal, entero, fechaCorta } from "@/lib/financiera/formato";

export type TipoColumna = "texto" | "entero" | "galones" | "pesos" | "fecha";
export type CeldaReporte = string | number | null;

export interface TablaReporte {
  titulo: string;
  columnas: { titulo: string; tipo: TipoColumna }[];
  filas: CeldaReporte[][];
}

export interface ReporteCarga {
  /** Nombre de archivo sin extensión. */
  archivo: string;
  titulo: string;
  contexto: string[];
  resumen: string[];
  /** La primera es el resumen por archivo; las demás solo si tienen filas. */
  tablas: TablaReporte[];
  notas: string[];
}

const rango = (desde: string | null, hasta: string | null) =>
  !desde ? "—" : desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} a ${fechaCorta(hasta)}`;

/** El mismo semáforo que pinta IndicadorGema, en texto. */
export function textoGema(c: ConciliacionGema | null): string {
  if (!c) return "Sin cruce";
  const pendiente = c.diasSinLiquidar.length ? ` · GEMA aún no liquida ${c.diasSinLiquidar.map(fechaCorta).join(", ")}` : "";
  if (c.estado === "sin_liquidar") return `Sin cierre de GEMA aún${pendiente}`;
  if (c.estado === "cuadra") return `Cuadra con GEMA · ${entero(c.cuadran)} buses-día${pendiente}`;
  const descuadre = c.busesDia - c.cuadran;
  if (Math.abs(c.diferencia) < 1) return `Total igual; ${entero(descuadre)} buses-día se compensan${pendiente}`;
  return `Diferencia ${cop(c.diferencia)} · ${entero(descuadre)} de ${entero(c.busesDia)} buses-día${pendiente}`;
}

export function armarReporteCarga(previa: ResumenArchivo[], generado: string): ReporteCarga {
  const validos = previa.filter((p) => !p.errorArchivo);
  const desde = validos.map((p) => p.resumen.desde).filter((d): d is string => !!d).sort()[0] ?? null;
  const hasta = validos.map((p) => p.resumen.hasta).filter((d): d is string => !!d).sort().at(-1) ?? null;
  const suma = (f: (p: ResumenArchivo) => number) => validos.reduce((s, p) => s + f(p), 0);
  const escribir = suma((p) => p.nuevas + p.corregidas);
  const rechazados = previa.length - validos.length;

  const resumenArchivos: TablaReporte = {
    titulo: "Resumen por archivo",
    columnas: [
      { titulo: "Archivo", tipo: "texto" }, { titulo: "Días", tipo: "texto" }, { titulo: "Tanqueos", tipo: "entero" },
      { titulo: "Buses", tipo: "entero" }, { titulo: "Galones", tipo: "galones" }, { titulo: "Valor", tipo: "pesos" },
      { titulo: "Nuevos", tipo: "entero" }, { titulo: "Corregidos", tipo: "entero" }, { titulo: "Ya cargados", tipo: "entero" },
      { titulo: "Rechazados", tipo: "entero" }, { titulo: "Cierre GEMA", tipo: "texto" },
    ],
    filas: previa.map((p) => p.errorArchivo
      ? [p.archivo, "Rechazado entero", null, null, null, null, null, null, null, null, p.errorArchivo]
      : [
        p.archivo, rango(p.resumen.desde, p.resumen.hasta), p.resumen.tanqueos, p.resumen.buses, p.resumen.galones, p.resumen.valor,
        p.nuevas, p.corregidas, p.sinCambio + p.enOtroArchivo, p.rechazadasTotal, textoGema(p.conciliacion),
      ]),
  };

  const alertas: TablaReporte = {
    titulo: "Alertas",
    columnas: [{ titulo: "Archivo", tipo: "texto" }, { titulo: "Alerta", tipo: "texto" }, { titulo: "Tanqueos", tipo: "entero" }],
    filas: validos.flatMap((p) => (Object.entries(p.resumen.alertas) as [AlertaCombustible, number][])
      .map(([a, n]) => [p.archivo, ALERTA_COMBUSTIBLE_LABEL[a] ?? a, n])),
  };
  const avisos: TablaReporte = {
    titulo: "Avisos",
    columnas: [{ titulo: "Archivo", tipo: "texto" }, { titulo: "Aviso", tipo: "texto" }],
    filas: validos.flatMap((p) => p.avisos.map((a) => [p.archivo, a])),
  };
  const cambios: TablaReporte = {
    titulo: "Tanqueos que cambian",
    columnas: [
      { titulo: "Archivo", tipo: "texto" }, { titulo: "Fecha", tipo: "fecha" }, { titulo: "Hora", tipo: "texto" },
      { titulo: "Bus", tipo: "texto" }, { titulo: "Factura", tipo: "texto" },
      { titulo: "Galones antes", tipo: "galones" }, { titulo: "Valor antes", tipo: "pesos" },
      { titulo: "Galones después", tipo: "galones" }, { titulo: "Valor después", tipo: "pesos" },
    ],
    filas: validos.flatMap((p) => p.cambios.map((c) => [
      p.archivo, c.fecha, c.hora?.slice(0, 5) ?? null, c.vehiculo, c.factura, c.antes.galones, c.antes.valor, c.despues.galones, c.despues.valor,
    ])),
  };
  const rechazadas: TablaReporte = {
    titulo: "Filas rechazadas",
    columnas: [
      { titulo: "Archivo", tipo: "texto" }, { titulo: "Hoja", tipo: "texto" }, { titulo: "Fila", tipo: "entero" },
      { titulo: "Factura", tipo: "texto" }, { titulo: "Motivo", tipo: "texto" },
    ],
    filas: validos.flatMap((p) => p.rechazadas.map((x) => [p.archivo, x.hoja, x.linea, x.factura, x.motivo])),
  };
  const gema: TablaReporte = {
    titulo: "Diferencias con el cierre de GEMA (bus y día)",
    columnas: [
      { titulo: "Archivo", tipo: "texto" }, { titulo: "Fecha", tipo: "fecha" }, { titulo: "Bus", tipo: "texto" },
      { titulo: "Proveedor", tipo: "pesos" }, { titulo: "GEMA", tipo: "pesos" }, { titulo: "GEMA − proveedor", tipo: "pesos" },
      { titulo: "Causa", tipo: "texto" },
    ],
    filas: validos.flatMap((p) => (p.conciliacion?.diferencias ?? []).map((d) => [
      p.archivo, d.fecha, d.bus, d.petromil, d.gema, d.diferencia, CAUSA_CONCILIACION_LABEL[d.causa],
    ])),
  };

  // La previsualización trae como mucho 50 rechazadas, cambios y diferencias por archivo.
  const notas: string[] = [];
  for (const p of validos) {
    if (p.rechazadasTotal > p.rechazadas.length) notas.push(`${p.archivo}: se listan ${p.rechazadas.length} de ${entero(p.rechazadasTotal)} filas rechazadas.`);
    if (p.corregidas > p.cambios.length) notas.push(`${p.archivo}: se listan ${p.cambios.length} de ${entero(p.corregidas)} tanqueos que cambian.`);
    const c = p.conciliacion;
    if (c && c.busesDia - c.cuadran > c.diferencias.length) {
      notas.push(`${p.archivo}: se listan ${c.diferencias.length} de ${entero(c.busesDia - c.cuadran)} diferencias con GEMA.`);
    }
    if (p.enOtroArchivoDistinto) {
      notas.push(`${p.archivo}: ${entero(p.enOtroArchivoDistinto)} tanqueos venían también en otro archivo de la subida con otros galones o valor; se conserva el del primer archivo.`);
    }
  }
  notas.push("Reporte de la previsualización: nada se escribe en la base hasta confirmar la carga.");

  return {
    archivo: `reporte_carga_combustible_${desde ?? "sin_fecha"}${hasta && hasta !== desde ? `_a_${hasta}` : ""}`,
    titulo: "Reporte de carga de combustible",
    contexto: [
      `Previsualización del ${generado} · ${previa.length} archivo(s)${rechazados ? `, ${rechazados} rechazado(s) entero(s)` : ""}`,
      `Tanqueos del ${rango(desde, hasta)}`,
    ],
    resumen: [
      `Se escribirán ${entero(escribir)} tanqueos`,
      `${entero(suma((p) => p.nuevas))} nuevos`,
      `${entero(suma((p) => p.corregidas))} corregidos`,
      `${entero(suma((p) => p.rechazadasTotal))} filas rechazadas`,
      `${decimal(suma((p) => p.resumen.galones), 1)} galones`,
      cop(suma((p) => p.resumen.valor)),
    ],
    tablas: [resumenArchivos, ...[alertas, avisos, cambios, rechazadas, gema].filter((t) => t.filas.length > 0)],
    notas,
  };
}

/** Celda para leer: miles con punto, como la pantalla. */
export function celdaTexto(v: CeldaReporte, tipo: TipoColumna): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return tipo === "fecha" ? fechaCorta(v) : v;
  if (tipo === "galones") return decimal(v, 3);
  if (tipo === "pesos") return cop(v);
  return entero(v);
}

/** Celda para CSV: números sin miles y con coma decimal, que Excel en español lee como número. */
export function celdaCsv(v: CeldaReporte, tipo: TipoColumna): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (tipo === "galones") return v.toFixed(3).replace(".", ",");
  return String(Math.round(v));
}

const md = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function reporteMarkdown(r: ReporteCarga): string {
  const lineas = [`# ${r.titulo}`, "", ...r.contexto.map((c) => `- ${c}`), "", `**${r.resumen.join(" · ")}**`];
  for (const t of r.tablas) {
    const derecha = (tipo: TipoColumna) => tipo !== "texto" && tipo !== "fecha";
    lineas.push(
      "", `## ${t.titulo}`, "",
      `| ${t.columnas.map((c) => md(c.titulo)).join(" | ")} |`,
      `| ${t.columnas.map((c) => (derecha(c.tipo) ? "---:" : "---")).join(" | ")} |`,
      ...t.filas.map((f) => `| ${f.map((v, i) => md(celdaTexto(v, t.columnas[i].tipo))).join(" | ")} |`),
    );
  }
  if (r.notas.length) lineas.push("", "## Notas", "", ...r.notas.map((n) => `- ${n}`));
  return lineas.join("\n") + "\n";
}

/** Una sección por tabla, separadas por una fila vacía. */
export function reporteCsv(r: ReporteCarga): CeldaReporte[][] {
  const filas: CeldaReporte[][] = [[r.titulo], ...r.contexto.map((c) => [c]), [r.resumen.join(" · ")]];
  for (const t of r.tablas) {
    filas.push([], [t.titulo], t.columnas.map((c) => c.titulo), ...t.filas.map((f) => f.map((v, i) => celdaCsv(v, t.columnas[i].tipo))));
  }
  if (r.notas.length) filas.push([], ["Notas"], ...r.notas.map((n) => [n]));
  return filas;
}

export async function descargarReporteCarga(previa: ResumenArchivo[], formato: "pdf" | "csv" | "md", generado: string) {
  const r = armarReporteCarga(previa, generado);
  if (formato === "csv") {
    const { descargarCsv } = await import("@/lib/exportar/csv");
    descargarCsv(`${r.archivo}.csv`, reporteCsv(r));
    return;
  }
  if (formato === "md") {
    const url = URL.createObjectURL(new Blob([reporteMarkdown(r)], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${r.archivo}.md`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const { descargarPdfTabla } = await import("@/lib/exportar/pdf-tabla");
  const alinear = (tipo: TipoColumna) => (tipo === "texto" || tipo === "fecha" ? "left" as const : "right" as const);
  const pdf = (t: TablaReporte) => ({
    columnas: t.columnas.map((c) => ({ titulo: c.titulo, alinear: alinear(c.tipo) })),
    filas: t.filas.map((f) => f.map((v, i) => celdaTexto(v, t.columnas[i].tipo))),
  });
  const [principal, ...resto] = r.tablas;
  await descargarPdfTabla({
    archivo: r.archivo,
    modulo: "Mantenimiento · Combustible",
    titulo: r.titulo,
    contexto: r.contexto,
    resumen: r.resumen,
    ...pdf(principal),
    anexos: resto.map((t) => ({ titulo: t.titulo, ...pdf(t) })),
    notas: r.notas,
    orientacion: "landscape",
  });
}
