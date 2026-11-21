import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AJUSTES_AGENDA_POR_DEFECTO as A,
  accionAgenda,
  ajustesAgenda,
  citasAfectadas,
  fechaEnTexto,
  horaDelDia,
  horaEnTexto,
  interpretarRespuestaCita,
  proximaCita,
  reprogramacionesDe,
  rutasAprendidas,
  siguienteDiaHabil,
  superaReprogramaciones,
  type Cita,
} from "./agenda";

/** Instante de Bogotá (UTC-5) a partir de fecha y hora locales. */
const bogota = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);

const cita = (extra: Partial<Cita> = {}): Cita => ({
  id: "c1",
  proceso_id: "p1",
  tipo: "prueba_manejo",
  fecha: "2026-11-19",
  hora: "13:00:00",
  estado: "programada",
  reprogramada_por: null,
  confirmada_at: null,
  llego_at: null,
  recordatorio_at: null,
  alerta_at: null,
  inasistencia_at: null,
  creada_por: null,
  created_at: "2026-11-18T15:00:00Z",
  ...extra,
});

test("próxima cita: hoy antes del mediodía; si no, el siguiente día hábil; el sábado, en la mañana", () => {
  // Jueves 19 a las 10:00 a. m.: hoy a la 1:00 p. m.
  assert.deepEqual(proximaCita(bogota("2026-11-19", "10:00"), A), { fecha: "2026-11-19", hora: "13:00" });
  // Jueves después del mediodía: viernes.
  assert.deepEqual(proximaCita(bogota("2026-11-19", "12:30"), A), { fecha: "2026-11-20", hora: "13:00" });
  // Viernes en la tarde: sábado a las 8:00 a. m.
  assert.deepEqual(proximaCita(bogota("2026-11-20", "15:00"), A), { fecha: "2026-11-21", hora: "08:00" });
  // Sábado a las 9:00 (ya pasó la hora del sábado): lunes; el domingo no cuenta.
  assert.deepEqual(proximaCita(bogota("2026-11-21", "09:00"), A), { fecha: "2026-11-23", hora: "13:00" });
  // Viernes 13 en la tarde: sábado 14; desde el sábado 14 en la tarde, salta el domingo y el lunes 16 festivo.
  assert.deepEqual(proximaCita(bogota("2026-11-14", "15:00"), A), { fecha: "2026-11-17", hora: "13:00" });
  // «Desde mañana» (para reprogramar): nunca el mismo día.
  assert.deepEqual(proximaCita(bogota("2026-11-19", "08:00"), A, [], true), { fecha: "2026-11-20", hora: "13:00" });
});

test("el profesor no puede o puede a otra hora: la cita salta ese día o toma esa hora", () => {
  const enfermo = [{ fecha: "2026-11-20", disponible: false, hora: null }];
  assert.equal(horaDelDia("2026-11-20", A, enfermo), null);
  assert.deepEqual(proximaCita(bogota("2026-11-19", "15:00"), A, enfermo), { fecha: "2026-11-21", hora: "08:00" });
  // Hoy no puede: aunque sea temprano, va al siguiente día.
  assert.deepEqual(proximaCita(bogota("2026-11-20", "08:00"), A, enfermo), { fecha: "2026-11-21", hora: "08:00" });
  // Puede a las 3:00 p. m.
  const tarde = [{ fecha: "2026-11-20", disponible: true, hora: "15:00:00" }];
  assert.equal(horaDelDia("2026-11-20", A, tarde), "15:00");
  assert.deepEqual(proximaCita(bogota("2026-11-19", "15:00"), A, tarde), { fecha: "2026-11-20", hora: "15:00" });
  // Domingo y festivo nunca tienen prueba.
  assert.equal(horaDelDia("2026-11-22", A), null);
  assert.equal(horaDelDia("2026-11-16", A), null);
  assert.equal(siguienteDiaHabil("2026-11-21"), "2026-11-23");
});

test("fecha y hora en palabras para los mensajes", () => {
  assert.equal(fechaEnTexto("2026-11-19"), "jueves 19 de noviembre");
  assert.equal(fechaEnTexto("2026-11-22"), "domingo 22 de noviembre");
  assert.equal(horaEnTexto("13:00:00"), "1:00 p. m.");
  assert.equal(horaEnTexto("08:00"), "8:00 a. m.");
  assert.equal(horaEnTexto("12:30"), "12:30 p. m.");
  assert.equal(horaEnTexto("00:15"), "12:15 a. m.");
});

