import { test } from "node:test";
import assert from "node:assert/strict";
import { armarReporteDiario, enlaceIndicadores, type PeriodoReporte } from "./reporte-diario";
import type { IndicadoresSeleccion } from "./indicadores";
import type { Indicadores } from "@/lib/comunicaciones/indicadores";

function ind(desde: string, hasta: string, extra: Partial<IndicadoresSeleccion> = {}): IndicadoresSeleccion {
  return {
    rango: { desde, hasta, dias: 1 },
    aspirantes: 40,
    contratados: 5,
    cerrados: 20,
    enCurso: 15,
    contratadosEnPeriodo: 2,
    embudo: [
      { clave: "pendiente", etiqueta: "Preselección", n: 40 },
      { clave: "contratado", etiqueta: "Contratado", n: 5 },
    ],
    porEtapa: [
      { clave: "pendiente", etiqueta: "Preselección", n: 10 },
      { clave: "cierre", etiqueta: "Cierre de proceso", n: 20 },
      { clave: "citado", etiqueta: "Citado", n: 0 },
    ],
    causasCierre: [{ clave: "x", etiqueta: "Licencia <no válida>", n: 12 }],
    porCanal: [{ clave: "whatsapp", etiqueta: "WhatsApp", n: 30, contratados: 4 }],
    clave: { asistencia: { citas: 20, asistieron: 16, noAsistieron: 4, sinRegistrar: 0, pct: 80 } },
    ...extra,
  } as IndicadoresSeleccion;
}
const chat = { volumen: { conversacionesNuevas: 7, recibidos: 120, enviados: 300, enviadosPor: { asistente: 200, gestionHumana: 50, plantilla: 30, automatico: 20 }, porDia: [] } } as unknown as Indicadores;

test("reporte diario: lo de ayer, los 30 días y los enlaces a Indicadores (24-nov-2026)", () => {
  const ayer: PeriodoReporte = { ind: ind("2026-11-23", "2026-11-23", { aspirantes: 3 }), chat, resp: null };
  const mes: PeriodoReporte = { ind: ind("2026-10-25", "2026-11-23"), chat, resp: null };
  const r = armarReporteDiario({ dia: "2026-11-23", ayer, mes, url: "https://gestivo.test" }, { desarrollo: true });
  assert.match(r.asunto, /^\[PRUEBAS\] Selección: reporte del lunes, 23 de noviembre de 2026$/);
  assert.match(r.texto, /AYER: 3 aspirantes nuevos, 2 contratados, 120 mensajes recibidos, 300 enviados/);
  assert.match(r.texto, /40 aspirantes, 15 en curso, 5 contratados, 20 cerrados/);
  assert.match(r.texto, /WhatsApp: 30 aspirantes, 4 contratados/);
  // El HTML escapa lo que viene de la base y no muestra etapas vacías en «Dónde están hoy».
  assert.ok(r.html.includes("Licencia &lt;no válida&gt;"));
  assert.ok(!r.html.includes(">Citado<"));
  assert.ok(r.html.includes(enlaceIndicadores("https://gestivo.test", "2026-10-25", "2026-11-23").replace(/&/g, "&amp;")));
  assert.ok(r.html.includes("Correo de pruebas"));
  // En producción, sin la marca de pruebas.
  const prod = armarReporteDiario({ dia: "2026-11-23", ayer, mes, url: "https://gestivo.test" }, { desarrollo: false });
  assert.ok(!prod.asunto.includes("PRUEBAS") && !prod.html.includes("Correo de pruebas"));
});

test("reporte diario: las alertas van arriba y en el asunto", async () => {
  const { umbralesAlertas } = await import("./alertas-indicadores");
  const ayer: PeriodoReporte = { ind: ind("2026-11-23", "2026-11-23", { aspirantes: 0 }), chat, resp: null };
  const mes: PeriodoReporte = { ind: ind("2026-10-25", "2026-11-23", { contratadosEnPeriodo: 1 }), chat, resp: null };
  const r = armarReporteDiario({ dia: "2026-11-23", ayer, mes, url: "https://gestivo.test", umbrales: umbralesAlertas(() => undefined) }, { desarrollo: false });
  assert.match(r.asunto, /^⚠ \d+ alertas? · Selección: reporte del/);
  assert.ok(r.html.indexOf("para revisar") < r.html.indexOf("Ayer, "), "el bloque de alertas va antes de lo de ayer");
  assert.match(r.texto, /ALERTAS \(\d+\):\n  ⚠ Aspirantes nuevos ayer: 0 \(mínimo 2\)/);
  // Sin alertas lo dice.
  const sano = armarReporteDiario({ dia: "2026-11-23", ayer: { ...ayer, ind: ind("2026-11-23", "2026-11-23", { aspirantes: 9 }) }, mes, url: "https://gestivo.test", umbrales: umbralesAlertas(() => 0) }, { desarrollo: false });
  assert.ok(sano.html.includes("Sin alertas") && !sano.asunto.includes("⚠"));
});
