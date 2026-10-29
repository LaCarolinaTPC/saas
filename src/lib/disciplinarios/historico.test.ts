import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaDeTexto, clasificarSancion, comoCargo, comoNombre, crearEmparejadorNombres, deducirMotivo, deducirNorma, leerHoja, mapearFila, mesDeTexto,
  parsearFecha, type FilaExcel,
} from "./historico";

/** Número de serie de Excel de una fecha ISO. */
const serie = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000 + 25569;

test("parsearFecha: número de serie de Excel", () => {
  assert.deepEqual(parsearFecha(serie("2025-09-04"), 2025, "SEPTIEMBRE"), { fecha: "2025-09-04", aviso: null });
});

test("parsearFecha: textos con errores de tipeo", () => {
  assert.equal(parsearFecha("27/003/2025", 2025, "MARZO").fecha, "2025-03-27");
  assert.equal(parsearFecha("26//08/2025", 2025, "AGOSTO").fecha, "2025-08-26");
  assert.equal(parsearFecha("25/092025", 2025, "SEPTIEMBRE").fecha, "2025-09-25");
  assert.equal(parsearFecha("10/012026", 2026, "ENERO").fecha, "2026-01-10");
  assert.equal(parsearFecha("1/03//2026", 2026, "MARZO").fecha, "2026-03-01");
  const r = parsearFecha("28/09/20026", 2026, "SEPTIEMBRE");
  assert.equal(r.fecha, "2026-09-28");
  assert.match(r.aviso ?? "", /corregido a 2026/);
  assert.equal(parsearFecha("27/03/205", 2025, "MARZO").fecha, "2025-03-27");
});

test("parsearFecha: mes 0 se toma de la columna MES", () => {
  const r = parsearFecha("05/0/2025", 2025, "MARZO ");
  assert.equal(r.fecha, "2025-03-05");
  assert.match(r.aviso ?? "", /columna MES/);
});

test("parsearFecha: año de la hoja, salvo nov–dic del año anterior", () => {
  // «3/15/24» en la hoja 2025 (MES = MARZO) es un error de tipeo.
  const r = parsearFecha(serie("2024-03-15"), 2025, "MARZO");
  assert.equal(r.fecha, "2025-03-15");
  assert.match(r.aviso ?? "", /2024 corregido a 2025/);
  // Noviembre de 2025 en la hoja 2026 es legítimo.
  assert.deepEqual(parsearFecha(serie("2025-11-14"), 2026, "NOVIEMBRE"), { fecha: "2025-11-14", aviso: null });
});

test("parsearFecha: vacío o ilegible", () => {
  assert.deepEqual(parsearFecha(null, 2025, "MARZO"), { fecha: null, aviso: null });
  assert.equal(parsearFecha("sin fecha", 2025, "MARZO").fecha, null);
  assert.equal(parsearFecha("31/02/2025", 2025, "FEBRERO").fecha, null);
});

test("mesDeTexto: con espacios y errores («JUILO»)", () => {
  assert.equal(mesDeTexto("MARZO "), 3);
  assert.equal(mesDeTexto("JUILO"), 7);
  assert.equal(mesDeTexto(""), null);
});

test("clasificarSancion: cada sanción del Excel", () => {
  const c = (s: string, obs = "", dias = "") => {
    const r = clasificarSancion(s, obs, dias);
    return [r.tipo, r.medida, r.asistio, r.diasSuspension];
  };
  for (const s of ["LLAMADO DE ATENCION", "LLAMADO DE ATENCIAON", "LLAMADO DE ATENCIÓN", "LLAMDO DE ATENCION", "LLMADO DE ATENCION", "LLAMADO DE ATENCION POR ESCRITO"]) {
    assert.deepEqual(c(s), ["llamado_atencion", "llamado_escrito", null, null], s);
  }
  assert.deepEqual(c("ACTA DE DESCARGO"), ["citacion_descargos", "no_registrada", true, null]);
  assert.deepEqual(c("DESCARGOS"), ["citacion_descargos", "no_registrada", true, null]);
  assert.deepEqual(c("CITACION A DESCARGOS"), ["citacion_descargos", "no_registrada", null, null]);
  assert.deepEqual(c("CITACION A PROCESO DISCIPLINARIO"), ["citacion_descargos", "no_registrada", null, null]);
  assert.deepEqual(c("SUSPENSIÓN", "", "3 DÍAS"), ["citacion_descargos", "suspension", null, 3]);
  assert.deepEqual(c("SUSPENSION", "", "20DIAS"), ["citacion_descargos", "suspension", null, 20]);
  assert.deepEqual(c("SANCION DISCIPLINARIA POR FALTA LEVE SUSPENSION LABORAL", "", "2"), ["citacion_descargos", "suspension", null, 2]);
  assert.deepEqual(c("LLAMADO DE ATENCIÓN Y DESCARGO"), ["citacion_descargos", "llamado_escrito", true, null]);
  assert.deepEqual(c("CONDUCTOR RENUNCIO ANTES"), ["citacion_descargos", "otra", false, null]);
  // Vacía: se usa la observación; si tampoco sirve, no reconocida.
  assert.deepEqual(c("", "ACTA DE DESCARGO"), ["citacion_descargos", "no_registrada", true, null]);
  assert.equal(clasificarSancion("", "EXCESO DE VELOCIDAD", "").reconocida, false);
});

