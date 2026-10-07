import { test } from "node:test";
import assert from "node:assert/strict";
import type { Conductor } from "@/lib/riesgo/variables";
import {
  analizar,
  construirContexto,
  construirPanel,
  cortesHasta,
  mesMas,
  series,
  variables,
  type MesLiq,
} from "./analisis";

function conductor(over: Partial<Conductor> = {}): Conductor {
  return {
    cedula: "100",
    nombre: "PRUEBA",
    codigo: "1",
    tipo_conductor: "FIJO",
    estado: "ACTIVO",
    fecha_ingreso: "2024-01-01",
    fecha_retiro: null,
    fecha_nacimiento: null,
    num_hijos: null,
    estado_civil: null,
    nivel_educativo: null,
    ...over,
  };
}

function mes(m: string, over: Partial<MesLiq> = {}): MesLiq {
  return {
    cedula: "100",
    mes: m,
    dias: 24,
    dias_con_valores: 24,
    viajes: 72,
    timbradas: 7200,
    bruto: 24 * 600000,
    neto: 24 * 110000,
    ahorro: 0,
    anticipo: 0,
    dias_bajo_base: 2,
    neto_sd: 20000,
    rutas: 1,
    vehiculos: 1,
    ruta_principal: "A - 16 MIRAMAR",
    ultimo_dia: `${m.slice(0, 8)}28`,
    vehiculo_principal: "553",
    clase_vehiculo: "BUS",
    capacidad_vehiculo: 50,
    modelo_vehiculo: 2016,
    ...over,
  };
}

test("aritmética de meses", () => {
  assert.equal(mesMas("2026-01-01", -1), "2025-12-01");
  assert.equal(mesMas("2025-12-01", 2), "2026-02-01");
  assert.deepEqual(cortesHasta("2025-06-01"), ["2025-04-01", "2025-05-01", "2025-06-01"]);
});

test("variables del mes anterior al corte, con caída y comparación con la ruta", () => {
  const meses = [
    mes("2025-01-01"),
    mes("2025-02-01"),
    mes("2025-03-01", { dias: 12, dias_con_valores: 12, viajes: 36, neto: 12 * 88000, bruto: 12 * 480000, dias_bajo_base: 6 }),
    // otro conductor de la misma ruta, para la mediana de la ruta
    mes("2025-03-01", { cedula: "200", bruto: 24 * 600000 }),
  ];
  const ctx = construirContexto(meses);
  const v = variables(conductor(), series(meses).get("100")!, "2025-04-01", ctx);
  assert.equal(v.dineroReal, true);
  assert.equal(v.x.dias_m1, 12);
  assert.equal(v.x.caida_dias, 0.5);
  assert.equal(v.x.neto_dia, 88);
  assert.equal(v.x.pct_bajo_base, 0.5);
  assert.ok(Math.abs(v.x.tendencia_neto - -0.2) < 1e-9);
  // mediana de la ruta en marzo: (480 mil + 600 mil) / 2 = 540 mil
  assert.ok(Math.abs(v.x.bruto_vs_ruta - 480 / 540) < 1e-9);
});

test("un mes sin valores en plata se imputa con la mediana de la flota", () => {
  const meses = [
    mes("2026-01-01", { neto: null, bruto: null, dias_con_valores: 0 }),
    mes("2026-01-01", { cedula: "200", neto: 24 * 100000 }),
    mes("2026-01-01", { cedula: "300", neto: 24 * 120000 }),
  ];
  const ctx = construirContexto(meses);
  const v = variables(conductor(), series(meses).get("100")!, "2026-02-01", ctx);
  assert.equal(v.dineroReal, false);
  assert.equal(v.x.neto_dia, 110);
  assert.equal(v.x.bruto_vs_ruta, 1);
  assert.equal(v.x.tendencia_neto, 0);
});

