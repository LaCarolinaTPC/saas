import { test } from "node:test";
import assert from "node:assert/strict";
import { combinarPruebas, interpretarConcepto, interpretarEstadoPrueba, leerFecha, leerFilasResultados, leerInformePdf, leerInformePsicoAlianza, leerPuntaje } from "./psico-resultados";

test("psicotécnica: el concepto en palabras (24-nov-2026)", () => {
  assert.equal(interpretarConcepto("APTO"), "apto");
  assert.equal(interpretarConcepto("Recomendado"), "apto");
  assert.equal(interpretarConcepto("Cumple con el perfil"), "apto");
  assert.equal(interpretarConcepto("NO APTO"), "no_apto");
  assert.equal(interpretarConcepto("No recomendado"), "no_apto");
  assert.equal(interpretarConcepto("Desfavorable"), "no_apto");
  assert.equal(interpretarConcepto("No cumple"), "no_apto");
  assert.equal(interpretarConcepto("Apto con observaciones"), "apto_con_observaciones");
  assert.equal(interpretarConcepto("Recomendado con restricciones"), "apto_con_observaciones");
  assert.equal(interpretarConcepto("Condicionado"), "apto_con_observaciones");
  assert.equal(interpretarConcepto("En proceso"), null);
  assert.equal(interpretarConcepto(""), null);
});

test("psicotécnica: fechas y puntajes", () => {
  assert.equal(leerFecha("24/11/2026"), "2026-11-24");
  assert.equal(leerFecha("2026-11-24"), "2026-11-24");
  assert.equal(leerFecha("Fecha: 3-1-2026"), "2026-01-03");
  assert.equal(leerFecha(46350), "2026-11-24", "número de fecha de Excel");
  assert.equal(leerFecha("31/13/2026"), null);
  assert.equal(leerPuntaje("85,5"), 85.5);
  assert.equal(leerPuntaje("90%"), 90);
  assert.equal(leerPuntaje("abc"), null);
});

test("psicotécnica: hoja de resultados con cabecera", () => {
  const filas = leerFilasResultados([
    ["Reporte de evaluados"],
    [],
    ["Nombre", "Número de documento", "Fecha de aplicación", "Puntaje", "Concepto final"],
    ["JUAN PÉREZ", "1.234.567", "20/11/2026", "82", "Apto"],
    ["ANA GÓMEZ", 7654321, "21/11/2026", "40", "No apto"],
    ["", "", "", "", ""],
    ["LUIS DÍAZ", "999888", "", "", "Pendiente"],
  ]);
  assert.ok(filas);
  assert.equal(filas!.length, 3);
  assert.deepEqual(filas![0], { fila: 4, cedula: "1234567", concepto: "Apto", estadoPrueba: null, resultado: "apto", fecha: "2026-11-20", puntaje: 82, nombre: "JUAN PÉREZ" });
  assert.equal(filas![1].resultado, "no_apto");
  assert.equal(filas![1].cedula, "7654321");
  assert.equal(filas![2].resultado, null, "pendiente: lo decide una persona");
  // Sin columnas de documento y resultado: no es una hoja de resultados.
  assert.equal(leerFilasResultados([["Documento", "Email"], ["123456", "a@b.co"]]), null);
});

test("psicotécnica: informe PDF", () => {
  const texto = `INFORME DE EVALUACIÓN PSICOSENSOMÉTRICA
  Nombre: JUAN PÉREZ   Documento de identidad: C.C. 1.234.567
  Fecha de aplicación: 20/11/2026
  Puntaje total: 78,5
  Concepto final: APTO CON OBSERVACIONES. Se recomienda...`;
  const r = leerInformePdf(texto, ["7654321", "1234567"]);
  assert.equal(r.cedula, "1234567");
  assert.equal(r.resultado, "apto_con_observaciones");
  assert.equal(r.fecha, "2026-11-20");
  assert.equal(r.puntaje, 78.5);
  // Una cédula que no está entre los inscritos: la que dice junto a «documento».
  assert.equal(leerInformePdf("Cédula: 55.444.333 Resultado: No apto", []).cedula, "55444333");
  assert.equal(leerInformePdf("Cédula: 55.444.333 Resultado: No apto", []).resultado, "no_apto");
});

