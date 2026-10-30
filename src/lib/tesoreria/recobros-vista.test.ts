import { test } from "node:test";
import assert from "node:assert/strict";
import type { RolRecobros } from "./recobros";
import {
  avisosRecobros, enAlcanceRecobros, enRango, esClaveAviso, esDeCajero, estadoCaja, notaCaja, filaBandeja, pasaAviso, totalAvisos, pasaBusqueda, pasaFiltroRapido, rangoPeriodo,
  type GestionVista, type SolicitudVista,
} from "./recobros-vista";

// Datos de prueba sin personas.
const sol = (p: Partial<SolicitudVista> = {}): SolicitudVista => ({
  id: "s1", numero: 1854866, viaje: 2, placa: "TST001", vehiculoCodigo: "1024",
  conductorCedula: "1000000001", conductorNombre: "CONDUCTOR DE PRUEBA", ruta: "D - 6",
  tipo: "camara", origen: "mantenimiento", fechaViaje: "2026-10-17",
  solicitadoAt: "2026-10-22T21:44:00Z", abonoFecha: null, anuladaAt: null, tomadoAt: null,
  estado: "resuelto", resultado: "recobro", resueltoAt: "2026-10-22T21:44:00Z",
  subgerenciaDecision: null, subgerenciaAt: null, valorRecobro: 37_000,
  cobroEstado: null, cobroAt: null, incobrableSolicitadoAt: null, liquidacionMarcadaAt: null,
  motivoSolicitud: null, notaSolicitud: null, solicitadoPorEmail: null, tomadoPorEmail: null, notaCamaras: null,
  resueltoPorEmail: "camara@ejemplo.co", timbradasRegistradora: 89, conteoCamara: 99, diferencia: 10,
  subgerenciaNota: null, subgerenciaPorEmail: null, cobroValor: null, alertas: [],
  ...p,
});
const g = (id: string, fecha: string, resultado: string, extra: Partial<GestionVista> = {}): GestionVista => ({
  id, fecha, createdAt: `${fecha}T15:00:00Z`, resultado, compromisoFecha: null, valorRecibido: null,
  observacion: "x", autorizadoPor: null, usuarioEmail: "cajero@ejemplo.co", rol: "caja", ...extra,
});
const nombre = (c: string) => ({ notificado: "Se le notificó el recobro", abono_parcial: "Abono parcial" })[c] ?? c;

test("fila de la bandeja: estado, saldo, última gestión y días", () => {
  const gs = [g("a", "2026-10-22", "notificado"), g("b", "2026-10-23", "abono_parcial", { valorRecibido: 10_000 })];
  const f = filaBandeja(sol(), gs, [], nombre, "2026-10-28", "2026-01-01");
  assert.equal(f.estado.estado, "plazo_vencido");
  assert.equal(f.semaforo, "rojo");
  assert.equal(f.recibido, 10_000);
  assert.equal(f.saldo, 27_000);
  assert.equal(f.ultimaGestion?.resultado, "Abono parcial");
  assert.equal(f.diasSinPagar, 5); // 23, 24, 26, 27 y 28
  assert.deepEqual(f.diasSinRegistro, ["2026-10-24", "2026-10-26", "2026-10-27"]);
  assert.equal(f.sinGestionHoy, true);
  // Registrado por Mantenimiento, sin abono ni reporte de cartulina: no aparece en Recobros ni es de Caja.
  assert.equal(enAlcanceRecobros(f), false);
  assert.equal(enAlcanceRecobros({ origen: "mantenimiento", gemaAbono: 0 }), true);
  assert.equal(enAlcanceRecobros({ origen: "abono_gema", gemaAbono: null }), true);
  assert.equal(estadoCaja(f), null);
  assert.equal(esDeCajero(f), false);
  // Reportado por Revisión cartulina: por gestionar.
  const deCartulina = filaBandeja(sol({ origen: "cartulina" }), gs, [], nombre, "2026-10-28");
  assert.equal(estadoCaja(deCartulina), "por_gestionar");
  assert.equal(esDeCajero(deCartulina), true);
  // Antes del inicio del registro diario no hay «sin registro del cajero».
  assert.deepEqual(filaBandeja(sol(), gs, [], nombre, "2026-10-28").diasSinRegistro, []);
  assert.deepEqual(filaBandeja(sol(), gs, [], nombre, "2026-10-28", "2026-10-26").diasSinRegistro, ["2026-10-26", "2026-10-27"]);

  // Una corrección aprobada del abono cambia el saldo sin tocar la gestión.
  const c = filaBandeja(sol(), gs, [{ campo: "valor_recibido", gestionId: "b", valorNuevo: "1000", decision: "aprobada" }], nombre, "2026-10-28");
  assert.equal(c.saldo, 36_000);
  const pend = filaBandeja(sol(), gs, [{ campo: "conteo_camara", gestionId: null, valorNuevo: "97", decision: null }], nombre, "2026-10-28");
  assert.equal(pend.correccionesPendientes, 1);
});

