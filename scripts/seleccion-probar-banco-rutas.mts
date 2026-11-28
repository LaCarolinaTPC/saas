// Respuestas a los mensajes de exámenes (24-nov-2026), de punta a punta: la
// pregunta del banco (fase 1), el aviso del reconocimiento de ruta con la
// pregunta de cuántas rutas conoce, y el estado del reconocimiento. Sin IA. El aspirante
// es del chat de prueba: la carta del banco no sale por WhatsApp (queda como
// enviada) y las respuestas salen simuladas en desarrollo.
//
// Crea «PRUEBA BANCO RUTAS» (cédula 9990008030) y lo borra al terminar.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-banco-rutas.mts
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { crearCitaSimple } from "@/lib/seleccion/agenda-servidor";
import { marcarBancoPreguntado, preguntaExamenDeConversacion, procesarRespuestaExamenes } from "@/lib/seleccion/respuestas-examenes-servidor";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");
const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-banco@gestivo.test" };
const TEL = "573009990830";
let fallas = 0;
const revisar = (n: string, ok: unknown, d?: unknown) => {
  if (!ok) fallas++;
  console.log(`${ok ? "✔" : "✖"} ${n}${!ok && d !== undefined ? `  → ${JSON.stringify(d)}` : ""}`);
};

async function limpiar() {
  const { data: c } = await db.from("wa_contactos").select("id").eq("telefono", TEL).maybeSingle();
  if (c) {
    const { data: convs } = await db.from("wa_conversaciones").select("id").eq("contacto_id", c.id);
    for (const v of convs ?? []) await db.from("wa_mensajes").delete().eq("conversacion_id", v.id);
    await db.from("wa_conversaciones").delete().eq("contacto_id", c.id);
    await db.from("wa_contactos").delete().eq("id", c.id);
  }
  const { data: ps } = await db.from("procesos_contratacion").select("id").eq("cedula", "9990008030");
  for (const p of ps ?? []) {
    await db.from("seleccion_citas").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion_eventos").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion").delete().eq("id", p.id);
  }
}
await limpiar();

const { error: eCol } = await db.from("procesos_contratacion").select("banco_cuenta, reconocimiento_estado").limit(1);
if (eCol) throw new Error("Faltan las migraciones 20261124194635 y 20261124203802 en esta base.");

const { data: proc, error } = await db
  .from("procesos_contratacion")
  .insert({ fecha_creacion: "2026-11-24", nombre: "PRUEBA BANCO RUTAS", cedula: "9990008030", reingreso: false, estado: "en_examenes", medio_postulacion: "whatsapp", origen: "chat_prueba", simit_valor: 0, autorizacion_datos: "si" })
  .select("id")
  .single();
if (error) throw new Error(error.message);
const id = proc.id as string;
const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TEL, nombre: "Prueba banco" }).select("id").single();
const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: id, ultimo_entrante_at: new Date().toISOString() }).select("id").single();
const convId = conv!.id as string;
const manana = new Date(Date.now() + 19 * 3_600_000).toISOString().slice(0, 10);
const citaF1 = await crearCitaSimple(id, "examen_f1", { fecha: manana, hora: "06:30" }, actor);

