// Batería del «no puedo ir» con el modelo real (pedido de GH del 22-nov-2026): cuando el aspirante dice que no
// puede ir a la cita, el asistente primero pregunta por qué, intenta una vez que vaya y, si aun así no puede,
// ofrece solo el siguiente día hábil. Si ese tampoco, pasa a una persona. Con la configuración guardada (prompt,
// proveedor y modelo del chat); no escribe nada en la base. Cuesta lo que cuesten las llamadas.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-no-puede.mts
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { generarRespuesta } from "@/lib/comunicaciones/agente/proveedores";
import { construirSistema, decidirRespuesta, reglasSeleccion, type CitaAsistente, type TurnoModelo } from "@/lib/comunicaciones/agente/motor";

const { config, claves } = await getAgenteConClaves();
const ahora = new Date("2026-11-18T15:00:00Z"); // miércoles 18 de noviembre
const SIGUIENTE = "2026-11-20";
const citaBase: CitaAsistente = {
  tipo: "prueba_manejo",
  fecha: "jueves 19 de noviembre",
  hora: "1:00 p. m.",
  direccion: "Carrera 14 #54-110, Soledad",
  confirmada: true,
  pideOtraFecha: false,
  noAsistio: false,
  opciones: [{ fecha: SIGUIENTE, texto: "viernes 20 de noviembre", hora: "1:00 p. m." }],
  puedeReprogramar: true,
};

let bien = 0;
let mal = 0;
function revisar(nombre: string, ok: boolean, detalle?: unknown) {
  if (ok) bien++;
  else mal++;
  console.log(`  ${ok ? "✔" : "✘"} ${nombre}${!ok && detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 300)}` : ""}`);
}
const fechaOfrecida = /viernes|20 de noviembre/i;
const otrosDias = /lunes|martes|s[áa]bado|23 de noviembre|24 de noviembre|21 de noviembre/i;

async function conversar(titulo: string, cita: CitaAsistente, mensajes: string[]) {
  console.log(`\n── ${titulo}`);
  const sistema = construirSistema(config.prompt, "Carlos", ahora, { ...reglasSeleccion(config, ""), cita });
  const turnos: TurnoModelo[] = [];
  const respuestas: ReturnType<typeof decidirRespuesta>[] = [];
  for (const m of mensajes) {
    turnos.push({ role: "user", content: m });
    const r = await generarRespuesta(config, claves, sistema, turnos);
    const d = decidirRespuesta({ texto: r.texto, rechazo: false });
    respuestas.push(d);
    turnos.push({ role: "assistant", content: r.texto });
    console.log(`  · aspirante: ${m}\n    asistente: ${d.texto.replace(/\n+/g, " ").slice(0, 260)}${d.reprogramar ? ` [mueve a ${d.reprogramar}]` : ""}${d.motivo ? ` [pasa a una persona: ${d.motivo}]` : ""}`);
  }
  return respuestas;
}

// 1. Acepta el siguiente día.
const a = await conversar("No puede, se le intenta convencer y acepta el siguiente día hábil", citaBase, [
  "Hola, no voy a poder ir mañana a la prueba",
  "Es que trabajo ese día en otra empresa",
  "No me dan permiso, de verdad no puedo",
  "Mejor el otro miércoles, que estoy libre",
  "Bueno, el viernes sí puedo",
]);
revisar("primero pregunta por qué (sin ofrecer fechas ni mover)", /por ?qu[ée]|qu[ée] pas|motivo|qu[ée] te impide|cu[ée]ntame/i.test(a[0].texto) && !a[0].reprogramar && !fechaOfrecida.test(a[0].texto), a[0].texto);
revisar("con el motivo, intenta que vaya (permiso, organizarse) sin mover la cita", !a[1].reprogramar && /permiso|organiz|hablar con|jefe|cambiar el turno|corta|importante/i.test(a[1].texto), a[1].texto);
revisar("si aun así no puede, ofrece solo el viernes 20", fechaOfrecida.test(a[2].texto) && !otrosDias.test(a[2].texto) && !a[2].reprogramar, a[2].texto);
revisar("si pide un día más lejano, le repite que el siguiente disponible es el viernes", fechaOfrecida.test(a[3].texto) && !a[3].reprogramar && !a[3].motivo, a[3].texto);
revisar("acepta: mueve la cita al viernes 20 (y a ningún otro día)", a.slice(0, 4).every((r) => !r.reprogramar) && a[4].reprogramar === SIGUIENTE, a[4]);

// 2. Tampoco puede el siguiente día: pasa a una persona, sin más fechas.
const b = await conversar("Tampoco puede el siguiente día: pasa a una persona", citaBase, [
  "No puedo ir mañana, lo siento",
  "Tengo una cita médica",
  "No, no la puedo cambiar",
  "El viernes tampoco puedo",
]);
revisar("nunca mueve la cita", b.every((r) => !r.reprogramar), b.map((r) => r.reprogramar));
revisar("al final pasa a Gestión Humana sin proponer más fechas", b[3].motivo !== null && !otrosDias.test(b[3].texto), b[3]);

// 3. Salida de reconocimiento de ruta: mismas reglas.
const c = await conversar("Reconocimiento de ruta: pregunta por qué antes de ofrecer otro día", { ...citaBase, tipo: "reconocimiento", hora: "9:00 a. m.", opciones: [{ fecha: SIGUIENTE, texto: "viernes 20 de noviembre", hora: "9:00 a. m." }] }, [
  "Buenas, mañana no puedo ir al reconocimiento de ruta",
]);
revisar("reconocimiento: primero pregunta por qué, sin mover", !c[0].reprogramar && /por ?qu[ée]|qu[ée] pas|motivo|qu[ée] te impide|cu[ée]ntame/i.test(c[0].texto), c[0].texto);

console.log(`\n${bien} bien, ${mal} mal.`);
process.exit(mal ? 1 : 0);
