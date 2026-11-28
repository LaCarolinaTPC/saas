import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularIndicadoresSeleccion,
  duracionLegible,
  lunesDe,
  origenConsulta,
  type EntradaIndicadoresSeleccion,
  type ProcesoInd,
} from "./indicadores";

const H = 3_600_000;
const proceso = (id: string, p: Partial<ProcesoInd> = {}): ProcesoInd => ({
  id,
  created_at: "2026-11-16T15:00:00Z",
  estado: "pendiente",
  medio_postulacion: null,
  origen: "whatsapp_agente",
  causa_no_contrato: null,
  hoja_vida_recibida_at: null,
  ...p,
});

function entrada(e: Partial<EntradaIndicadoresSeleccion>): EntradaIndicadoresSeleccion {
  return {
    rango: { desde: "2026-11-14", hasta: "2026-11-20" },
    hoy: "2026-11-20",
    procesos: [],
    eventos: [],
    citas: [],
    verificaciones: [],
    consumos: [],
    contrataciones: [],
    cromaCostoCop: 0,
    trm: 4000,
    faltantes: [],
    ...e,
  };
}

test("lunesDe: lunes de la semana", () => {
  assert.equal(lunesDe("2026-11-20"), "2026-11-16"); // viernes
  assert.equal(lunesDe("2026-11-16"), "2026-11-16"); // lunes
  assert.equal(lunesDe("2026-11-22"), "2026-11-16"); // domingo
});

test("origenConsulta distingue automáticas, de una persona, reutilizadas, manuales y simuladas", () => {
  assert.equal(origenConsulta({ proveedor: "croma", consultado_por: "Sistema", estado: "ok" }), "automatica");
  assert.equal(origenConsulta({ proveedor: "croma", consultado_por: "Agente IA", estado: "ok" }), "automatica");
  assert.equal(origenConsulta({ proveedor: "croma", consultado_por: "gh@empresa.co", estado: "ok" }), "persona");
  assert.equal(origenConsulta({ proveedor: "croma", consultado_por: "Sistema (reutilizada de la consulta del 2026-11-10)", estado: "ok" }), "reutilizada");
  assert.equal(origenConsulta({ proveedor: "manual", consultado_por: "gh@empresa.co (revisión manual)", estado: "ok" }), "manual");
  assert.equal(origenConsulta({ proveedor: "simulado", consultado_por: "x (simulado en el chat de prueba)", estado: "ok" }), "simulada");
});

test("el embudo cuenta a quien pasó por una etapa aunque se la haya saltado, y excluye el chat de prueba", () => {
  const ind = calcularIndicadoresSeleccion(
    entrada({
      procesos: [
        proceso("a", { estado: "citado" }),
        proceso("b", { estado: "cierre", causa_no_contrato: "Antecedentes" }),
        proceso("c", { estado: "pendiente" }),
        proceso("prueba", { estado: "contratado", origen: "chat_prueba" }),
      ],
      eventos: [
        { proceso_id: "a", tipo: "estado", estado_anterior: "pendiente", estado_nuevo: "antecedentes", created_at: "2026-11-16T17:00:00Z" },
        { proceso_id: "a", tipo: "estado", estado_anterior: "antecedentes", estado_nuevo: "citado", created_at: "2026-11-17T15:00:00Z" },
        // b se cerró desde antecedentes sin evento de entrada.
        { proceso_id: "b", tipo: "estado", estado_anterior: "antecedentes", estado_nuevo: "cierre", created_at: "2026-11-17T15:00:00Z" },
      ],
    })
  );
  assert.equal(ind.aspirantes, 3);
  assert.equal(ind.cerrados, 1);
  assert.equal(ind.enCurso, 2);
  const embudo = Object.fromEntries(ind.embudo.map((f) => [f.clave, f.n]));
  assert.equal(embudo.pendiente, 3);
  assert.equal(embudo.antecedentes, 2);
  assert.equal(embudo.citado, 1);
  assert.equal(embudo.contratado, 0);
  assert.deepEqual(ind.causasCierre.map((c) => [c.etiqueta, c.n]), [["Antecedentes", 1]]);
});

