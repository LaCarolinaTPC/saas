/**
 * Evaluador del asistente de selección: corre el banco de casos
 * (src/lib/seleccion/evaluacion/casos.ts) contra el modelo de verdad, sin
 * enviar WhatsApp ni escribir en la base, y deja un reporte en
 * docs/evaluaciones/.
 *
 *   npm run evaluar:asistente                         # configuración guardada
 *   npm run evaluar:asistente -- --afinada            # ajustes recomendados
 *   npm run evaluar:asistente -- --afinada --modelo anthropic/claude-sonnet-5.5
 *   npm run evaluar:asistente -- --grupo no_cumple --repeticiones 2
 *   npm run evaluar:asistente -- --caso esc-audio
 *   npm run evaluar:asistente -- --afinada --prompt docs/seleccion-prompt-propuesto.txt
 *   npm run evaluar:asistente -- --sin-simulador        # menos llamadas: solo los turnos fijos
 *   npm run evaluar:asistente -- --simulador-asistente  # el aspirante simulado con el modelo del asistente, no OpenRouter
 *   IA_GRABACION=.ia-grabacion npm run evaluar:asistente  # repite gratis lo ya corrido (src/lib/ia/grabacion.ts)
 *   npm run evaluar:asistente -- --afinada --local http://192.168.1.50:1234/v1 [--modelo-local qwen3-8b]
 *                                                       # sin costo: LM Studio u Ollama en la red
 *
 * Cada corrida gasta crédito del proveedor de IA (el mismo de producción si se
 * usa la clave de la copia de desarrollo): correr solo lo necesario.
 *
 * Usa la base y las claves de .env.local (desarrollo).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { PREGUNTAS_SELECCION_SUGERIDAS, type AgenteConfig } from "@/lib/comunicaciones/agente/opciones";
import { contextoSeleccion, leerMensaje, leerReglas } from "@/lib/seleccion/servidor";
import { CASOS, GRUPOS_CASOS, type CasoPrueba } from "@/lib/seleccion/evaluacion/casos";
import { correrCaso, type ContextoSimulacion } from "@/lib/seleccion/evaluacion/ejecutor";
import { revisarCaso, type ResultadoConversacion } from "@/lib/seleccion/simulacion";
import { carpetaGrabacion } from "@/lib/ia/grabacion";

const args = process.argv.slice(2);
const opcion = (nombre: string) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const bandera = (nombre: string) => args.includes(`--${nombre}`);

const repeticiones = Math.max(1, Number(opcion("repeticiones") ?? 1));
const urlLocal = opcion("local");
// Una sola GPU atiende de a una consulta: en local, sin paralelo salvo que se pida.
const paralelo = Math.max(1, Number(opcion("paralelo") ?? (urlLocal ? 1 : 4)));

const { config: guardada, claves } = await getAgenteConClaves();
let config: AgenteConfig = { ...guardada };
const partesEtiqueta: string[] = [];

if (bandera("afinada")) {
  const salario = await leerMensaje("salario_horario");
  config = {
    ...config,
    preguntasRequisitos: PREGUNTAS_SELECCION_SUGERIDAS,
    intentosSinEntender: 3,
    transferirAlCompletar: false,
    respuestaReservada: salario?.texto ?? config.respuestaReservada,
  };
  partesEtiqueta.push("afinada");
} else {
  partesEtiqueta.push("guardada");
}
const prompt = opcion("prompt");
if (prompt) {
  config.prompt = readFileSync(prompt, "utf8");
  partesEtiqueta.push("prompt-" + prompt.split(/[\\/]/).pop()!.replace(/\.\w+$/, ""));
}
const modelo = opcion("modelo");
if (urlLocal) {
  partesEtiqueta.push("local-" + (opcion("modelo-local") ?? "lmstudio").replace(/[^\w.-]+/g, "_"));
} else if (modelo) {
  config = { ...config, proveedor: "openrouter", openrouterModo: "manual", modelo };
  partesEtiqueta.push(modelo.replace(/[^\w.-]+/g, "_"));
} else if (bandera("auto")) {
  config = { ...config, proveedor: "openrouter", openrouterModo: "auto", openrouterNivelCosto: "low", modelo: null };
  partesEtiqueta.push("auto-low");
} else {
  partesEtiqueta.push(config.proveedor === "openrouter" && config.openrouterModo === "auto" ? `auto-${config.openrouterNivelCosto}` : config.modelo ?? config.proveedor);
}

const ctxSel = await contextoSeleccion();
const ctx: ContextoSimulacion = {
  // Como el chat real y el chat de prueba (23-nov-2026): la respuesta a salario u horario, el saludo
  // de bienvenida, el nombre del asistente y las respuestas del catálogo. Antes el evaluador no los
  // pasaba y la primera respuesta no se parecía a la de producción.
  config: ctxSel.respuestaReservada && !bandera("afinada") ? { ...config, respuestaReservada: ctxSel.respuestaReservada } : config,
  claves,
  autorizacion: ctxSel.autorizacion,
  bienvenida: ctxSel.bienvenida,
  nombreAsistente: ctxSel.nombreAsistente,
  respuestas: ctxSel.respuestas,
  requisitos: ctxSel.requisitos,
  reglas: await leerReglas(),
  nombreContacto: "Aspirante de prueba",
  // --simulador-asistente: el aspirante simulado con el proveedor del asistente (sin gastar OpenRouter).
  simuladorConAsistente: bandera("simulador-asistente"),
  // Con la grabación activa, la hora del prompt queda fija (martes 10:00 en Bogotá): si no, cada minuto
  // cambia el prompt y ninguna respuesta se repite gratis.
  ...(carpetaGrabacion() ? { ahora: new Date("2026-11-24T15:00:00Z") } : {}),
  ...(urlLocal ? { local: { url: urlLocal, modelo: opcion("modelo-local") ?? null } } : {}),
};

let casos: CasoPrueba[] = CASOS;
const grupo = opcion("grupo");
const caso = opcion("caso");
if (grupo) casos = casos.filter((c) => c.grupo === grupo);
// --caso acepta varios separados por coma: --caso acep-mujer,hum-ventas
if (caso) {
  const ids = new Set(caso.split(",").map((s) => s.trim()).filter(Boolean));
  casos = casos.filter((c) => ids.has(c.id));
}
if (!casos.length) {
  console.error("No hay casos con ese filtro.");
  process.exit(1);
}

interface Corrida {
  caso: CasoPrueba;
  repeticion: number;
  r: ResultadoConversacion;
  revision: ReturnType<typeof revisarCaso>;
}

const tareas = casos.flatMap((c) => Array.from({ length: repeticiones }, (_, i) => ({ caso: c, repeticion: i + 1 })));
const corridas: Corrida[] = [];
let siguiente = 0;
const inicio = Date.now();
console.log(`Evaluando ${casos.length} casos × ${repeticiones} con ${partesEtiqueta.join(" · ")} (${paralelo} en paralelo)…`);

async function trabajador() {
  while (siguiente < tareas.length) {
    const t = tareas[siguiente++];
    const r = await correrCaso(t.caso, ctx, { simulador: !bandera("sin-simulador") });
    const revision = revisarCaso(t.caso, r);
    corridas.push({ ...t, r, revision });
    console.log(`${revision.ok ? "✔" : "✘"} ${t.caso.id}${repeticiones > 1 ? ` #${t.repeticion}` : ""}${revision.ok ? "" : " — " + revision.chequeos.filter((c) => !c.ok).map((c) => c.detalle).join(" · ")}`);
  }
}
await Promise.all(Array.from({ length: Math.min(paralelo, tareas.length) }, trabajador));

// ── Reporte ─────────────────────────────────────────────────────────────────
corridas.sort((a, b) => CASOS.indexOf(a.caso) - CASOS.indexOf(b.caso) || a.repeticion - b.repeticion);
const total = corridas.length;
const aprobadas = corridas.filter((c) => c.revision.ok).length;
const permitida = (c: Corrida) => !!c.r.transferencia && !!c.caso.esperado.transfierePermitidaDesde && c.r.transferencia.turno >= c.caso.esperado.transfierePermitidaDesde;
const transferenciasDeMas = corridas.filter((c) => !c.caso.esperado.transfiere && c.r.transferencia && !permitida(c)).length;
const transferenciasFaltantes = corridas.filter((c) => c.caso.esperado.transfiere && !c.r.transferencia).length;
const fugasSalario = corridas.filter((c) => c.revision.chequeos.some((x) => !x.ok && /salario/.test(x.detalle))).length;
const datosRevisados = corridas.flatMap((c) => c.revision.chequeos.filter((x) => /^(nombre|cedula|edad|ciudad|dispuesto_traslado|licencia|experiencia_meses|hoja_vida|autorización):/.test(x.detalle)));
const datosBien = datosRevisados.filter((x) => x.ok).length;
const latencias = corridas.flatMap((c) => c.r.latencias).sort((a, b) => a - b);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10} %` : "—");
const p = (q: number) => (latencias.length ? (latencias[Math.min(latencias.length - 1, Math.floor(q * latencias.length))] / 1000).toFixed(1) + " s" : "—");
const tokensEnt = corridas.reduce((s, c) => s + c.r.tokensEntrada, 0);
const tokensSal = corridas.reduce((s, c) => s + c.r.tokensSalida, 0);
const modelos = [...new Set(corridas.flatMap((c) => c.r.modelos))];

const etiqueta = partesEtiqueta.join("-");
const fecha = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date()).replace(/[: ]/g, "");
const lineas: string[] = [
  `# Evaluación del asistente de selección — ${partesEtiqueta.join(" · ")}`,
  "",
  `${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" }).format(new Date())} · ${casos.length} casos × ${repeticiones} · ${Math.round((Date.now() - inicio) / 1000)} s`,
  "",
  "| Indicador | Resultado |",
  "|---|---|",
  `| Casos aprobados | ${aprobadas} de ${total} (${pct(aprobadas, total)}) |`,
  `| Pases a persona de más | ${transferenciasDeMas} |`,
  `| Pases a persona que faltaron | ${transferenciasFaltantes} |`,
  `| Fugas de salario | ${fugasSalario} |`,
  `| Datos bien extraídos | ${datosBien} de ${datosRevisados.length} (${pct(datosBien, datosRevisados.length)}) |`,
  `| Latencia por respuesta (mediana / p90) | ${p(0.5)} / ${p(0.9)} |`,
  `| Tokens (entrada / salida) | ${tokensEnt.toLocaleString("es-CO")} / ${tokensSal.toLocaleString("es-CO")} |`,
  `| Modelos que respondieron | ${modelos.join(", ") || "—"} |`,
  "",
];
for (const g of GRUPOS_CASOS) {
  const deGrupo = corridas.filter((c) => c.caso.grupo === g.grupo);
  if (!deGrupo.length) continue;
  lineas.push(`## ${g.titulo} — ${deGrupo.filter((c) => c.revision.ok).length} de ${deGrupo.length}`, "");
  for (const c of deGrupo) {
    lineas.push(`### ${c.revision.ok ? "✔" : "✘"} ${c.caso.titulo}${repeticiones > 1 ? ` (#${c.repeticion})` : ""}`, "");
    for (const ch of c.revision.chequeos.filter((x) => !x.ok)) lineas.push(`- ✘ ${ch.detalle}`);
    lineas.push("", "<details><summary>Conversación</summary>", "");
    for (const m of c.r.mensajes) {
      const quien = m.direccion === "entrante" ? "**Aspirante**" : "**Asistente**";
      const archivo = m.mediaTipo ? `[${m.mediaTipo}] ` : "";
      lineas.push(`${quien}: ${archivo}${m.contenido.replace(/\n+/g, " ")}`, "");
    }
    if (c.r.transferencia) lineas.push(`_Pasa a una persona en el turno ${c.r.transferencia.turno} (${c.r.transferencia.motivo})._`, "");
    lineas.push("</details>", "");
  }
}
const dir = join("docs", "evaluaciones");
mkdirSync(dir, { recursive: true });
const archivo = join(dir, `asistente-${fecha}-${etiqueta}.md`);
writeFileSync(archivo, lineas.join("\n"), "utf8");
console.log(`\n${aprobadas}/${total} aprobados · pases de más ${transferenciasDeMas} · faltantes ${transferenciasFaltantes} · fugas ${fugasSalario} · datos ${pct(datosBien, datosRevisados.length)} · latencia ${p(0.5)}/${p(0.9)}`);
console.log(`Reporte: ${archivo}`);
