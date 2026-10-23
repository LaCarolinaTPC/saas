import { test } from "node:test";
import assert from "node:assert/strict";
import {
  claseDesdeLesionados,
  faltantesVehiculoPropio,
  flagsDesdeCodigos,
  formatoDesdeRegistro,
  pareceInterno,
  placaNormalizada,
  vehiculoPropioVacio,
} from "./formato";

test("sin N.º interno no se puede guardar el reporte", () => {
  assert.deepEqual(faltantesVehiculoPropio(vehiculoPropioVacio()), ["N.º interno del vehículo"]);
  // Tener placa NO alcanza: así se guardaron 6 de los 7 reportes sin vehículo.
  assert.deepEqual(faltantesVehiculoPropio({ ...vehiculoPropioVacio(), placa: "TZK544" }), [
    "N.º interno del vehículo",
  ]);
  assert.deepEqual(faltantesVehiculoPropio({ ...vehiculoPropioVacio(), codigo: "  " }), [
    "N.º interno del vehículo",
  ]);
  assert.deepEqual(faltantesVehiculoPropio(null), ["N.º interno del vehículo"]);
  assert.deepEqual(faltantesVehiculoPropio({ ...vehiculoPropioVacio(), codigo: "125" }), []);
});

test("la placa se normaliza para poder buscarla", () => {
  // El caso real del reporte #1589: dos espacios, y así no encontraba el bus.
  assert.equal(placaNormalizada("STL  243"), "STL243");
  assert.equal(placaNormalizada("stl-243"), "STL243");
  assert.equal(placaNormalizada(" TZK 544 "), "TZK544");
});

test("un número escrito en «Placa» se reconoce como N.º interno", () => {
  // Caso real del reporte #1572: escribieron 534, que es el interno.
  assert.equal(pareceInterno("534"), true);
  assert.equal(pareceInterno(" 125 "), true);
  assert.equal(pareceInterno("TZK544"), false);
  assert.equal(pareceInterno(""), false);
});

const FACTORES = [
  { codigo: "110", factor_politica: "fatiga_comprobada" as const },
  { codigo: "116", factor_politica: "exceso_velocidad" as const },
  { codigo: "121", factor_politica: "no_guardar_distancia" as const },
  { codigo: "139", factor_politica: null },
];

test("los códigos marcados activan los factores de la política", () => {
  assert.deepEqual(flagsDesdeCodigos(["116", "139"], FACTORES, false), {
    exceso_velocidad: true,
    uso_celular: false,
    no_guardar_distancia: false,
    fatiga_comprobada: false,
  });
  const todos = flagsDesdeCodigos(["110", "121"], FACTORES, true);
  assert.equal(todos.fatiga_comprobada, true);
  assert.equal(todos.no_guardar_distancia, true);
  assert.equal(todos.uso_celular, true);
});

test("un código sin mapeo no suma al puntaje", () => {
  const f = flagsDesdeCodigos(["139", "999"], FACTORES, false);
  assert.ok(Object.values(f).every((v) => v === false));
});

test("la clase del formato sale de los lesionados", () => {
  assert.equal(claseDesdeLesionados("ninguno"), "simple");
  assert.equal(claseDesdeLesionados("leves"), "lesionado");
  assert.equal(claseDesdeLesionados("incapacitantes"), "lesionado");
  assert.equal(claseDesdeLesionados("fatal"), "muerto");
  assert.equal(claseDesdeLesionados(null), null);
});

test("un reporte anterior se adapta al formato", () => {
  const f = formatoDesdeRegistro(
    {
      factores_codigos: [],
      fact_exceso_velocidad: true,
      fact_fatiga: true,
      fact_uso_celular: true,
      tiene_peaton: true,
      peaton_nombre: "ANA PÉREZ",
      peaton_cedula: "123",
    },
    [
      { es_propio: true, placa: "TSK123" },
      { es_propio: false, placa: "ABC987", descripcion: "el que nos chocó" },
    ],
    [],
    FACTORES
  );
  assert.deepEqual(f.factores_codigos, ["116", "110"]);
  assert.equal(f.uso_celular, true);
  assert.equal(f.vehiculo_propio.placa, "TSK123");
  assert.equal(f.terceros.length, 1);
  assert.equal(f.terceros[0].placa, "ABC987");
  assert.equal(f.victimas.length, 1);
  assert.equal(f.victimas[0].condicion, "peaton");
  assert.equal(f.victimas[0].nombre, "ANA PÉREZ");
});

test("un reporte nuevo conserva sus códigos y víctimas", () => {
  const f = formatoDesdeRegistro(
    { factores_codigos: ["139"], fact_exceso_velocidad: true, vehiculo_placa: "XYZ111", tiene_ipat: false },
    [],
    [{ nombre: "LUIS", condicion: "usuario", fallecido: false }],
    FACTORES
  );
  assert.deepEqual(f.factores_codigos, ["139"]);
  assert.equal(f.vehiculo_propio.placa, "XYZ111");
  assert.equal(f.vehiculo_propio.tiene_ipat, false);
  assert.equal(f.vehiculo_propio.empresa, null);
  assert.equal(f.victimas[0].condicion, "usuario");
});
