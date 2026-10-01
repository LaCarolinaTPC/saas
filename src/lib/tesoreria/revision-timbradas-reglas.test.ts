import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENTO_ENTRADA, EVENTO_SALIDA, descuentoAutorizado, esAlerta, esAlertaExcel, esDomingoOFestivo, etiquetasDe,
  eventoMasCercano, ordenarFilas, procesarDia, tablaVigente, TABLA_DOMFEST_EXPRESS, TABLA_DOMFEST_OTRAS,
  TABLA_LUNSAB_NUEVA, TABLA_NUEVOS, TABLA_VIEJOS,
  type EventoGeocerca, type TimbradaDescontada, type ViajeDespacho, type ViajeRecaudado,
} from "./revision-timbradas-reglas";

// 2026-09-29 es martes (Lun–Sáb); 2026-09-27 domingo; 2026-10-12 festivo (Día de la Raza, lunes).
const MARTES = "2026-09-29";

const hd = (p: Partial<ViajeDespacho> = {}): ViajeDespacho => ({
  numero: 1000, viaje: 1, placa: "ABC123", codigo: "501", conductor: "PEREZ JUAN", conductorCod: "889",
  horaDespacho: "08:00:00", horaLlegada: "10:00:00", estado: "DESPACHADO", timbradas: 80,
  rutaProgramada: "A - 16 MIRAMAR", rutaReprogramada: "A - 16 MIRAMAR", ...p,
});
const pv = (p: Partial<EventoGeocerca>): EventoGeocerca => ({
  fecha: MARTES, hora: "08:00:00", placa: "ABC123", descripcion: EVENTO_SALIDA, subidas: 0, bajadas: 0, registradora: 0, ...p,
});
/** Par de eventos del terminal con `sub` subidas entre salida y llegada. */
const viajePv = (sub: number, o: { baj?: number; reg?: number; sal?: string; lle?: string; fechaLle?: string; placa?: string; fecha?: string } = {}) => [
  pv({ placa: o.placa ?? "ABC123", fecha: o.fecha ?? MARTES, hora: o.sal ?? "08:00:30", subidas: 10, bajadas: 10, registradora: 5000 }),
  pv({
    placa: o.placa ?? "ABC123", fecha: o.fechaLle ?? o.fecha ?? MARTES, hora: o.lle ?? "10:00:30", descripcion: EVENTO_ENTRADA,
    subidas: 10 + sub, bajadas: 10 + (o.baj ?? sub), registradora: 5000 + (o.reg ?? sub),
  }),
];
const vr = (p: Partial<ViajeRecaudado> = {}): ViajeRecaudado => ({
  numero: 1000, timbradasReal: 80, descuento: 0, inicial: 5000, final: 5080, codigoVehiculo: "501", viaje: "1",
  codigoConductor: "0889", conductorNombre: "PEREZ JUAN", ...p,
});
const td = (motivo: string, descuento: number, p: Partial<TimbradaDescontada> = {}): TimbradaDescontada => ({
  numViaje: 1, placa: "ABC123", descuento, motivo, ...p,
});

const uno = (fecha: string, h: ViajeDespacho, e: EventoGeocerca[], r: ViajeRecaudado[], t: TimbradaDescontada[] = []) =>
  procesarDia(fecha, [h], e, r, t).filas[0];

test("tablas de descuentos autorizados por tramo", () => {
  assert.equal(descuentoAutorizado(59, TABLA_LUNSAB_NUEVA), 0);
  assert.equal(descuentoAutorizado(60, TABLA_LUNSAB_NUEVA), 1);
  assert.equal(descuentoAutorizado(119, TABLA_LUNSAB_NUEVA), 2);
  assert.equal(descuentoAutorizado(150, TABLA_LUNSAB_NUEVA), 4);
  assert.equal(descuentoAutorizado(400, TABLA_LUNSAB_NUEVA), 4);
  assert.equal(descuentoAutorizado(30, TABLA_DOMFEST_EXPRESS), 1);
  assert.equal(descuentoAutorizado(70, TABLA_DOMFEST_EXPRESS), 3);
  assert.equal(descuentoAutorizado(39, TABLA_DOMFEST_OTRAS), 0);
  assert.equal(descuentoAutorizado(100, TABLA_DOMFEST_OTRAS), 3);
  assert.equal(descuentoAutorizado(80, TABLA_NUEVOS), 1);
  assert.equal(descuentoAutorizado(71, TABLA_VIEJOS), 2);
});

