// El simulador del cron del chat de prueba (27-nov-2026) contra la base de .env.local (desarrollo):
//   1. Quien no pasó la preselección se cierra a los 30 min (reloj adelantado) y su referido del
//      Plan Padrino queda «No contratado».
//   2. La cita de mañana: recordatorio a las 9:00, alerta si no confirmó a las 11:05 y «No asistió»
//      pasada la tolerancia.
//   3. Lo del banco sin respuesta: el aviso de rutas a las +24 h.
//   4. Un resultado tardío con anotación después del aval: el aval se anula y queda la alerta.
//   5. El silencio de un aspirante que todavía no es candidato: los avisos de reactivación.
//   6. Un proceso real (no del chat de prueba) nunca se toca.
// Candidatos «chat_prueba» ficticios (cédulas 99900098NN); lo borra todo al terminar. No envía nada.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-cron-prueba.mts
import { createAdminClient } from "@/lib/supabase/admin";
import { correrCronPrueba, type ItemCronPrueba } from "@/lib/seleccion/cron-prueba-servidor";
import { crearCitaSimple } from "@/lib/seleccion/agenda-servidor";
import { evaluarAntecedentesProceso } from "@/lib/seleccion/servidor";
import { registrarReferidoNucleo } from "@/lib/padrino/registro-servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import type { ActorProceso } from "@/lib/contratacion/servidor";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo.");
const db = createAdminClient();
const PREFIJO = "99900098";
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-cron@gestivo.test" };

