import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETROS_V2, PARAMETROS_V3 } from "./politica";
import { hitosPorBeneficiario } from "./reglas";
import type { HechosPermanencia } from "./hitos";
import { accionRetroactiva, conciliarHitos, esReemplazada, estadoTrasRehacer, hitosResultantes, totalesHitos, type HitoExistente } from "./retroactivo";

const INGRESO = "2026-10-06";
/** Los hitos que hoy tiene un referido B de la v2, con los estados dados. */
const hitosB = (e1: string, e2: string): HitoExistente[] =>
  hitosPorBeneficiario(PARAMETROS_V2, "B", INGRESO).map((h, i) => ({
    id: `h${h.numero}`,
    numero: h.numero,
    beneficiario: h.beneficiario,
    valor: h.valor,
    estado: i === 0 ? e1 : e2,
    fecha_causacion: h.fechaCausacion!,
    descripcion: h.descripcion,
  }));
const resumen = (c: ReturnType<typeof conciliarHitos>) => ({
  actualizar: c.actualizar.map((h) => `${h.id}:${h.numero}${h.beneficiario[0]}=${h.valor}`),
  insertar: c.insertar.map((h) => `${h.numero}${h.beneficiario[0]}=${h.valor}${h.ajusteDe ? `(ajuste ${h.ajusteDe})` : ""}`),
  cancelar: c.cancelar,
  sobrepago: c.sobrepago,
});

test("accion: rehace a los contratados desde la fecha, revalida a los abiertos, no toca lo demás", () => {
  const r = (estado: string, fechaIngreso: string | null, anulado = false) => accionRetroactiva({ estado, fechaIngreso, anulado }, "2026-10-01");
  assert.equal(r("en_seguimiento", "2026-10-06"), "rehacer");
  assert.equal(r("terminado", "2026-10-01"), "rehacer");
  assert.equal(r("completado", "2026-09-30"), "sin_cambio");
  assert.equal(r("en_validacion", null), "revalidar");
  assert.equal(r("elegible", null), "revalidar");
  assert.equal(r("no_elegible", null), "sin_cambio");
  assert.equal(r("en_seguimiento", "2026-10-06", true), "sin_cambio");
});

test("conciliar: sin pagos, las filas de la v2 se reescriben con la v3 y las que faltan se insertan", () => {
  const nuevos = hitosPorBeneficiario(PARAMETROS_V3, "A", INGRESO);
  const c = conciliarHitos(hitosB("por_aprobar", "pendiente"), nuevos, "v3");
  assert.deepEqual(resumen(c), {
    actualizar: ["h1:1p=100000", "h2:2p=200000"],
    insertar: ["3p=200000", "2r=100000", "3r=100000"],
    cancelar: [],
    sobrepago: { padrino: 0, referido: 0 },
  });
  // Mismo esquema y montos (B → B): todo se reescribe igual, nada sobra.
  const b = conciliarHitos(hitosB("pendiente", "pendiente"), hitosPorBeneficiario(PARAMETROS_V3, "B", INGRESO), "v3");
  assert.deepEqual(resumen(b).actualizar, ["h1:1p=100000", "h2:2p=100000"]);
  assert.deepEqual([b.insertar.length, b.cancelar.length], [0, 0]);
});

test("conciliar: lo ya pagado se respeta y se descuenta; la diferencia a favor va en un ajuste", () => {
  // Pagado el hito 1 de la v2 (100.000); la v3 A paga 100.000 en el mes 1: queda cubierto.
  const a = conciliarHitos(hitosB("pagado", "pendiente"), hitosPorBeneficiario(PARAMETROS_V3, "A", INGRESO), "v3");
  assert.deepEqual(resumen(a).actualizar, ["h2:2p=200000"]);
  assert.deepEqual(resumen(a).insertar, ["3p=200000", "2r=100000", "3r=100000"]);
  assert.equal(a.conservar.length, 1);
  // Si la nueva paga más por el mismo hito ya pagado: ajuste con otro número y la misma fecha.
  const mas = structuredClone(PARAMETROS_V3);
  mas.esquemas.B!.hitos[0].pagos.padrino = 150000;
  const m = conciliarHitos(hitosB("pagado", "pendiente"), hitosPorBeneficiario(mas, "B", INGRESO), "v3");
  assert.deepEqual(resumen(m).insertar, ["3p=50000(ajuste 1)"]);
  assert.equal(m.insertar[0].fechaCausacion, "2026-11-06");
  assert.deepEqual(resumen(m).actualizar, ["h2:2p=100000"]);
  // Aplicar dos veces da lo mismo: el ajuste reutiliza su fila.
  const yaAplicado: HitoExistente[] = [
    ...hitosB("pagado", "pendiente").map((h) => (h.numero === 2 ? { ...h, valor: 100000 } : h)),
    { id: "aj", numero: 3, beneficiario: "padrino", valor: 50000, estado: "pendiente", fecha_causacion: "2026-11-06", descripcion: m.insertar[0].descripcion },
  ];
  const otra = conciliarHitos(yaAplicado, hitosPorBeneficiario(mas, "B", INGRESO), "v3");
  assert.deepEqual(resumen(otra), { actualizar: ["aj:3p=50000", "h2:2p=100000"], insertar: [], cancelar: [], sobrepago: { padrino: 0, referido: 0 } });
});

