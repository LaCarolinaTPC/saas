import { test } from "node:test";
import assert from "node:assert/strict";
import { asociarProceso, faseDeEstado, interpretarLecturaLaboratorio, lecturaSinModelo, type ProcesoEnExamenes } from "./laboratorio";

test("laboratorio: interpreta el JSON del modelo y descarta lo que no sirve", () => {
  const r = interpretarLecturaLaboratorio(
    'Aquí va: [{"nombre":"JUAN PÉREZ GÓMEZ","cedula":"1.096.229.643","fase":1,"resultado":"apto","observacion":"usar lentes"},{"nombre":null,"cedula":null},{"nombre":"ANA RUIZ","cedula":"12","fase":3,"resultado":"aplazado"}]'
  );
  assert.deepEqual(r, [
    { nombre: "JUAN PÉREZ GÓMEZ", cedula: "1096229643", fase: 1, resultado: "apto", observacion: "usar lentes" },
    // «Aplazado» es un resultado desde el 21-nov-2026 (Salud Ocupacional).
    { nombre: "ANA RUIZ", cedula: null, fase: null, resultado: "aplazado", observacion: null },
  ]);
  assert.equal(interpretarLecturaLaboratorio('[{"nombre":"X Y","resultado":"pendiente"}]')![0].resultado, null);
  assert.deepEqual(interpretarLecturaLaboratorio("[]"), []);
  assert.equal(interpretarLecturaLaboratorio("No hay resultados."), null);
  assert.equal(interpretarLecturaLaboratorio("[{roto"), null);
});

test("laboratorio: sin modelo saca las cédulas del texto y no los celulares", () => {
  assert.deepEqual(lecturaSinModelo(["Resultados de 1096229643 y 72.009.959", "llamar al 3001234567"]).map((l) => l.cedula), ["1096229643", "72009959"]);
});

const PROCESOS: ProcesoEnExamenes[] = [
  { id: "a", nombre: "JUAN CARLOS PEREZ GOMEZ", cedula: "1096229643", estado: "en_examenes" },
  { id: "b", nombre: "ANA MARIA RUIZ DIAZ", cedula: "72009959", estado: "en_examenes_fase2" },
  { id: "c", nombre: "PEDRO RUIZ DIAZ", cedula: "80111222", estado: "en_examenes" },
];
const l = (nombre: string | null, cedula: string | null = null) => ({ nombre, cedula, fase: null, resultado: null, observacion: null });

test("laboratorio: asocia por cédula, por nombre (con una letra de diferencia) y nunca a ciegas", () => {
  assert.equal(asociarProceso(l(null, "72009959"), PROCESOS)?.id, "b");
  assert.equal(asociarProceso(l("Juan Pérez Gómez"), PROCESOS)?.id, "a");
  assert.equal(asociarProceso(l("Juan Peres Gomez"), PROCESOS)?.id, "a");
  // «Ruiz Díaz» coincide con dos aspirantes: lo asigna una persona.
  assert.equal(asociarProceso(l("Ruiz Diaz"), PROCESOS), null);
  // Un solo nombre no basta.
  assert.equal(asociarProceso(l("Pedro"), PROCESOS), null);
  assert.equal(asociarProceso(l("Luis Torres"), PROCESOS), null);
});

test("laboratorio: la fase sale del estado si el laboratorio no la dice", () => {
  assert.equal(faseDeEstado("en_examenes"), 1);
  assert.equal(faseDeEstado("en_examenes_fase2"), 2);
  assert.equal(faseDeEstado("citado"), null);
});

test("laboratorio: el resultado por la frase acordada", async () => {
  const { resultadoPorFrase, tieneFrases } = await import("./laboratorio");
  const frases = { apto: "Puede continuar a segunda fase", no_apto: "No puede continuar", aplazado: "Aplazado" };
  const juan = { nombre: "JUAN PEREZ GOMEZ", cedula: "1096229643" };
  assert.equal(resultadoPorFrase("JUAN PEREZ CC 1096229643: PUEDE CONTINUAR A SEGUNDA FASE.", juan, false, frases), "apto");
  assert.equal(resultadoPorFrase("Juan Pérez, cédula 1.096.229.643 — no puede continuar", juan, false, frases), "no_apto");
  assert.equal(resultadoPorFrase("Juan: aplazado por hemograma", juan, false, frases), "aplazado");
  assert.equal(resultadoPorFrase("Juan: pendiente", juan, false, frases), null);
  // Sin la frase de «no apto», un «no puede continuar a segunda fase» no se toma como apto.
  assert.equal(resultadoPorFrase("Juan NO puede continuar a segunda fase", juan, false, { apto: "puede continuar a segunda fase" }), null);
  // Dos resultados distintos en el mismo mensaje de una persona: no se decide.
  assert.equal(resultadoPorFrase("Juan puede continuar a segunda fase, aplazado optometría", juan, false, frases), null);
  // Varias personas: cuenta la línea de cada una.
  const varias = "JUAN PEREZ CC 1096229643 puede continuar a segunda fase\nANA RUIZ CC 22334455 no puede continuar";
  assert.equal(resultadoPorFrase(varias, juan, true, frases), "apto");
  assert.equal(resultadoPorFrase(varias, { nombre: "ANA RUIZ", cedula: "22334455" }, true, frases), "no_apto");
  assert.equal(resultadoPorFrase(varias, { nombre: "PEDRO SOLO", cedula: "99999999" }, true, frases), null);
  // Sin frases.
  assert.equal(resultadoPorFrase("Juan apto", juan, false, null), null);
  assert.equal(resultadoPorFrase("Juan apto", juan, false, { apto: "  " }), null);
  assert.equal(tieneFrases({ apto: "Puede continuar" }), true);
  assert.equal(tieneFrases({ apto: "", no_apto: null }), false);
});