test("tiempo en cada etapa: de su entrada a la de la siguiente alcanzada", () => {
  const ind = calcularIndicadoresSeleccion(
    entrada({
      procesos: [proceso("a", { estado: "citado", created_at: "2026-11-16T10:00:00Z" })],
      eventos: [
        { proceso_id: "a", tipo: "estado", estado_anterior: "pendiente", estado_nuevo: "antecedentes", created_at: "2026-11-16T12:00:00Z" },
        { proceso_id: "a", tipo: "estado", estado_anterior: "antecedentes", estado_nuevo: "citado", created_at: "2026-11-17T12:00:00Z" },
      ],
    })
  );
  const t = Object.fromEntries(ind.tiempoEnEtapa.map((x) => [x.estado, x.tiempos.mediana]));
  assert.equal(t.pendiente, 2 * H);
  assert.equal(t.antecedentes, 24 * H);
  assert.equal(t.citado, null);
});

test("los cinco indicadores de la junta", () => {
  const ind = calcularIndicadoresSeleccion(
    entrada({
      procesos: [
        proceso("a", { hoja_vida_recibida_at: "2026-11-16T16:00:00Z", estado: "contratado" }),
        proceso("b"),
        proceso("c", { origen: "manual", medio_postulacion: "computrabajo" }),
      ],
      citas: [
        { proceso_id: "a", tipo: "prueba_manejo", estado: "asistio", fecha: "2026-11-17" },
        { proceso_id: "b", tipo: "prueba_manejo", estado: "no_asistio", fecha: "2026-11-18" },
        { proceso_id: "b", tipo: "prueba_manejo", estado: "reprogramada", fecha: "2026-11-18" },
        { proceso_id: "c", tipo: "prueba_manejo", estado: "programada", fecha: "2026-11-19" },
        // Hoy todavía no cuenta.
        { proceso_id: "c", tipo: "prueba_manejo", estado: "programada", fecha: "2026-11-20" },
      ],
      contrataciones: [{ proceso_id: "a", inicio: "2026-11-10T12:00:00Z", contratado_at: "2026-11-19T12:00:00Z" }],
      verificaciones: [
        { proveedor: "croma", consultado_por: "Sistema", estado: "ok" },
        { proveedor: "croma", consultado_por: "Sistema", estado: "hallazgo" },
        { proveedor: "croma", consultado_por: "Sistema (reutilizada de la consulta del 2026-11-10)", estado: "ok" },
        { proveedor: "croma", consultado_por: "gh@empresa.co", estado: "error" },
        { proveedor: "manual", consultado_por: "gh@empresa.co (revisión manual)", estado: "ok" },
        { proveedor: "simulado", consultado_por: "gh (simulado en el chat de prueba)", estado: "ok" },
      ],
      consumos: [
        { concepto: "asistente", costo_usd: 0.5 },
        { concepto: "lectura", costo_usd: "0.25" },
      ],
      cromaCostoCop: 2000,
    })
  );
  const k = ind.clave;
  // Hoja de vida: solo los del asistente (a y b).
  assert.deepEqual([k.hojaVida.base, k.hojaVida.n, k.hojaVida.pct], [2, 1, 50]);
  // Asistencia: 1 de 2 con registro; la programada del 19 queda sin registrar.
  assert.deepEqual([k.asistencia.citas, k.asistencia.asistieron, k.asistencia.noAsistieron, k.asistencia.sinRegistrar, k.asistencia.pct], [3, 1, 1, 1, 50]);
  assert.equal(k.diasHastaContratar.mediana, 9 * 24 * H);
  // Antecedentes: 2 automáticas + 1 reutilizada de 5 (sin la simulada).
  assert.equal(k.antecedentes.total, 5);
  assert.equal(k.antecedentes.pctAutomaticas, 60);
  // Costo: 0,75 USD + 2 consultas cobradas × 2.000 COP = 3.000 + 4.000.
  assert.equal(k.costo.consultasCroma, 2);
  assert.equal(k.costo.totalCop, 7000);
  assert.equal(k.costo.porAspiranteCop, 2333);
  assert.equal(k.costo.porContratadoCop, 7000);
  assert.deepEqual(ind.costoPorConcepto.map((c) => [c.clave, c.n]), [["antecedentes", 4000], ["asistente", 2000], ["lectura", 1000]]);
  // Por canal: el del asistente cuenta como WhatsApp.
  assert.deepEqual(ind.porCanal.map((c) => [c.etiqueta, c.n, c.contratados]), [["WhatsApp", 2, 1], ["Computrabajo", 1, 0]]);
});

