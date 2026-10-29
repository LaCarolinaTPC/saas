import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularRecobro, diasHabilesEntre, diasSinRegistro, esDiaHabilRecobro, estadoRecobro, inicioRevision,
  motivoNoPermitido, ordenUrgencia, ranking, resumen, saldoRecobro, semaforo, sinGestionHoy, sumarDiasHabiles,
  textoEstado, validarCierreLiquidacion, validarCorreccion, validarGestion, valorDeDiferencia,
  type EstadoCalculado, type FilaRecobro, type GestionBase, type ResultadoCatalogo, type RolRecobros, type SolicitudBase,
} from "./recobros";

// El ejemplo del requerimiento de Tesorería: viaje del sáb 17-oct-2026,
// registradora 89, cámara 99, revisado el jue 22-oct. Datos de prueba sin
// personas.
const sol = (p: Partial<SolicitudBase> = {}): SolicitudBase => ({
  tipo: "camara", origen: "mantenimiento", fechaViaje: "2026-10-17",
  solicitadoAt: "2026-10-22T21:44:00Z", abonoFecha: null, anuladaAt: null, tomadoAt: null,
  estado: "resuelto", resultado: "recobro", resueltoAt: "2026-10-22T21:44:00Z",
  subgerenciaDecision: null, subgerenciaAt: null, valorRecobro: 37_000,
  cobroEstado: null, cobroAt: null, incobrableSolicitadoAt: null, liquidacionMarcadaAt: null,
  ...p,
});

let n = 0;
const g = (fecha: string, resultado: string, extra: Partial<GestionBase> = {}): GestionBase => ({
  id: `g${++n}`, fecha, createdAt: `${fecha}T15:00:00Z`, resultado,
  compromisoFecha: null, valorRecibido: null, ...extra,
});

const EJEMPLO = [
  g("2026-10-22", "notificado"),
  g("2026-10-23", "pidio_plazo", { compromisoFecha: "2026-10-24" }),
  g("2026-10-24", "no_pago_comprometido"),
  g("2026-10-26", "acuerdo_operativo", { compromisoFecha: "2026-10-27" }),
  g("2026-10-27", "no_vino"),
  g("2026-10-28", "no_vino"),
];
const hasta = (fecha: string) => EJEMPLO.filter((x) => x.fecha <= fecha);

const CATALOGO: ResultadoCatalogo[] = [
  ["notificado", "Se le notificó el recobro", 0, 0, 1, 0, 0],
  ["no_vino", "No vino a trabajar", 0, 0, 1, 0, 0],
  ["pidio_plazo", "Pidió plazo de pago", 1, 0, 1, 0, 0],
  ["no_pago_comprometido", "No pagó lo comprometido", 0, 0, 1, 0, 0],
  ["acuerdo_operativo", "Acuerdo con Operativo", 1, 0, 1, 1, 0],
  ["abono_parcial", "Abono parcial", 0, 1, 1, 0, 0],
  ["pago_completo", "Pagó completo", 0, 1, 0, 0, 1],
].map(([clave, nombre, c, v, o, a, ci]) => ({
  clave: clave as string, nombre: nombre as string, exigeCompromiso: !!c, exigeValor: !!v, exigeObservacion: !!o,
  exigeAutorizadoPor: !!a, cierra: !!ci, registra: "caja" as const, activo: true,
}));

test("días hábiles: lunes a sábado, sin domingos ni festivos", () => {
  assert.equal(esDiaHabilRecobro("2026-10-24"), true); // sábado
  assert.equal(esDiaHabilRecobro("2026-10-25"), false); // domingo
  assert.equal(esDiaHabilRecobro("2026-11-02"), false); // Todos los Santos, trasladado
  assert.equal(diasHabilesEntre("2026-10-22", "2026-10-24"), 2);
  assert.equal(diasHabilesEntre("2026-10-24", "2026-10-26"), 1);
  assert.equal(diasHabilesEntre("2026-10-24", "2026-10-28"), 3);
  assert.equal(diasHabilesEntre("2026-10-24", "2026-10-24"), 0);
  assert.equal(sumarDiasHabiles("2026-10-22", 2), "2026-10-24");
  // Sábado + 1: salta el domingo y el festivo del lunes.
  assert.equal(sumarDiasHabiles("2026-10-31", 1), "2026-11-03");
});