// Textos inventados con la estructura de los informes reales de PsicoAlianza (muestras de GH, 24-nov-2026).
const DISC = `Datos del Candidato Nombre: Pedro Pablo Prueba Gomez Identificación: 1234567890 Proceso: Conductor - Cobrador Perfil: Conductor Edad: 30 Fecha: 20-11-2026 09:45:01 RESUMEN PERFIL EVALUADO: Conductor AJUSTE DEL CANDIDATO AL PERFIL: 0% 100% 81.43% 0% a 50% 51% a 75% 76% a 100% No Recomendado Recomendado con sugerencias Recomendado RASGO PREDOMINANTE ... ESCALA DE SIMULACIÓN Una alta simulación indica que la prueba fue respondida con un escaso nivel de sinceridad. Alta 75 Página 1 de 6`;
const ETHIKOS = `Datos del Candidato Nombre: Pedro Pablo Prueba Gomez Identificación: 1234567890 Proceso : Conductor - Cobrador Perfil: Perfil Estandar Edad: 30 Fecha: 21-11-2026 09:59:26 RESUMEN RESULTADO FINAL 82%RESULTADO OBTENIDO RESUMEN DE LA EVALUACIÓN ... NIVEL DE SINCERIDAD EN LAS RESPUESTAS La puntuación obtenida permite inferir que la persona respondió la prueba con un nivel de sinceridad medio. Medio 63 ... RESPUESTAS TOTAL DE PREGUNTAS 72 CONTESTADAS SIN CONTESTAR 72 0 El candidato respondió todas las preguntas.`;

test("PsicoAlianza: Ten DISC (la leyenda de la escala no es el concepto)", () => {
  const r = leerInformePsicoAlianza(DISC, "Ten DISC_1234567890_Pedro Prueba_20261120160621_84663.pdf");
  assert.equal(r.prueba, "Ten DISC");
  assert.equal(r.cedula, "1234567890");
  assert.equal(r.nombre, "Pedro Pablo Prueba Gomez");
  assert.equal(r.fecha, "2026-11-20");
  assert.equal(r.porcentaje, 81.43);
  assert.equal(r.resultado, "apto", "81,43 % es «Recomendado», aunque el texto diga «No Recomendado» en la leyenda");
  assert.equal(r.deducido, false, "el informe trae su escala: no hace falta confirmarlo");
  assert.equal(r.incompleta, false);
  assert.match(r.alertas.join(" "), /simulación alta \(75\)/);
  // Con 60 % es «con sugerencias»; con 40 %, no recomendado.
  assert.equal(leerInformePsicoAlianza(DISC.replace("81.43%", "60%"), "Ten DISC_1234567890_x.pdf").resultado, "apto_con_observaciones");
  assert.equal(leerInformePsicoAlianza(DISC.replace("81.43%", "40%"), "Ten DISC_1234567890_x.pdf").resultado, "no_apto");
});

