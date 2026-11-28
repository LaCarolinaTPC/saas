import { test } from "node:test";
import assert from "node:assert/strict";
import { condicionesContratar, listoParaContratar, movimientoListo, type DatosContratar } from "./contratacion";
import { armarCorreoListo } from "./listo-contratar";
import { movimientoAlSoltar, siguientePaso } from "./mover-tablero";
import { ESTADOS_EN_CURSO, PROCESO_ESTADOS, ordenEstado } from "@/lib/contratacion/constants";
import { armarReporteDiario, type DatosReporte } from "./reporte-diario";

const CUMPLE: DatosContratar = {
  examenes: [{ fase: 1, resultado: "apto" }, { fase: 2, resultado: "apto" }],
  rutasAprendidas: 2,
  rutasMinimas: 2,
  reingreso: false,
  itemsCarpeta: ["Hoja de vida"],
  carpeta: [{ item: "Hoja de vida", estado: "validado" }],
  aprobada: false,
  exigePsicotecnica: true,
  psicotecnica: "apto",
  antecedentes: { veredicto: "limpio", decision: null, legado: null },
};

test("listo para contratar: cumple todo menos el visto bueno (25-nov-2026)", () => {
  const c = condicionesContratar(CUMPLE);
  // Para contratar todavía falta el visto bueno…
  assert.equal(c.ok, false);
  // …pero ya está listo para que Gestión Humana lo revise.
  assert.deepEqual(listoParaContratar(c.condiciones), { listo: true, faltan: [] });
  // Con el visto bueno sigue listo (hasta que lo pasen a contratado).
  assert.equal(listoParaContratar(condicionesContratar({ ...CUMPLE, aprobada: true }).condiciones).listo, true);
  // Si falta cualquier otra condición, no; y dice cuál, sin contar el visto bueno.
  const sinCarpeta = listoParaContratar(condicionesContratar({ ...CUMPLE, carpeta: [{ item: "Hoja de vida", estado: "recibido" }] }).condiciones);
  assert.equal(sinCarpeta.listo, false);
  assert.equal(sinCarpeta.faltan.length, 1);
  assert.match(sinCarpeta.faltan[0], /carpeta/);
  assert.equal(listoParaContratar(condicionesContratar({ ...CUMPLE, psicotecnica: null }).condiciones).listo, false);
  assert.equal(listoParaContratar(condicionesContratar({ ...CUMPLE, examenes: [{ fase: 1, resultado: "apto" }] }).condiciones).listo, false);
  assert.equal(listoParaContratar(condicionesContratar({ ...CUMPLE, antecedentes: { veredicto: "revision", decision: null, legado: null } }).condiciones).listo, false);
  // Sin condiciones que revisar no hay nada que lo sostenga.
  assert.equal(listoParaContratar([]).listo, false);
});

test("listo para contratar: cuándo sube y cuándo baja solo", () => {
  // Sube desde las dos últimas etapas.
  assert.equal(movimientoListo("reconocimiento_ruta", true, true), "sube");
  assert.equal(movimientoListo("en_examenes_fase2", true, true), "sube");
  // Antes no (le falta la fase 2), ni cerrado, ni contratado.
  for (const e of ["pendiente", "citado", "en_examenes", "cierre", "contratado"]) assert.equal(movimientoListo(e, true, true), null, e);
  // Ya está y sigue cumpliendo: nada (no repite el correo).
  assert.equal(movimientoListo("listo_contratar", true, true), null);
  // Dejó de cumplir: vuelve.
  assert.equal(movimientoListo("listo_contratar", true, false), "baja");
  assert.equal(movimientoListo("reconocimiento_ruta", true, false), null);
  // Con las condiciones apagadas nadie se mueve solo.
  assert.equal(movimientoListo("reconocimiento_ruta", false, true), null);
  assert.equal(movimientoListo("listo_contratar", false, false), null);
});