test("valor del recobro: pasaje de GEMA, o la tarifa del día", () => {
  assert.deepEqual(calcularRecobro({ conteo: 99, timbradas: 89, pasajeGema: 3_700, fechaViaje: "2026-10-17" }), {
    diferencia: 10, pasaje: 3_700, pasajeFuente: "gema", valor: 37_000, pasajeDistinto: false,
  });
  const domingo = calcularRecobro({ conteo: 50, timbradas: 48, pasajeGema: null, fechaViaje: "2026-10-18" });
  assert.equal(domingo?.pasaje, 3_800);
  assert.equal(domingo?.pasajeFuente, "tarifa");
  assert.equal(calcularRecobro({ conteo: 80, timbradas: 85, pasajeGema: 3_700, fechaViaje: "2026-10-17" })?.valor, 0);
  assert.equal(calcularRecobro({ conteo: null, timbradas: 85, pasajeGema: 3_700, fechaViaje: "2026-10-17" }), null);
  assert.equal(calcularRecobro({ conteo: 90, timbradas: 85, pasajeGema: 3_500, fechaViaje: "2026-10-17" })?.pasajeDistinto, true);
  assert.equal(valorDeDiferencia(4, null, "2026-11-02").valor, 15_200); // festivo
});

test("octubre: las 11 diferencias de cámara suman 94 timbradas y $347.800", () => {
  const pares = [[156, 144], [163, 149], [94, 90], [63, 56], [103, 95], [99, 89], [69, 60], [131, 124], [83, 80], [53, 43], [121, 111]];
  const calc = pares.map(([c, t]) => calcularRecobro({ conteo: c, timbradas: t, pasajeGema: 3_700, fechaViaje: "2026-10-20" })!);
  assert.equal(calc.reduce((s, x) => s + x.diferencia, 0), 94);
  assert.equal(calc.reduce((s, x) => s + x.valor, 0), 347_800);
});

test("ejemplo del requerimiento, día por día", () => {
  const e = (hoy: string) => estadoRecobro(sol(), hasta(hoy), hoy);

  const d22 = e("2026-10-22");
  assert.equal(d22.estado, "en_gestion");
  assert.equal(d22.plazoHasta, "2026-10-24");
  assert.equal(e("2026-10-23").estado, "en_gestion");

  const d24 = e("2026-10-24");
  assert.equal(d24.estado, "plazo_vencido"); // registró que no pagó el día del plazo
  assert.equal(textoEstado(d24, "2026-10-24"), "Plazo vencido");

  const d26 = e("2026-10-26");
  assert.equal(d26.detalle, "acuerdo_vigente");
  assert.equal(textoEstado(d26, "2026-10-26"), "Acuerdo con Operativo · paga 2026-10-27");

  assert.equal(e("2026-10-27").detalle, "acuerdo_incumplido");
  const d28 = e("2026-10-28");
  assert.equal(textoEstado(d28, "2026-10-28"), "Incumplió acuerdo · 3 días hábiles vencido");
  assert.equal(semaforo(d28, "2026-10-28"), "rojo");
});

test("el plazo y el acuerdo vencen solos, sin que nadie los marque", () => {
  const notif = [g("2026-10-22", "notificado")];
  assert.equal(estadoRecobro(sol(), notif, "2026-10-24").detalle, "ultimo_dia");
  assert.equal(estadoRecobro(sol(), notif, "2026-10-26").estado, "plazo_vencido");
  const acuerdo = [...hasta("2026-10-26")];
  assert.equal(estadoRecobro(sol(), acuerdo, "2026-10-27").detalle, "acuerdo_vigente");
  assert.equal(estadoRecobro(sol(), acuerdo, "2026-10-28").detalle, "acuerdo_incumplido");
});