test("acciones del día: recordatorio, alerta si no confirma y no asistió con tolerancia", () => {
  const dia = "2026-11-19";
  assert.equal(accionAgenda(cita(), bogota(dia, "07:30"), A), null);
  assert.equal(accionAgenda(cita(), bogota(dia, "08:05"), A), "recordatorio");
  assert.equal(accionAgenda(cita({ recordatorio_at: "x" }), bogota(dia, "08:20"), A), null);
  // 11:00 sin confirmar: llamar (antes que el recordatorio si los dos faltan).
  assert.equal(accionAgenda(cita({ recordatorio_at: "x" }), bogota(dia, "11:05"), A), "alerta_no_confirmo");
  assert.equal(accionAgenda(cita({ recordatorio_at: "x", estado: "confirmada" }), bogota(dia, "11:05"), A), null);
  assert.equal(accionAgenda(cita({ recordatorio_at: "x", alerta_at: "x" }), bogota(dia, "11:20"), A), null);
  // A la 1:15 todavía se le espera; a la 1:30 (30 min de tolerancia), no asistió.
  assert.equal(accionAgenda(cita({ recordatorio_at: "x", alerta_at: "x" }), bogota(dia, "13:15"), A), null);
  assert.equal(accionAgenda(cita({ recordatorio_at: "x", alerta_at: "x" }), bogota(dia, "13:30"), A), "inasistencia");
  assert.equal(accionAgenda(cita({ estado: "confirmada" }), bogota(dia, "13:45"), A), "inasistencia");
  // Con la llegada registrada, o ya marcada, nada.
  assert.equal(accionAgenda(cita({ estado: "asistio", llego_at: "x" }), bogota(dia, "13:45"), A), null);
  assert.equal(accionAgenda(cita({ estado: "no_asistio", inasistencia_at: "x" }), bogota(dia, "14:00"), A), null);
  // Otro día u otro tipo de cita: nada.
  assert.equal(accionAgenda(cita({ fecha: "2026-11-20" }), bogota(dia, "13:45"), A), null);
  assert.equal(accionAgenda(cita({ tipo: "examen_f1" }), bogota(dia, "13:45"), A), null);
});

test("respuesta del aspirante a la cita (los botones llegan como texto)", () => {
  assert.equal(interpretarRespuestaCita("Sí, voy"), "confirma");
  assert.equal(interpretarRespuestaCita("si señora"), "confirma");
  assert.equal(interpretarRespuestaCita("Ahí estaré"), "confirma");
  assert.equal(interpretarRespuestaCita("ok"), "confirma");
  assert.equal(interpretarRespuestaCita("Necesito otra fecha"), "pide_otra_fecha");
  assert.equal(interpretarRespuestaCita("Sí, reprogramar"), "pide_otra_fecha");
  assert.equal(interpretarRespuestaCita("no puedo ir mañana"), "pide_otra_fecha");
  assert.equal(interpretarRespuestaCita("Ya no me interesa"), "no_interesa");
  // Preguntas o mensajes largos no se interpretan: los atiende el asistente.
  assert.equal(interpretarRespuestaCita("¿a qué hora es?"), null);
  assert.equal(interpretarRespuestaCita("si pero quería saber si puedo llevar la hoja de vida en una usb porque no tengo impresora"), null);
  assert.equal(interpretarRespuestaCita(""), null);
});

test("reprogramaciones: solo cuentan las del aspirante", () => {
  const citas = [
    cita({ estado: "reprogramada", reprogramada_por: "aspirante" }),
    cita({ estado: "reprogramada", reprogramada_por: "empresa" }),
    cita({ estado: "reprogramada", reprogramada_por: null }),
    cita({ estado: "programada" }),
  ];
  assert.equal(reprogramacionesDe(citas), 2);
  assert.equal(superaReprogramaciones(citas, A), false);
  assert.equal(superaReprogramaciones([...citas, cita({ estado: "reprogramada", reprogramada_por: "aspirante" })], A), true);
});

test("citas afectadas cuando el profesor no puede o cambia la hora", () => {
  const citas = [
    cita({ id: "a", fecha: "2026-11-20" }),
    cita({ id: "b", fecha: "2026-11-20", estado: "confirmada" }),
    cita({ id: "c", fecha: "2026-11-20", estado: "asistio" }),
    cita({ id: "d", fecha: "2026-11-21" }),
    cita({ id: "e", fecha: "2026-11-20", tipo: "examen_f1" }),
  ];
  assert.deepEqual(citasAfectadas(citas, { fecha: "2026-11-20", disponible: false, hora: null }).map((c) => c.id), ["a", "b"]);
  // Puede a la misma hora: ninguna; a otra hora: las dos.
  assert.deepEqual(citasAfectadas(citas, { fecha: "2026-11-20", disponible: true, hora: "13:00" }), []);
  assert.deepEqual(citasAfectadas(citas, { fecha: "2026-11-20", disponible: true, hora: "15:00" }).map((c) => c.id), ["a", "b"]);
});

test("ajustes de la agenda: lo que falte o esté mal escrito queda con el valor por defecto; 0 es válido", () => {
  const a = ajustesAgenda([
    { clave: "cita_hora_semana", valor: "14:00" },
    { clave: "cita_hora_sabado", valor: "8 am" },
    { clave: "tolerancia_inasistencia_minutos", valor: 0 },
    { clave: "reprogramaciones_max", valor: "3" },
  ]);
  assert.equal(a.citaHoraSemana, "14:00");
  assert.equal(a.citaHoraSabado, "08:00");
  assert.equal(a.toleranciaInasistenciaMinutos, 0);
  assert.equal(a.reprogramacionesMax, 3);
  assert.equal(a.rutasMinimas, 2);
  assert.deepEqual(ajustesAgenda([]), A);
});

test("rutas aprendidas: cuenta la ruta con al menos una salida aprendida, sin repetir", () => {
  assert.deepEqual(
    rutasAprendidas([
      { ruta: "A1", resultado: "repetir" },
      { ruta: "A1", resultado: "aprendida" },
      { ruta: "A1", resultado: "aprendida" },
      { ruta: "B2", resultado: "repetir" },
    ]),
    ["A1"]
  );
});
