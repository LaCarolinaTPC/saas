import { test } from "node:test";
import assert from "node:assert/strict";
import { cruzarObligaciones, tipoPorContenido, type SoporteVista } from "./soportes-reglas";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);

test("el tipo del archivo se decide por su contenido", () => {
  assert.equal(tipoPorContenido(new TextEncoder().encode("%PDF-1.7\n...")), "application/pdf");
  assert.equal(tipoPorContenido(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(tipoPorContenido(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(tipoPorContenido(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")), "image/webp");
  // Un ejecutable o un HTML renombrado a .pdf no pasa.
  assert.equal(tipoPorContenido(bytes(0x4d, 0x5a)), null);
  assert.equal(tipoPorContenido(new TextEncoder().encode("<html><script>")), null);
});

const soporte = (p: Partial<SoporteVista>): SoporteVista => ({
  id: "x", codigoVehiculo: "501", fecha: "2026-09-06", tipo: "obligaciones", concepto: "PAG FACT", valor: null,
  archivoNombre: "f.pdf", archivoMime: "application/pdf", archivoTamano: 1000, subidoPorEmail: null, createdAt: "", ...p,
});

test("cruce del pago de obligaciones de GEMA contra los soportes", () => {
  // Día real del PDF: el 501 tuvo 1.909.321 de descuentos otros el 2026-09-06.
  const filas = [
    { fecha: "2026-09-06", descuentos_otros: 1909321 },
    { fecha: "2026-09-07", descuentos_otros: 0 },
    { fecha: "2026-09-08", descuentos_otros: 50000 },
    { fecha: "2026-09-09", descuentos_otros: null },
  ];
  const r = cruzarObligaciones(filas, [
    soporte({ valor: 217000 }), soporte({ valor: 1692321 }), // suman 1.909.321
    soporte({ fecha: "2026-09-08", valor: 20000 }),
    soporte({ fecha: "2026-09-10", valor: 5000 }),
    soporte({ fecha: "2026-09-08", tipo: "combustible", valor: 30000 }), // otro tipo: no cuenta
  ]);
  assert.deepEqual(r.map((x) => [x.fecha, x.descuento, x.soportado, x.estado]), [
    ["2026-09-06", 1909321, 1909321, "soportado"],
    ["2026-09-08", 50000, 20000, "parcial"],
    ["2026-09-10", 0, 5000, "solo_soporte"],
  ]);
  assert.equal(cruzarObligaciones([{ fecha: "2026-09-06", descuentos_otros: 1000 }], [])[0].estado, "sin_soporte");
  // Un soporte sin valor cuenta como soporte, pero no cubre el monto.
  assert.equal(cruzarObligaciones([{ fecha: "2026-09-06", descuentos_otros: 1000 }], [soporte({})])[0].estado, "parcial");
});
