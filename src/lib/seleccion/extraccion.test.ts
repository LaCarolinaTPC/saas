import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PREFILTRO_VACIO, edadDesdeFecha, edadEfectiva, extraerJson, faltantes, fechaValida, fusionarPrefiltro, interpretarExtraccion,
  prefiltroCompleto, transcribir, SISTEMA_EXTRACCION,
  type DatosPrefiltro,
} from "./extraccion";

test("transcribir numera solo los mensajes del aspirante", () => {
  const { texto, idPorNumero } = transcribir([
    { id: "a", direccion: "entrante", contenido: "Hola, estoy interesado", mediaTipo: null },
    { id: "b", direccion: "saliente", contenido: "¿Cuántos años tienes?", mediaTipo: null },
    { id: "c", direccion: "entrante", contenido: "", mediaTipo: "document" },
  ]);
  assert.match(texto, /^\[1\] Aspirante: Hola/);
  assert.match(texto, /Asistente: ¿Cuántos/);
  assert.match(texto, /\[2\] Aspirante: \[Envió un documento\]/);
  assert.equal(idPorNumero.get(2), "c");
});

test("extraerJson tolera cercas de código y texto alrededor", () => {
  assert.deepEqual(extraerJson('Claro:\n```json\n{"edad": 30}\n```'), { edad: 30 });
  assert.equal(extraerJson("no hay json"), null);
  assert.equal(extraerJson("{roto"), null);
});

test("interpretar valida y limpia cada campo", () => {
  const d = interpretarExtraccion(
    JSON.stringify({
      nombre: "  Carlos   Pérez ",
      cedula: "1.045.678.901",
      edad: "35 años",
      ciudad: "Soledad",
      dispuesto_traslado: null,
      licencia: "C2",
      experiencia_meses: 24,
      hoja_vida: true,
      autorizacion: "si",
      autorizacion_mensaje: 7,
      busca_trabajo: true,
    })
  )!;
  assert.equal(d.nombre, "Carlos Pérez");
  assert.equal(d.cedula, "1045678901");
  assert.equal(d.edad, 35);
  assert.equal(d.autorizacion, "si");
  assert.equal(d.autorizacion_mensaje, 7);
});

test("interpretar descarta valores imposibles en lugar de inventar", () => {
  const d = interpretarExtraccion('{"cedula": "12", "edad": 150, "experiencia_meses": -3, "autorizacion": "tal vez", "autorizacion_mensaje": 4}')!;
  assert.equal(d.cedula, null);
  assert.equal(d.edad, null);
  assert.equal(d.experiencia_meses, null);
  assert.equal(d.autorizacion, null);
  // Sin autorización no se guarda el número de mensaje.
  assert.equal(d.autorizacion_mensaje, null);
  assert.equal(d.busca_trabajo, true);
  assert.equal(interpretarExtraccion("lo siento, no puedo"), null);
});

test("fusionar: lo nuevo corrige, un null no borra y la hoja de vida no se pierde", () => {
  const antes: DatosPrefiltro = { ...PREFILTRO_VACIO, nombre: "Carlos", edad: 30, hoja_vida: true };
  const ahora: DatosPrefiltro = { ...PREFILTRO_VACIO, edad: 31, licencia: "C3", autorizacion: "si", autorizacion_mensaje: 5 };
  const f = fusionarPrefiltro(antes, ahora);
  assert.equal(f.nombre, "Carlos");
  assert.equal(f.edad, 31);
  assert.equal(f.licencia, "C3");
  assert.equal(f.hoja_vida, true);
  assert.equal(f.autorizacion_mensaje, 5);
  // Una extracción posterior sin autorización conserva la anterior y su mensaje.
  const g = fusionarPrefiltro(f, { ...PREFILTRO_VACIO });
  assert.equal(g.autorizacion, "si");
  assert.equal(g.autorizacion_mensaje, 5);
});