test("deducirMotivo y deducirNorma: ambas hojas", () => {
  // 2025: FALTA = hecho, OBSERVACIÓN = norma.
  assert.equal(deducirMotivo(["EXCESO DE VELOCIDAD", "INCUMPLIMIENTO DE FUNCIONES"]), "exceso_velocidad");
  assert.equal(deducirNorma(["EXCESO DE VELOCIDAD", "INCUMPLIMIENTO DE FUNCIONES"], "exceso_velocidad"), "funciones");
  // 2026: FALTA = norma, OBSERVACIÓN = hecho.
  assert.equal(deducirMotivo(["INCUMPLIENTO DE NORMAS DE SEGURIDAD VIAL ", "EXCESO DE VELOCIDAD"]), "exceso_velocidad");
  assert.equal(deducirNorma(["INCUMPLIMIENTO DE NORMAS CST", "LLAMADO DE ATENCION"], "incumplimiento_funciones"), "normas_cst");
  assert.equal(deducirNorma(["IMCUMPLIMIENTO DE LAS NORMAS C.S.T", ""], "incumplimiento_funciones"), "normas_cst");
  // «LLAMADO DE ATENCIÓN» no es mala atención al usuario.
  assert.equal(deducirMotivo(["INCUMPLIMIENTO DE NORMAS CST", "LLAMADO DE ATENCION"]), "incumplimiento_funciones");
  assert.equal(deducirMotivo(["", "CITACION A DESCARGO, NO VINO A TRABAJAR"]), "faltas_injustificadas");
  assert.equal(deducirMotivo(["USO DE MANOS LIBRES AL CONDUCIR", ""]), "uso_celular");
  assert.equal(deducirMotivo(["CONDUCIR SIN CINTURON", ""]), "sin_cinturon");
  assert.equal(deducirMotivo(["MALA ATENCIÓN AL USUARIO", ""]), "maltrato");
  assert.equal(deducirMotivo(["COMPORTAMIENTO INADECUADO", ""]), "comportamiento");
  assert.equal(deducirMotivo(["", "", "LLAGADA TARDE"]), "llegadas_tarde");
  assert.equal(deducirMotivo(["", "", "", "", "COBRO DE VIAJES"]), "cobro_viaje");
  // Sin norma escrita: la del motivo.
  assert.equal(deducirNorma(["USUARIO EN EL ESTRIBO MIENTRAS CONDUCE", ""], "usuario_estribo"), "seguridad_vial");
});

test("textos: nombre, cargo y área", () => {
  assert.equal(comoNombre("YENIFER  PINZON"), "Yenifer Pinzon");
  assert.equal(comoNombre("MARIA DE LA HOZ"), "Maria de la Hoz");
  assert.equal(comoCargo("CONDUCTOR-COBRADOR"), "Conductor-cobrador");
  assert.equal(areaDeTexto("OPERATIVA"), "operativa");
  assert.equal(areaDeTexto("ADMINISTATIVO"), "administrativa");
  assert.equal(areaDeTexto(""), null);
});

test("leerHoja: ubica las columnas por encabezado y salta filas sin empleado", () => {
  const enc = ["MES", "FECHA REPORTE", "INCUMPLIMIENTO DE FUNCIONES ", "EMPLEADO", "CARGO", "AREA ", "FECHA DESCARGO", "REALIZADO POR", "FALTA", "OBSERVACION ", "SANCION APLICADA", "DIAS DE SANCION ", "LLEGADA TARDE", "COBRO DE VIAJE"];
  const filas = leerHoja("2026", [
    ["PROCESOS DISCIPLINARIOS 2026"],
    [],
    enc,
    ["ENERO", serie("2026-01-10"), "DPTO GESTION HUMANA", "ROLDAN DIAZ JUAN CARLOS", "CONDUCTOR-COBRADOR", "OPERATIVA", serie("2026-01-10"), "YENIFER PINZON", "INCUMPLIENTO DE NORMAS DE SEGURIDAD VIAL ", "EXCESO DE VELOCIDAD", "LLAMADO DE ATENCION", null, null, null],
    [null, null, null, null],
  ]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].fila, 4);
  assert.equal(filas[0].empleado, "ROLDAN DIAZ JUAN CARLOS");
  assert.equal(filas[0].observacion, "EXCESO DE VELOCIDAD");
});