test("por semana: aspirantes por creación y contratados por fecha de contratación", () => {
  const ind = calcularIndicadoresSeleccion(
    entrada({
      procesos: [proceso("a", { created_at: "2026-11-14T15:00:00Z" }), proceso("b", { created_at: "2026-11-18T15:00:00Z" })],
      contrataciones: [{ proceso_id: "x", inicio: "2026-11-01T00:00:00Z", contratado_at: "2026-11-19T15:00:00Z" }],
    })
  );
  assert.deepEqual(
    ind.porSemana.map((s) => [s.fecha, s.aspirantes, s.contratados]),
    [["2026-11-09", 1, 0], ["2026-11-16", 1, 1]]
  );
});

test("sin datos no divide por cero", () => {
  const ind = calcularIndicadoresSeleccion(entrada({}));
  assert.equal(ind.clave.hojaVida.pct, null);
  assert.equal(ind.clave.asistencia.pct, null);
  assert.equal(ind.clave.costo.porAspiranteCop, null);
  assert.equal(ind.clave.antecedentes.pctAutomaticas, null);
});

test("duracionLegible", () => {
  assert.equal(duracionLegible(null), "—");
  assert.equal(duracionLegible(10 * 60_000), "10 min");
  assert.equal(duracionLegible(5 * H), "5 h");
  assert.equal(duracionLegible(84 * H), "3,5 días");
});

test("por día (27-nov-2026): aspirantes nuevos y los que no cumplieron el perfil, con la causa", () => {
  const ind = calcularIndicadoresSeleccion(
    entrada({
      procesos: [
        proceso("a", { created_at: "2026-11-16T15:00:00Z" }),
        proceso("b", { created_at: "2026-11-16T16:00:00Z", estado: "cierre", causa_no_contrato: "SIMIT por encima del tope" }),
        proceso("c", { created_at: "2026-11-16T17:00:00Z", estado: "cierre", causa_no_contrato: "Desistimiento" }), // no es del perfil
        proceso("d", { created_at: "2026-11-17T15:00:00Z", estado: "cierre", causa_no_contrato: "Edad fuera del rango" }),
        proceso("p", { created_at: "2026-11-17T15:00:00Z", origen: "chat_prueba", estado: "cierre", causa_no_contrato: "Edad fuera del rango" }), // prueba: no cuenta
      ],
    })
  );
  const dia16 = ind.porDia.find((d) => d.fecha === "2026-11-16")!;
  assert.equal(dia16.aspirantes, 3);
  assert.equal(dia16.noCumplieron, 1);
  assert.deepEqual(dia16.causas.map((c) => c.etiqueta), ["SIMIT por encima del tope"]);
  const dia17 = ind.porDia.find((d) => d.fecha === "2026-11-17")!;
  assert.deepEqual([dia17.aspirantes, dia17.noCumplieron], [1, 1]);
  assert.equal(ind.porDia.length, 7); // un renglón por día del periodo
});

test("resumen semanal (27-nov-2026): de los que se postularon, cuántos se citaron y se presentaron a la prueba", () => {
  const ev = (proceso_id: string, estado_nuevo: string, estado_anterior: string | null = null) => ({ proceso_id, tipo: "estado", estado_anterior, estado_nuevo, created_at: "2026-11-18T15:00:00Z" });
  const ind = calcularIndicadoresSeleccion(
    entrada({
      procesos: [
        proceso("a"), // solo preselección
        proceso("b", { estado: "citado" }),
        proceso("c", { estado: "en_examenes" }), // pasó la prueba
        proceso("d", { estado: "cierre", causa_no_contrato: "No asistió" }), // se citó y no llegó
      ],
      eventos: [ev("b", "citado"), ev("c", "citado"), ev("c", "prueba_manejo"), ev("c", "en_examenes"), ev("d", "citado"), ev("d", "cierre", "citado")],
    })
  );
  const s = ind.porSemana.find((x) => x.fecha === "2026-11-16")!;
  assert.deepEqual([s.aspirantes, s.citados, s.presentaron], [4, 3, 1]);
});
