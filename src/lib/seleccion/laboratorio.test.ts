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