test("días sin registro del cajero: el domingo no cuenta y hoy aún tiene plazo", () => {
  const sinLunes = EJEMPLO.filter((x) => x.fecha !== "2026-10-26");
  const est = estadoRecobro(sol(), sinLunes, "2026-10-28");
  assert.deepEqual(diasSinRegistro(est, sinLunes, "2026-10-28"), ["2026-10-26"]);
  assert.deepEqual(diasSinRegistro(estadoRecobro(sol(), EJEMPLO, "2026-10-28"), EJEMPLO, "2026-10-28"), []);

  const solo22 = [g("2026-10-22", "notificado")];
  const e29 = estadoRecobro(sol(), solo22, "2026-10-29");
  assert.equal(sinGestionHoy(e29, solo22, "2026-10-29"), true);
  assert.equal(sinGestionHoy(e29, solo22, "2026-11-01"), false); // domingo
});

test("abonos hasta saldo 0: pagado", () => {
  const gs = [
    g("2026-10-22", "notificado"),
    g("2026-10-23", "abono_parcial", { valorRecibido: 17_000 }),
    g("2026-10-24", "pago_completo", { valorRecibido: 20_000 }),
  ];
  assert.equal(saldoRecobro(37_000, gs.slice(0, 2)), 20_000);
  const e = estadoRecobro(sol(), gs, "2026-10-26");
  assert.equal(e.estado, "pagado");
  assert.equal(e.desde, "2026-10-24");
  // Una corrección aprobada del abono cambia el saldo sin tocar la gestión.
  assert.equal(saldoRecobro(37_000, gs.slice(0, 2), [{ gestionId: gs[1].id, valorNuevo: 7_000 }]), 30_000);
});

test("revisión, subgerencia y cierres", () => {
  const pendiente = sol({ estado: "pendiente", resultado: null, resueltoAt: null, origen: "abono_gema", abonoFecha: "2026-10-27" });
  assert.equal(estadoRecobro(pendiente, [], "2026-10-28").estado, "solicitud_creada");
  assert.equal(estadoRecobro(pendiente, [], "2026-10-28").desde, "2026-10-27");
  assert.equal(estadoRecobro({ ...pendiente, tomadoAt: "2026-10-28T14:00:00Z" }, [], "2026-10-28").estado, "en_revision");
  assert.equal(estadoRecobro({ ...pendiente, anuladaAt: "2026-10-28T14:00:00Z" }, [], "2026-10-28").estado, "anulada");

  assert.equal(estadoRecobro(sol({ resultado: "normalidad_timbradas" }), [], "2026-10-28").estado, "cerrado_sin_cobro");
  const sinConteo = sol({ resultado: "sin_conteo", valorRecobro: null });
  assert.equal(estadoRecobro(sinConteo, [], "2026-10-28").estado, "decide_subgerencia");
  const cobrar = estadoRecobro({ ...sinConteo, subgerenciaDecision: "cobrar", subgerenciaAt: "2026-10-27T15:00:00Z" }, [], "2026-10-28");
  assert.equal(cobrar.estado, "sin_gestionar");
  assert.equal(cobrar.habilitadoDesde, "2026-10-27");
  const noCobrar = estadoRecobro({ ...sinConteo, subgerenciaDecision: "no_cobrar", subgerenciaAt: "2026-10-27T15:00:00Z" }, [], "2026-10-28");
  assert.equal(noCobrar.motivoCierre, "subgerencia_no_cobra");

  assert.equal(estadoRecobro(sol({ incobrableSolicitadoAt: "2026-10-28T15:00:00Z" }), [], "2026-10-28").estado, "incobrable_por_autorizar");
  assert.equal(estadoRecobro(sol({ cobroEstado: "incobrable", cobroAt: "2026-10-29T15:00:00Z" }), [], "2026-10-30").motivoCierre, "incobrable");
  assert.equal(estadoRecobro(sol({ liquidacionMarcadaAt: "2026-10-28T15:00:00Z" }), [], "2026-10-28").estado, "para_liquidacion");
  assert.equal(estadoRecobro(sol({ cobroEstado: "liquidacion_definitiva", cobroAt: "2026-10-29T15:00:00Z" }), [], "2026-10-30").estado, "liquidado");
});

