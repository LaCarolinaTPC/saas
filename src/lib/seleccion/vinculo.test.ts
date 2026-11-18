import { test } from "node:test";
import assert from "node:assert/strict";
import { cedulaNormalizada, cedulasMencionadas, resumenVinculo, type VinculoEmpresa } from "./vinculo";

test("cédulas mencionadas: con puntos o espacios, sin celulares ni números cortos", () => {
  assert.deepEqual(cedulasMencionadas(["mi cédula es 1.007.892.713 expedida el 9 de feb de 2009"]), ["1007892713"]);
  assert.deepEqual(cedulasMencionadas(["72 009 959", "mi cel 3001234567", "tengo 37 años"]), ["72009959"]);
  assert.deepEqual(cedulasMencionadas(["72009959", "sí, 72009959"]), ["72009959"]);
  assert.deepEqual(cedulasMencionadas(["hola"]), []);
});

test("cédula normalizada", () => {
  assert.equal(cedulaNormalizada("72.009.959"), "72009959");
  assert.equal(cedulaNormalizada("123"), null);
  assert.equal(cedulaNormalizada(null), null);
});

test("resumen del vínculo para la ficha", () => {
  const base: VinculoEmpresa = { tipo: "retirado", cedula: "1", nombre: null, codigo: "C123", fechaIngreso: "2020-01-10", fechaRetiro: "2024-05-02", causaRetiro: "RENUNCIA_VOLUNTARIA", notaRetiro: "Se fue a otra ciudad" };
  assert.equal(resumenVinculo(base), "Trabajó en la empresa como conductor (código C123); del 2020-01-10 al 2024-05-02; causa de retiro: Renuncia voluntaria; nota: Se fue a otra ciudad.");
  assert.match(resumenVinculo({ ...base, causaRetiro: null, notaRetiro: null }), /causa de retiro: sin registrar\.$/);
  assert.equal(resumenVinculo({ ...base, tipo: "activo" }), "Ya es conductor activo de la empresa (código C123), desde el 2020-01-10.");
});