test("domingos y festivos de Colombia eligen el plan especial", () => {
  assert.equal(esDomingoOFestivo("2026-09-27"), true); // domingo
  assert.equal(esDomingoOFestivo("2026-10-12"), true); // festivo trasladado (Ley Emiliani)
  assert.equal(esDomingoOFestivo(MARTES), false);
  assert.equal(esDomingoOFestivo("2026-10-03"), false); // sábado: Lun–Sáb
  assert.equal(tablaVigente(false, true), TABLA_LUNSAB_NUEVA);
  assert.equal(tablaVigente(true, true), TABLA_DOMFEST_EXPRESS);
  assert.equal(tablaVigente(true, false), TABLA_DOMFEST_OTRAS);
});

test("evento más cercano a la hora del despacho, de la placa, el día y el tipo", () => {
  const e = [
    pv({ hora: "07:50:00" }), pv({ hora: "08:04:00" }), pv({ hora: "08:01:00", placa: "OTR999" }),
    pv({ hora: "08:00:10", descripcion: EVENTO_ENTRADA }), pv({ hora: "08:00:05", fecha: "2026-09-30" }),
  ];
  assert.equal(eventoMasCercano(e, "ABC123", MARTES, "08:00:00", EVENTO_SALIDA)?.hora, "08:04:00");
  assert.equal(eventoMasCercano(e, "ABC123", MARTES, "xx", EVENTO_SALIDA), null);
  // Empate: gana el más temprano.
  assert.equal(eventoMasCercano([pv({ hora: "08:05:00" }), pv({ hora: "07:55:00" })], "ABC123", MARTES, "08:00:00", EVENTO_SALIDA)?.hora, "07:55:00");
});

test("estados sin cruce: no despachado, datos incompletos, sin datos PV y sin recaudo", () => {
  assert.equal(uno(MARTES, hd({ estado: "NO_DESPACHADO" }), viajePv(80), [vr()]).estado, "N/A - No Despachado");
  assert.equal(uno(MARTES, hd({ horaLlegada: "00:00:00" }), viajePv(80), [vr()]).estado, "Revisar - Datos Incompletos");

  const sinPv = uno(MARTES, hd(), [], [vr({ descuento: 2 })], [td("ACTUALIZACIÓN CONTEO", 1)]);
  assert.equal(sinPv.estado, "Revisar - Sin Datos PV");
  assert.deepEqual([sinPv.timR, sinPv.dctoVr, sinPv.tdDcto, sinPv.timNeto], [80, 2, 1, 78]);

  const sinVr = uno(MARTES, hd({ estado: "NO_FINALIZADO", timbradas: 70 }), viajePv(70), [], [td("ACTUALIZACIÓN CONTEO", 3)]);
  assert.equal(sinVr.estado, "Sin Recaudo - Con Timbradas");
  assert.deepEqual([sinVr.timR, sinVr.dctoVr, sinVr.tdDcto, sinVr.timNeto], [70, 0, 3, 67]);
  assert.match(sinVr.observacion!, /Recaudo no registrado \(despacho en estado NO_FINALIZADO\)/);
});

test("cartulina distinta a los puntos virtuales", () => {
  const f = uno(MARTES, hd(), viajePv(78), [vr()]);
  assert.equal(f.estado, "Revisar - Cartulina Con PV");
  assert.deepEqual([f.acSub, f.acReg, f.difSR, f.difSB, f.regSalida, f.regLlegada], [78, 78, 0, 0, 5000, 5078]);
});

