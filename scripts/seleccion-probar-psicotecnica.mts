// Candidatos › Psicotécnica (27-nov-2026): cuándo aparece cada aspirante en sus
// listas, de punta a punta, y cómo pesa el resultado en «Listo para contratar».
//
//  1. En la fase 1 sin correo: no aparece.
//  2. La revisión periódica pide el correo solo después de la pregunta del banco
//     (o pasadas 24 h sin respuesta), y solo en las etapas desde la fase 1.
//  3. Pedido o por confirmar: todavía no aparece.
//  4. Correo confirmado → «Por inscribir» (y en la plantilla de PsicoAlianza).
//  5. Marcado inscrito → «Esperando resultado»; en rojo pasados los días del ajuste.
//  6. «No la presentó» → vuelve a «Por inscribir», marcado «2.ª vez».
//  7. Con resultado → sale de las pendientes y queda en «Con resultado»; si el
//     ajuste lo exige, «no apto» bloquea «Listo para contratar» y «con
//     observaciones» lo cumple.
//  8. Un proceso cerrado con el correo confirmado no aparece.
//
// Crea «PRUEBA PSICOTECNICA» (9990008101) y «PRUEBA PSICO CERRADO» (9990008102)
// con un contacto de WhatsApp ficticio, y los borra al terminar. WhatsApp sale
// simulado (desarrollo) y no sale ningún correo (se apaga el SMTP aquí).
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-psicotecnica.mts
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { correoDeProceso, ejecutarCorreosPsico, escribirCorreoPsico } from "@/lib/seleccion/correo-psico-servidor";
import { guardarResultados, listasPsico, marcarInscritos, plantillaPsicoAlianza, reprogramarPsico } from "@/lib/seleccion/psico-servidor";
import { condicionesDeProceso } from "@/lib/seleccion/contratacion-servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");
delete process.env.SMTP_HOST;

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-psico@gestivo.test" };
const CEDULA = "9990008101";
const CEDULA_CERRADO = "9990008102";
const TELEFONO = "573009990811";
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
  const { data: ps } = await db.from("procesos_contratacion").select("id").in("cedula", [CEDULA, CEDULA_CERRADO]);
  for (const p of ps ?? []) {
    await db.from("seleccion_notificaciones").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion_eventos").delete().eq("proceso_id", p.id);
    await db.from("procesos_contratacion").delete().eq("id", p.id);
  }
}
await limpiar();

const base = { fecha_creacion: fechaBogota(new Date().toISOString()), reingreso: false, medio_postulacion: "whatsapp", origen: "manual", simit_valor: 0, autorizacion_datos: "si" };
const { data: proc, error } = await db
  .from("procesos_contratacion")
  .insert({ ...base, nombre: "PRUEBA PSICOTECNICA", cedula: CEDULA, estado: "en_examenes", celular: "3009990811" })
  .select("id")
  .single();
if (error) throw new Error(`crear proceso: ${error.message}`);
const id = proc.id as string;
const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TELEFONO, nombre: "Prueba Psicotecnica" }).select("id").single();
await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: id, ultimo_entrante_at: new Date().toISOString() });

const dondeEsta = async (procesoId = id) => {
  const l = await listasPsico();
  if (l.error) throw new Error(l.error);
  const en = (xs: { procesoId: string }[]) => xs.find((a) => a.procesoId === procesoId);
  const lugar = en(l.porInscribir) ? "por_inscribir" : en(l.esperando) ? "esperando" : en(l.conResultado) ? "con_resultado" : "ninguna";
  return { lugar, fila: en(l.porInscribir) ?? en(l.esperando) ?? en(l.conResultado), dias: l.diasParaPresentar };
};
const correoEstado = async () => (await correoDeProceso(id))?.correo_estado ?? null;
// La revisión periódica a las 10:00 de hoy (dentro del horario de los recordatorios).
const AHORA = new Date(`${fechaBogota(new Date().toISOString())}T15:00:00Z`);
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString();

