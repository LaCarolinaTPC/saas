import { test } from "node:test";
import assert from "node:assert/strict";
import {
  croquisVacio,
  figuraDesdeTipo,
  leyenda,
  rutaDeCroquis,
  siguienteEtiqueta,
  validarCroquis,
  vehiculosDelReporte,
  type Croquis,
} from "./croquis";

test("figuraDesdeTipo agrupa el catálogo de tipos de vehículo", () => {
  assert.equal(figuraDesdeTipo("buseta"), "bus");
  assert.equal(figuraDesdeTipo("mula"), "camion");
  assert.equal(figuraDesdeTipo("motocarro"), "moto");
  assert.equal(figuraDesdeTipo("bicicleta"), "bicicleta");
  assert.equal(figuraDesdeTipo("campero"), "carro");
  assert.equal(figuraDesdeTipo(""), "carro");
  assert.equal(figuraDesdeTipo(null), "carro");
});

test("vehiculosDelReporte numera V1 la empresa y V2… los terceros en orden", () => {
  const v = vehiculosDelReporte({ codigo: "1022", placa: "TSK123" }, [
    { placa: "abc123", tipo_vehiculo: "automovil" },
    { placa: "", tipo_vehiculo: "moto" },
  ]);
  assert.deepEqual(v, [
    { etiqueta: "V1", figura: "bus", descripcion: "Bus 1022 · TSK123" },
    { etiqueta: "V2", figura: "carro", descripcion: "Carro ABC123" },
    { etiqueta: "V3", figura: "moto", descripcion: "Moto" },
  ]);
  assert.equal(vehiculosDelReporte({}, [])[0].descripcion, "Vehículo de la empresa");
});

test("siguienteEtiqueta salta las usadas y separa peatones", () => {
  const c: Croquis = {
    ...croquisVacio(),
    elementos: [
      { id: "a", tipo: "vehiculo", figura: "bus", etiqueta: "V1", x: 0, y: 0, rot: 0, posicion: "final" },
      { id: "b", tipo: "vehiculo", figura: "carro", etiqueta: "V2", x: 0, y: 0, rot: 0, posicion: "final" },
    ],
  };
  assert.equal(siguienteEtiqueta(c.elementos, "carro"), "V3");
  assert.equal(siguienteEtiqueta(c.elementos, "peaton"), "P1");
});

test("leyenda: una línea por etiqueta, V antes que P, sin repetir la posición previa", () => {
  const c: Croquis = {
    ...croquisVacio("cruce"),
    elementos: [
      { id: "p", tipo: "vehiculo", figura: "peaton", etiqueta: "P1", x: 0, y: 0, rot: 0, posicion: "final" },
      { id: "b", tipo: "vehiculo", figura: "carro", etiqueta: "V2", x: 0, y: 0, rot: 0, posicion: "final" },
      { id: "b2", tipo: "vehiculo", figura: "carro", etiqueta: "V2", x: 9, y: 9, rot: 0, posicion: "previa" },
      { id: "a", tipo: "vehiculo", figura: "bus", etiqueta: "V1", x: 0, y: 0, rot: 0, posicion: "final" },
      { id: "x", tipo: "vehiculo", figura: "moto", etiqueta: "V10", x: 0, y: 0, rot: 0, posicion: "final" },
    ],
  };
  const vehiculos = vehiculosDelReporte({ codigo: "1022" }, [{ placa: "ABC123", tipo_vehiculo: "automovil" }]);
  assert.deepEqual(leyenda(c, vehiculos), [
    "V1 = Bus 1022",
    "V2 = Carro ABC123",
    "V10 = Moto",
    "P1 = Peatón",
  ]);
});

test("validarCroquis sanea lo que llega del cliente", () => {
  const c = validarCroquis({
    version: 1,
    plantilla: "t",
    rotVia: 450,
    norte: -90,
    elementos: [
      { id: "ok", tipo: "vehiculo", figura: "bus", etiqueta: "V1", x: 100.123, y: 50, rot: 370, posicion: "previa" },
      { id: "x", tipo: "vehiculo", figura: "avion", etiqueta: "V2", x: 1, y: 1, rot: 0 },
      { id: "y", tipo: "vehiculo", figura: "carro", etiqueta: "<b>", x: 1, y: 1, rot: 0 },
      { tipo: "texto", x: 10, y: 10, rot: 0, texto: "  <script>Cra 50</script>  " },
      { tipo: "texto", x: 10, y: 10, rot: 0, texto: "   " },
      { tipo: "flecha", x1: 0, y1: 0, x2: "9", y2: 0 },
      { tipo: "impacto", x: 99999, y: 10 },
      { tipo: "senal", senal: "pare", x: 1, y: 2, rot: 0 },
      "basura",
    ],
  });
  assert.ok(c);
  assert.equal(c.rotVia, 90);
  assert.equal(c.norte, 270);
  assert.deepEqual(c.elementos[0], {
    id: "ok", tipo: "vehiculo", figura: "bus", etiqueta: "V1", x: 100.1, y: 50, rot: 10, posicion: "previa",
  });
  assert.deepEqual(c.elementos.map((e) => e.tipo), ["vehiculo", "texto", "impacto", "senal"]);
  const t = c.elementos[1];
  assert.equal(t.tipo === "texto" && t.texto, "scriptCra 50/script");
  const imp = c.elementos[2];
  assert.equal(imp.tipo === "impacto" && imp.x, 1600, "se acota al doble del lienzo");
});

test("validarCroquis rechaza lo que no es un croquis", () => {
  assert.equal(validarCroquis(null), null);
  assert.equal(validarCroquis({ version: 2, plantilla: "t", elementos: [] }), null);
  assert.equal(validarCroquis({ version: 1, plantilla: "autopista", elementos: [] }), null);
  assert.deepEqual(validarCroquis({ version: 1, plantilla: "vacia" })?.elementos, []);
});

test("rutaDeCroquis solo acepta croquis/<uuid>.png", () => {
  const id = "0b9f3c2e-6a1d-4e8b-9c7a-2f5d1e3b4a6c";
  assert.equal(rutaDeCroquis(`croquis/${id}.png`), `croquis/${id}.png`);
  assert.equal(rutaDeCroquis(`fotos/${id}.png`), null);
  assert.equal(rutaDeCroquis(`croquis/${id}.jpg`), null);
  assert.equal(rutaDeCroquis(undefined), null);
});