test("política nueva Lun–Sáb: descuentos válidos y diferencia sin soporte", () => {
  const ok = (dcto: number, t: TimbradaDescontada[] = []) => uno(MARTES, hd(), viajePv(95), [vr({ timbradasReal: 95, descuento: dcto })], t);
  // 95 timbradas → 2 autorizados (90–119).
  assert.equal(ok(0).estado, "OK");
  assert.equal(ok(2).estado, "OK");
  assert.equal(ok(2).autorizado, 2);
  assert.equal(ok(3, [td("ACTUALIZACIÓN CONTEO", 1)]).estado, "OK"); // td + aut
  assert.equal(ok(1, [td("ACTUALIZACIÓN CONTEO", 1)]).estado, "OK"); // solo td
  assert.equal(ok(0, [td("POR VENTA", 5)]).estado, "OK"); // POR VENTA no suma al TD Dcto

  const dif = ok(5);
  assert.equal(dif.estado, "Diferencia Por Revisar");
  assert.equal(dif.observacion, "Dcto real 5 vs autorizado 2: +3 sin soporte en TD");
  assert.deepEqual(etiquetasDe(dif), ["sinsop"]);
});

test("descuentos manuales: cuadran con soporte por verificar o se desglosan", () => {
  const f = uno(MARTES, hd(), viajePv(95), [vr({ timbradasReal: 95, descuento: 6 })], [td("SENSOR", 3), td("POR ABORTADOS", 1)]);
  // 6 − 4 manuales = 2 = autorizado → cuadra con manuales, sigue en Diferencia.
  assert.equal(f.estado, "Diferencia Por Revisar");
  assert.equal(f.observacion, "Cuadra con descuentos manuales registrados en TD: SENSOR 3, POR ABORTADOS 1 — verificar soporte");
  assert.equal(f.manual, 4);
  assert.deepEqual(etiquetasDe(f), ["manual"]);

  const g = uno(MARTES, hd(), viajePv(95), [vr({ timbradasReal: 95, descuento: 9 })], [td("SENSOR", 3)]);
  assert.equal(g.observacion, "Dcto real 9 vs autorizado 2 + manuales (SENSOR 3): +4 sin soporte en TD");
});

test("domingo: tabla EXPRESS y tabla de otras rutas", () => {
  const dom = "2026-09-27";
  const e = viajePv(45, { fecha: dom });
  const express = uno(dom, hd({ rutaReprogramada: "B - 2 EXPRESS CENTRO" }), e, [vr({ timbradasReal: 45, descuento: 1 })]);
  assert.equal(express.estado, "OK"); // 30–49 → 1
  assert.equal(express.autorizado, 1);
  const otra = uno(dom, hd(), e, [vr({ timbradasReal: 45, descuento: 1 })]);
  assert.equal(otra.estado, "OK"); // 40–69 → 1
  assert.equal(uno(dom, hd(), e, [vr({ timbradasReal: 45, descuento: 2 })]).estado, "Diferencia Por Revisar");
  assert.equal(uno(dom, hd({ rutaProgramada: "EXPRESS" }), viajePv(50, { fecha: dom }), [vr({ timbradasReal: 50, descuento: 2 })]).estado, "OK");
});

test("cortesía de las 18:00: Tim R = Ac.Sub + 1 y VENTA ADICIONAL en descuentos", () => {
  const noche = hd({ horaDespacho: "18:30:00", horaLlegada: "20:30:00" });
  const e = viajePv(70, { sal: "18:30:10", lle: "20:30:10" });

  const mas1 = uno(MARTES, noche, e, [vr({ timbradasReal: 71, descuento: 0 })]);
  assert.equal(mas1.estado, "OK");
  assert.match(mas1.observacion!, /Tim R = Ac.Sub \+ 1/);

  const va = uno(MARTES, noche, e, [vr({ timbradasReal: 70, descuento: 2 })], [td("VENTA ADICIONAL", 1)]);
  assert.equal(va.estado, "OK"); // 1 autorizado + 1 cortesía
  assert.deepEqual(etiquetasDe(va), ["cort"]);

  // Antes de las 18:00 la VENTA ADICIONAL no se acepta.
  const tarde = uno(MARTES, hd(), viajePv(70), [vr({ timbradasReal: 70, descuento: 2 })], [td("VENTA ADICIONAL", 1)]);
  assert.equal(tarde.estado, "Diferencia Por Revisar");
  // Ni si el viaje no terminó despachado.
  const nf = uno(MARTES, { ...noche, estado: "NO_FINALIZADO" }, e, [vr({ timbradasReal: 71 })]);
  assert.equal(nf.estado, "Revisar - Cartulina Con PV");
});

