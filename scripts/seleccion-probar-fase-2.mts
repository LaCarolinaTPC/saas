// Candidatos › Exámenes fase 2 y «Desistió» (27-nov-2026), contra la base de desarrollo:
//  1. Quién aparece en cada grupo (para registrar, próximas, aplazados, sin cita).
//  2. «Confirmo» del aspirante confirma la cita de la fase 2.
//  3. Apto pasa a reconocimiento; desistió exige causa y cierra con «Desistimiento»
//     (la causa y la fase quedan en el examen y en la observación).
//  4. Desistió en la fase 1.
//
// Crea aspirantes «PRUEBA FASE2 …» (99900083xx) y los borra al terminar. WhatsApp simulado.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-fase-2.mts
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { pantallaFase2 } from "@/lib/seleccion/fase2-servidor";
import { registrarExamen } from "@/lib/seleccion/examenes-servidor";
import { procesarRespuestaCita } from "@/lib/seleccion/agenda-ejecutar";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");
const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-fase2@gestivo.test" };
const PREFIJO = "99900083";
const TELEFONO = "573009990831";
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
  const { data: ps } = await db.from("procesos_contratacion").select("id").like("cedula", `${PREFIJO}%`);
  for (const p of ps ?? []) {
    for (const t of ["seleccion_citas", "seleccion_examenes", "seleccion_notificaciones", "procesos_contratacion_eventos"]) await db.from(t).delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion").delete().eq("id", p.id);
  }
}
await limpiar();

const hoy = fechaBogota(new Date().toISOString());
async function aspirante(n: string, nombre: string, estado: string, f2?: { fecha: string; estado?: string }, aplazado?: string) {
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({ fecha_creacion: hoy, nombre, cedula: `${PREFIJO}${n}`, estado, medio_postulacion: "whatsapp", origen: "manual", simit_valor: 0, reingreso: false, autorizacion_datos: "si" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = data.id as string;
  if (estado === "en_examenes_fase2") await db.from("seleccion_examenes").insert({ proceso_id: id, fase: 1, fecha: sumarDias(hoy, -1), resultado: "apto" });
  if (f2) await db.from("seleccion_citas").insert({ proceso_id: id, tipo: "examen_f2", fecha: f2.fecha, hora: "06:30", estado: f2.estado ?? "programada" });
  if (aplazado) await db.from("seleccion_examenes").insert({ proceso_id: id, fase: 2, fecha: hoy, resultado: "aplazado", observacion: aplazado });
  return id;
}
const lugar = async (id: string) => (await pantallaFase2()).aspirantes.find((a) => a.procesoId === id);
const proceso = async (id: string) => (await db.from("procesos_contratacion").select("estado, causa_no_contrato, observacion").eq("id", id).single()).data!;

try {
  const hoyId = await aspirante("01", "PRUEBA FASE2 HOY", "en_examenes_fase2", { fecha: hoy });
  const mananaId = await aspirante("02", "PRUEBA FASE2 MANANA", "en_examenes_fase2", { fecha: sumarDias(hoy, 1) });
  const aplId = await aspirante("03", "PRUEBA FASE2 APLAZADO", "en_examenes_fase2", { fecha: sumarDias(hoy, -1) }, "Repetir hemograma");
  const sinId = await aspirante("04", "PRUEBA FASE2 SIN CITA", "en_examenes_fase2");
  const f1Id = await aspirante("05", "PRUEBA FASE1 DESISTE", "en_examenes");

  console.log("\n1. Grupos");
  revisar("cita de hoy: «Para registrar»", (await lugar(hoyId))?.grupo === "registrar", await lugar(hoyId));
  revisar("cita de mañana: «Próximas citas»", (await lugar(mananaId))?.grupo === "proximas");
  revisar("aplazado: «Aplazados» con el motivo", (await lugar(aplId))?.grupo === "aplazados" && (await lugar(aplId))?.aplazado?.observacion === "Repetir hemograma");
  revisar("sin cita: «Sin cita»", (await lugar(sinId))?.grupo === "sin_cita");
  revisar("la fase 1 no aparece", !(await lugar(f1Id)));

  console.log("\n2. Confirma la cita de la fase 2");
  const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TELEFONO, nombre: "Prueba Fase2" }).select("id").single();
  const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: mananaId, ultimo_entrante_at: new Date().toISOString() }).select("id").single();
  const { data: msj } = await db.from("wa_mensajes").insert({ conversacion_id: conv!.id, direccion: "entrante", contenido: "Sí, confirmo. Ahí estaré en ayunas", timestamp: new Date().toISOString() }).select("id").single();
  const resp = await procesarRespuestaCita(conv!.id as string, msj!.id as string);
  const m = await lugar(mananaId);
  revisar("queda «Confirmó»", resp === "confirma" && m?.cita?.estado === "confirmada" && !!m.cita.confirmadaAt, { resp, cita: m?.cita });

  console.log("\n3. Resultados de la fase 2");
  const apto = await registrarExamen(hoyId, { fase: 2, resultado: "apto" }, actor);
  revisar("apto: pasa a reconocimiento de ruta y sale de la lista", apto.ok && (await proceso(hoyId)).estado === "reconocimiento_ruta" && !(await lugar(hoyId)), apto);
  const sinCausa = await registrarExamen(mananaId, { fase: 2, resultado: "desistio" }, actor);
  revisar("desistió sin causa: no se acepta", !sinCausa.ok && /por qué desistió/.test(sinCausa.error ?? ""), sinCausa);
  const des = await registrarExamen(mananaId, { fase: 2, resultado: "desistio", causa: "Mejor oferta laboral", observacion: "Llamó a decir que no sigue" }, actor);
  const p = await proceso(mananaId);
  const { data: ex } = await db.from("seleccion_examenes").select("resultado, causa").eq("proceso_id", mananaId).eq("fase", 2).single();
  revisar("desistió: cierra con «Desistimiento»", des.ok && p.estado === "cierre" && p.causa_no_contrato === "Desistimiento", { des, p });
  revisar("la causa queda en el examen y la fase en la observación", ex?.resultado === "desistio" && ex.causa === "Mejor oferta laboral" && /fase 2: Mejor oferta laboral/.test(p.observacion ?? ""), { ex, obs: p.observacion });

  console.log("\n4. Cerrar por «Desistimiento» desde el tablero estando en la fase 2");
  const { cambiarEstadoProceso } = await import("@/lib/contratacion/servidor");
  await cambiarEstadoProceso(aplId, "cierre", { actor, causa: "Desistimiento", detalle: { motivo: "No se presentó al laboratorio y no contesta el teléfono" } });
  const { data: exT } = await db.from("seleccion_examenes").select("resultado, causa").eq("proceso_id", aplId).eq("fase", 2).single();
  revisar("la fase 2 queda «desistió» con las observaciones como causa", exT?.resultado === "desistio" && /no se present/i.test(exT.causa ?? ""), exT);

  console.log("\n5. Desistió en la fase 1");
  const d1 = await registrarExamen(f1Id, { fase: 1, resultado: "desistio", causa: "Sin explicación" }, actor);
  const p1 = await proceso(f1Id);
  revisar("cierra con «Desistimiento» y la fase 1", d1.ok && p1.estado === "cierre" && /fase 1: Sin explicación/.test(p1.observacion ?? ""), { d1, p1 });
} finally {
  await limpiar();
}
console.log(fallas ? `\n✖ ${fallas} chequeos fallaron` : "\n✔ Todo bien");
process.exit(fallas ? 1 : 0);
