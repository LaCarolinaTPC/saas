// Correo para la prueba psicosensotécnica (24-nov-2026), de punta a punta:
// pedirlo, que lo escriba, que diga si está bien, el enlace (sí y no), escribirlo
// a mano y marcar la inscripción. Sin IA. WhatsApp sale simulado en desarrollo.
// El correo con el enlace sí sale en desarrollo (salirEnDesarrollo): por eso
// aquí no se envía salvo con --enviar-a=<su bandeja>; sin ese argumento se
// apaga el SMTP en este proceso, se comprueba el aviso de error y el enlace se simula.
//
// Crea un aspirante «PRUEBA CORREO» con cédula 9990008001 y un contacto de
// WhatsApp ficticio, y los borra al terminar. No corre la revisión periódica
// (tocaría a los aspirantes reales de la copia): esa lógica la cubre la prueba
// unitaria de correo-psico.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-correo-psico.mts [--enviar-a=yo@empresa.com]
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import {
  correoDeProceso,
  escribirCorreoPsico,
  leerEnlace,
  marcarInscritoPsico,
  pedirCorreoPsico,
  procesarCorreoPsico,
  responderEnlace,
} from "@/lib/seleccion/correo-psico-servidor";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");
// Bandeja real para recibir el correo con el enlace; sin ella no sale ningún correo.
const ENVIAR_A = process.argv.find((a) => a.startsWith("--enviar-a="))?.slice("--enviar-a=".length).trim().toLowerCase() || null;
if (!ENVIAR_A) delete process.env.SMTP_HOST;
const CORREO_2 = ENVIAR_A ?? "prueba.correo2@gestivo.test";

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-correo@gestivo.test" };
const TELEFONO = "573009990801";
let fallas = 0;
const revisar = (nombre: string, ok: unknown, detalle?: unknown) => {
  if (!ok) fallas++;
  console.log(`${ok ? "✔" : "✖"} ${nombre}${!ok && detalle !== undefined ? `  → ${JSON.stringify(detalle)}` : ""}`);
};

// Limpieza de una corrida anterior.
async function limpiar() {
  const { data: c } = await db.from("wa_contactos").select("id").eq("telefono", TELEFONO).maybeSingle();
  if (c) {
    const { data: convs } = await db.from("wa_conversaciones").select("id").eq("contacto_id", c.id);
    for (const v of convs ?? []) await db.from("wa_mensajes").delete().eq("conversacion_id", v.id);
    await db.from("wa_conversaciones").delete().eq("contacto_id", c.id);
    await db.from("wa_contactos").delete().eq("id", c.id);
  }
  const { data: ps } = await db.from("procesos_contratacion").select("id").eq("cedula", "9990008001");
  for (const p of ps ?? []) {
    await db.from("procesos_contratacion_eventos").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion").delete().eq("id", p.id);
  }
}
await limpiar();

const { data: proc, error } = await db
  .from("procesos_contratacion")
  .insert({ fecha_creacion: "2026-11-24", nombre: "PRUEBA CORREO", cedula: "9990008001", reingreso: false, estado: "en_examenes", medio_postulacion: "whatsapp", origen: "manual", simit_valor: 0, autorizacion_datos: "si", celular: "3009990801" })
  .select("id")
  .single();
if (error) throw new Error(`crear proceso: ${error.message}`);
const id = proc.id as string;
const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TELEFONO, nombre: "Prueba Correo" }).select("id").single();
// Escribió hace un rato: la ventana de 24 horas está abierta.
const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: id, ultimo_entrante_at: new Date().toISOString() }).select("id").single();
const convId = conv!.id as string;

