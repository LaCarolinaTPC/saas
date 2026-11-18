import { test } from "node:test";
import assert from "node:assert/strict";
import { compararConChat, fotosADescartar, interpretarLecturaCedula, lecturaIlegible, resumenLectura } from "./lectura-cedula";

const JSON_REVERSO = [
  "```json",
  '{"es_cedula": true, "lado": "reverso", "numero": "72.009.959", "apellidos": null, "nombres": null, "fecha_nacimiento": "1979-05-02", "lugar_nacimiento": "BARRANQUILLA (ATLANTICO)", "sexo": "M", "rh": "O+", "fecha_expedicion": "1997-11-07", "lugar_expedicion": "BARRANQUILLA", "problemas": null}',
  "```",
].join("\n");

test("lectura de la cédula: interpreta el JSON del modelo y valida los datos", () => {
  const l = interpretarLecturaCedula(JSON_REVERSO);
  assert.ok(l);
  assert.equal(l.numero, "72009959");
  assert.equal(l.lado, "reverso");
  assert.equal(l.fechaExpedicion, "1997-11-07");
  assert.equal(l.sexo, "M");
  // Fecha imposible: null, no se adivina.
  assert.equal(interpretarLecturaCedula('{"es_cedula": true, "fecha_expedicion": "1997-02-30"}')?.fechaExpedicion, null);
  assert.equal(interpretarLecturaCedula('{"es_cedula": false}')?.esCedula, false);
  assert.equal(interpretarLecturaCedula("no puedo leer esto"), null);
});

test("lectura de la cédula: comparación con lo dicho en el chat", () => {
  const l = interpretarLecturaCedula('{"es_cedula": true, "numero": "72009959", "fecha_expedicion": "1997-11-07"}')!;
  const c = compararConChat(l, { cedula: "72009959", fecha_expedicion: "1997-11-08", fecha_nacimiento: null });
  assert.equal(c.find((x) => x.dato === "Número de cédula")?.coincide, true);
  assert.equal(c.find((x) => x.dato === "Fecha de expedición")?.coincide, false);
  assert.equal(c.find((x) => x.dato === "Fecha de nacimiento")?.coincide, null);
});

test("resumen de la lectura: lo leído, lo que falta, en qué lado, y sin el nombre", () => {
  const l = interpretarLecturaCedula('{"es_cedula": true, "tipo_cedula": "amarilla", "lado": "frente", "numero": "72009959", "nombres": "ALEXANDER"}')!;
  const r = resumenLectura(l);
  assert.match(r, /cédula amarilla \(frente\); número 72009959/);
  assert.match(r, /faltan los datos del reverso: pídele la foto del reverso o que escriba/);
  assert.ok(!r.includes("ALEXANDER"));
  const reverso = resumenLectura(interpretarLecturaCedula('{"es_cedula": true, "tipo_cedula": "amarilla", "lado": "reverso", "fecha_expedicion": "1997-11-07", "fecha_nacimiento": "1979-05-02"}')!);
  assert.match(reverso, /falta el número, que va en el frente/);
  const digital = resumenLectura(interpretarLecturaCedula('{"es_cedula": true, "tipo_cedula": "digital", "lado": "frente", "numero": "72009959", "fecha_nacimiento": "1979-05-02"}')!);
  assert.match(digital, /no se leyó la fecha de expedición: pídele que lo escriba o una foto más clara/);
  const completa = resumenLectura(interpretarLecturaCedula('{"es_cedula": true, "tipo_cedula": "digital", "lado": "frente", "numero": "72009959", "fecha_expedicion": "1997-11-07", "fecha_nacimiento": "1979-05-02"}')!);
  assert.ok(!completa.includes("pídele"));
  assert.equal(resumenLectura(interpretarLecturaCedula('{"es_cedula": false}')!), "no parece una cédula de ciudadanía");
});

test("fotos a descartar: las borrosas y las que otra foto del mismo lado reemplaza", () => {
  const L = (json: string) => interpretarLecturaCedula(json)!;
  const borrosa = L('{"es_cedula": true, "tipo_cedula": "amarilla", "lado": "frente", "problemas": "foto borrosa"}');
  const frenteParcial = L('{"es_cedula": true, "tipo_cedula": "amarilla", "lado": "frente", "numero": null, "fecha_nacimiento": null, "problemas": "reflejo", "fecha_expedicion": null, "nombres": "ALEX"}');
  const frente = L('{"es_cedula": true, "tipo_cedula": "amarilla", "lado": "frente", "numero": "72009959"}');
  const frenteOtra = L('{"es_cedula": true, "tipo_cedula": "amarilla", "lado": "frente", "numero": "72009959"}');
  const reverso = L('{"es_cedula": true, "tipo_cedula": "amarilla", "lado": "reverso", "fecha_expedicion": "1997-11-07", "fecha_nacimiento": "1979-05-02"}');
  const licencia = L('{"es_cedula": false}');

  assert.ok(lecturaIlegible(borrosa));
  assert.ok(lecturaIlegible(frenteParcial));
  assert.ok(!lecturaIlegible(frente));
  assert.ok(!lecturaIlegible(licencia));

  // Borrosa, luego el frente bien, el reverso y una foto que no es cédula.
  const fuera = fotosADescartar([borrosa, frente, reverso, licencia]);
  assert.deepEqual([...fuera.entries()], [[0, "ilegible"]]);
  // El mismo frente dos veces: se queda el último. Frente y reverso no se reemplazan.
  assert.deepEqual([...fotosADescartar([frente, reverso, frenteOtra]).entries()], [[0, "reemplazada"]]);
  // Una nueva que no leyó la fecha que sí leyó la vieja no la reemplaza.
  const reversoSinNacimiento = L('{"es_cedula": true, "lado": "reverso", "fecha_expedicion": "1997-11-07"}');
  assert.equal(fotosADescartar([reverso, reversoSinNacimiento]).size, 0);
  // Datos que se contradicen: no se reemplaza (puede ser otra cédula).
  const otroNumero = L('{"es_cedula": true, "lado": "frente", "numero": "11111111"}');
  assert.equal(fotosADescartar([frente, otroNumero]).size, 0);
  // La que trae ambos lados reemplaza al frente.
  const ambos = L('{"es_cedula": true, "tipo_cedula": "digital", "lado": "ambos", "numero": "72009959", "fecha_expedicion": "1997-11-07", "fecha_nacimiento": "1979-05-02"}');
  assert.deepEqual([...fotosADescartar([frente, ambos]).entries()], [[0, "reemplazada"]]);
});