test("inicio del reloj de revisión según el origen", () => {
  assert.equal(inicioRevision({ origen: "abono_gema", abonoFecha: "2026-10-27", solicitadoAt: "2026-10-28T09:00:00Z", fechaViaje: "2026-10-27" }), "2026-10-27");
  // 2026-10-28 02:00 UTC es el 27 en Bogotá.
  assert.equal(inicioRevision({ origen: "cartulina", abonoFecha: null, solicitadoAt: "2026-10-28T02:00:00Z", fechaViaje: "2026-10-20" }), "2026-10-27");
  assert.equal(inicioRevision({ origen: "mantenimiento", abonoFecha: null, solicitadoAt: "2026-10-28T09:00:00Z", fechaViaje: "2026-10-20" }), "2026-10-20");
});

test("semáforo por días hábiles en el estado", () => {
  const pend = (hoy: string) => estadoRecobro(sol({ estado: "pendiente", resultado: null, origen: "abono_gema", abonoFecha: "2026-10-22" }), [], hoy);
  assert.equal(semaforo(pend("2026-10-23"), "2026-10-23"), "verde");
  assert.equal(semaforo(pend("2026-10-26"), "2026-10-26"), "ambar"); // 23, 24 y 26
  assert.equal(semaforo(pend("2026-10-27"), "2026-10-27"), "rojo");
  assert.equal(semaforo(estadoRecobro(sol({ resultado: "normalidad_timbradas" }), [], "2026-10-30"), "2026-10-30"), "gris");
});

test("validar la gestión de hoy", () => {
  const ctx = (gs: GestionBase[], hoy: string, saldo = 37_000) => ({
    catalogo: CATALOGO, estado: estadoRecobro(sol(), gs, hoy), saldo, hoy,
  });
  const notif = [g("2026-10-22", "notificado")];

  assert.equal(validarGestion({ resultado: "no_vino" }, ctx(notif, "2026-10-23")).ok, false); // sin observación
  assert.equal(validarGestion({ resultado: "notificado", observacion: "otra vez" }, ctx(notif, "2026-10-23")).ok, false);
  assert.equal(validarGestion({ resultado: "pidio_plazo", observacion: "x", compromisoFecha: "2026-10-26" }, ctx(notif, "2026-10-23")).ok, false); // pasa el plazo
  assert.equal(validarGestion({ resultado: "pidio_plazo", observacion: "x", compromisoFecha: "2026-10-24" }, ctx(notif, "2026-10-23")).ok, true);
  assert.equal(validarGestion({ resultado: "pidio_plazo", observacion: "x", compromisoFecha: "2026-10-25" }, ctx([], "2026-10-23")).ok, false); // domingo
  // El acuerdo con Operativo solo con el plazo vencido, y exige quién autorizó.
  assert.equal(validarGestion({ resultado: "acuerdo_operativo", observacion: "x", compromisoFecha: "2026-10-24", autorizadoPor: "Jefe" }, ctx(notif, "2026-10-23")).ok, false);
  assert.equal(validarGestion({ resultado: "acuerdo_operativo", observacion: "x", compromisoFecha: "2026-10-28" }, ctx(notif, "2026-10-26")).ok, false);
  assert.equal(validarGestion({ resultado: "acuerdo_operativo", observacion: "x", compromisoFecha: "2026-10-28", autorizadoPor: "Jefe" }, ctx(notif, "2026-10-26")).ok, true);

  assert.equal(validarGestion({ resultado: "abono_parcial", observacion: "x", valorRecibido: 37_000 }, ctx(notif, "2026-10-23")).ok, false); // cubre todo
  assert.equal(validarGestion({ resultado: "abono_parcial", observacion: "x", valorRecibido: 40_000 }, ctx(notif, "2026-10-23")).ok, false); // pasa el saldo
  assert.equal(validarGestion({ resultado: "abono_parcial", observacion: "x", valorRecibido: 10_000 }, ctx(notif, "2026-10-23")).ok, true);
  assert.equal(validarGestion({ resultado: "pago_completo", valorRecibido: 37_000 }, ctx(notif, "2026-10-23")).ok, false); // sin cargue GEMA
  assert.equal(validarGestion({ resultado: "pago_completo", valorRecibido: 30_000, gemaCargueConfirmado: true }, ctx(notif, "2026-10-23")).ok, false);
  const pago = validarGestion({ resultado: "pago_completo", valorRecibido: 37_000, gemaCargueConfirmado: true }, ctx(notif, "2026-10-23"));
  assert.equal(pago.ok, true);
  if (pago.ok) assert.equal(pago.gestion.observacion, null); // «Pagó completo» no la exige

  const cerrado = { ...ctx(notif, "2026-10-23"), estado: estadoRecobro(sol({ cobroEstado: "cobrado", cobroAt: "2026-10-23T15:00:00Z" }), notif, "2026-10-23") };
  assert.equal(validarGestion({ resultado: "no_vino", observacion: "x" }, cerrado).ok, false);
});