let ok = 0;
const fallos: string[] = [];
const titulo = (t: string) => console.log(`\n── ${t}`);
const revisar = (nombre: string, condicion: unknown, detalle?: unknown) => {
  if (condicion) {
    ok++;
    console.log(`  ✔ ${nombre}`);
  } else {
    const d = detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 600)}` : "";
    fallos.push(`${nombre}${d}`);
    console.log(`  ✘ ${nombre}${d}`);
  }
};

async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((p) => p.id as string);
  if (!ids.length) return;
  const { data: refs } = await db.from("padrino_referidos").select("id").in("proceso_id", ids);
  const rids = (refs ?? []).map((r) => r.id as string);
  if (rids.length) {
    await db.from("padrino_hitos").delete().in("referido_id", rids);
    await db.from("padrino_eventos").delete().in("referido_id", rids);
    await db.from("padrino_referidos").delete().in("id", rids);
  }
  await db.from("verificaciones_externas").delete().in("proceso_id", ids);
  await db.from("seleccion_citas").delete().in("proceso_id", ids);
  await db.from("procesos_contratacion_eventos").delete().in("proceso_id", ids);
  await db.from("procesos_contratacion").delete().in("id", ids);
}

let n = 0;
async function crear(nombre: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({
      fecha_creacion: fechaBogota(new Date().toISOString()),
      nombre,
      cedula: `${PREFIJO}${String(++n).padStart(2, "0")}`,
      estado: "pendiente",
      origen: "chat_prueba",
      medio_postulacion: "whatsapp",
      reingreso: false,
      autorizacion_datos: "si",
      simit_valor: 0,
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
const item = (idChat: number, procesoId: string | null, extra: Partial<ItemCronPrueba> = {}): ItemCronPrueba => ({
  idChat,
  procesoId,
  ultimoEntranteAt: null,
  ultimoEsNuestro: false,
  hojaVida: true,
  buscaTrabajo: true,
  nombre: null,
  ...extra,
});
const estado = async (id: string) => (await db.from("procesos_contratacion").select("estado, causa_no_contrato").eq("id", id).single()).data as { estado: string; causa_no_contrato: string | null };
/** Una hora de Bogotá en `dias` días (AAAA-MM-DD + HH:MM, Bogotá = UTC-5). */
const enBogota = (dias: number, hhmm: string) => {
  const d = new Date(Date.now() - 5 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);
  return { fecha: d, ahora: new Date(`${d}T${hhmm}:00-05:00`) };
};

await limpiar();
try {
  // ── 1 ─────────────────────────────────────────────────────────────────────
  titulo("1. Cierre de quien no pasó la preselección (+31 min)");
  const p1 = await crear("CRON PRUEBA LICENCIA", {
    recomendado: true,
    recomendado_at: new Date().toISOString(),
    requisito_incumplido: "Licencia no válida (no tiene, vencida o distinta de C2/C3)",
    preseleccion: { global: "no_cumple", incumplido: "licencia", edad: { color: "verde" }, residencia: { color: "verde" }, licencia: { color: "rojo" }, simit: { color: "verde" } },
  });
  await db.from("procesos_contratacion_eventos").insert({ proceso_id: p1, tipo: "preseleccion", detalle: { global: "no_cumple", licencia: "rojo" }, actor: "sistema", usuario_email: "Sistema" });
  const reg = await registrarReferidoNucleo({ procesoId: p1, cedulaPadrino: process.env.PADRINO_PRUEBA ?? "8567283" }, { userId: null, userEmail: actor.userEmail }, null).catch((e: Error) => e.message);
  revisar("tiene un referido del Plan Padrino", typeof reg === "string" && reg.length > 20, reg);
  const ahora0 = new Date();
  const antes = await correrCronPrueba([item(1, p1)], ahora0);
  revisar("con el reloj en la hora real no lo cierra todavía", (await estado(p1)).estado === "pendiente", antes.pasos);
  const r1 = await correrCronPrueba([item(1, p1)], new Date(Date.now() + 31 * 60_000));
  const e1 = await estado(p1);
  revisar("a los +31 min lo cierra con la causa", e1.estado === "cierre" && /Licencia/.test(e1.causa_no_contrato ?? ""), e1);
  revisar("y el chat recibe la nota del cambio", r1.chats[0]?.notas.some((x) => /Cierre|cerr/i.test(x)), r1.chats[0]);
  // Caso del navegador (27-nov-2026): cerrado en la misma vuelta, no le toca la reactivación por silencio.
  const p1b = await crear("CRON PRUEBA CIERRE Y SILENCIO", {
    requisito_incumplido: "Licencia no válida (no tiene, vencida o distinta de C2/C3)",
    preseleccion: { global: "no_cumple", incumplido: "licencia", edad: { color: "verde" }, residencia: { color: "verde" }, licencia: { color: "rojo" }, simit: { color: "verde" } },
  });
  await db.from("procesos_contratacion_eventos").insert({ proceso_id: p1b, tipo: "preseleccion", detalle: { global: "no_cumple", licencia: "rojo" }, actor: "sistema", usuario_email: "Sistema" });
  const r1b = await correrCronPrueba([item(7, p1b, { ultimoEntranteAt: Date.now() - 3_600_000, ultimoEsNuestro: true, hojaVida: false })], new Date(Date.now() + 30 * 3_600_000));
  revisar("cerrado en la misma vuelta: sin reactivación por silencio", (await estado(p1b)).estado === "cierre" && !r1b.chats[0]?.silencio.length, r1b.chats[0]);
  const { data: ref1 } = await db.from("padrino_referidos").select("estado").eq("proceso_id", p1).maybeSingle();
  revisar("su referido del Plan Padrino queda «No contratado»", ref1?.estado === "no_contratado", ref1);

  // ── 2 ─────────────────────────────────────────────────────────────────────
  titulo("2. La cita de mañana: recordatorio, alerta y «No asistió»");
  const p2 = await crear("CRON PRUEBA CITA", { estado: "citado" });
  const m9 = enBogota(1, "09:00");
  await crearCitaSimple(p2, "prueba_manejo", { fecha: m9.fecha, hora: "13:00" }, actor);
  const r2a = await correrCronPrueba([item(2, p2)], m9.ahora);
  revisar("a las 9:00 le llega el recordatorio de la cita", r2a.chats[0]?.mensajes.some((m) => m.clave === "recordatorio_cita" && m.texto.length > 10), { mensajes: r2a.chats[0]?.mensajes, pasos: r2a.pasos.agenda });
  const r2rep = await correrCronPrueba([item(2, p2)], new Date(m9.ahora.getTime() + 10 * 60_000));
  revisar("no se repite en la vuelta siguiente", !r2rep.chats[0]?.mensajes.length, r2rep.chats[0]?.mensajes);
  const r2b = await correrCronPrueba([item(2, p2)], enBogota(1, "11:05").ahora);
  revisar("a las 11:05, sin confirmar: alerta para llamar", r2b.chats[0]?.notas.some((x) => /no ha confirmado/i.test(x)), r2b.chats[0]);
  const r2c = await correrCronPrueba([item(2, p2)], enBogota(1, "14:05").ahora);
  const { data: cita2 } = await db.from("seleccion_citas").select("estado").eq("proceso_id", p2).maybeSingle();
  revisar("pasada la tolerancia queda «No asistió»", cita2?.estado === "no_asistio" && r2c.chats[0]?.notas.some((x) => /No asistió/.test(x)), { cita2, chat: r2c.chats[0] });

  // ── 3 ─────────────────────────────────────────────────────────────────────
  titulo("3. Lo del banco sin respuesta: aviso de rutas a las +24 h");
  const p3 = await crear("CRON PRUEBA BANCO", { estado: "en_examenes", banco_preguntado_at: new Date().toISOString() });
  const r3a = await correrCronPrueba([item(3, p3)], new Date(Date.now() + 2 * 3_600_000));
  revisar("a las +2 h todavía no", !r3a.chats[0]?.mensajes.some((m) => m.clave === "reconocimiento_aviso"), r3a.chats[0]?.mensajes);
  const r3b = await correrCronPrueba([item(3, p3)], enBogota(2, "10:00").ahora);
  revisar("pasadas 24 h le llega el aviso del reconocimiento de rutas", r3b.chats[0]?.mensajes.some((m) => m.clave === "reconocimiento_aviso"), { mensajes: r3b.chats[0]?.mensajes, pasos: r3b.pasos.reconocimiento });

  // ── 4 ─────────────────────────────────────────────────────────────────────
  titulo("4. Resultado tardío con anotación después del aval");
  const p4 = await crear("CRON PRUEBA AVAL", { estado: "citado", antecedentes_decision: "aprobado", antecedentes_decision_por: actor.userEmail, antecedentes_decision_at: new Date().toISOString() });
  await db.from("procesos_contratacion_eventos").insert({ proceso_id: p4, tipo: "dato", detalle: { decision_antecedentes: "aprobado", fuentes: ["rnmc"], hallazgos: [], justificacion: "El RNMC no respondía (prueba)." }, actor: "usuario", usuario_email: actor.userEmail });
  const ced4 = (await db.from("procesos_contratacion").select("cedula").eq("id", p4).single()).data!.cedula as string;
  const fila = (fuente: string, resultado: Record<string, unknown>) => ({ proceso_id: p4, cedula: ced4, proveedor: "manual", fuente, estado: "ok", resultado: { manual: true, ...resultado }, consultado_por: "prueba" });
  await db.from("verificaciones_externas").insert([
    fila("policia", { has_records: false }),
    fila("procuraduria", { found: true, has_records: false }),
    fila("contraloria", { is_fiscal_responsible: false }),
    fila("rnmc", { found: true, full_name: "CRON PRUEBA AVAL", has_pending_measures: true }),
  ]);
  const ev4 = await evaluarAntecedentesProceso(p4);
  const { data: d4 } = await db.from("procesos_contratacion").select("antecedentes_decision, estado").eq("id", p4).single();
  revisar("el aval se anula (vuelve a revisión) y el proceso sigue en su etapa", d4?.antecedentes_decision === null && d4?.estado === "citado" && ev4?.decision === null, { d4, decision: ev4?.decision });
  const { data: ev4s } = await db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", p4);
  const detalles = (ev4s ?? []).map((e) => e.detalle as Record<string, unknown>);
  revisar("queda el evento «aval anulado»", detalles.some((d) => d.aval_anulado === true));
  revisar("y el intento de la alerta por correo (en dev solo sale a la lista de pruebas)", detalles.some((d) => d.alerta_antecedentes === "tardio"), detalles.filter((d) => d.alerta_antecedentes));

  // ── 5 ─────────────────────────────────────────────────────────────────────
  titulo("5. Silencio de un aspirante que todavía no es candidato");
  const ultimo = Date.now() - 60 * 60_000;
  // El reloj virtual, 31 h después y dentro del horario de los mensajes (7:00–20:00 en Bogotá):
  // corrida cerca de la medianoche, «+31 h» caía a las 6 a. m. y no salía nada, como debe ser.
  let ahora5 = ultimo + 31 * 3_600_000;
  while ((new Date(ahora5).getUTCHours() + 19) % 24 < 9 || (new Date(ahora5).getUTCHours() + 19) % 24 > 18) ahora5 += 3_600_000;
  // Sin la hoja de vida (con ella ya terminó lo que se le pedía y no hay reactivación).
  const r5 = await correrCronPrueba([item(5, null, { ultimoEntranteAt: ultimo, ultimoEsNuestro: true, hojaVida: false })], new Date(ahora5));
  const pasos5 = r5.chats[0]?.silencio ?? [];
  revisar(`a las +31 h van los avisos de reactivación (${pasos5.map((s) => s.accion).join(", ")})`, pasos5.some((s) => s.accion === "aviso1"), pasos5);
  revisar("con una clave para no repetirlos", pasos5.every((s) => s.clave.endsWith(`:${ultimo}`)));
  const r5b = await correrCronPrueba([item(5, null, { ultimoEntranteAt: ultimo, ultimoEsNuestro: false })], new Date(ahora5));
  revisar("si el último mensaje es del aspirante, no hay silencio", !r5b.chats[0]?.silencio.length);

  // ── 6 ─────────────────────────────────────────────────────────────────────
  titulo("6. Un proceso real nunca se toca");
  const { data: real } = await db.from("procesos_contratacion").select("id, estado, updated_at").neq("origen", "chat_prueba").eq("estado", "pendiente").limit(1).maybeSingle();
  if (real) {
    const r6 = await correrCronPrueba([item(6, real.id as string)], new Date(Date.now() + 3 * 86_400_000));
    const { data: despues } = await db.from("procesos_contratacion").select("estado, updated_at").eq("id", real.id).single();
    revisar("se ignora: sin mensajes ni cambios", r6.chats[0]?.procesoId === null && despues?.estado === real.estado && despues?.updated_at === real.updated_at, { r6: r6.chats[0], despues });
  } else console.log("  (no hay procesos reales en Preselección para comprobarlo)");
} finally {
  await limpiar();
  const { count } = await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`);
  console.log(`\nLimpieza: quedan ${count ?? 0} procesos de esta prueba.`);
}

console.log(`\n${ok} bien, ${fallos.length} mal.`);
if (fallos.length) {
  for (const f of fallos) console.log(` - ${f}`);
  process.exitCode = 1;
}
