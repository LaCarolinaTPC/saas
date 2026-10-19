import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MARCACIONES,
  momentoDesdeLocal,
  normalizarCedula,
  validarLote,
} from "./lote";

/** Marcación mínima válida, para variar un campo a la vez. */
function marca(extra: Record<string, unknown> = {}) {
  return { id: 1, pin: "27", momento: "2026-10-13T06:42:10", ...extra };
}

test("normalizarCedula: el '0' del equipo no es una cédula", () => {
  assert.equal(normalizarCedula("0"), null);
  assert.equal(normalizarCedula("000"), null);
  assert.equal(normalizarCedula(""), null);
  assert.equal(normalizarCedula(null), null);
  assert.equal(normalizarCedula(undefined), null);
  // Demasiado corta o demasiado larga para ser cédula.
  assert.equal(normalizarCedula("123"), null);
  assert.equal(normalizarCedula("1".repeat(21)), null);
});

test("normalizarCedula: deja solo dígitos", () => {
  assert.equal(normalizarCedula("72197769"), "72197769");
  assert.equal(normalizarCedula(" 72.197.769 "), "72197769");
  assert.equal(normalizarCedula("CC 1042998276"), "1042998276");
  assert.equal(normalizarCedula(1042998276), "1042998276");
});

test("momentoDesdeLocal: hora del equipo -> momento con offset y día operativo", () => {
  assert.deepEqual(momentoDesdeLocal("2026-10-13T06:42:10"), {
    momento: "2026-10-13T06:42:10-05:00",
    fecha: "2026-10-13",
  });
  // Con espacio en vez de T, como lo escribe el proveedor OLE DB.
  assert.deepEqual(momentoDesdeLocal("2026-10-13 06:42:10"), {
    momento: "2026-10-13T06:42:10-05:00",
    fecha: "2026-10-13",
  });
  // Sin segundos.
  assert.deepEqual(momentoDesdeLocal("2026-10-13T06:42"), {
    momento: "2026-10-13T06:42:00-05:00",
    fecha: "2026-10-13",
  });
});

test("momentoDesdeLocal: rechaza lo que no es una fecha real", () => {
  for (const malo of [
    "2026-02-31T06:00:00", // febrero no tiene 31
    "2026-13-01T06:00:00", // mes 13
    "2026-10-13T25:00:00", // hora 25
    "2026-10-13T06:60:00", // minuto 60
    "13/10/2026 06:42", // otro formato
    "2026-10-13", // sin hora
    "",
    "ayer",
    1760000000,
    null,
    undefined,
  ]) {
    assert.equal(momentoDesdeLocal(malo), null, `deberia rechazar ${JSON.stringify(malo)}`);
  }
});

test("momentoDesdeLocal: una fecha anterior al equipo es basura", () => {
  assert.equal(momentoDesdeLocal("1899-10-13T06:00:00"), null);
  assert.equal(momentoDesdeLocal("2200-10-13T06:00:00"), null);
});