test("correcciones", () => {
  const ctx = {
    tipo: "camara" as const, estado: estadoRecobro(sol(), [], "2026-10-23"), conteoActual: 99, diferenciaActual: 10,
    resultadoActual: "recobro" as const, valoresRecibidos: new Map([["g1", 10_000]]), valorRecobro: 37_000, totalRecibido: 10_000,
  };
  assert.equal(validarCorreccion({ campo: "conteo_camara", valorNuevo: 99, motivo: "x" }, ctx).ok, false); // igual
  assert.equal(validarCorreccion({ campo: "conteo_camara", valorNuevo: 97 }, ctx).ok, false); // sin motivo
  assert.equal(validarCorreccion({ campo: "conteo_camara", valorNuevo: "97", motivo: "Se recontó" }, ctx).ok, true);
  assert.equal(validarCorreccion({ campo: "diferencia", valorNuevo: 3, motivo: "x" }, ctx).ok, false); // es de cámara
  assert.equal(validarCorreccion({ campo: "resultado", valorNuevo: "normalidad_timbradas", motivo: "x" }, ctx).ok, false); // ya pagó una parte
  assert.equal(validarCorreccion({ campo: "valor_recibido", gestionId: "g1", valorNuevo: 50_000, motivo: "x" }, ctx).ok, false);
  const ok = validarCorreccion({ campo: "valor_recibido", gestionId: "g1", valorNuevo: 1_000, motivo: "Digitó un cero de más" }, ctx);
  assert.equal(ok.ok && ok.valorAnterior, "10000");
});

test("quién puede qué", () => {
  const nadie: RolRecobros = { auxiliar: false, mantenimiento: false, directorMantenimiento: false, subgerencia: false, caja: false, operativo: false, directora: false };
  const enGestion = estadoRecobro(sol(), [g("2026-10-22", "notificado")], "2026-10-23");
  const vencido = estadoRecobro(sol(), [g("2026-10-22", "notificado")], "2026-10-27");
  assert.equal(motivoNoPermitido("gestionar", enGestion, { ...nadie, caja: true }, "camara"), null);
  assert.notEqual(motivoNoPermitido("gestionar", enGestion, { ...nadie, operativo: true }, "camara"), null);
  assert.notEqual(motivoNoPermitido("instruccion_operativo", enGestion, { ...nadie, operativo: true }, "camara"), null);
  assert.equal(motivoNoPermitido("instruccion_operativo", vencido, { ...nadie, operativo: true }, "camara"), null);
  const pendiente = estadoRecobro(sol({ estado: "pendiente", resultado: null }), [], "2026-10-23");
  assert.equal(motivoNoPermitido("resolver", pendiente, { ...nadie, mantenimiento: true }, "camara"), null);
  assert.notEqual(motivoNoPermitido("resolver", pendiente, { ...nadie, mantenimiento: true }, "cartulina"), null);
  assert.equal(motivoNoPermitido("validar_correccion", enGestion, { ...nadie, directorMantenimiento: true }, "camara"), null);
  assert.notEqual(motivoNoPermitido("validar_correccion", enGestion, { ...nadie, directora: true }, "camara"), null);
  assert.equal(motivoNoPermitido("marcar_liquidacion", enGestion, { ...nadie, directora: true }, "camara"), null);
});