test("listo para contratar: la etapa va entre el reconocimiento y contratado, y cuenta como en curso", () => {
  assert.equal(ordenEstado("listo_contratar"), ordenEstado("reconocimiento_ruta") + 1);
  assert.equal(ordenEstado("contratado"), ordenEstado("listo_contratar") + 1);
  assert.ok((ESTADOS_EN_CURSO as string[]).includes("listo_contratar"));
  assert.equal(PROCESO_ESTADOS.find((e) => e.value === "listo_contratar")?.label, "Listo para contratar");
});

test("listo para contratar: en el tablero no se lleva a mano", () => {
  // Soltar en la columna abre la ficha con lo que le falta.
  assert.deepEqual(movimientoAlSoltar("reconocimiento_ruta", "listo_contratar"), { tipo: "ficha", destino: "listo_contratar" });
  assert.equal(siguientePaso("reconocimiento_ruta", "listo_contratar"), "listo_contratar");
  // De ahí a contratado: la ficha con las condiciones.
  assert.deepEqual(movimientoAlSoltar("listo_contratar", "contratado"), { tipo: "ficha", destino: "contratado" });
  assert.equal(siguientePaso("listo_contratar", "contratado"), "contratado");
  // Devolverlo a una etapa anterior o cerrarlo: como siempre.
  assert.deepEqual(movimientoAlSoltar("listo_contratar", "reconocimiento_ruta"), { tipo: "directo" });
  assert.deepEqual(movimientoAlSoltar("listo_contratar", "cierre"), { tipo: "cierre" });
  // No es un paso intermedio de otros recorridos.
  assert.equal(siguientePaso("en_examenes", "reconocimiento_ruta"), "en_examenes_fase2");
  assert.equal(siguientePaso("pendiente", "contratado"), "contratado");
});

test("listo para contratar: el correo a Gestión Humana", () => {
  const c = condicionesContratar(CUMPLE).condiciones;
  const correo = armarCorreoListo({ nombre: "Ana <Pérez>", cedula: "1234567", vacante: "Conductor" }, c, "https://gestivo.test");
  assert.equal(correo.asunto, "Listo para contratar: Ana <Pérez> (CC 1234567)");
  assert.match(correo.texto, /Exámenes médicos aptos/);
  // El visto bueno es lo que falta: no va en la lista de lo cumplido.
  assert.doesNotMatch(correo.texto, /- Visto bueno/);
  assert.match(correo.texto, /dar el visto bueno/);
  assert.match(correo.texto, /https:\/\/gestivo\.test\/candidatos\?estado=listo_contratar&q=1234567/);
  // El nombre va escapado en el HTML.
  assert.match(correo.html, /Ana &lt;Pérez&gt;/);
  assert.match(armarCorreoListo({ nombre: "Ana", cedula: "1" }, c, "http://x", true).asunto, /^\[DESARROLLO\] /);
});

test("listo para contratar: sección del reporte diario", () => {
  const ind = { rango: { desde: "2026-11-24", hasta: "2026-11-24" }, aspirantes: 0, contratadosEnPeriodo: 0, enCurso: 0, contratados: 0, cerrados: 0, embudo: [], porEtapa: [], causasCierre: [], porCanal: [] };
  const periodo = { ind, chat: null, resp: null } as unknown as DatosReporte["ayer"];
  const base: DatosReporte = { dia: "2026-11-24", ayer: periodo, mes: periodo, url: "https://gestivo.test" };
  const sin = armarReporteDiario(base, { desarrollo: false });
  assert.doesNotMatch(sin.html, /Listos para contratar/);
  const con = armarReporteDiario(
    { ...base, listos: [{ nombre: "Ana Pérez", cedula: "1234567", dias: 3, conVistoBueno: false }, { nombre: "Luis Díaz", cedula: "7654321", dias: 0, conVistoBueno: true }] },
    { desarrollo: false }
  );
  assert.match(con.html, /Listos para contratar · 2/);
  assert.match(con.html, /Ana Pérez/);
  assert.match(con.html, /hace 3 días/);
  assert.match(con.html, /Con visto bueno/);
  assert.match(con.texto, /LISTOS PARA CONTRATAR \(2\)/);
  assert.match(con.texto, /Luis Díaz \(CC 7654321\) · con visto bueno · desde hoy/);
});