test("PsicoAlianza: Ethikos (el concepto es imagen: sale del porcentaje)", () => {
  const r = leerInformePsicoAlianza(ETHIKOS, "Ethikos - Riesgos_1234567890_Pedro Prueba_20261120160227_84663.pdf");
  assert.equal(r.prueba, "Ethikos - Riesgos");
  assert.equal(r.porcentaje, 82);
  assert.equal(r.resultado, "apto");
  assert.equal(r.deducido, true);
  assert.equal(r.incompleta, false, "72 contestadas, 0 sin contestar");
  assert.deepEqual(r.alertas, [], "sinceridad media: sin alerta");
  // No la terminó: quedaron preguntas sin contestar.
  const inc = leerInformePsicoAlianza(ETHIKOS.replace("SIN CONTESTAR 72 0 El candidato respondió todas las preguntas.", "SIN CONTESTAR 50 22"), "Ethikos_1234567890_x.pdf");
  assert.equal(inc.incompleta, true);
  assert.match(inc.alertas.join(" "), /no la terminó \(22 de 72/);
  // Si el informe escribe el concepto, gana lo escrito.
  const escrito = leerInformePsicoAlianza(ETHIKOS.replace("RESULTADO FINAL 82%", "RESULTADO FINAL NO RECOMENDADO 82%"), "Ethikos_1234567890_x.pdf");
  assert.equal(escrito.resultado, "no_apto");
  assert.equal(escrito.deducido, false);
});

test("PsicoAlianza: las pruebas de un aspirante en un solo resultado", () => {
  const disc = leerInformePsicoAlianza(DISC.replace("81.43%", "60%"), "Ten DISC_1234567890_x.pdf");
  const eth = leerInformePsicoAlianza(ETHIKOS, "Ethikos - Riesgos_1234567890_x.pdf");
  const c = combinarPruebas([eth, disc]);
  assert.equal(c.resultado, "apto_con_observaciones", "gana el peor");
  assert.equal(c.fecha, "2026-11-21", "la más reciente");
  assert.equal(c.puntaje, 60, "el porcentaje más bajo");
  assert.match(c.detalle, /Ethikos - Riesgos: Recomendado \(82 %\) deducido · Ten DISC: Recomendado con sugerencias \(60 %\)/);
  assert.equal(combinarPruebas([eth, { ...disc, resultado: null }]).resultado, null, "si una no tiene concepto, lo decide una persona");
  assert.equal(combinarPruebas([eth, { ...disc, incompleta: true }]).incompleta, true);
});

test("PsicoAlianza: no la presentó o no la terminó (Excel)", () => {
  assert.equal(interpretarEstadoPrueba("No presentó"), "no_presento");
  assert.equal(interpretarEstadoPrueba("Ausente"), "no_presento");
  assert.equal(interpretarEstadoPrueba("Sin presentar"), "no_presento");
  assert.equal(interpretarEstadoPrueba("Incompleta"), "incompleta");
  assert.equal(interpretarEstadoPrueba("No terminó la prueba"), "incompleta");
  assert.equal(interpretarEstadoPrueba("Apto"), null);
  const filas = leerFilasResultados([["Documento", "Resultado"], ["123456", "No presentó"], ["654321", "Incompleta"], ["111222", "Apto"]]);
  assert.deepEqual(filas!.map((f) => [f.estadoPrueba ?? null, f.resultado]), [["no_presento", null], ["incompleta", null], [null, "apto"]]);
});

test("psicotécnica: riesgos para conducir → se sugiere «con sugerencias» (27-nov-2026)", () => {
  const ethikos = [
    "Datos del Candidato Nombre: Persona De Prueba Identificación: 900000001 Fecha: 24-06-2025 09:59:26",
    "RESULTADO FINAL RESULTADO OBTENIDO 82%",
    "Tratamiento de la Información 81.0 Veracidad 81.0 Conducta No Fraudulenta 66.0 Abstinencia del uso de SPA y Alcohol 70.0 No Violencia 70.0",
    "Riesgos del Evaluado frente al Cargo Permite identificar aspectos puntuales que requieren ser revisados, teniendo en cuenta respuestas específicas del candidato(a) que podrían convertirse en un riesgo potencial.",
    "El(la) Sr. (Sra.) Prueba considera que el consumo moderado de alcohol en horario laboral no necesariamente conduce a errores en el trabajo.",
    "Esta persona prefiere no ser tan sincera cuando está en medio de un conflicto para evitar que la situación empeore.",
    "Especificaciones a considerar frente al Cargo …",
    "TOTAL DE PREGUNTAS 72 CONTESTADAS SIN CONTESTAR 72 0",
  ].join("\n");
  const e = leerInformePsicoAlianza(ethikos, "Ethikos - Riesgos_900000001_Persona_1.pdf");
  assert.equal(e.resultado, "apto");
  assert.ok(e.alertas.some((a) => /riesgo: El\(la\) Sr\. \(Sra\.\) Prueba considera/.test(a)), "la frase no se corta en «Sr.»");
  assert.ok(e.alertas.some((a) => /Conducta no fraudulenta 66 \(tendencia a mejorar\)/.test(a)));
  assert.ok(e.alertas.some((a) => /Abstinencia del uso de SPA y alcohol 70/.test(a)));
  assert.ok(!e.alertas.some((a) => /Veracidad/.test(a)), "81 no es riesgo");
  assert.deepEqual(e.riesgosConducir, ["riesgo señalado sobre alcohol", "Abstinencia del uso de SPA y alcohol 70", "No violencia 70"]);

  const disc = "Identificación: 900000001 AJUSTE DEL CANDIDATO AL PERFIL: 0% 100% 81.43% 0% a 50% 51% a 75% 76% a 100% No Recomendado Recomendado con sugerencias Recomendado Control de Impulsos Ajuste:(95.7%) Rumor Ajuste:(60%) ESCALA DE SIMULACIÓN Una alta simulación indica que la prueba fue respondida con un escaso nivel de sinceridad. Baja 20";
  const d = leerInformePsicoAlianza(disc, "Ten DISC_900000001_Persona_2.pdf");
  assert.equal(d.resultado, "apto");
  assert.ok(d.alertas.some((a) => /Rumor con ajuste de 60 %/.test(a)));
  assert.deepEqual(d.riesgosConducir, [], "el rumor no pesa para conducir y la simulación es baja");

  const c = combinarPruebas([e, d]);
  assert.equal(c.resultado, "apto_con_observaciones");
  assert.match(c.alertas[0], /^Sugerencia de Gestivo: «Recomendado con sugerencias».*alcohol/);
  assert.match(c.detalle, /Ethikos - Riesgos: Recomendado \(82 %\)/, "el detalle guarda lo que dice el informe");
  assert.equal(combinarPruebas([d]).resultado, "apto", "sin riesgos para conducir queda como dice el informe");
});
