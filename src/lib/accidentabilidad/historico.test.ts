import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COL,
  ciudadDesdeDireccion,
  codigoCausal,
  crearEmparejador,
  diaColombia,
  dinero,
  fechaHora,
  leerCsv,
  mapearFila,
  nulo,
} from "./historico";

function fila(over: Partial<Record<keyof typeof COL, string>> = {}) {
  const base: Partial<Record<keyof typeof COL, string>> = {
    fecha: "1/2/2024",
    hora: "9:08:00 PM",
    direccion: "CALLE 38 CARRERA 41 - BARRANQUILLA",
    danos: "1",
    ipat: "NO",
    conciliacion: "SI",
    propietario: "Afiliado",
    interno: "906",
    placa: "UYY035 ",
    conductor: "PORTO SALGADO LUIS HERNANDO",
    ruta: "CALLE 30",
    inmovilizacion: "NO",
    reporteAseguradora: "SI",
    reporteAseguradoraNumero: "45678893",
    responsabilidad: "CONDUCTOR",
    causal1: "121 NO MANTENER DISTANCIA DE SEGURIDAD",
    cobroConductor: "SI",
    cobroTercero: "NO",
    usuarioVia: "Automovil",
    vehiculoAfectado: "Particular",
    terceroNombre: "EDUARDO MARTINEZ BORRERO",
    terceroCelular: "3004965713",
    terceroDireccion: "Desconocido",
    terceroPlaca: "HEU-786",
    agente: "N/A",
    costo: " $ 230,000 ",
    estadoCaso: "Cerrado",
    ...over,
  };
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [COL[k as keyof typeof COL], v ?? ""]));
}

test("lee CSV con comillas y comas dentro de la celda", () => {
  assert.deepEqual(leerCsv('a,"$ 1,000",c\r\n"x ""y""",,z\n'), [
    ["a", "$ 1,000", "c"],
    ['x "y"', "", "z"],
  ]);
});

test("fecha M/D/AAAA y hora AM/PM en hora de Colombia", () => {
  assert.equal(fechaHora("1/2/2024", "9:08:00 AM"), "2024-01-02T09:08:00-05:00");
  assert.equal(fechaHora("12/31/2025", "12:30:00 PM"), "2025-12-31T12:30:00-05:00");
  assert.equal(fechaHora("3/5/2026", "12:05:00 AM"), "2026-03-05T00:05:00-05:00");
  assert.equal(fechaHora("", "9:00 AM"), null);
  assert.equal(diaColombia("2026-03-05T00:05:00-05:00"), "2026-03-05");
});

test("ciudad tolera errores de digitación", () => {
  assert.equal(ciudadDesdeDireccion("CALLE 1 - BARRAQNUILLA"), "barranquilla");
  assert.equal(ciudadDesdeDireccion("CALLE 1 - BARRNQUILLA"), "barranquilla");
  assert.equal(ciudadDesdeDireccion("CALLE 1 - SOLEDAD ATLANTICO"), "soledad");
  assert.equal(ciudadDesdeDireccion("VIA AL MAR - PUERTO COLOMBIA"), "puerto_colombia");
  assert.equal(ciudadDesdeDireccion("CALLE 1 CARRERA 2"), null);
});

test("valores vacíos, desconocidos y dinero", () => {
  assert.equal(nulo("DESCONOCIDO"), null);
  assert.equal(nulo(" N/A "), null);
  assert.equal(nulo(" JOSE "), "JOSE");
  assert.equal(dinero(" $ 230,000 "), 230000);
  assert.equal(dinero(" $ -   "), 0);
  assert.equal(dinero(""), null);
  assert.equal(codigoCausal("139 IMPERICIA EN EL MANEJO"), "139");
});

test("fila simple con tercero en vehículo particular", () => {
  const r = mapearFila(fila(), 3);
  assert.ok(r.ok);
  const a = r.registro;
  assert.equal(a.historico_ref, "GO-R-22!fila 3");
  assert.equal(a.fecha_accidente, "2024-01-02T21:08:00-05:00");
  assert.equal(a.clase_accidente, "simple");
  assert.equal(a.ciudad, "barranquilla");
  assert.equal(a.vehiculo_placa, "UYY035");
  assert.equal(a.vehiculo_afiliado, true);
  assert.equal(a.vehiculo_empresa, false);
  assert.equal(a.responsabilidad_reportada, "directo");
  assert.deepEqual(a.factores_codigos, ["121"]);
  assert.equal(a.costo_reparacion, 230000);
  assert.equal(a.caso_estado, "cerrado");
  assert.equal(a.agente_nombre, null);
  assert.equal(a.victima, null);
  assert.equal(a.tercero?.tipo_vehiculo, "automovil");
  assert.equal(a.tercero?.clase_vehiculo, "particular");
  assert.equal(a.tercero?.placa, "HEU-786");
  assert.equal(a.tercero?.propietario_direccion, null);
});

test("pasajero lesionado va a víctimas y no crea vehículo del tercero", () => {
  const r = mapearFila(
    fila({ danos: "", lesion: "1", usuarioVia: "Pasajero flota", vehiculoAfectado: "Lesionado", terceroPlaca: "N/A", terceroNombre: "JOSE AGUILAR" }),
    7
  );
  assert.ok(r.ok);
  assert.equal(r.registro.clase_accidente, "lesionado");
  assert.equal(r.registro.tercero, null);
  assert.deepEqual(r.registro.victima, {
    nombre: "JOSE AGUILAR", direccion: null, telefono: "3004965713", condicion: "usuario", fallecido: false,
  });
});

test("fila sin fecha se rechaza", () => {
  const r = mapearFila(fila({ fecha: "" }), 9);
  assert.equal(r.ok, false);
});

test("empareja conductor por nombre en cualquier orden y con apellido faltante", () => {
  const maestro = [
    { id: "1", cedula: "100", nombre: "LUIS HERNANDO PORTO SALGADO", codigo: "A1" },
    { id: "2", cedula: "200", nombre: "PATIÑO MORALES MARCIAL ENRIQUE", codigo: "A2" },
    { id: "3", cedula: "300", nombre: "PEREZ JUAN", codigo: "A3" },
    { id: "4", cedula: "400", nombre: "PEREZ JUAN", codigo: "A4" },
  ];
  const buscar = crearEmparejador(maestro);
  const exacto = buscar("PORTO SALGADO LUIS HERNANDO");
  assert.equal(exacto.tipo, "exacto");
  assert.equal(exacto.tipo === "exacto" && exacto.conductor.cedula, "100");
  const probable = buscar("PATINO MARCIAL ENRIQUE");
  assert.equal(probable.tipo === "probable" && probable.conductor.cedula, "200");
  assert.equal(buscar("JUAN PEREZ").tipo, "ambiguo");
  assert.equal(buscar("NADIE CONOCIDO").tipo, "ninguno");
});

test("fecha digitada como día/mes y ciudad en cualquier parte de la dirección", () => {
  assert.equal(fechaHora("19/09/2026", "8:00:00 AM"), "2026-09-19T08:00:00-05:00");
  assert.equal(ciudadDesdeDireccion("CRA 51B CON AVENIDA TAJAMARES PT.COLOMBIA"), "puerto_colombia");
  assert.equal(ciudadDesdeDireccion("CARRERA 12 CALLE 63B -SOLEDAD"), "soledad");
  assert.equal(ciudadDesdeDireccion("VIA 40 # 51 -19 BARRANQUILLA"), "barranquilla");
});
