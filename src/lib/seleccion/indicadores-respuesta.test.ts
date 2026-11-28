import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FIRMA_RECORDATORIO,
  calcularIndicadoresRespuesta,
  type ConversacionResp,
  type EntradaRespuesta,
  type MensajeResp,
} from "./indicadores-respuesta";

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.parse("2026-11-16T15:00:00Z");
const en = (ms: number) => new Date(T0 + ms).toISOString();

const conv = (id: string, p: Partial<ConversacionResp> = {}): ConversacionResp => ({ id, created_at: en(0), proceso_id: null, prefiltro: null, ...p });
const entra = (c: string, t: number): MensajeResp => ({ conversacion_id: c, direccion: "entrante", enviado_por: null, timestamp: en(t) });
const sale = (c: string, t: number, firma = "Agente IA"): MensajeResp => ({ conversacion_id: c, direccion: "saliente", enviado_por: firma, timestamp: en(t) });
const recordatorio = (c: string, t: number) => sale(c, t, FIRMA_RECORDATORIO);

function entrada(e: Partial<EntradaRespuesta>): EntradaRespuesta {
  return { rango: { desde: "2026-11-14", hasta: "2026-11-20" }, conversaciones: [], mensajes: [], procesos: [], citas: [], referidos: [], faltantes: [], ...e };
}

test("respuesta: cuenta a quienes escriben de nuevo, sin los de otros temas ni los que no recibieron nada", () => {
  const r = calcularIndicadoresRespuesta(
    entrada({
      conversaciones: [
        conv("a", { prefiltro: { recomendado: false, ciudad: "Soledad", edad: 30, cedula: "1045", autorizacion: "si", hoja_vida: true } }),
        conv("b", { prefiltro: { recomendado: true } }),
        conv("c"), // saludó y no volvió
        conv("d", { prefiltro: { busca_trabajo: false } }), // vende algo: no es aspirante
        conv("e"), // escribió y nadie le respondió: no entra en la base
      ],
      mensajes: [
        entra("a", 0), sale("a", MIN), entra("a", 5 * MIN), sale("a", 6 * MIN), entra("a", 26 * MIN),
        entra("b", 0), sale("b", MIN), entra("b", 3 * MIN),
        entra("c", 0), sale("c", MIN),
        entra("d", 0), sale("d", MIN), entra("d", 2 * MIN),
        entra("e", 0),
      ],
    })
  );
  assert.equal(r.base, 3);
  assert.equal(r.respondieron, 2);
  assert.equal(Math.round(r.pctRespondieron!), 67);
  // Esperas: a 4 y 20 min, b 2 min → mediana 4 min.
  assert.equal(r.tiempos.respuestaAspirante.n, 3);
  assert.equal(r.tiempos.respuestaAspirante.mediana, 4 * MIN);
  const llego = Object.fromEntries(r.preguntas.map((p) => [p.clave, p.n]));
  assert.deepEqual(llego, { recomendado: 2, ciudad: 1, edad: 1, cedula: 1, autorizacion: 1, experiencia: 0, disponibilidad: 0, hoja_vida: 1 });
  assert.deepEqual([r.recomendados.si, r.recomendados.no, r.recomendados.sinResponder], [1, 1, 1]);
});

test("recordatorios: responde el último de la racha; los anteriores no funcionaron", () => {
  const r = calcularIndicadoresRespuesta(
    entrada({
      conversaciones: [conv("a", { proceso_id: "p1" }), conv("b", { seguimiento_escalado_at: en(30 * H) }), conv("c")],
      procesos: [{ id: "p1", created_at: en(8 * H), estado: "pendiente", origen: "whatsapp_agente" }],
      mensajes: [
        // a: calla, dos recordatorios, responde 30 min después del segundo.
        entra("a", 0), sale("a", MIN), recordatorio("a", 2 * H), recordatorio("a", 4 * H), entra("a", 4 * H + 30 * MIN), sale("a", 4 * H + 31 * MIN),
        // b: tres recordatorios y nunca vuelve: queda para una persona.
        entra("b", 0), sale("b", MIN), recordatorio("b", 2 * H), recordatorio("b", 4 * H), recordatorio("b", 6 * H),
        // c: responde al primero; después otro silencio con un recordatorio sin respuesta.
        entra("c", 0), sale("c", MIN), recordatorio("c", 2 * H), entra("c", 2 * H + 10 * MIN), sale("c", 2 * H + 11 * MIN), recordatorio("c", 5 * H),
      ],
    })
  );
  const s = r.recordatorios;
  assert.equal(s.conversaciones, 3);
  assert.equal(s.enviados, 7);
  assert.equal(s.volvieron, 2);
  assert.equal(s.volvieronYRegistraron, 1);
  assert.equal(s.escaladas, 1);
  assert.deepEqual(
    s.porNumero.map((n) => [n.numero, n.enviados, n.respondidos]),
    [
      [1, 4, 1], // a, b, c y el segundo silencio de c; solo c respondió al primero
      [2, 2, 1], // a respondió al segundo
      [3, 1, 0],
    ]
  );
  assert.equal(s.tiempoRespuesta.n, 2);
  assert.equal(s.tiempoRespuesta.mediana, 20 * MIN);
  // Del primer mensaje al registro: 8 horas.
  assert.equal(r.tiempos.hastaRegistro.mediana, 8 * H);
});