try {
  console.log("\n1. En la fase 1, sin correo");
  revisar("no aparece en ninguna lista", (await dondeEsta()).lugar === "ninguna", await dondeEsta());

  console.log("\n2. La revisión periódica pide el correo");
  await db.from("procesos_contratacion").update({ banco_preguntado_at: hace(1), banco_respondido_at: null }).eq("id", id);
  let r = await ejecutarCorreosPsico(AHORA, { soloProcesos: [id] });
  revisar("con la pregunta del banco sin responder (1 h), espera", r.pedidos === 0 && (await correoEstado()) === null, r);
  await db.from("procesos_contratacion").update({ estado: "citado", banco_preguntado_at: null }).eq("id", id);
  r = await ejecutarCorreosPsico(AHORA, { soloProcesos: [id] });
  revisar("antes de la fase 1 (citado) no se pide", r.pedidos === 0 && (await correoEstado()) === null, r);
  await db.from("procesos_contratacion").update({ estado: "en_examenes", banco_preguntado_at: hace(25) }).eq("id", id);
  r = await ejecutarCorreosPsico(AHORA, { soloProcesos: [id] });
  revisar("pasadas 24 h sin respuesta del banco, se pide", r.pedidos === 1 && (await correoEstado()) === "pedido", { r, estado: await correoEstado() });

  console.log("\n3. Pedido, todavía sin confirmar");
  revisar("con el correo pedido no aparece", (await dondeEsta()).lugar === "ninguna");
  await db.from("procesos_contratacion").update({ correo: "prueba.psico@gestivo.test", correo_estado: "por_confirmar" }).eq("id", id);
  revisar("por confirmar tampoco", (await dondeEsta()).lugar === "ninguna");

  console.log("\n4. Correo confirmado");
  const ok = await escribirCorreoPsico(id, "Prueba.Psico@Gestivo.test", true, actor);
  let d = await dondeEsta();
  revisar("aparece en «Por inscribir»", ok.ok && d.lugar === "por_inscribir", { ok, d });
  const plantilla = await plantillaPsicoAlianza([id]);
  revisar("sale en la plantilla de PsicoAlianza", plantilla.ok && plantilla.filas === 1, plantilla.ok ? plantilla.filas : plantilla.error);

  console.log("\n5. Inscrito en PsicoAlianza");
  const ins = await marcarInscritos([id], actor);
  d = await dondeEsta();
  revisar("pasa a «Esperando resultado»", ins.marcados === 1 && d.lugar === "esperando", { ins, d });
  revisar("recién inscrito no está en rojo", d.fila && !(d.fila as { demorado?: boolean }).demorado, d.fila);
  await db.from("procesos_contratacion").update({ correo_inscrito_at: hace(24 * (d.dias + 1)) }).eq("id", id);
  d = await dondeEsta();
  revisar(`con más de ${d.dias} días sin resultado, en rojo`, (d.fila as { demorado?: boolean } | undefined)?.demorado === true, d.fila);

  console.log("\n6. No la presentó");
  const re = await reprogramarPsico(id, "no_presento", actor);
  d = await dondeEsta();
  const fila = d.fila as { reprogramaciones?: number; ultimaRazon?: string } | undefined;
  revisar("vuelve a «Por inscribir»", re.ok && d.lugar === "por_inscribir", { re, d: d.lugar });
  revisar("marcado como segunda vez, por no presentarla", fila?.reprogramaciones === 1 && fila?.ultimaRazon === "no_presento", fila);
  await marcarInscritos([id], actor);
  revisar("inscrito otra vez: «Esperando resultado»", (await dondeEsta()).lugar === "esperando");

  console.log("\n7. Con resultado");
  const hoy = fechaBogota(new Date().toISOString());
  const g1 = await guardarResultados([{ clave: CEDULA, procesoId: id, resultado: "no_apto", fecha: hoy, puntaje: 40, archivos: [], detalle: "Ethikos: No recomendado (40 %)" }], [], actor);
  d = await dondeEsta();
  revisar("sale de las pendientes y queda en «Con resultado»", g1.guardados === 1 && d.lugar === "con_resultado", { g1, d: d.lugar });
  let cond = await condicionesDeProceso(id);
  const psico = () => cond.condiciones.find((c) => c.id === "psicotecnica");
  if (psico()) {
    revisar("«no apto» no cumple la condición de «Listo para contratar»", psico()!.cumple === false, psico());
    await guardarResultados([{ clave: CEDULA, procesoId: id, resultado: "apto_con_observaciones", fecha: hoy, puntaje: 70, archivos: [], detalle: "Ethikos: Recomendado con sugerencias (70 %)" }], [], actor);
    cond = await condicionesDeProceso(id);
    revisar("«con observaciones» sí la cumple", psico()?.cumple === true, psico());
    revisar("el detalle dice de dónde salió", /PsicoAlianza|Ethikos/i.test(psico()?.detalle ?? ""), psico()?.detalle);
  } else {
    console.log("  (el ajuste «Exigir la prueba psicotécnica apta para contratar» está apagado: no se revisa la condición)");
  }

  console.log("\n8. Proceso cerrado");
  const { data: cerrado } = await db
    .from("procesos_contratacion")
    .insert({ ...base, nombre: "PRUEBA PSICO CERRADO", cedula: CEDULA_CERRADO, estado: "cierre", correo: "cerrado@gestivo.test", correo_estado: "validado", correo_validado_at: new Date().toISOString() })
    .select("id")
    .single();
  revisar("con el correo confirmado pero cerrado, no aparece", (await dondeEsta(cerrado!.id as string)).lugar === "ninguna");
} finally {
  await limpiar();
}

console.log(fallas ? `\n✖ ${fallas} chequeos fallaron` : "\n✔ Todo bien");
process.exit(fallas ? 1 : 0);