test("laboratorio: apto solo con la frase (o una variante); en la fase 1, otro resultado es no apto salvo «aplazado»", async () => {
  const { decidirResultado, sistemaLaboratorio, interpretarLecturaLaboratorio, FRASE_APTO_POR_DEFECTO } = await import("./laboratorio");
  const juan = { nombre: "JUAN PEREZ", cedula: "1096229643", fase: 1 as const, observacion: null };
  // La frase por defecto, exacta (con o sin «sí», con o sin tildes): apto y se registra solo.
  assert.deepEqual(decidirResultado("JUAN PEREZ CC 1096229643: Sí, puede pasar a fase 2", { ...juan, resultado: "apto" }, false, null, 1), { resultado: "apto", automatico: true });
  assert.deepEqual(decidirResultado("Juan: puede pasar a fase 2", { ...juan, resultado: null }, false, null, 1), { resultado: "apto", automatico: true });
  // Una variante que la IA reconoce como la frase: apto.
  assert.deepEqual(decidirResultado("Juan ya puede seguir a la segunda fase", { ...juan, resultado: "apto", frase: true }, false, null, 1), { resultado: "apto", automatico: true });
  // Otro texto de resultado (la IA dice apto, pero no es la frase): no apto.
  assert.deepEqual(decidirResultado("Juan apto", { ...juan, resultado: "apto" }, false, null, 1), { resultado: "no_apto", automatico: true });
  assert.deepEqual(decidirResultado("Juan no puede pasar a fase 2", { ...juan, resultado: "no_apto" }, false, null, 1), { resultado: "no_apto", automatico: true });
  // «Aplazado» especificado: aplazado.
  assert.deepEqual(decidirResultado("Juan aplazado por hemograma", { ...juan, resultado: "aplazado" }, false, null, 1), { resultado: "aplazado", automatico: true });
  // Sin resultado (un saludo, «pendiente»): no se decide.
  assert.deepEqual(decidirResultado("Juan está pendiente", { ...juan, resultado: null }, false, null, 1), { resultado: null, automatico: false });
  // En la fase 2 la regla no aplica: lo confirma una persona.
  assert.deepEqual(decidirResultado("Juan apto en fase 2", { ...juan, fase: 2, resultado: "apto" }, false, null, 2), { resultado: "apto", automatico: false });
  // Un archivo solo (sin texto) que la IA lee como apto sin la frase: lo confirma una persona, no se vuelve no apto.
  assert.deepEqual(decidirResultado("", { ...juan, resultado: "apto" }, false, null, 1, { soloArchivo: true }), { resultado: "apto", automatico: false });
  assert.deepEqual(decidirResultado("", { ...juan, resultado: "no_apto" }, false, null, 1, { soloArchivo: true }), { resultado: "no_apto", automatico: true });
  // La frase de apto repetida con el aspirante ya en la fase 2 no aprueba la fase 2.
  assert.deepEqual(decidirResultado("Juan: Sí, puede pasar a fase 2", { ...juan, fase: null, resultado: "apto" }, false, null, 2), { resultado: "apto", automatico: false });
  // Fase 2 (27-nov-2026): resultados médicos, siempre los registra una persona; la frase solo propone.
  assert.deepEqual(decidirResultado("Juan: No continúa", { ...juan, fase: 2, resultado: null }, false, { no_apto: "No continúa" }, 2), { resultado: "no_apto", automatico: false });
  assert.deepEqual(decidirResultado("Juan aplazado por hemograma", { ...juan, fase: 2, resultado: "aplazado" }, false, null, 2), { resultado: "aplazado", automatico: false });
  // La IA recibe la frase y la instrucción de las variantes; su marca se lee.
  assert.match(sistemaLaboratorio(null), new RegExp(FRASE_APTO_POR_DEFECTO));
  assert.match(sistemaLaboratorio({ apto: "Continúa" }), /«Continúa»/);
  assert.equal(interpretarLecturaLaboratorio('[{"nombre":"JUAN PEREZ","cedula":"1096229643","fase":1,"resultado":"apto","frase":true}]')![0].frase, true);
  assert.equal(interpretarLecturaLaboratorio('[{"nombre":"JUAN PEREZ","resultado":"apto","frase":false}]')![0].frase, undefined);
});