test("citas: qué respondieron al recordatorio y si asistieron; sin las del chat de prueba", () => {
  const cita = (proceso_id: string, estado: string, extra: object = {}) => ({ proceso_id, tipo: "prueba_manejo", estado, created_at: en(24 * H), recordatorio_at: en(40 * H), ...extra });
  const r = calcularIndicadoresRespuesta(
    entrada({
      conversaciones: ["p1", "p2", "p3", "p4", "px"].map((p) => conv(`c-${p}`, { proceso_id: p })),
      mensajes: ["p1", "p2", "p3", "p4", "px"].flatMap((p) => [entra(`c-${p}`, 0), sale(`c-${p}`, MIN)]),
      procesos: [
        ...["p1", "p2", "p3", "p4"].map((id) => ({ id, created_at: en(0), estado: "citado", origen: "whatsapp_agente" })),
        { id: "px", created_at: en(0), estado: "citado", origen: "chat_prueba" },
      ],
      citas: [
        cita("p1", "asistio", { confirmada_at: en(41 * H) }),
        cita("p2", "no_asistio"),
        cita("p3", "pide_otra_fecha"),
        cita("p4", "programada", { recordatorio_at: null }), // todavía sin recordatorio
        cita("px", "asistio", { confirmada_at: en(41 * H) }),
      ],
    })
  );
  assert.deepEqual([r.citas.recordadas, r.citas.confirmaron, r.citas.pidieronOtraFecha, r.citas.sinRespuesta], [3, 1, 1, 1]);
  assert.deepEqual(r.citas.asistenciaConfirmadas, { citas: 1, asistieron: 1, pct: 100 });
  assert.deepEqual(r.citas.asistenciaSinConfirmar, { citas: 1, asistieron: 0, pct: 0 });
  // Del registro a la primera cita: 24 horas (4 procesos reales).
  assert.equal(r.tiempos.hastaPrimeraCita.n, 4);
  assert.equal(r.tiempos.hastaPrimeraCita.mediana, 24 * H);
});

test("recomendados: apadrinados con y sin padrino, tiempo hasta asignarlo y contratación frente al resto", () => {
  const r = calcularIndicadoresRespuesta(
    entrada({
      conversaciones: ["p1", "p2", "p3"].map((p) => conv(`c-${p}`, { proceso_id: p, prefiltro: { recomendado: p !== "p3" } })),
      mensajes: ["p1", "p2", "p3"].flatMap((p) => [entra(`c-${p}`, 0), sale(`c-${p}`, MIN)]),
      procesos: [
        { id: "p1", created_at: en(H), estado: "contratado", cedula: "111", origen: "whatsapp_agente", recomendado: true, recomendado_at: en(2 * MIN) },
        { id: "p2", created_at: en(H), estado: "pendiente", cedula: "222", origen: "whatsapp_agente", recomendado: true, recomendado_at: en(2 * MIN) },
        { id: "p3", created_at: en(H), estado: "cierre", cedula: "333", origen: "whatsapp_agente", recomendado: false },
      ],
      referidos: [{ cedula_referido: "111", created_at: en(2 * MIN + 48 * H) }],
    })
  );
  const x = r.recomendados;
  assert.deepEqual([x.si, x.no, x.sinResponder], [2, 1, 0]);
  assert.deepEqual([x.apadrinados, x.conPadrino, x.sinPadrino], [2, 1, 1]);
  assert.equal(x.tiempoHastaPadrino.mediana, 48 * H);
  assert.deepEqual(x.contratacion.recomendados, { n: 2, contratados: 1, pct: 50 });
  assert.deepEqual(x.contratacion.resto, { n: 1, contratados: 0, pct: 0 });
});

test("sin datos no falla y deja los porcentajes vacíos", () => {
  const r = calcularIndicadoresRespuesta(entrada({}));
  assert.equal(r.base, 0);
  assert.equal(r.pctRespondieron, null);
  assert.equal(r.recordatorios.pctVolvieron, null);
  assert.deepEqual(r.recordatorios.porNumero, []);
  assert.equal(r.tiempos.respuestaAspirante.mediana, null);
});
