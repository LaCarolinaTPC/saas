import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFINICIONES_ALERTAS, evaluarAlertas, umbralesAlertas } from "./alertas-indicadores";
import type { IndicadoresSeleccion } from "./indicadores";
import type { Indicadores } from "@/lib/comunicaciones/indicadores";
import type { IndicadoresRespuesta } from "./indicadores-respuesta";

function ind(x: Partial<IndicadoresSeleccion> = {}): IndicadoresSeleccion {
  return {
    rango: { desde: "2026-10-25", hasta: "2026-11-23", dias: 30 },
    aspirantes: 300,
    contratados: 10,
    cerrados: 100,
    enCurso: 190,
    contratadosEnPeriodo: 10,
    embudo: [{ clave: "citado", etiqueta: "Citado", n: 120 }],
    causasCierre: [{ clave: "No se ajusta al perfil", etiqueta: "No se ajusta al perfil", n: 20 }],
    porCanal: [{ clave: "whatsapp", etiqueta: "WhatsApp", n: 250, contratados: 10 }],
    clave: { asistencia: { citas: 50, asistieron: 40, noAsistieron: 10, sinRegistrar: 0, pct: 80 } },
    ...x,
  } as IndicadoresSeleccion;
}
const chat = (conversacionesNuevas: number, recibidos = 500) => ({ volumen: { conversacionesNuevas, recibidos } }) as unknown as Indicadores;
const resp = (pct: number) => ({ base: 100, pctRespondieron: pct }) as unknown as IndicadoresRespuesta;
const U = umbralesAlertas(() => undefined);

test("alertas: con todo sano no alerta (24-nov-2026)", () => {
  assert.deepEqual(evaluarAlertas({ ind: ind(), chat: chat(600), resp: resp(70), ayer: { ind: ind({ aspirantes: 8 }), chat: chat(20, 40) } }, U), []);
});

test("alertas: cada umbral", () => {
  const a = evaluarAlertas(
    {
      ind: ind({
        aspirantes: 60,
        contratadosEnPeriodo: 1,
        embudo: [{ clave: "citado", etiqueta: "Citado", n: 6 }],
        causasCierre: [
          { clave: "Edad fuera del rango", etiqueta: "Edad fuera del rango", n: 30 },
          { clave: "Desistimiento", etiqueta: "Desistimiento", n: 20 },
        ],
        cerrados: 50,
        porCanal: [
          { clave: "whatsapp", etiqueta: "WhatsApp", n: 35, contratados: 0 },
          { clave: "referido", etiqueta: "Referido", n: 5, contratados: 0 },
        ],
        clave: { asistencia: { citas: 10, asistieron: 4, noAsistieron: 6, sinRegistrar: 0, pct: 40 } } as IndicadoresSeleccion["clave"],
      }),
      chat: chat(400),
      resp: { base: 400, pctRespondieron: 35 } as unknown as IndicadoresRespuesta,
      ayer: { ind: ind({ aspirantes: 0 }), chat: chat(0, 0) },
    },
    U
  );
  const claves = a.map((x) => x.clave).sort();
  assert.deepEqual(claves, [
    "asistencia",
    "aspirantes_ayer",
    "aspirantes_dia",
    "canal_sin_contratos:whatsapp",
    "cierre_perfil",
    "contratados",
    "mensajes_ayer",
    "preseleccion",
    "registro",
    "respuesta",
  ]);
  const p = a.find((x) => x.clave === "preseleccion")!;
  assert.equal(p.valor, "10 %");
  assert.equal(p.umbral, "mínimo 25 %");
  assert.match(a.find((x) => x.clave === "cierre_perfil")!.valor, /60 %/);
  assert.ok(a.find((x) => x.clave.startsWith("canal"))!.accion.length > 10);
});

test("alertas: configurables y apagables; sin datos suficientes no alerta", () => {
  const u = umbralesAlertas((k) => ({ alerta_respuesta_min: 0, alerta_cierre_perfil_max: 100, alerta_contratados_min: "20" })[k as never]);
  assert.equal(u.respuesta, null);
  assert.equal(u.cierre_perfil, null);
  assert.equal(u.contratados, 20);
  assert.equal(u.asistencia, DEFINICIONES_ALERTAS.find((d) => d.clave === "asistencia")!.porDefecto);
  const pocos = evaluarAlertas({ ind: ind({ aspirantes: 3, cerrados: 2, embudo: [{ clave: "citado", etiqueta: "Citado", n: 0 }] }), chat: chat(5), resp: { base: 3, pctRespondieron: 0 } as unknown as IndicadoresRespuesta }, U);
  assert.ok(!pocos.some((x) => ["registro", "respuesta", "preseleccion", "cierre_perfil"].includes(x.clave)), "con muy pocos casos no se saca porcentaje");
  // En Indicadores no hay datos de ayer: esas no se evalúan.
  assert.ok(!evaluarAlertas({ ind: ind(), chat: chat(600), resp: resp(70) }, U).some((x) => x.clave.endsWith("_ayer")));
});
