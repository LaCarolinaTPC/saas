import assert from "node:assert/strict";
import test from "node:test";

import {
  CONCEPTO_PENDIENTE,
  HORA_POR_OMISION,
  decidir,
  explicarPendientes,
  horaEfectiva,
  minutosAhoraBogota,
  minutosDeHora,
  pendientesAAnular,
  type Candidato,
  type PendienteAuto,
} from "./auto-pendientes";
import type { FilaConductor } from "./plantilla";

/** Un lunes hábil de 2026. */
const LUNES = "2026-10-19";
/** El domingo anterior. */
const DOMINGO = "2026-10-18";
/** 2 de noviembre de 2026: lunes, y festivo trasladado (Todos los Santos). */
const FESTIVO = "2026-11-02";

function gente(...cedulas: string[]): Candidato[] {
  return cedulas.map((c) => ({ cedula: c, codigo: "C" + c, nombre: "Nombre " + c }));
}

function base(extra: Partial<Parameters<typeof decidir>[0]> = {}) {
  return decidir({
    fecha: LUNES,
    hoy: LUNES,
    ahoraMinutos: 10 * 60,
    activo: true,
    hora: "09:00",
    candidatos: gente("1", "2"),
    yaRegistrados: [],
    ...extra,
  });
}

test("la hora se lee solo si es una hora de verdad", () => {
  assert.equal(minutosDeHora("09:00"), 540);
  assert.equal(minutosDeHora("9:05"), 545);
  assert.equal(minutosDeHora("00:00"), 0);
  assert.equal(minutosDeHora("23:59"), 1439);

  // Lo que escribe una persona en un campo de texto.
  for (const malo of ["", " ", "nueve", "25:00", "09:60", "09", "9:5", "-1:00", null, undefined]) {
    assert.equal(minutosDeHora(malo as string), null, `debería rechazar ${JSON.stringify(malo)}`);
  }
});

test("una hora inválida cae a la de por omisión, no a medianoche", () => {
  // Importa: si cayera a 0, los registros se crearían a las 00:00, antes de que
  // nadie hubiera despachado nada, y la lista sería toda la plantilla.
  assert.equal(horaEfectiva("basura"), HORA_POR_OMISION);
  assert.equal(horaEfectiva(null), HORA_POR_OMISION);
  assert.equal(horaEfectiva(""), HORA_POR_OMISION);
  assert.equal(horaEfectiva("07:30"), "07:30");
  assert.equal(horaEfectiva(" 07:30 "), "07:30");
});

test("corre en un día hábil pasada la hora", () => {
  const d = base();
  assert.equal(d.corre, true);
  if (!d.corre) return;
  assert.deepEqual(
    d.crear.map((c) => c.cedula),
    ["1", "2"]
  );
});

test("antes de la hora no crea nada", () => {
  const d = base({ ahoraMinutos: 8 * 60 + 59, hora: "09:00" });
  assert.equal(d.corre, false);
  if (d.corre) return;
  assert.equal(d.motivo, "aun_no_es_la_hora");
  assert.match(d.detalle, /09:00/);
});

test("justo a la hora sí crea", () => {
  const d = base({ ahoraMinutos: 9 * 60, hora: "09:00" });
  assert.equal(d.corre, true);
});

test("la hora se puede cambiar", () => {
  assert.equal(base({ ahoraMinutos: 7 * 60 + 30, hora: "07:00" }).corre, true);
  assert.equal(base({ ahoraMinutos: 7 * 60 + 30, hora: "11:00" }).corre, false);
});

/**
 * La razón de ser de todo el diseño: en domingo y festivo «sin despacho» son
 * 83–94 personas, casi todas descansando. Crear registros ahí habría metido a
 * decenas en el conteo de días seguidos que dispara descargos y terminación.
 */
test("en domingo NO corre", () => {
  const d = base({ fecha: DOMINGO, hoy: DOMINGO });
  assert.equal(d.corre, false);
  if (d.corre) return;
  assert.equal(d.motivo, "no_es_dia_habil");
  assert.match(d.detalle, /descansos/);
});

test("en festivo tampoco, aunque caiga en lunes", () => {
  const d = base({ fecha: FESTIVO, hoy: FESTIVO });
  assert.equal(d.corre, false);
  if (d.corre) return;
  assert.equal(d.motivo, "no_es_dia_habil");
});

test("de un día pasado no crea nada, aunque fuera hábil", () => {
  // Crear registros de días que nadie estaba mirando sería una sorpresa en un
  // módulo con consecuencias laborales.
  const d = base({ fecha: "2026-10-13", hoy: LUNES });
  assert.equal(d.corre, false);
  if (d.corre) return;
  assert.equal(d.motivo, "no_es_hoy");
});

test("apagado no hace nada", () => {
  const d = base({ activo: false });
  assert.equal(d.corre, false);
  if (d.corre) return;
  assert.equal(d.motivo, "apagado");
});

test("a quien ya tiene registro no se le crea otro", () => {
  const d = base({ candidatos: gente("1", "2", "3"), yaRegistrados: ["2"] });
  assert.equal(d.corre, true);
  if (!d.corre) return;
  assert.deepEqual(
    d.crear.map((c) => c.cedula),
    ["1", "3"]
  );
});