test("el resultado es el retiro en los 60 días siguientes y es nulo si aún no se observa", () => {
  const meses = ["2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01"].map((m) => mes(m));
  const ctx = construirContexto(meses);
  const se = series(meses);
  const ret = conductor({ estado: "RETIRADO", fecha_retiro: "2025-05-20" });
  const filas = construirPanel([ret], se, ctx, ["2025-04-01", "2025-05-01"], "2025-06-15");
  assert.equal(filas.find((f) => f.corte === "2025-04-01")?.retiro60, 1);
  // 2025-05-01 + 60 días = 2025-06-30, todavía no ha pasado el 2025-06-15
  assert.equal(filas.find((f) => f.corte === "2025-05-01")?.retiro60, null);
});

test("sin cierres en los tres meses previos no entra al panel", () => {
  const meses = [mes("2025-01-01")];
  const filas = construirPanel([conductor()], series(meses), construirContexto(meses), ["2025-06-01"], "2026-01-01");
  assert.equal(filas.length, 0);
});

test("analizar: modelo, conductores puntuados y descriptivos", () => {
  // 60 conductores; los que trabajan pocos días se retiran.
  const conductores: Conductor[] = [];
  const meses: MesLiq[] = [];
  for (let i = 0; i < 60; i++) {
    const se = i % 3 === 0;
    const ced = String(1000 + i);
    conductores.push(
      conductor({
        cedula: ced,
        codigo: String(i),
        fecha_ingreso: "2024-06-01",
        estado: se ? "RETIRADO" : "ACTIVO",
        fecha_retiro: se ? mesMas("2025-05-01", 9 + (i % 7)).replace(/01$/, "15") : null,
      })
    );
    const fin = se ? mesMas("2025-05-01", 9 + (i % 7)) : "2026-10-01";
    for (let m = "2025-01-01"; m <= fin; m = mesMas(m, 1)) {
      const dias = se && m >= mesMas(fin, -2) ? 8 : 25;
      meses.push(mes(m, { cedula: ced, dias, dias_con_valores: dias, neto: dias * (se ? 95000 : 120000), bruto: dias * 600000 }));
    }
  }
  const a = analizar(conductores, meses, "2026-10-07");
  assert.equal(a.corte, "2026-10-01");
  assert.ok(a.metricas, "debe haber métricas");
  assert.ok(a.metricas!.auc > 0.8, `AUC ${a.metricas!.auc}`);
  assert.equal(a.conductores.length, 40);
  assert.ok(a.flota.length > 0);
  assert.equal(a.trayectoria.length, 6);
  assert.ok(a.trayectoria[0].retiradosDias < a.trayectoria[0].activosDias);
  assert.deepEqual(a.mesesSinValores, []);
});

test("las ventas se comparan con la misma ruta y tipo de vehículo, o solo la ruta si el grupo es chico", async () => {
  const { referenciaVentas } = await import("./analisis");
  const meses: MesLiq[] = [];
  // 6 busetas de Miramar venden 400 mil/día y 6 buses 700 mil/día
  for (let i = 0; i < 6; i++) {
    meses.push(mes("2025-03-01", { cedula: `90${i}`, clase_vehiculo: "BUSETA", bruto: 24 * 400000 }));
    meses.push(mes("2025-03-01", { cedula: `80${i}`, clase_vehiculo: "BUS", bruto: 24 * 700000 }));
  }
  const ctx = construirContexto(meses);
  const buseta = meses[0];
  assert.equal(referenciaVentas(ctx, "2025-03-01", buseta).mediana, 400000);
  const v = variables(conductor({ cedula: "900" }), series(meses).get("900")!, "2025-04-01", ctx);
  assert.equal(v.x.bruto_vs_ruta, 1);
  assert.equal(v.x.es_buseta, 1);
  // Una sola buseta en otra ruta: se compara con la ruta completa.
  const sola = mes("2025-03-01", { cedula: "71", ruta_principal: "D - 6", clase_vehiculo: "BUSETA" });
  const ctx2 = construirContexto([...meses, sola, mes("2025-03-01", { cedula: "72", ruta_principal: "D - 6", bruto: 24 * 800000 })]);
  assert.equal(referenciaVentas(ctx2, "2025-03-01", sola).grupo, "D - 6");
});