async function escribe(texto: string): Promise<boolean> {
  const { data: m } = await db.from("wa_mensajes").insert({ conversacion_id: convId, direccion: "entrante", contenido: texto, timestamp: new Date().toISOString() }).select("id").single();
  return procesarCorreoPsico(convId, m!.id as string);
}
const ultimoSaliente = async () =>
  ((await db.from("wa_mensajes").select("contenido").eq("conversacion_id", convId).eq("direccion", "saliente").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.contenido as string | undefined) ?? "";
const estado = async () => (await correoDeProceso(id))!;

try {
  console.log("\n1. Pedir el correo");
  const pedido = await pedirCorreoPsico(id, actor);
  revisar("se le pide por WhatsApp (simulado)", pedido.ok && pedido.envio === "enviado", pedido);
  revisar("queda «pedido» con la cuenta de recordatorios en 0", (await estado()).correo_estado === "pedido" && (await estado()).correo_recordatorios === 0);
  revisar("el mensaje dice para qué es", /psicosensot/i.test(await ultimoSaliente()), await ultimoSaliente());

  console.log("\n2. Lo que responde");
  revisar("un mensaje que no es del correo lo deja al asistente", (await escribe("¿y eso para qué es?")) === false);
  revisar("un «sí» suelto, sin correo escrito, también", (await escribe("sí")) === false);
  revisar("escribe el correo (con espacios del celular): Gestivo lo atiende", (await escribe("mi correo es Prueba.Correo @Gestivo.test")) === true);
  let e = await estado();
  revisar("queda «por confirmar» con el correo en minúsculas", e.correo_estado === "por_confirmar" && e.correo === "prueba.correo@gestivo.test", e);
  revisar("se le pregunta si está bien", /prueba\.correo@gestivo\.test/.test(await ultimoSaliente()), await ultimoSaliente());
  revisar("dice que no: se le pide el correcto", (await escribe("No, lo corrijo")) === true && (await estado()).correo_estado === "pedido" && (await estado()).correo === null);
  await escribe(CORREO_2);
  revisar("escribe otro: se vuelve a preguntar", (await estado()).correo === CORREO_2 && (await estado()).correo_estado === "por_confirmar");
  revisar("dice que sí: Gestivo lo atiende", (await escribe("Sí, es correcto")) === true);
  e = await estado();
  const salio = e.correo_estado === "enviado";
  revisar(
    salio ? `el correo con el enlace salió a ${CORREO_2}` : "sin --enviar-a no sale ningún correo: queda por confirmar con el error",
    ENVIAR_A ? salio : e.correo_estado === "por_confirmar" && !!e.correo_error,
    e
  );
  if (!salio) revisar("y se le dice que Gestión Humana lo revisa", /Gestión Humana/.test(await ultimoSaliente()), await ultimoSaliente());

  console.log("\n3. El enlace del correo");
  // Se simula el correo: un token conocido, como lo dejaría enviarCorreoValidacion.
  const token = "PruebaDeEnlaceCorreo_0123456789abcdef";
  const hash = createHash("sha256").update(token).digest("hex");
  const vence = new Date(Date.now() + 86_400_000).toISOString();
  await db.from("procesos_contratacion").update({ correo_estado: "enviado", correo_token_hash: hash, correo_token_vence: vence }).eq("id", id);
  const vista = await leerEnlace(token);
  revisar("la página muestra el correo y espera la respuesta", vista.estado === "pendiente" && vista.correo === CORREO_2, vista);
  revisar("un token que no existe no sirve", (await leerEnlace("TokenQueNoExiste_0123456789")).estado === "no_existe");
  await db.from("procesos_contratacion").update({ correo_token_vence: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
  revisar("un enlace vencido lo dice", (await leerEnlace(token)).estado === "vencido");
  await db.from("procesos_contratacion").update({ correo_token_vence: vence }).eq("id", id);
  revisar("«No es mi correo»: se le vuelve a pedir", (await responderEnlace(token, "no")).estado === "corregir" && (await estado()).correo_estado === "pedido");
  revisar("y el enlace ya no sirve", (await leerEnlace(token)).estado === "no_existe");
  await db.from("procesos_contratacion").update({ correo: CORREO_2, correo_estado: "enviado", correo_token_hash: hash, correo_token_vence: vence }).eq("id", id);
  revisar("«Sí, es mi correo»: queda confirmado por el enlace", (await responderEnlace(token, "si")).estado === "validado" && (await estado()).correo_validado_por === "enlace");
  revisar("ya confirmado, un correo nuevo en el chat lo atiende el asistente", (await escribe("otro@gestivo.test")) === false);

  console.log("\n4. Gestión Humana");
  const ins = await marcarInscritoPsico(id, actor);
  revisar("marca «inscrito» y se le avisa que le llega la información por correo", ins.ok && ins.envio === "enviado" && (await estado()).correo_estado === "inscrito", ins);
  revisar("el aviso trae el correo", new RegExp(CORREO_2.replace(/[.+]/g, "\$&")).test(await ultimoSaliente()), await ultimoSaliente());
  revisar("no se puede marcar dos veces", !(await marcarInscritoPsico(id, actor)).ok);
  revisar("un correo mal escrito a mano no se acepta", !(await escribirCorreoPsico(id, "no-es-correo", true, actor)).ok);
  const mano = await escribirCorreoPsico(id, "Confirmado.Mano@Gestivo.test", true, actor);
  e = await estado();
  revisar("escrito a mano y confirmado con el aspirante: queda validado por esa persona", mano.ok && e.correo_estado === "validado" && e.correo === "confirmado.mano@gestivo.test" && e.correo_validado_por === actor.userEmail, e);
  const { data: eventos } = await db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", id);
  revisar("todo queda en el historial", (eventos ?? []).filter((x) => (x.detalle as Record<string, unknown>)?.correo_psico).length >= 6, eventos?.length);
} finally {
  await limpiar();
}

console.log(fallas ? `\n✖ ${fallas} chequeos fallaron` : "\n✔ Todo bien");
process.exit(fallas ? 1 : 0);