test("la misma persona enrolada dos veces entra una sola vez", () => {
  // Pasa de verdad: hay diez personas con la misma cédula en dos pines.
  const d = base({ candidatos: gente("1", "1", "2") });
  assert.equal(d.corre, true);
  if (!d.corre) return;
  assert.deepEqual(
    d.crear.map((c) => c.cedula),
    ["1", "2"]
  );
});

test("sin cédula no se registra a nadie", () => {
  const d = base({
    candidatos: [
      { cedula: "", codigo: null, nombre: "Sin cédula" },
      { cedula: "  ", codigo: null, nombre: "Espacios" },
      { cedula: " 9 ", codigo: null, nombre: "Con espacios alrededor" },
    ],
  });
  assert.equal(d.corre, true);
  if (!d.corre) return;
  assert.deepEqual(
    d.crear.map((c) => c.cedula),
    ["9"]
  );
});

test("sin candidatos corre y no crea nada", () => {
  const d = base({ candidatos: [] });
  assert.equal(d.corre, true);
  if (!d.corre) return;
  assert.equal(d.crear.length, 0);
});

test("el tipo que se crea NO es el que escala a disciplinario", () => {
  // Fija la decisión del diseño: si alguien cambia esto a «no_justificada»,
  // esta prueba falla y hay que leer el comentario de auto-pendientes.ts.
  assert.equal(CONCEPTO_PENDIENTE, "pendiente");
  assert.notEqual(CONCEPTO_PENDIENTE, "no_justificada");
});

test("la explicación dice qué pasó, y el error manda sobre todo lo demás", () => {
  const estado = {
    hora: "09:00",
    activo: true,
    creados: 0,
    motivo: null as Parameters<typeof explicarPendientes>[0]["motivo"],
    error: null as string | null,
  };

  assert.match(explicarPendientes(estado), /Al día/);
  assert.match(explicarPendientes({ ...estado, creados: 1 }), /registró 1 pendiente a las 09:00/);
  assert.match(explicarPendientes({ ...estado, creados: 3 }), /registró 3 pendientes a las/);
  assert.match(
    explicarPendientes({ ...estado, motivo: "aun_no_es_la_hora" }),
    /a partir de las 09:00/
  );
  assert.match(explicarPendientes({ ...estado, motivo: "no_es_dia_habil" }), /domingo y festivo/);
  assert.match(explicarPendientes({ ...estado, motivo: "no_es_hoy" }), /día en curso/);
  assert.match(explicarPendientes({ ...estado, activo: false }), /Apagado/);

  // Si falló, eso es lo que hay que leer: no «al día», que sería mentira.
  const conError = explicarPendientes({ ...estado, creados: 2, error: "se cayó la base" });
  assert.match(conError, /No se pudieron crear/);
  assert.match(conError, /se cayó la base/);
});

test("si falta la migración, el mensaje dice qué hacer y no el error crudo", () => {
  // El error literal de PostgREST cuando el código va por delante de la base.
  const texto = explicarPendientes({
    hora: "09:00",
    activo: true,
    creados: 0,
    motivo: null,
    error: "Could not find the 'origen' column of 'ausentismo_registros' in the schema cache",
  });
  assert.match(texto, /Falta aplicar la migración/);
  assert.match(texto, /20261021030119/);
  assert.doesNotMatch(texto, /schema cache/);
});

test("anula el pendiente auto de un retirado, reubicado o solo informativo; respeta al activo", () => {
  const fecha = "2026-10-21";
  const ficha = (p: Partial<FilaConductor> & { cedula: string }): FilaConductor => ({
    cedula: p.cedula,
    estado: p.estado ?? "ACTIVO",
    reubicado: p.reubicado ?? null,
    fecha_ingreso: p.fecha_ingreso ?? "2026-01-01",
    codigo: p.codigo ?? "123",
    created_at: p.created_at ?? "2026-01-01T00:00:00Z",
    solo_informativo: p.solo_informativo ?? false,
  });
  const maestro = new Map<string, FilaConductor>([
    ["1", ficha({ cedula: "1" })], // activo pleno
    ["2", ficha({ cedula: "2", estado: "RETIRADO" })], // retirado
    ["3", ficha({ cedula: "3", reubicado: "SI" })], // reubicado
    ["4", ficha({ cedula: "4", solo_informativo: true })], // solo informativo
  ]);
  const pendientes: PendienteAuto[] = [
    { id: "a", cedula: "1" },
    { id: "b", cedula: "2" },
    { id: "c", cedula: "3" },
    { id: "d", cedula: "4" },
    { id: "e", cedula: "9" }, // sin ficha en el maestro
  ];

  const anular = pendientesAAnular(pendientes, maestro, fecha).map((p) => p.id).sort();
  // El activo (a) se queda; retirado/reubicado/solo-informativo se anulan;
  // el que no está en el maestro (e) NO se toca: mejor revisión manual.
  assert.deepEqual(anular, ["b", "c", "d"]);
});

test("los minutos de Colombia no dependen de la zona del servidor", () => {
  // 2026-10-20 15:00 UTC son las 10:00 en Bogotá (UTC−5, sin horario de verano).
  const minutos = minutosAhoraBogota(new Date("2026-10-20T15:00:00Z"));
  assert.equal(minutos, 10 * 60);

  // Y el borde del día: 03:00 UTC es la víspera a las 22:00 en Bogotá.
  assert.equal(minutosAhoraBogota(new Date("2026-10-21T03:00:00Z")), 22 * 60);
});