test("lote válido: normaliza marcaciones y personas", () => {
  const r = validarLote({
    agente: "PC-ZK/1.0",
    personas: [
      { pin: "27", userid: 634, ssn: "72197769", nombre: "Alexander", apellido: "Lechuga Cerda", departamentoId: 48 },
      { pin: "999", userid: 700, ssn: "0", nombre: "Sin", apellido: "Identificacion", departamentoId: 47 },
    ],
    marcaciones: [marca({ id: 31891320, deviceId: 7, deviceName: "Entrada", verificado: 6, punto: "Entrada-1" })],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.agente, "PC-ZK/1.0");
  assert.equal(r.lote.personas.length, 2);
  assert.equal(r.lote.personas[0].cedula, "72197769");
  // El SSN "0" no invalida la persona: queda sin cédula.
  assert.equal(r.lote.personas[1].cedula, null);
  assert.deepEqual(r.lote.marcaciones[0], {
    idZk: 31891320,
    pin: "27",
    momento: "2026-10-13T06:42:10-05:00",
    fecha: "2026-10-13",
    deviceId: 7,
    deviceName: "Entrada",
    deviceSn: null,
    verificado: 6,
    punto: "Entrada-1",
  });
});

test("lote vacío es válido: sirve de latido", () => {
  const r = validarLote({ agente: "PC-ZK", marcaciones: [] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.marcaciones.length, 0);
  assert.equal(r.lote.personas.length, 0);
});

test("acepta claves con guion bajo (las que manda el agente tal cual)", () => {
  const r = validarLote({
    marcaciones: [
      { id: 5, pin: "27", momento: "2026-10-13T06:00:00", device_id: 7, device_name: "Entrada", device_sn: "AHID22", verified: 6 },
    ],
    personas: [{ pin: "27", userid: 1, ssn: "72197769", departamento_id: 48 }],
  });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.marcaciones[0].deviceId, 7);
  assert.equal(r.lote.marcaciones[0].deviceSn, "AHID22");
  assert.equal(r.lote.marcaciones[0].verificado, 6);
  assert.equal(r.lote.personas[0].departamentoId, 48);
});

test("el error dice el índice y el id, para poder arreglarlo", () => {
  const r = validarLote({
    marcaciones: [marca({ id: 1 }), marca({ id: 2, momento: "2026-13-01T06:00:00" })],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.estado, 400);
  assert.match(r.error, /marcaciones\[1\]/);
  assert.match(r.error, /id 2/);
  assert.match(r.error, /momento/);
});

test("rechaza el lote entero: id ausente, cero o no entero", () => {
  for (const id of [undefined, 0, -3, "abc", 1.5, null]) {
    const r = validarLote({ marcaciones: [{ pin: "27", momento: "2026-10-13T06:00:00", id }] });
    assert.equal(r.ok, false, `deberia rechazar id ${JSON.stringify(id)}`);
  }
});

test("rechaza pin vacío y objetos que no son objetos", () => {
  assert.equal(validarLote({ marcaciones: [marca({ pin: "" })] }).ok, false);
  assert.equal(validarLote({ marcaciones: [marca({ pin: "   " })] }).ok, false);
  assert.equal(validarLote({ marcaciones: ["no soy objeto"] }).ok, false);
  assert.equal(validarLote({ marcaciones: [null] }).ok, false);
});

test("rechaza un id repetido dentro del mismo lote", () => {
  const r = validarLote({ marcaciones: [marca({ id: 7 }), marca({ id: 7 })] });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /dos veces/);
});

test("rechaza un pin repetido en el snapshot de personas", () => {
  const r = validarLote({
    personas: [
      { pin: "27", userid: 1, ssn: "72197769" },
      { pin: "27", userid: 2, ssn: "72162708" },
    ],
    marcaciones: [],
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /viene dos veces/);
});

test("pasa de MAX_MARCACIONES -> 413, no 400", () => {
  const muchas = Array.from({ length: MAX_MARCACIONES + 1 }, (_, i) =>
    marca({ id: i + 1 })
  );
  const r = validarLote({ marcaciones: muchas });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.estado, 413);
});

test("cuerpo que no es objeto, o listas que no son listas", () => {
  assert.equal(validarLote(null).ok, false);
  assert.equal(validarLote("texto").ok, false);
  assert.equal(validarLote([]).ok, false);
  assert.equal(validarLote({ marcaciones: "no es lista" }).ok, false);
  assert.equal(validarLote({ personas: 5, marcaciones: [] }).ok, false);
});

test("campos opcionales malos invalidan el lote (son del esquema del equipo)", () => {
  assert.equal(validarLote({ marcaciones: [marca({ deviceId: "siete" })] }).ok, false);
  assert.equal(validarLote({ marcaciones: [marca({ verificado: "huella" })] }).ok, false);
  // Ausentes sí son válidos: quedan en null.
  const r = validarLote({ marcaciones: [marca()] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lote.marcaciones[0].deviceId, null);
  assert.equal(r.lote.marcaciones[0].verificado, null);
});
