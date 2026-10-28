import { test } from "node:test";
import assert from "node:assert/strict";
import { minutosDe, ranura, ranuraTrasEjecutar, tramoDe, vencimiento } from "./reglas";

const base = { hoy: "2026-10-27", hora: "09:00", activa: true, ultimaRanura: "" };

test("minutosDe: valida la hora", () => {
  assert.equal(minutosDe("09:30"), 570);
  assert.equal(minutosDe("9:05"), 545);
  assert.equal(minutosDe("24:00"), null);
  assert.equal(minutosDe(""), null);
});

test("vencimiento: antes de la hora no corre", () => {
  assert.deepEqual(vencimiento({ ...base, ahoraMinutos: 8 * 60 + 59 }), { vence: false, motivo: "aun_no" });
});

test("vencimiento: pasada la hora corre una vez por ranura", () => {
  assert.deepEqual(vencimiento({ ...base, ahoraMinutos: 9 * 60 }), { vence: true, ranura: "2026-10-27@09:00" });
  assert.deepEqual(vencimiento({ ...base, ahoraMinutos: 15 * 60, ultimaRanura: "2026-10-27@09:00" }), {
    vence: false,
    motivo: "ya_corrio",
  });
});

test("vencimiento: al día siguiente o con otra hora vuelve a correr", () => {
  assert.equal(vencimiento({ ...base, hoy: "2026-10-28", ahoraMinutos: 600, ultimaRanura: "2026-10-27@09:00" }).vence, true);
  assert.deepEqual(vencimiento({ ...base, hora: "08:30", ahoraMinutos: 600, ultimaRanura: "2026-10-27@09:00" }), {
    vence: true,
    ranura: "2026-10-27@08:30",
  });
});

test("vencimiento: apagada o con hora inválida no corre", () => {
  assert.equal(vencimiento({ ...base, activa: false, ahoraMinutos: 600 }).vence, false);
  assert.deepEqual(vencimiento({ ...base, hora: "nueve", ahoraMinutos: 600 }), { vence: false, motivo: "hora_invalida" });
});

test("ranuraTrasEjecutar: la manual antes de la hora no gasta la del día", () => {
  const e = { hoy: "2026-10-27", hora: "09:00", ranuraPrevia: "2026-10-26@09:00" };
  assert.equal(ranuraTrasEjecutar({ ...e, manual: true, ahoraMinutos: 7 * 60 }), "2026-10-26@09:00");
  assert.equal(ranuraTrasEjecutar({ ...e, manual: true, ahoraMinutos: 10 * 60 }), ranura("2026-10-27", "09:00"));
  assert.equal(ranuraTrasEjecutar({ ...e, manual: false, ahoraMinutos: 9 * 60 }), "2026-10-27@09:00");
});

test("cada N minutos: una vez por tramo, desde la hora configurada", () => {
  const cada = { ...base, hora: "00:00", cadaMinutos: 5 };
  assert.equal(tramoDe(10 * 60 + 7, 5), "10:05");
  assert.equal(tramoDe(0, 5), "00:00");
  assert.deepEqual(vencimiento({ ...cada, ahoraMinutos: 10 * 60 + 7 }), { vence: true, ranura: "2026-10-27@10:05" });
  assert.deepEqual(vencimiento({ ...cada, ahoraMinutos: 10 * 60 + 9, ultimaRanura: "2026-10-27@10:05" }), { vence: false, motivo: "ya_corrio" });
  assert.equal(vencimiento({ ...cada, ahoraMinutos: 10 * 60 + 10, ultimaRanura: "2026-10-27@10:05" }).vence, true);
  // Antes de la hora de arranque no corre.
  assert.equal(vencimiento({ ...cada, hora: "05:00", ahoraMinutos: 4 * 60 }).vence, false);
  // La manual gasta el tramo en curso.
  assert.equal(
    ranuraTrasEjecutar({ hoy: "2026-10-27", hora: "00:00", manual: true, ahoraMinutos: 10 * 60 + 7, ranuraPrevia: "", cadaMinutos: 5 }),
    "2026-10-27@10:05"
  );
});
