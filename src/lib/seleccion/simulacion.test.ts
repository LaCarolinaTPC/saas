import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLAS_POR_DEFECTO as R, licenciaVerificadaDesdeRunt } from "./preseleccion";
import { PREFILTRO_VACIO, type DatosPrefiltro } from "./extraccion";
import { TIEMPOS_REACTIVACION_POR_DEFECTO as T } from "./reactivacion";
import { queHariaGestivo, revisarCaso, simularPreseleccion, simularSilencio, type ResultadoConversacion } from "./simulacion";
import { CASOS, casoPorId, estimarLlamadas } from "./evaluacion/casos";

const AHORA = new Date("2026-11-13T15:00:00Z"); // 10:00 a. m. en Bogotá
const completo: DatosPrefiltro = {
  ...PREFILTRO_VACIO,
  nombre: "Carlos Gómez",
  cedula: "1045678901",
  fecha_expedicion: "2008-07-21",
  edad: 34,
  ciudad: "Soledad",
  licencia: "C2",
  experiencia_meses: 36,
  hoja_vida: true,
  autorizacion: "si",
};

test("qué pasaría: aspirante completo crea el proceso, pasa a antecedentes y queda listo para citar", () => {
  const pre = simularPreseleccion(completo, 0, R, AHORA);
  const g = queHariaGestivo({ datos: completo, preseleccion: pre, abierto: null, transferencia: null });
  assert.equal(g.proceso, "crear");
  assert.equal(g.estado, "antecedentes");
  assert.equal(g.listoParaCitar, true);
  assert.equal(g.cierrePropuesto, null);
  assert.ok(g.eventos.some((e) => /Antecedentes/.test(e)));
});

test("qué pasaría: con proceso abierto se completa, no se duplica; sin cédula se espera", () => {
  const pre = simularPreseleccion(completo, 0, R, AHORA);
  const abierto = { id: "x", estado: "pendiente", causa_no_contrato: null, fecha_creacion: "2026-11-01" };
  assert.equal(queHariaGestivo({ datos: completo, preseleccion: pre, abierto, transferencia: null }).proceso, "completar");
  const sinCedula = { ...completo, cedula: null };
  assert.equal(queHariaGestivo({ datos: sinCedula, preseleccion: pre, abierto: null, transferencia: null }).proceso, "esperar_cedula");
});

test("qué pasaría: no cumple propone cierre y no queda listo; quien no busca trabajo no crea proceso", () => {
  const mayor = { ...completo, edad: 62 };
  const pre = simularPreseleccion(mayor, 0, R, AHORA);
  const g = queHariaGestivo({ datos: mayor, preseleccion: pre, abierto: null, transferencia: null });
  assert.equal(g.cierrePropuesto, "edad");
  assert.equal(g.listoParaCitar, false);
  assert.equal(g.estado, "pendiente");
  const empleado = { ...PREFILTRO_VACIO, busca_trabajo: false };
  assert.equal(queHariaGestivo({ datos: empleado, preseleccion: null, abierto: null, transferencia: null }).proceso, "ninguno");
});

test("qué pasaría: SIMIT sobre el tope deja el semáforo en rojo", () => {
  const pre = simularPreseleccion(completo, 3_500_000, R, AHORA);
  assert.equal(pre.global, "no_cumple");
  assert.equal(pre.incumplido, "simit");
  assert.equal(simularPreseleccion(completo, null, R, AHORA).global, "incompleto");
});

test("silencio: secuencia completa en 8 días con los tiempos por defecto", () => {
  const { pasos } = simularSilencio({ horas: 192, ahora: AHORA, tiempos: T, hojaVida: false, buscaTrabajo: true, procesoEstado: null });
  assert.deepEqual(pasos.map((p) => p.accion), ["aviso1", "aviso2", "llamar", "incomunicado"]);
  // Con la hoja de vida recibida no hay reactivación.
  assert.equal(simularSilencio({ horas: 192, ahora: AHORA, tiempos: T, hojaVida: true, buscaTrabajo: true, procesoEstado: null }).pasos.length, 0);
  // Si el proceso ya avanzó, tampoco.
  assert.equal(simularSilencio({ horas: 192, ahora: AHORA, tiempos: T, hojaVida: false, buscaTrabajo: true, procesoEstado: "citado" }).pasos.length, 0);
});

test("revisar caso: detecta un pase a persona de más y una fuga de salario", () => {
  const caso = casoPorId("preg-salario-insiste")!;
  const r: ResultadoConversacion = {
    mensajes: [
      { direccion: "entrante", contenido: "cuánto pagan?", mediaTipo: null },
      { direccion: "saliente", contenido: "El salario es de $1.750.905 al mes.", mediaTipo: null },
    ],
    transferencia: { turno: 1, motivo: "marca" },
    extraido: null,
    preseleccion: null,
    tokensEntrada: 0,
    tokensSalida: 0,
    latencias: [],
    modelos: [],
  };
  const { ok, chequeos } = revisarCaso(caso, r);
  assert.equal(ok, false);
  assert.ok(chequeos.some((c) => !c.ok && /salario/.test(c.detalle)));
  assert.ok(chequeos.some((c) => !c.ok && /sin motivo/.test(c.detalle)));
});

test("banco de casos: ids únicos y estimación de llamadas", () => {
  assert.equal(new Set(CASOS.map((c) => c.id)).size, CASOS.length);
  assert.ok(CASOS.length >= 60);
  for (const c of CASOS) assert.ok(estimarLlamadas(c) >= c.turnos.length + 1, c.id);
});

test("chat de prueba: la fecha de nacimiento manda sobre la edad y el RUNT real entra al semáforo", () => {
  // Nació el 1960-01-01: tiene 66 en nov-2026 aunque haya dicho 34.
  const mayor = simularPreseleccion({ ...completo, fecha_nacimiento: "1960-01-01" }, 0, R, AHORA);
  assert.equal(mayor.edad.color, "rojo");
  const runt = { registrado: true, tieneLicencia: true, categorias: [{ categoria: "C1", vence: "2030-01-01", activa: true }], consultadoEl: "", nombre: "CARLOS GÓMEZ" };
  const conRunt = simularPreseleccion(completo, 0, R, AHORA, runt);
  assert.equal(conRunt.licencia.color, "rojo");
  assert.equal(conRunt.licencia.origen, "verificado");
  assert.equal(licenciaVerificadaDesdeRunt(runt, R, AHORA)?.estado, "no_cumple");
  const c2 = { ...runt, categorias: [{ categoria: "C2", vence: "2030-01-01", activa: true }] };
  assert.deepEqual(licenciaVerificadaDesdeRunt(c2, R, AHORA)?.estado, "cumple");
  // El RUNT a nombre de otra persona: revisión manual, el asistente no sabe nada de la licencia.
  const otro = { ...c2, nombreNoCoincide: true, nombreRegistro: "ALEXANDER ARDILA" };
  assert.equal(licenciaVerificadaDesdeRunt(otro, R, AHORA), null);
  const conOtro = simularPreseleccion(completo, 0, R, AHORA, otro);
  assert.equal(conOtro.licencia.color, "pendiente");
  assert.match(conOtro.licencia.motivo, /a nombre de otra persona/);
  assert.equal(licenciaVerificadaDesdeRunt({ ...runt, registrado: false }, R, AHORA)?.estado, "confirmar_cedula");
  assert.equal(licenciaVerificadaDesdeRunt(null, R, AHORA), null);
});
