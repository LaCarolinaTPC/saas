/**
 * Pruebas combinatorias (28-nov-2026, pedido: «haz pruebas del sistema con todas
 * las combinaciones posibles»). Recorren el producto cartesiano de las entradas
 * de las reglas con más casos y comparan con lo que debe pasar, escrito aparte.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { efectoExamen, examenesAptos, type ExamenGuardado, type FaseExamen, type ResultadoExamen } from "./examenes";
import { condicionesContratar, listoParaContratar, type DatosContratar } from "./contratacion";
import { decidirResultado } from "./laboratorio";
import { calcularEstadisticasExamenes, type FilaExamen, type ResultadoFase } from "./estadisticas-examenes";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";

const RESULTADOS: ResultadoExamen[] = ["apto", "no_apto", "aplazado", "desistio"];
const PREVIOS_F1: ("pendiente" | ResultadoExamen | null)[] = [null, "pendiente", ...RESULTADOS];
const ESTADOS = PROCESO_ESTADOS.map((e) => e.value);

test("exámenes: toda fase × resultado × etapa × resultado previo de la fase 1", () => {
  let casos = 0;
  for (const fase of [1, 2] as FaseExamen[])
    for (const resultado of RESULTADOS)
      for (const estado of ESTADOS)
        for (const previo of PREVIOS_F1) {
          casos++;
          const previos: ExamenGuardado[] = previo ? [{ fase: 1, resultado: previo }] : [];
          const r = efectoExamen(fase, resultado, estado, previos);
          const donde = `fase ${fase}, ${resultado}, ${estado}, previo ${previo}`;
          // Cerrado o contratado: nunca.
          if (estado === "cierre" || estado === "contratado") {
            assert.ok("error" in r, `${donde}: debía negarse`);
            continue;
          }
          // La fase 2 pide la fase 1 apta.
          if (fase === 2 && previo !== "apto") {
            assert.ok("error" in r, `${donde}: la fase 2 sin la 1 apta`);
            continue;
          }
          assert.ok(!("error" in r), `${donde}: ${"error" in r ? r.error : ""}`);
          if ("error" in r) continue;
          if (resultado === "desistio") assert.deepEqual(r, { estado: null, citarFase2: false, proponeCierre: false, cerrarDesistimiento: true }, donde);
          else if (resultado === "no_apto") assert.deepEqual(r, { estado: null, citarFase2: false, proponeCierre: true }, donde);
          else if (resultado === "aplazado") assert.deepEqual(r, { estado: null, citarFase2: false, proponeCierre: false }, donde);
          else if (fase === 1) assert.deepEqual(r, estado === "en_examenes" ? { estado: "en_examenes_fase2", citarFase2: true, proponeCierre: false } : { estado: null, citarFase2: false, proponeCierre: false }, donde);
          else assert.deepEqual(r, estado === "en_examenes_fase2" ? { estado: "reconocimiento_ruta", citarFase2: false, proponeCierre: false } : { estado: null, citarFase2: false, proponeCierre: false }, donde);
        }
  assert.equal(casos, 2 * RESULTADOS.length * ESTADOS.length * PREVIOS_F1.length);
});

test("exámenes aptos: las 36 combinaciones de las dos fases", () => {
  const todos = [null, "pendiente", ...RESULTADOS] as const;
  for (const r1 of todos)
    for (const r2 of todos) {
      const ex: ExamenGuardado[] = [...(r1 ? [{ fase: 1 as const, resultado: r1 }] : []), ...(r2 ? [{ fase: 2 as const, resultado: r2 }] : [])];
      assert.equal(examenesAptos(ex), r1 === "apto" && r2 === "apto", `${r1}/${r2}`);
    }
});

test("listo para contratar: las 2⁷ combinaciones de condiciones (con y sin psicotécnica exigida)", () => {
  let casos = 0;
  for (let m = 0; m < 1 << 7; m++) {
    const bit = (i: number) => (m & (1 << i)) !== 0;
    const examenesOk = bit(0);
    const rutasOk = bit(1);
    const carpetaOk = bit(2);
    const exige = bit(3);
    const psicoOk = bit(4);
    const antecedentesOk = bit(5);
    const aprobada = bit(6);
    const d: DatosContratar = {
      examenes: [{ fase: 1, resultado: "apto" }, { fase: 2, resultado: examenesOk ? "apto" : "aplazado" }],
      rutasAprendidas: rutasOk ? 2 : 1,
      rutasMinimas: 2,
      reingreso: false,
      itemsCarpeta: ["Hoja de vida", "Cédula"],
      carpeta: [
        { item: "Hoja de vida", estado: "validado" },
        { item: "Cédula", estado: carpetaOk ? "validado" : "recibido" },
      ],
      aprobada,
      exigePsicotecnica: exige,
      psicotecnica: psicoOk ? "apto" : "no_apto",
      antecedentes: { veredicto: antecedentesOk ? "limpio" : "revision", decision: null, legado: null },
    };
    const c = condicionesContratar(d);
    const sinVistoBueno = examenesOk && rutasOk && carpetaOk && (!exige || psicoOk) && antecedentesOk;
    const donde = `máscara ${m.toString(2).padStart(7, "0")}`;
    assert.equal(listoParaContratar(c.condiciones).listo, sinVistoBueno, `${donde}: listo`);
    assert.equal(c.ok, sinVistoBueno && aprobada, `${donde}: contratar`);
    // Lo que falta enumera exactamente lo que no se cumple (sin el visto bueno).
    const esperadas = [!antecedentesOk, !examenesOk, !rutasOk, !carpetaOk, exige && !psicoOk].filter(Boolean).length;
    assert.equal(listoParaContratar(c.condiciones).faltan.length, esperadas, `${donde}: faltan`);
    // La psicotécnica solo aparece si se exige.
    assert.equal(c.condiciones.some((x) => x.id === "psicotecnica"), exige, `${donde}: psicotécnica`);
    casos++;
  }
  assert.equal(casos, 128);
});

test("laboratorio: la fase 2 nunca se registra sola, con o sin frase, para cualquier resultado leído", () => {
  const frases = { apto: "Sí, puede pasar a fase 2", no_apto: "No continúa", aplazado: "Aplazado por" };
  const textos = ["Juan: Sí, puede pasar a fase 2", "Juan: No continúa", "Juan: Aplazado por hemograma", "Juan apto", "Juan no apto por columna", ""];
  const leidos = [null, "apto", "no_apto", "aplazado"] as const;
  for (const texto of textos)
    for (const r of leidos)
      for (const conFrases of [true, false])
        for (const soloArchivo of [true, false]) {
          const d = decidirResultado(texto, { nombre: "Juan", cedula: null, fase: 2, resultado: r, observacion: null }, false, conFrases ? frases : null, 2, { soloArchivo });
          assert.equal(d.automatico, false, `fase 2 «${texto}» leído ${r} frases ${conFrases} archivo ${soloArchivo}`);
        }
});

test("estadísticas: cada combinación de resultados de las dos fases cuenta donde debe", () => {
  const r1s: ResultadoFase[] = ["apto", "no_apto", "desistio", "aplazado", "pendiente"];
  const r2s: ResultadoFase[] = ["apto", "no_apto", "desistio", "aplazado", "pendiente"];
  const filas: FilaExamen[] = [];
  for (const r1 of r1s)
    for (const r2 of r2s)
      filas.push({ cedula: `${filas.length + 10000}`, nombre: null, laboratorio: "RESCATE", fechaFase1: "2026-05-10", resultadoFase1: r1, fechaFase2: null, resultadoFase2: r1 === "apto" ? r2 : null, causa: "Columna", fuente: "historico" });
  const e = calcularEstadisticasExamenes(filas);
  assert.equal(e.total.citados, 25);
  for (const r1 of r1s) assert.equal(e.total.fase1[r1], 5, `fase 1 ${r1}`);
  // La fase 2 solo la tienen los 5 aptos de la fase 1, uno por resultado.
  for (const r2 of r2s) assert.equal(e.total.fase2[r2], 1, `fase 2 ${r2}`);
  assert.equal(e.total.aptosContratar, 1);
  // No aptos: 5 de la fase 1 + 1 de la fase 2, todos por columna.
  assert.deepEqual(e.causasNoApto, [{ causa: "Columna", n: 6 }]);
  assert.equal(e.laboratorios[0].noApto, 6);
  assert.equal(e.laboratorios[0].desistio, 6);
});