test("viaje nocturno busca la llegada al día siguiente", () => {
  const noche = hd({ horaDespacho: "22:00:00", horaLlegada: "00:40:00" });
  const e = viajePv(60, { sal: "22:00:20", lle: "00:40:20", fechaLle: "2026-09-30" });
  const f = uno(MARTES, noche, e, [vr({ timbradasReal: 60, descuento: 1 })]);
  assert.equal(f.estado, "OK");
  assert.equal(f.acSub, 60);
  assert.equal(f.observacion, null); // salida ≥ 18:00: no es error de digitación

  const raro = uno(MARTES, hd({ horaDespacho: "10:00:00", horaLlegada: "09:00:00" }), [], [vr()]);
  assert.match(raro.observacion!, /Llegada 09:00 anterior a la salida en HD/);
  assert.deepEqual(etiquetasDe(raro), ["llant"]);
});

test("política vieja: sensor viejo cuando solo cuadra con su tabla", () => {
  const ago = "2026-08-10";
  const e = viajePv(60, { fecha: ago });
  const viejo = procesarDia(ago, [hd()], e, [vr({ timbradasReal: 60, descuento: 1 })], []);
  assert.equal(viejo.politicaNueva, false);
  assert.equal(viejo.filas[0].estado, "OK");
  assert.equal(viejo.filas[0].sensor, "VIEJO");
  assert.deepEqual(viejo.placasSensorViejo, ["ABC123"]);

  const e85 = viajePv(85, { fecha: ago });
  assert.equal(uno(ago, hd(), e85, [vr({ timbradasReal: 85, descuento: 1 })]).sensor, "NUEVO");
  assert.equal(uno(ago, hd(), e85, [vr({ timbradasReal: 85, descuento: 3 })]).estado, "Diferencia Por Revisar");
  // Sin cortesía de 18:00 antes del cambio de política.
  const noche = uno(ago, hd({ horaDespacho: "19:00:00", horaLlegada: "21:00:00" }), viajePv(60, { fecha: ago, sal: "19:00:00", lle: "21:00:00" }), [vr({ timbradasReal: 61 })]);
  assert.equal(noche.estado, "Revisar - Cartulina Con PV");
});

test("observaciones: llegada repetida, liquidación conjunta y conductor distinto", () => {
  const v1 = hd({ numero: 1, viaje: 1 });
  const v2 = hd({ numero: 2, viaje: 2, horaDespacho: "09:00:00" }); // misma llegada 10:00:00
  const r = procesarDia(
    MARTES, [v1, v2], viajePv(80),
    [vr({ numero: 1, viaje: "1" }), vr({ numero: 2, viaje: "2", codigoConductor: "0777", conductorNombre: "GOMEZ ANA" })],
    [],
  );
  const [f1, f2] = r.filas;
  assert.match(f1.observacion!, /Llegada repetida con v2 en HD/);
  assert.match(f1.observacion!, /Liquidado junto con v2 en recaudo/);
  assert.doesNotMatch(f1.observacion!, /Conductor/); // 0889 = 889
  assert.match(f2.observacion!, /Conductor en recaudo distinto al del despacho: 777 GOMEZ ANA/);
  assert.deepEqual(etiquetasDe(f2), ["llrep", "liq", "conductor"]);
});

test("alertas y orden por prioridad", () => {
  const r = procesarDia(
    MARTES,
    [
      hd({ numero: 1, placa: "ZZZ999" }),
      hd({ numero: 2, placa: "AAA111", estado: "NO_DESPACHADO" }),
      hd({ numero: 3, placa: "BBB222" }),
    ],
    [...viajePv(80, { placa: "ZZZ999", baj: 60 }), ...viajePv(80, { placa: "BBB222" })],
    [vr({ numero: 1 }), vr({ numero: 3, descuento: 9 })],
    [],
  );
  const ord = ordenarFilas(r.filas).map((f) => [f.placa, f.estado]);
  assert.deepEqual(ord, [
    ["BBB222", "Diferencia Por Revisar"],
    ["ZZZ999", "OK"],
    ["AAA111", "N/A - No Despachado"],
  ]);
  const zzz = r.filas[0];
  assert.equal(zzz.difSB, 20);
  assert.equal(esAlertaExcel(zzz), false);
  assert.equal(esAlerta(zzz), true); // subidas ≠ bajadas por más de 10
});