test("prefiltro completo con los datos, la hoja de vida y la autorización", () => {
  const d: DatosPrefiltro = {
    ...PREFILTRO_VACIO,
    nombre: "Carlos", cedula: "1045678901", fecha_expedicion: "2008-07-21", edad: 35, ciudad: "Barranquilla", licencia: "C2", experiencia_meses: 24,
    hoja_vida: true, autorizacion: "si", autorizacion_mensaje: 9,
  };
  assert.equal(prefiltroCompleto(d), true);
  assert.deepEqual(faltantes(d), []);
  assert.equal(prefiltroCompleto({ ...d, hoja_vida: false }), false);
  assert.deepEqual(faltantes({ ...d, ciudad: null }), ["ciudad o traslado"]);
  // El traslado sin ciudad también cuenta como residencia.
  assert.equal(prefiltroCompleto({ ...d, ciudad: null, dispuesto_traslado: true }), true);
});

test("el nombre ya no hace falta: sale del RUNT; la fecha de nacimiento reemplaza a la edad", () => {
  const d: DatosPrefiltro = {
    ...PREFILTRO_VACIO,
    cedula: "1045678901", fecha_expedicion: "2008-07-21", fecha_nacimiento: "1990-05-20", ciudad: "Soledad", licencia: "C2", experiencia_meses: 24,
    hoja_vida: true, autorizacion: "si", autorizacion_mensaje: 3,
  };
  assert.equal(prefiltroCompleto(d), true);
  assert.deepEqual(faltantes(d), []);
  assert.deepEqual(faltantes({ ...d, fecha_nacimiento: null }), ["fecha de nacimiento"]);
  assert.deepEqual(faltantes({ ...d, cedula: null }), ["cédula"]);
  // La fecha de expedición es necesaria para seguir (la exige el RNMC).
  assert.equal(prefiltroCompleto({ ...d, fecha_expedicion: null }), false);
  assert.deepEqual(faltantes({ ...d, fecha_expedicion: null }), ["fecha de expedición de la cédula"]);
});

test("fecha de nacimiento: se valida y la edad se calcula a la fecha", () => {
  assert.equal(fechaValida("1985-3-15"), "1985-03-15");
  assert.equal(fechaValida("1985-02-30"), null);
  assert.equal(fechaValida("15/03/1985"), null);
  assert.equal(edadDesdeFecha("1985-03-15", "2026-03-14"), 40);
  assert.equal(edadDesdeFecha("1985-03-15", "2026-03-15"), 41);
  assert.equal(edadDesdeFecha("2020-01-01", "2026-11-17"), null); // 6 años: no es posible
  // Manda la fecha sobre la edad dicha; sin fecha, la dicha.
  assert.equal(edadEfectiva({ edad: 30, fecha_nacimiento: "1990-05-20" }, "2026-11-17"), 36);
  assert.equal(edadEfectiva({ edad: 30, fecha_nacimiento: null }, "2026-11-17"), 30);
  const r = interpretarExtraccion('{"cedula": "1.045.678.901", "fecha_nacimiento": "1990-05-20", "busca_trabajo": true}');
  assert.equal(r?.fecha_nacimiento, "1990-05-20");
  assert.equal(r?.nombre, null);
  assert.equal(interpretarExtraccion('{"fecha_nacimiento": "20 de mayo"}')?.fecha_nacimiento, null);
  // Una fecha nueva no se borra con un null posterior.
  assert.equal(fusionarPrefiltro(r, { ...PREFILTRO_VACIO }).fecha_nacimiento, "1990-05-20");
});

test("fecha de expedición de la cédula: se lee aparte de la de nacimiento", () => {
  const r = interpretarExtraccion('{"cedula": "1045678901", "fecha_expedicion": "2008-07-21", "fecha_nacimiento": "1990-05-20", "busca_trabajo": true}');
  assert.equal(r?.fecha_expedicion, "2008-07-21");
  assert.equal(r?.fecha_nacimiento, "1990-05-20");
  assert.equal(interpretarExtraccion('{"fecha_expedicion": "21/07/2008"}')?.fecha_expedicion, null);
  assert.equal(fusionarPrefiltro(r, { ...PREFILTRO_VACIO }).fecha_expedicion, "2008-07-21");
});

test("la lectura automática de la foto entra en la transcripción y solo cuenta confirmada", () => {
  const { texto } = transcribir([{ id: "a", direccion: "entrante", contenido: "", mediaTipo: "image", lectura: "cédula (reverso); número 72009959" }]);
  assert.match(texto, /\[Lectura automática de la foto: cédula \(reverso\); número 72009959\]/);
  assert.ok(SISTEMA_EXTRACCION.includes("solo si la persona los confirmó"));
});
