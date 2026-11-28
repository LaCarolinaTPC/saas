// Recordatorio de la fase 2 de exámenes la víspera (27-nov-2026), contra la base de desarrollo:
//  1. Antes de la hora del ajuste no sale.
//  2. Sin el mensaje en el catálogo (migración 20261128034238 sin aplicar) no sale y se reintenta.
//  3. Con el mensaje: sale una vez, con el laboratorio, la fecha y «ayuno»; no se repite.
//  4. Si la citación salió hace menos de 6 horas, no se recuerda.
//
// Crea «PRUEBA RECORDATORIO F2» (9990008201) con su cita y un contacto ficticio, y los borra al
// terminar. Si el mensaje no existe en la base, lo crea solo para la prueba y lo borra al final.
// WhatsApp sale simulado (desarrollo).
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-recordatorio-f2.mts
import { createAdminClient } from "@/lib/supabase/admin";
import { ejecutarAgenda } from "@/lib/seleccion/agenda-ejecutar";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");

const db = createAdminClient();
const CEDULA = "9990008201";
const TELEFONO = "573009990821";
const CLAVE = "recordatorio_examen_f2";
let fallas = 0;
const revisar = (nombre: string, ok: unknown, detalle?: unknown) => {
  if (!ok) fallas++;
  console.log(`${ok ? "✔" : "✖"} ${nombre}${!ok && detalle !== undefined ? `  → ${JSON.stringify(detalle)}` : ""}`);
};

async function limpiar() {
  const { data: c } = await db.from("wa_contactos").select("id").eq("telefono", TELEFONO).maybeSingle();
  if (c) {
    const { data: convs } = await db.from("wa_conversaciones").select("id").eq("contacto_id", c.id);
    for (const v of convs ?? []) await db.from("wa_mensajes").delete().eq("conversacion_id", v.id);
    await db.from("wa_conversaciones").delete().eq("contacto_id", c.id);
    await db.from("wa_contactos").delete().eq("id", c.id);
  }
  const { data: ps } = await db.from("procesos_contratacion").select("id").eq("cedula", CEDULA);
  for (const p of ps ?? []) {
    await db.from("seleccion_citas").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion_eventos").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion").delete().eq("id", p.id);
  }
}
await limpiar();

const hoy = fechaBogota(new Date().toISOString());
const manana = sumarDias(hoy, 1);
// Hoy a las 17:30 y a las 18:30 de Bogotá (UTC-5).
const antes = new Date(`${hoy}T22:30:00Z`);
const despues = new Date(`${hoy}T23:30:00Z`);

const { data: proc, error } = await db
  .from("procesos_contratacion")
  .insert({ fecha_creacion: hoy, nombre: "PRUEBA RECORDATORIO F2", cedula: CEDULA, estado: "en_examenes_fase2", medio_postulacion: "whatsapp", origen: "manual", simit_valor: 0, reingreso: false, autorizacion_datos: "si", celular: "3009990821" })
  .select("id")
  .single();
if (error) throw new Error(`crear proceso: ${error.message}`);
const id = proc.id as string;
const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TELEFONO, nombre: "Prueba Recordatorio" }).select("id").single();
// Escribió hace un rato: la ventana de 24 horas está abierta (no hace falta la plantilla de Meta).
const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: id, ultimo_entrante_at: new Date().toISOString() }).select("id").single();
const { data: cita } = await db
  .from("seleccion_citas")
  .insert({ proceso_id: id, tipo: "examen_f2", fecha: manana, hora: "06:30", estado: "programada", created_at: new Date(Date.now() - 86_400_000).toISOString() })
  .select("id")
  .single();
const citaId = cita!.id as string;
const recordado = async () => ((await db.from("seleccion_citas").select("recordatorio_at").eq("id", citaId).single()).data?.recordatorio_at as string | null) ?? null;
const ultimo = async () =>
  ((await db.from("wa_mensajes").select("contenido").eq("conversacion_id", conv!.id).eq("direccion", "saliente").order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.contenido as string | undefined) ?? "";

const { data: yaHabia } = await db.from("seleccion_mensajes").select("clave").eq("clave", CLAVE).maybeSingle();
let creado = false;
try {
  console.log("\n1. Antes de la hora");
  let r = await ejecutarAgenda(antes, { soloProcesos: [id] });
  revisar("a las 17:30 no sale", !r.recordatoriosExamen && !(await recordado()), r);

  if (!yaHabia) {
    console.log("\n2. Sin el mensaje en el catálogo (migración sin aplicar)");
    r = await ejecutarAgenda(despues, { soloProcesos: [id] });
    revisar("no sale y la cita queda libre para reintentar", !r.recordatoriosExamen && !(await recordado()), r);
    const { error: e } = await db.from("seleccion_mensajes").insert({
      clave: CLAVE,
      nombre: "Recordatorio de la fase 2 de exámenes (prueba)",
      cuando: "La víspera de la cita",
      orden: 111,
      texto: "Buenas tardes, señor(a) {nombre}.\nLe recordamos que mañana tiene la segunda fase de exámenes médicos:\n📍 Laboratorio: {laboratorio}\n📅 Fecha: {fecha}\n⏰ Hora: {hora}\n¡Importante! Debe asistir en completo ayuno.\n¡Muchas gracias!",
      texto_sugerido: "x",
      modo: "automatico",
      variables: ["nombre", "laboratorio", "fecha", "hora"],
      plantilla_nombre: "sel_recordatorio_examen_f2",
      plantilla_variables: ["nombre", "laboratorio", "fecha", "hora"],
      plantilla_botones: [],
      plantilla_categoria: "UTILITY",
    });
    if (e) throw new Error(`mensaje de prueba: ${e.message}`);
    creado = true;
  }

  console.log("\n3. A las 18:30, con el mensaje");
  r = await ejecutarAgenda(despues, { soloProcesos: [id] });
  const texto = await ultimo();
  revisar("sale el recordatorio", r.recordatoriosExamen === 1 && !!(await recordado()), r);
  revisar("dice mañana, el laboratorio, la hora y el ayuno", /mañana/i.test(texto) && /Laboratorio:\s*\S/.test(texto) && /6:30/.test(texto) && /ayuno/i.test(texto), texto);
  r = await ejecutarAgenda(new Date(despues.getTime() + 15 * 60_000), { soloProcesos: [id] });
  revisar("en la siguiente corrida no se repite", !r.recordatoriosExamen, r);

  console.log("\n4. Citación reciente");
  await db.from("seleccion_citas").update({ recordatorio_at: null, created_at: new Date(despues.getTime() - 2 * 3_600_000).toISOString() }).eq("id", citaId);
  r = await ejecutarAgenda(despues, { soloProcesos: [id] });
  revisar("si la citación salió hace 2 horas, no se recuerda", !r.recordatoriosExamen && !(await recordado()), r);
} finally {
  if (creado) await db.from("seleccion_mensajes").delete().eq("clave", CLAVE);
  await limpiar();
}

console.log(fallas ? `\n✖ ${fallas} chequeos fallaron` : "\n✔ Todo bien");
process.exit(fallas ? 1 : 0);