test("cierre por liquidación definitiva", () => {
  assert.equal(validarCierreLiquidacion({ concepto: "descontado_total", valorDescontado: 30_000, soporte: "LIQ-1" }, 37_000).ok, false);
  assert.equal(validarCierreLiquidacion({ concepto: "descontado_total", valorDescontado: 37_000, soporte: "LIQ-1" }, 37_000).ok, true);
  assert.equal(validarCierreLiquidacion({ concepto: "descontado_parcial", valorDescontado: 37_000, soporte: "LIQ-1" }, 37_000).ok, false);
  const nd = validarCierreLiquidacion({ concepto: "no_descontable", soporte: "LIQ-1" }, 37_000);
  assert.equal(nd.ok && nd.valorDescontado, 0);
  assert.equal(validarCierreLiquidacion({ concepto: "otro", valorDescontado: 0, soporte: "LIQ-1" }, 37_000).ok, false);
  assert.equal(validarCierreLiquidacion({ concepto: "descontado_total", valorDescontado: 37_000 }, 37_000).ok, false);
});

test("resumen, ranking y orden de urgencia", () => {
  const hoy = "2026-10-28";
  const fila = (p: Partial<FilaRecobro>, s: Partial<SolicitudBase> = {}, gs: GestionBase[] = []): FilaRecobro => {
    const est: EstadoCalculado = estadoRecobro(sol(s), gs, hoy);
    return {
      tipo: "camara", fechaViaje: "2026-10-17", conductorCedula: "A", conductorNombre: "Conductor A", vehiculoCodigo: "1",
      diferencia: 10, valorRecobro: 37_000, recibido: 0, inicioRevision: "2026-10-17", resueltoEn: "2026-10-22",
      estado: est, sinGestionHoy: sinGestionHoy(est, gs, hoy), ...p,
    };
  };
  const filas = [
    fila({}),
    fila({ conductorCedula: "B", conductorNombre: "Conductor B", vehiculoCodigo: "2", diferencia: 4, valorRecobro: 14_800, recibido: 14_800 },
      { cobroEstado: "cobrado", cobroAt: "2026-10-27T15:00:00Z" }),
    fila({ diferencia: null, valorRecobro: null, resueltoEn: "2026-10-27" }, { resultado: "normalidad_timbradas" }),
  ];
  const r = resumen(filas);
  assert.equal(r.recobrosHabilitados, 2);
  assert.equal(r.timbradasNoRegistradas, 14);
  assert.equal(r.valorDejadoDeCobrar, 51_800);
  assert.equal(r.porCobrar, 37_000);
  assert.equal(r.recaudado, 14_800);
  assert.equal(r.sinGestionHoy, 1);
  // Del sáb 17 al jue 22 son 4 días hábiles (el domingo no cuenta); al mar 27, 8.
  assert.equal(r.diasPromedioRevision, (4 + 4 + 8) / 3);

  const porConductor = ranking(filas, "conductor");
  assert.deepEqual(porConductor.map((p) => [p.clave, p.timbradas, p.viajes]), [["A", 10, 1], ["B", 4, 1]]);

  const orden = ordenUrgencia([
    { id: 1, semaforo: "verde" as const, valorRecobro: 90_000 },
    { id: 2, semaforo: "rojo" as const, valorRecobro: 10_000 },
    { id: 3, semaforo: "rojo" as const, valorRecobro: 30_000 },
    { id: 4, semaforo: "gris" as const, valorRecobro: 99_000 },
  ]);
  assert.deepEqual(orden.map((o) => o.id), [3, 2, 1, 4]);
});
