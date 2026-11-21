/**
 * Exporta, sin llamar a la IA, el prompt de sistema exacto del asistente de
 * selección (reglas fijas + prompt + requisitos + autorización) y el banco de
 * casos, para que otro modelo (por ejemplo, un agente de Claude Code) haga de
 * asistente sin gastar crédito del proveedor. Las conversaciones resultantes
 * se revisan con `npm run evaluar:asistente -- --revisar <carpeta>`.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/exportar-casos-asistente.mts <carpeta> [--prompt archivo]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { PREGUNTAS_SELECCION_SUGERIDAS } from "@/lib/comunicaciones/agente/opciones";
import { construirSistema, reglasSeleccion } from "@/lib/comunicaciones/agente/motor";
import { contextoSeleccion, leerMensaje } from "@/lib/seleccion/servidor";
import { CASOS } from "@/lib/seleccion/evaluacion/casos";
import { SISTEMA_EXTRACCION } from "@/lib/seleccion/extraccion";

const carpeta = process.argv[2];
if (!carpeta) throw new Error("Indique la carpeta de salida.");
const i = process.argv.indexOf("--prompt");
const { config: guardada } = await getAgenteConClaves();
const salario = await leerMensaje("salario_horario");
const config = {
  ...guardada,
  preguntasRequisitos: PREGUNTAS_SELECCION_SUGERIDAS,
  intentosSinEntender: 3,
  transferirAlCompletar: false,
  respuestaReservada: salario?.texto ?? guardada.respuestaReservada,
  prompt: i > 0 ? readFileSync(process.argv[i + 1], "utf8") : guardada.prompt,
};
const ctx = await contextoSeleccion();
const sistema = construirSistema(
  config.prompt,
  "Aspirante de prueba",
  new Date(),
  reglasSeleccion(config, "«se cuentan en la conversación»", ctx.autorizacion, ctx.requisitos)
);
mkdirSync(carpeta, { recursive: true });
writeFileSync(join(carpeta, "sistema-asistente.txt"), sistema, "utf8");
writeFileSync(join(carpeta, "sistema-extraccion.txt"), SISTEMA_EXTRACCION, "utf8");
writeFileSync(
  join(carpeta, "casos.json"),
  JSON.stringify(
    CASOS.map((c) => ({ id: c.id, grupo: c.grupo, turnos: c.turnos, perfil: c.perfil ?? null, estilo: c.estilo ?? null, maxTurnos: c.maxTurnos ?? 12 })),
    null,
    1
  ),
  "utf8"
);
console.log(`Exportado: ${sistema.length} caracteres de prompt, ${CASOS.length} casos → ${carpeta}`);