test("cada conductor puntuado trae motivos con cifras e historial", () => {
  const conductores: Conductor[] = [];
  const meses: MesLiq[] = [];
  for (let i = 0; i < 60; i++) {
    const se = i % 3 === 0;
    const ced = String(1000 + i);
    conductores.push(conductor({ cedula: ced, codigo: String(i), fecha_ingreso: "2024-06-01", estado: se ? "RETIRADO" : "ACTIVO", fecha_retiro: se ? mesMas("2025-05-01", 9 + (i % 7)).replace(/01$/, "15") : null }));
    const fin = se ? mesMas("2025-05-01", 9 + (i % 7)) : "2026-10-01";
    for (let m = "2025-01-01"; m <= fin; m = mesMas(m, 1)) {
      const dias = (se && m >= mesMas(fin, -2)) || (i === 1 && m === "2026-09-01") ? 8 : 25;
      meses.push(mes(m, { cedula: ced, dias, dias_con_valores: dias, neto: dias * 110000, bruto: dias * 600000 }));
    }
  }
  const a = analizar(conductores, meses, "2026-10-07");
  const c = a.conductores.find((x) => x.cedula === "1001")!;
  assert.equal(c.cedula, a.conductores[0].cedula, "el que trabajó 8 días va primero");
  assert.ok(c.motivos.some((m) => m.includes("Trabajó 8 días en septiembre")), c.motivos.join(" | "));
  assert.equal(c.historial.length, 5);
  assert.equal(c.historial.at(-1)!.enCurso, true);
  assert.equal(c.historial.at(-2)!.dias, 8);
});

test("quien ingresó a mitad de mes no queda como si hubiera faltado", async () => {
  const { diasPosibles, diasEquivalentes } = await import("./analisis");
  assert.equal(diasPosibles("2026-09-01", "2026-09-21"), 10);
  assert.equal(diasPosibles("2026-09-01", "2025-01-01"), 30);
  assert.equal(diasEquivalentes(8, "2026-09-01", "2026-09-21"), 24);
  assert.equal(diasEquivalentes(8, "2026-09-01", "2024-01-01"), 8);
  const meses = [mes("2026-09-01", { dias: 8, dias_con_valores: 8, neto: 8 * 110000 })];
  const v = variables(conductor({ fecha_ingreso: "2026-09-21" }), series(meses).get("100")!, "2026-10-01", construirContexto(meses));
  assert.equal(v.x.dias_m1, 24);
});

test("novedades: viajes perdidos, accidentes en 6 meses y ausencias solo donde hay registro", () => {
  const meses = ["2026-01-01", "2026-02-01", "2026-03-01"].map((m) => mes(m));
  const nov = new Map(
    [
      { cedula: "100", mes: "2026-03-01", vp_injustificados: 4, ausencias: 2, ausencias_nj: 1, suspensiones: 0, accidentes: 1, accidentes_responsable: 1 },
      { cedula: "100", mes: "2025-11-01", vp_injustificados: 9, ausencias: 0, ausencias_nj: 0, suspensiones: 0, accidentes: 1, accidentes_responsable: 0 },
    ].map((n) => [n.mes, n])
  );
  const ctx = construirContexto(meses);
  const v = variables(conductor(), series(meses).get("100")!, "2026-04-01", ctx, nov, { ausentismoDesde: "2026-01-01" });
  assert.equal(v.x.vp_injust_m1, 4);
  assert.equal(v.x.vp_injust_3m, 4); // noviembre queda fuera de los 3 meses
  assert.equal(v.x.accidentes_6m, 2);
  assert.equal(v.x.accidentes_resp_6m, 1);
  assert.equal(v.x.ausencias_nj_3m, 1);
  // Un corte cuyos 3 meses previos empiezan antes del registro de Ausentismo no cuenta ausencias.
  const antes = variables(conductor(), series(meses).get("100")!, "2026-03-01", ctx, nov, { ausentismoDesde: "2026-01-01" });
  assert.equal(antes.x.ausencias_3m, 0);
});