const fila = (x: Partial<FilaExcel>): FilaExcel => ({
  hoja: "2026", fila: 10, mes: "ENERO", fechaReporte: serie("2026-01-09"), empleado: "FERNANDO JOSE HERNANDEZ HERNANDEZ",
  cargo: "CONDUCTOR-COBRADOR", area: "OPERATIVA", fechaDescargo: serie("2026-01-20"), realizadoPor: "YENIFER PINZON",
  falta: "IMCUMPLIMIENTO DE NORMAS DE SEGURIDAD VIAL", observacion: "LLAMADO DE ATENCION", sancion: "LLAMADO DE ATENCION ",
  diasSancion: "", llegadaTarde: "", cobroViaje: "", ...x,
});

test("mapearFila: llamado de atención de 2026", () => {
  const r = mapearFila(fila({}));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const p = r.proceso;
  assert.equal(p.historico_ref, "2026:10");
  assert.equal(p.tipo, "llamado_atencion");
  assert.equal(p.medida, "llamado_escrito");
  assert.equal(p.fecha_hecho, "2026-01-09");
  assert.equal(p.fecha_descargos, null); // solo citaciones
  assert.equal(p.norma_incumplida, "seguridad_vial");
  assert.equal(p.cargo, "Conductor-cobrador");
  assert.equal(p.area, "operativa");
  assert.equal(p.realizado_por, "Yenifer Pinzon");
  assert.match(p.descripcion, /Falta: IMCUMPLIMIENTO DE NORMAS DE SEGURIDAD VIAL/);
  assert.deepEqual(r.avisos, []);
});

test("mapearFila: suspensión con días y acta de descargo con fecha", () => {
  const s = mapearFila(fila({ sancion: "SUSPENSION", diasSancion: "2" }));
  assert.equal(s.ok && s.proceso.medida === "suspension" && s.proceso.dias_suspension === 2, true);
  assert.equal(s.ok && s.proceso.fecha_descargos, "2026-01-20");
  const a = mapearFila(fila({ sancion: "ACTA DE DESCARGO", fechaDescargo: serie("2026-01-01") }));
  assert.equal(a.ok, true);
  if (!a.ok) return;
  assert.equal(a.proceso.fecha_descargos, null);
  assert.match(a.avisos.join(" "), /anterior a los hechos/);
});

test("mapearFila: sin fecha válida se rechaza", () => {
  assert.equal(mapearFila(fila({ fechaReporte: null })).ok, false);
});

test("crearEmparejadorNombres: exacto, probable con errores, parcial, ambiguo y ninguno", () => {
  const t = (cedula: string, nombre: string) => ({ cedula, nombre, codigo: null, estado: "ACTIVO" });
  const emparejar = crearEmparejadorNombres([
    t("1", "COHEN ECHEVERRIA ABRAHAM ENRIQUE"),
    t("2", "PUELLO FRANCO EDGAR ALEXANDER"),
    t("3", "PEREZ ATENCIA FABIAN JOSE"),
    t("4", "PEREZ CARVAJAL FABIAN"),
    t("5", "CASTRO DE LA HOZ FRANCISCO JAVIER"),
  ]);
  const r = (n: string) => {
    const e = emparejar(n);
    return [e.tipo, "conductor" in e ? e.conductor.cedula : "candidatos" in e ? e.candidatos.map((c) => c.cedula).join(",") : ""];
  };
  assert.deepEqual(r("ABRAHAM ENRIQUE COHEN ECHEVERRIA"), ["exacto", "1"]);
  assert.deepEqual(r("COHEN ECHEVERRIA ABRHAM ENRIQUE"), ["probable", "1"]); // una letra
  assert.deepEqual(r("FRANCISCO JAVIER CASTRO"), ["probable", "5"]); // partículas fuera
  assert.deepEqual(r("EDGAR PUELLO"), ["parcial", "2"]);
  assert.deepEqual(r("FABIAN PEREZ"), ["ambiguo", "3,4"]);
  assert.deepEqual(r("HUGO ZAFRA"), ["ninguno", ""]);
  // Palabras cortas no se aproximan («ANA» no es «ANAS»).
  assert.deepEqual(r("EDGA PUELLO"), ["ninguno", ""]);
});
