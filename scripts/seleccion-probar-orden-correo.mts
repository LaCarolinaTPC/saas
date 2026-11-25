// Prueba real del correo de la orden de exámenes al laboratorio, en desarrollo
// (24-nov-2026). Solo envía si el laboratorio tiene puesto el correo de prueba
// que se da con --para (cámbielo antes en Selección › Laboratorios): así nunca
// le llega una orden falsa al laboratorio de verdad. Las copias (correos_copia)
// se quitan del envío.
//
// Crea un aspirante «PRUEBA ORDEN LABORATORIO» (cédula 9990008003) citado a la
// fase 1 en ese laboratorio, envía su orden con el mismo código de «Enviar» y
// lo borra al terminar.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-orden-correo.mts --para=pruebas@empresa.com [--laboratorio=<id>]
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { crearCitaSimple } from "@/lib/seleccion/agenda-servidor";
import { enviarOrdenLaboratorio, leerLaboratorios } from "@/lib/seleccion/laboratorios-servidor";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo.");
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim() || null;
const para = arg("para")?.toLowerCase() ?? null;
if (!para) throw new Error("Falta --para=<correo de prueba>: el mismo que le puso al laboratorio.");

const labs = (await leerLaboratorios()).filter((l) => l.canal === "correo" && l.activo);
const idLab = arg("laboratorio");
const lab = idLab ? labs.find((l) => l.id === idLab) : labs[0];
if (!lab) throw new Error("No hay un laboratorio activo que reciba la orden por correo.");
const correosLab = lab.correos.map((c) => c.trim().toLowerCase());
if (correosLab.length !== 1 || correosLab[0] !== para) {
  console.log(`✖ ${lab.nombre} tiene como destinatario ${lab.correos.join(", ") || "(ninguno)"}, no ${para}.`);
  console.log("  Cámbielo en Selección › Laboratorios por el correo de prueba (solo ese) y vuelva a correr esto. No se envió nada.");
  process.exit(1);
}
// Solo esa dirección puede recibir en este proceso; las copias se quitan.
process.env.CORREO_PERMITIDOS_DESARROLLO = para;

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-orden@gestivo.test" };
const CEDULA = "9990008003";

async function limpiar() {
  const { data: ps } = await db.from("procesos_contratacion").select("id").eq("cedula", CEDULA);
  for (const p of ps ?? []) {
    await db.from("seleccion_citas").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion_eventos").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion").delete().eq("id", p.id);
  }
}
await limpiar();

const manana = new Date(Date.now() + 19 * 3_600_000).toISOString().slice(0, 10);
const { data: proc, error } = await db
  .from("procesos_contratacion")
  .insert({ fecha_creacion: manana, nombre: "PRUEBA ORDEN LABORATORIO", cedula: CEDULA, reingreso: false, estado: "en_examenes", medio_postulacion: "whatsapp", origen: "manual", simit_valor: 0, autorizacion_datos: "si", laboratorio_id: lab.id, fecha_examenes: manana })
  .select("id")
  .single();
if (error) throw new Error(`crear proceso: ${error.message}`);

try {
  const citaId = await crearCitaSimple(proc.id as string, "examen_f1", { fecha: manana, hora: "06:30" }, actor);
  if (!citaId) throw new Error("No se pudo crear la cita.");
  const r = await enviarOrdenLaboratorio(lab.id, manana, actor, { citaIds: [citaId] });
  if (r.ok) {
    console.log(`✔ Orden enviada: ${r.detalle.join(" ")}`);
    console.log(`  Revise la bandeja ${para}: asunto «[DESARROLLO…] …» con la orden de PRUEBA ORDEN LABORATORIO en PDF.`);
  } else {
    console.log(`✖ No salió: ${r.error}`);
    process.exitCode = 1;
  }
} finally {
  await limpiar();
}
