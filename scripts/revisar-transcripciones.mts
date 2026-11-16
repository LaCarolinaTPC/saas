/**
 * Revisa conversaciones del banco de casos escritas por otro modelo (por
 * ejemplo, agentes de Claude Code que hacen de asistente) con los mismos
 * chequeos del evaluador, sin llamar a la IA del proveedor.
 *
 * La carpeta debe tener:
 *   - transcripciones-*.json: [{ id, mensajes: [{ direccion, contenido, mediaTipo }] }]
 *     (los mensajes del asistente pueden terminar en [[TRANSFERIR]])
 *   - extraccion.json: { [id]: <JSON de la extracción> }
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/revisar-transcripciones.mts <carpeta> [etiqueta]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { MARCA_TRANSFERIR, interpretarRespuesta, parsearFrases, pideHumano, textoReciente } from "@/lib/comunicaciones/agente/motor";
import { leerReglas, textoAutorizacion } from "@/lib/seleccion/servidor";
import { CASOS, GRUPOS_CASOS } from "@/lib/seleccion/evaluacion/casos";
import { interpretarExtraccion } from "@/lib/seleccion/extraccion";
import { revisarCaso, simularPreseleccion, type MensajeSimulado, type ResultadoConversacion } from "@/lib/seleccion/simulacion";

const carpeta = process.argv[2];
const etiqueta = process.argv[3] ?? "claude-code";
if (!carpeta) throw new Error("Indique la carpeta.");
const { config } = await getAgenteConClaves();
const frases = parsearFrases(config.frasesTransferencia);
const reglas = await leerReglas();
const autorizacion = (await textoAutorizacion()) ?? "";

const transcripciones = new Map<string, MensajeSimulado[]>();
for (const f of readdirSync(carpeta).filter((n) => /^transcripciones-.*\.json$/.test(n))) {
  for (const t of JSON.parse(readFileSync(join(carpeta, f), "utf8")) as { id: string; mensajes: MensajeSimulado[] }[]) transcripciones.set(t.id, t.mensajes);
}
const extraccion = JSON.parse(readFileSync(join(carpeta, "extraccion.json"), "utf8")) as Record<string, unknown>;

const filas = CASOS.filter((c) => transcripciones.has(c.id)).map((caso) => {
  const crudos = transcripciones.get(caso.id)!;
  const r: ResultadoConversacion = { mensajes: [], transferencia: null, extraido: null, preseleccion: null, tokensEntrada: 0, tokensSalida: 0, latencias: [], modelos: ["claude-code"] };
  let turno = 0;
  for (const m of crudos) {
    const mensaje: MensajeSimulado = { direccion: m.direccion, contenido: m.contenido ?? "", mediaTipo: m.mediaTipo ?? null };
    if (mensaje.direccion === "entrante") {
      turno++;
      r.mensajes.push(mensaje);
      // Como responder.ts: la frase de transferencia pasa el chat sin consultar al modelo.
      if (pideHumano(textoReciente(r.mensajes), frases)) {
        r.mensajes.push({ direccion: "saliente", contenido: config.mensajeTransferencia, mediaTipo: null });
        r.transferencia = { turno, motivo: "frase" };
        break;
      }
    } else {
      const { texto, transferir } = interpretarRespuesta(mensaje.contenido, autorizacion);
      r.mensajes.push({ ...mensaje, contenido: texto || (transferir ? config.mensajeTransferencia : "") });
      if (transferir || mensaje.contenido.includes(MARCA_TRANSFERIR)) {
        r.transferencia = { turno, motivo: "marca" };
        break;
      }
    }
  }
  const ext = extraccion[caso.id];
  r.extraido = ext ? interpretarExtraccion(typeof ext === "string" ? ext : JSON.stringify(ext)) : null;
  r.preseleccion = simularPreseleccion(r.extraido, caso.simit ?? 0, reglas);
  return { caso, r, revision: revisarCaso(caso, r) };
});

const total = filas.length;
const ok = filas.filter((f) => f.revision.ok).length;
const permitida = (f: (typeof filas)[number]) => !!f.r.transferencia && !!f.caso.esperado.transfierePermitidaDesde && f.r.transferencia.turno >= f.caso.esperado.transfierePermitidaDesde;
const deMas = filas.filter((f) => !f.caso.esperado.transfiere && f.r.transferencia && !permitida(f)).length;
const faltan = filas.filter((f) => f.caso.esperado.transfiere && !f.r.transferencia).length;
const fugas = filas.filter((f) => f.revision.chequeos.some((c) => !c.ok && /salario/.test(c.detalle))).length;
const datos = filas.flatMap((f) => f.revision.chequeos.filter((c) => /^(nombre|cedula|edad|ciudad|dispuesto_traslado|licencia|experiencia_meses|hoja_vida|autorización):/.test(c.detalle)));
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10} %` : "—");

const lineas = [
  `# Evaluación del asistente de selección — ${etiqueta}`,
  "",
  "Conversaciones escritas por agentes de Claude Code haciendo de asistente con el prompt de sistema exacto; revisadas con los mismos chequeos del evaluador. Valida las reglas y el prompt, no el modelo de producción.",
  "",
  "| Indicador | Resultado |",
  "|---|---|",
  `| Casos aprobados | ${ok} de ${total} (${pct(ok, total)}) |`,
  `| Pases a persona de más | ${deMas} |`,
  `| Pases a persona que faltaron | ${faltan} |`,
  `| Fugas de salario | ${fugas} |`,
  `| Datos bien extraídos | ${datos.filter((c) => c.ok).length} de ${datos.length} (${pct(datos.filter((c) => c.ok).length, datos.length)}) |`,
  "",
];
for (const g of GRUPOS_CASOS) {
  const de = filas.filter((f) => f.caso.grupo === g.grupo);
  if (!de.length) continue;
  lineas.push(`## ${g.titulo} — ${de.filter((f) => f.revision.ok).length} de ${de.length}`, "");
  for (const f of de) {
    lineas.push(`### ${f.revision.ok ? "✔" : "✘"} ${f.caso.titulo}`, "");
    for (const c of f.revision.chequeos.filter((x) => !x.ok)) lineas.push(`- ✘ ${c.detalle}`);
    lineas.push("", "<details><summary>Conversación</summary>", "");
    for (const m of f.r.mensajes) lineas.push(`${m.direccion === "entrante" ? "**Aspirante**" : "**Asistente**"}: ${m.mediaTipo ? `[${m.mediaTipo}] ` : ""}${m.contenido.replace(/\n+/g, " ")}`, "");
    if (f.r.transferencia) lineas.push(`_Pasa a una persona en el turno ${f.r.transferencia.turno} (${f.r.transferencia.motivo})._`, "");
    lineas.push("</details>", "");
  }
}
const dir = join("docs", "evaluaciones");
mkdirSync(dir, { recursive: true });
const fecha = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date()).replace(/[: ]/g, "");
const archivo = join(dir, `asistente-${fecha}-${etiqueta}.md`);
writeFileSync(archivo, lineas.join("\n"), "utf8");
for (const f of filas) console.log(`${f.revision.ok ? "✔" : "✘"} ${f.caso.id}${f.revision.ok ? "" : " — " + f.revision.chequeos.filter((c) => !c.ok).map((c) => c.detalle).join(" · ")}`);
console.log(`\n${ok}/${total} aprobados · pases de más ${deMas} · faltantes ${faltan} · fugas ${fugas} · datos ${pct(datos.filter((c) => c.ok).length, datos.length)}`);
console.log(`Reporte: ${archivo}`);
if (filas.length < CASOS.length) console.log(`Faltan transcripciones de ${CASOS.length - filas.length} casos.`);