test("lo cobrado con el flujo anterior cuenta como recibido", () => {
  const f = filaBandeja(sol({ origen: "cartulina", cobroEstado: "cobrado", cobroValor: 37_000, cobroAt: "2026-10-24T15:00:00Z" }), [], [], nombre, "2026-10-28");
  assert.equal(f.estado.estado, "pagado");
  assert.equal(f.recibido, 37_000);
  assert.equal(f.saldo, 0);
  assert.equal(f.semaforo, "gris");
  assert.equal(f.diasSinPagar, null);
  // Pagado: Caja lo ve como gestionado, para consultar.
  assert.equal(estadoCaja(f), "gestionado");
  assert.equal(esDeCajero(f), true);
  assert.equal(pasaFiltroRapido(f, "gestionados"), true);
  assert.equal(pasaFiltroRapido(f, "por_gestionar"), false);
});

test("filtros rápidos y búsqueda", () => {
  const pendiente = filaBandeja(sol({ estado: "pendiente", resultado: null, resueltoAt: null, origen: "abono_gema", abonoFecha: "2026-10-27" }), [], [], nombre, "2026-10-28");
  assert.equal(pasaFiltroRapido(pendiente, "por_revisar"), true);
  assert.equal(pasaFiltroRapido(pendiente, "sin_gestionar"), false);
  assert.equal(pasaFiltroRapido(pendiente, "todos"), true);
  assert.equal(esDeCajero(pendiente), false);
  assert.equal(estadoCaja(pendiente), null);
  assert.equal(pasaFiltroRapido(pendiente, "por_gestionar"), false);
  assert.equal(pasaBusqueda(pendiente, "prueba"), true);
  assert.equal(pasaBusqueda(pendiente, "1024"), true);
  assert.equal(pasaBusqueda(pendiente, "1854866"), true);
  assert.equal(pasaBusqueda(pendiente, "otro"), false);
});