async function escribe(texto: string): Promise<boolean> {
  const { data: m } = await db.from("wa_mensajes").insert({ conversacion_id: convId, direccion: "entrante", contenido: texto, timestamp: new Date().toISOString() }).select("id").single();
  return procesarRespuestaExamenes(convId, m!.id as string);
}
const ultimoSaliente = async () =>
  ((await db.from("wa_mensajes").select("contenido").eq("conversacion_id", convId).eq("direccion", "saliente").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.contenido as string | undefined) ?? "";
const proceso = async () => (await db.from("procesos_contratacion").select("*").eq("id", id).single()).data as Record<string, unknown>;

try {
  console.log("\n1. Fase 1: ¿cuenta en el Banco de Bogotá?");
  revisar("sin la pregunta marcada, no se atiende nada", (await escribe("no tengo")) === false);
  await marcarBancoPreguntado(id);
  revisar("el asistente sabe que espera la respuesta del banco", (await preguntaExamenDeConversacion(convId)) === "banco");
  revisar("otra cosa la atiende el asistente", (await escribe("¿a qué hora es el examen?")) === false);
  revisar("«tengo en Bancolombia» también (que lo aclare)", (await escribe("tengo en bancolombia")) === false);
  revisar("«No tengo cuenta»: Gestivo responde", (await escribe("No tengo cuenta")) === true);
  let p = await proceso();
  revisar("queda «no» con la hora de la respuesta", p.banco_cuenta === "no" && !!p.banco_respondido_at, { banco: p.banco_cuenta });
  revisar("se le explican las sedes", /Metrocentro/.test(await ultimoSaliente()), await ultimoSaliente());
  const { data: cita } = await db.from("seleccion_citas").select("orden_aspirante_at").eq("id", citaF1!).single();
  revisar("y se le envía la carta del banco (chat de prueba: queda como enviada)", !!cita?.orden_aspirante_at);
  // Chat de prueba: el aviso no sale por WhatsApp; queda la pregunta marcada y el evento.
  const { data: evAviso } = await db.from("procesos_contratacion_eventos").select("id").eq("proceso_id", id).eq("detalle->>reconocimiento_aviso", "true").limit(1);
  revisar("después del banco le llega el aviso del reconocimiento (con la pregunta de las rutas)", !!p.rutas_preguntado_at && !!evAviso?.length, { rutas: p.rutas_preguntado_at });
  revisar("el reconocimiento queda pendiente hasta que responda", p.reconocimiento_estado === "pendiente", { reco: p.reconocimiento_estado });
  revisar("el correo todavía no se pide (una pregunta a la vez)", !p.correo_estado, { correo: p.correo_estado });
  revisar("ahora el asistente sabe que espera las rutas", (await preguntaExamenDeConversacion(convId)) === "rutas");
  revisar("«una sola»: Gestivo responde", (await escribe("una sola")) === true);
  p = await proceso();
  revisar("queda 1, pendiente de citar, y se le dice que el encargado lo citará", p.rutas_declaradas === 1 && p.reconocimiento_estado === "pendiente" && /le enviará la citación/.test(await ultimoSaliente()), await ultimoSaliente());
  revisar("después de las rutas se le pide el correo para la psicotécnica", p.correo_estado === "pedido", { correo: p.correo_estado });

  console.log("\n2. El «sí» va a la última pregunta");
  await db.from("procesos_contratacion").update({ banco_preguntado_at: new Date(Date.now() - 60_000).toISOString(), banco_respondido_at: null, banco_cuenta: null, correo_estado: "por_confirmar", correo: "x@gestivo.test", correo_recordatorio_at: new Date().toISOString(), rutas_respondido_at: new Date().toISOString() }).eq("id", id);
  revisar("con «¿Tu correo es…?» después, un «sí» es para el correo", (await escribe("sí")) === false);
  await db.from("procesos_contratacion").update({ correo_estado: null, correo: null, correo_recordatorio_at: null }).eq("id", id);
  revisar("sin eso, «Sí, tengo cuenta» es para el banco", (await escribe("Sí, tengo cuenta")) === true);
  p = await proceso();
  revisar("queda «sí» y se le pide el certificado bancario", p.banco_cuenta === "si" && /certificado bancario/.test(await ultimoSaliente()), await ultimoSaliente());

  console.log("\n3. Dice que conoce las rutas: por verificar");
  await db.from("procesos_contratacion").update({ rutas_preguntado_at: new Date().toISOString(), rutas_respondido_at: null, rutas_declaradas: null, reconocimiento_estado: "pendiente" }).eq("id", id);
  revisar("un saludo lo atiende el asistente", (await escribe("buenas tardes")) === false);
  revisar("«dos rutas»: Gestivo responde", (await escribe("dos rutas")) === true);
  p = await proceso();
  revisar("con el mínimo (2) queda «por verificar» y se le dice que el encargado lo verificará", p.reconocimiento_estado === "por_verificar" && /lo verificará/.test(await ultimoSaliente()), { reco: p.reconocimiento_estado, msg: await ultimoSaliente() });
  const { data: eventos } = await db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", id);
  const det = (eventos ?? []).map((e) => e.detalle as Record<string, unknown>);
  revisar("todo queda en el historial", det.some((d) => d?.banco_cuenta) && det.some((d) => d && "rutas_declaradas" in d));
} finally {
  await limpiar();
}
console.log(fallas ? `\n✖ ${fallas} chequeos fallaron` : "\n✔ Todo bien");
process.exit(fallas ? 1 : 0);