test("conciliar: si la nueva paga menos, se descuenta de los siguientes y lo que no alcanza es sobrepago", () => {
  const menos = structuredClone(PARAMETROS_V3);
  menos.esquemas.B!.hitos[0].pagos.padrino = 60000;
  menos.esquemas.B!.hitos[1].pagos.padrino = 30000;
  // Pagados los dos de la v2 (200.000) contra 90.000 de la nueva: 110.000 de más.
  const c = conciliarHitos(hitosB("pagado", "pagado"), hitosPorBeneficiario(menos, "B", INGRESO), "v3");
  assert.deepEqual([c.actualizar.length, c.insertar.length], [0, 0]);
  assert.deepEqual(c.sobrepago, { padrino: 110000, referido: 0 });
  assert.match(c.notas.join(" "), /de más/);
  // Con solo el primero pagado (100.000 contra 60.000): el segundo queda en 30.000 - 40.000 → cubierto, 10.000 de más.
  const p = conciliarHitos(hitosB("pagado", "pendiente"), hitosPorBeneficiario(menos, "B", INGRESO), "v3");
  assert.deepEqual(p.sobrepago, { padrino: 10000, referido: 0 });
  assert.deepEqual(p.cancelar, ["h2"]);
});

test("conciliar: sin bonificación en la nueva, lo pendiente se cancela y lo pagado queda como sobrepago", () => {
  const c = conciliarHitos(hitosB("pagado", "pendiente"), [], "v3");
  assert.deepEqual(c.cancelar, ["h2"]);
  assert.deepEqual(c.sobrepago, { padrino: 100000, referido: 0 });
});

test("conciliar: un hito rechazado se respeta", () => {
  const c = conciliarHitos(hitosB("rechazado", "pendiente"), hitosPorBeneficiario(PARAMETROS_V3, "B", INGRESO), "v3");
  assert.deepEqual(resumen(c).actualizar, ["h2:2p=100000"]);
  assert.equal(c.insertar.length, 0);
  assert.match(c.notas.join(" "), /rechazo/);
});

test("resultantes: conservados más los nuevos proyectados a hoy, con sus totales", () => {
  const activo: HechosPermanencia = { referido: { estado: "ACTIVO", fechaRetiro: null }, padrinoConductor: { estado: "ACTIVO", fechaRetiro: null }, padrinoEmpleado: null, autorizacionEmpleado: null };
  const c = conciliarHitos(hitosB("pagado", "pendiente"), hitosPorBeneficiario(PARAMETROS_V3, "A", INGRESO), "v3");
  const hs = hitosResultantes(c, INGRESO, activo, { modoEmpleados: "lista_blanca", padrinoDebeSeguirActivo: true }, "2026-12-10");
  assert.deepEqual(hs.map((h) => `${h.numero}${h.beneficiario[0]}:${h.estado}`), ["1p:pagado", "2p:por_aprobar", "2r:por_aprobar", "3p:pendiente", "3r:pendiente"]);
  assert.deepEqual(totalesHitos(hs), { comprometido: 700000, causado: 400000, pagado: 100000, padrino: 500000, referido: 200000 });
  assert.equal(estadoTrasRehacer(hs), "en_seguimiento");
  assert.equal(estadoTrasRehacer([]), "contratado");
  // El referido se retiró antes del mes 2: lo siguiente no se causa ni se compromete.
  const retirado = { ...activo, referido: { estado: "RETIRADO", fechaRetiro: "2026-11-20" } };
  const hr = hitosResultantes(c, INGRESO, retirado, { modoEmpleados: "lista_blanca", padrinoDebeSeguirActivo: true }, "2027-03-01");
  assert.deepEqual(totalesHitos(hr).comprometido, 100000);
  assert.equal(estadoTrasRehacer(hr), "terminado");
});

test("una versión reemplazada (rango vacío) nunca rigió", () => {
  assert.equal(esReemplazada({ vigente_desde: "2026-10-01", vigente_hasta: "2026-09-30" }), true);
  assert.equal(esReemplazada({ vigente_desde: "2026-10-01", vigente_hasta: "2026-10-01" }), false);
  assert.equal(esReemplazada({ vigente_desde: "2026-10-01", vigente_hasta: null }), false);
});