test("periodos del resumen", () => {
  assert.deepEqual(rangoPeriodo("semana", "2026-10-29"), { desde: "2026-10-26", hasta: "2026-11-01" });
  assert.deepEqual(rangoPeriodo("semana", "2026-11-01"), { desde: "2026-10-26", hasta: "2026-11-01" }); // domingo
  assert.deepEqual(rangoPeriodo("mes", "2026-10-29"), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(rangoPeriodo("mes_anterior", "2026-01-15"), { desde: "2025-12-01", hasta: "2025-12-31" });
  assert.equal(rangoPeriodo("todo", "2026-10-29"), null);
  assert.equal(enRango("2026-10-17", rangoPeriodo("mes", "2026-10-29")), true);
  assert.equal(enRango("2026-09-30", rangoPeriodo("mes", "2026-10-29")), false);
});

test("avisos por rol: cada quien ve lo que le toca atender", () => {
  const hoy = "2026-10-28";
  const sinRol: RolRecobros = {
    auxiliar: false, mantenimiento: false, directorMantenimiento: false, subgerencia: false,
    caja: false, operativo: false, directora: false,
  };
  const vencido = [g("a", "2026-10-22", "notificado")];
  const filas = [
    filaBandeja(sol({ origen: "cartulina", id: "1" }), vencido, [], nombre, hoy),                                   // plazo vencido, sin gestión hoy
    filaBandeja(sol({ origen: "cartulina", id: "2" }), [...vencido, g("b", hoy, "no_pago_comprometido")], [], nombre, hoy), // vencido, con gestión hoy
    filaBandeja(sol({ origen: "cartulina", id: "3" }), [...vencido, g("c", "2026-10-27", "acuerdo_operativo", { compromisoFecha: "2026-10-31" })], [], nombre, hoy),
    filaBandeja(sol({ origen: "cartulina", id: "4", resultado: "sin_conteo", valorRecobro: null }), [], [], nombre, hoy), // decide subgerencia
    filaBandeja(sol({ origen: "cartulina", id: "5", estado: "pendiente", resultado: null, resueltoAt: null }), [], [], nombre, hoy), // cámara por revisar
    filaBandeja(sol({ origen: "cartulina", id: "6", incobrableSolicitadoAt: "2026-10-27T15:00:00Z" }), [], [
      { campo: "conteo_camara", gestionId: null, valorNuevo: "97", decision: null },
      { campo: "diferencia", gestionId: null, valorNuevo: "8", decision: null },
    ], nombre, hoy),
  ];
  assert.equal(filas[2].estado.detalle, "acuerdo_vigente");

  assert.deepEqual(avisosRecobros(filas, sinRol), []);
  const caja = avisosRecobros(filas, { ...sinRol, caja: true });
  // 1, 2, 3 y 6 siguen por gestionar aunque tengan gestión hoy (el 4 no está habilitado, el 5 espera la cámara).
  assert.deepEqual(caja.map((a) => [a.clave, a.n]), [["por_gestionar", 4]]);
  assert.equal(caja[0].texto, "4 recobros por gestionar en caja");
  assert.equal(caja[0].href, "/tesoreria/recobros?ver=por_gestionar");
  assert.deepEqual(caja[0].detalle?.map((d) => d.id).sort(), ["1", "2", "3", "6"]);
  assert.equal(caja[0].detalle?.[0].numero, 1854866);
  // Operativo: vencidos sin acuerdo vigente.
  assert.deepEqual(avisosRecobros(filas, { ...sinRol, operativo: true }).map((a) => a.n), [2]);
  assert.deepEqual(avisosRecobros(filas, { ...sinRol, subgerencia: true }).map((a) => a.clave), ["decide_subgerencia"]);
  assert.deepEqual(avisosRecobros(filas, { ...sinRol, directora: true }).map((a) => a.clave), ["incobrable_por_autorizar"]);
  // Las correcciones se cuentan una a una, no por recobro.
  const dir = avisosRecobros(filas, { ...sinRol, directorMantenimiento: true });
  assert.equal(dir[0].texto, "2 correcciones por validar");
  const mant = avisosRecobros(filas, { ...sinRol, mantenimiento: true });
  assert.equal(mant[0].href, "/mantenimiento/camaras/solicitudes");
  assert.equal(totalAvisos(avisosRecobros(filas, { ...sinRol, caja: true, operativo: true })), 6);

  // El filtro `?ver=` de la bandeja usa la misma regla.
  assert.deepEqual(filas.filter((f) => pasaAviso(f, "plazo_vencido")).map((f) => f.id), ["1", "2"]);
  assert.equal(esClaveAviso("correcciones"), true);
  assert.equal(esClaveAviso("cualquiera"), false);
});

test("Caja con abono de GEMA: GEMA manda", () => {
  const hoy = "2026-10-30";
  const conAbono = (p: Partial<SolicitudVista>) =>
    filaBandeja(sol({ origen: "abono_gema", abonoFecha: "2026-10-29", ...p }), [], [], nombre, hoy);
  // Sin revisar: es de Mantenimiento, no de Caja, mientras GEMA lo tenga por gestionar.
  const sinRevisar = conAbono({ estado: "pendiente", resultado: null, resueltoAt: null, gemaAbonoEstado: 0 });
  assert.equal(estadoCaja(sinRevisar), null);
  assert.equal(pasaAviso(sinRevisar, "por_revisar_camara"), true);
  // Ya gestionado en GEMA: no espera la cámara.
  assert.equal(pasaAviso(conAbono({ estado: "pendiente", resultado: null, resueltoAt: null, gemaAbonoEstado: 1 }), "por_revisar_camara"), false);
  // Recobro con el abono por gestionar: por gestionar.
  const recobro = conAbono({ gemaAbonoEstado: 0 });
  assert.equal(estadoCaja(recobro), "por_gestionar");
  assert.equal(notaCaja(recobro), null);
  // Sin recobro, pero el abono sigue por gestionar en GEMA: Caja lo tiene que gestionar allá.
  const normal = conAbono({ resultado: "normalidad_timbradas", valorRecobro: 0, gemaAbonoEstado: 0 });
  assert.equal(normal.estado.estado, "cerrado_sin_cobro");
  assert.equal(estadoCaja(normal), "por_gestionar");
  assert.match(notaCaja(normal) ?? "", /falta gestionar el abono en GEMA/);
  // Gestionado en GEMA = cobrado, aunque Gestivo no tenga pago.
  assert.equal(estadoCaja(conAbono({ gemaAbonoEstado: 1 })), "gestionado");
  assert.equal(estadoCaja(conAbono({ resultado: "normalidad_timbradas", valorRecobro: 0, gemaAbonoEstado: 1 })), "gestionado");
  // Anulado en GEMA o esperando a subgerencia: fuera de Caja.
  assert.equal(estadoCaja(conAbono({ gemaAbonoEstado: 2 })), null);
  assert.equal(estadoCaja(conAbono({ resultado: "sin_conteo", valorRecobro: null, gemaAbonoEstado: 0 })), null);
  // Avisos y filtros usan la misma regla.
  const rol = { auxiliar: false, mantenimiento: false, directorMantenimiento: false, subgerencia: false, caja: true, operativo: false, directora: false };
  const [a] = avisosRecobros([recobro, normal, sinRevisar], rol);
  assert.equal(a.n, 2);
  assert.equal(a.detalle?.find((d) => d.nota)?.nota, "Sin recobro · falta gestionar el abono en GEMA");
  assert.equal(pasaFiltroRapido(normal, "por_gestionar"), true);
});
