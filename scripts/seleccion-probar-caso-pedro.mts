// El caso de Pedro Luis (chat de prueba n.º 1, 27-nov-2026) otra vez, con los arreglos del mismo día.
// Ese día: lo citaron solo para la 1:00 p. m. del mismo día, el mensaje no llegó al chat, se marcó
// «Llegó» un día antes, el examen quedó a las 6:30 del mismo sábado de la prueba, «No tengo cuenta»
// no se atendió y la IA le dijo que el mensaje de exámenes no era nuestro.
//
// Repite la misma secuencia con un candidato nuevo del chat de prueba (cédula 99900096NN), con la
// conversación real de Pedro hasta la hoja de vida y sus mismos mensajes después. El chat de Pedro no
// se toca. Usa la IA del asistente de verdad (unas 10 llamadas pequeñas). No sale WhatsApp. Borra todo
// al terminar. La conversación completa queda en el archivo que se pasa como argumento (opcional).
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-caso-pedro.mts [salida.txt]
import { writeFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import { antecedentesEnRevisionDeProceso, cerradoPorAntecedentesDeProceso, contextoSeleccion, leerReglas } from "@/lib/seleccion/servidor";
import { licenciaVerificadaDesdeRunt } from "@/lib/seleccion/preseleccion";
import { responderSimulado, type ContextoSimulacion } from "@/lib/seleccion/evaluacion/ejecutor";
import type { MensajeSimulado } from "@/lib/seleccion/simulacion";
import {
  citaParaAsistente,
  citaVigenteDeProceso,
  citarAutomaticamente,
  confirmarCita,
  examenParaAsistente,
  marcarLlegada,
  pedirOtraFecha,
  reprogramarPorAsistente,
  vistaCitacion,
} from "@/lib/seleccion/agenda-servidor";
import { citaVigente, fechaEnTexto, horaEnTexto, interpretarRespuestaCita, type Cita } from "@/lib/seleccion/agenda";
import { enviarAExamenes, planExamenes, registrarPrueba } from "@/lib/seleccion/profesor-servidor";
import { atenderRespuestaExamenesPrueba, preguntaExamenDeProceso } from "@/lib/seleccion/respuestas-examenes-servidor";
import { correoParaAsistenteDeProceso } from "@/lib/seleccion/correo-psico-servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import type { ResumenRunt } from "@/lib/verificacion/proveedores";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");
const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-caso-pedro@gestivo.test" };
const PREFIJO = "99900096";
const CHAT_PEDRO = 1795713314321;
const salida = process.argv[2] ?? null;

let ok = 0;
const fallos: string[] = [];
const revisar = (nombre: string, condicion: unknown, detalle?: unknown) => {
  if (condicion) {
    ok++;
    console.log(`  ✔ ${nombre}`);
  } else {
    const d = detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 400)}` : "";
    fallos.push(`${nombre}${d}`);
    console.log(`  ✘ ${nombre}${d}`);
  }
};
const titulo = (t: string) => {
  console.log(`\n── ${t}`);
  transcripcion.push(`\n════ ${t} ════`);
};

const chat: MensajeSimulado[] = [];
const transcripcion: string[] = [];
const sale = (texto: string, etiqueta: string) => {
  chat.push({ direccion: "saliente", contenido: texto, mediaTipo: null });
  transcripcion.push(`\n[${etiqueta}]\n${texto}`);
};
const entra = (texto: string) => {
  chat.push({ direccion: "entrante", contenido: texto, mediaTipo: null });
  transcripcion.push(`\n>>> PEDRO: ${texto}`);
};

async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((p) => p.id as string);
  if (!ids.length) return;
  await db.from("seleccion_envios_laboratorio").delete().overlaps("proceso_ids", ids);
  await db.from("seleccion_adjuntos").delete().in("proceso_id", ids);
  await db.from("seleccion_examenes").delete().in("proceso_id", ids);
  await db.from("seleccion_pruebas_manejo").delete().in("proceso_id", ids);
  await db.from("seleccion_citas").delete().in("proceso_id", ids);
  await db.from("procesos_contratacion_eventos").delete().in("proceso_id", ids);
  await db.from("procesos_contratacion").delete().in("id", ids);
}

await limpiar();
try {
  // ── Lo que ya traía el chat de Pedro ──────────────────────────────────────
  const { data: fila, error } = await db.from("seleccion_chats_prueba").select("estado").eq("id", CHAT_PEDRO).single();
  if (error) throw new Error(`No se pudo leer el chat de Pedro: ${error.message}`);
  const estado = fila.estado as { chat: (MensajeSimulado & { id: number })[]; runt: ResumenRunt | null };
  // Hasta la hoja de vida (mensaje 20): lo de después es lo que cambió.
  for (const m of estado.chat.filter((x) => x.id <= 20)) chat.push({ direccion: m.direccion, contenido: m.contenido, mediaTipo: m.mediaTipo, ...(m.lectura ? { lectura: m.lectura } : {}) });
  transcripcion.push(`(Conversación real de Pedro hasta la hoja de vida: ${chat.length} mensajes)`);

  const { data: p, error: eP } = await db
    .from("procesos_contratacion")
    .insert({
      fecha_creacion: fechaBogota(new Date().toISOString()),
      nombre: "PEDRO LUIS TORRES MERCADO",
      cedula: `${PREFIJO}01`,
      estado: "antecedentes",
      origen: "chat_prueba",
      medio_postulacion: "whatsapp",
      reingreso: false,
      autorizacion_datos: "si",
      edad: 35,
      ciudad_residencia: "Soledad",
      experiencia_meses: 24,
      licencia_categoria: "C2, B2",
      licencia_verificada_runt: true,
      simit_valor: 0,
      antecedentes: "ok",
      antecedentes_resultado: "limpio",
    })
    .select("id")
    .single();
  if (eP) throw new Error(eP.message);
  const id = p.id as string;
  const hoy = fechaBogota(new Date().toISOString());

  /** El contexto que arma el chat de prueba para el asistente (como prueba-actions › contexto). */
  async function contexto(): Promise<ContextoSimulacion> {
    const { config, claves } = await getAgenteConClaves();
    const [ctx, reglas, cita, preguntaExamen, correoPsico, enRevision, cerrado, examen] = await Promise.all([
      contextoSeleccion(),
      leerReglas(),
      citaParaAsistente(id),
      preguntaExamenDeProceso(id),
      correoParaAsistenteDeProceso(id),
      antecedentesEnRevisionDeProceso(id),
      cerradoPorAntecedentesDeProceso(id),
      examenParaAsistente(id),
    ]);
    const ahora = new Date();
    return {
      config: ctx.respuestaReservada ? { ...config, respuestaReservada: ctx.respuestaReservada } : config,
      claves,
      autorizacion: ctx.autorizacion,
      bienvenida: ctx.bienvenida,
      nombreAsistente: ctx.nombreAsistente,
      respuestas: ctx.respuestas,
      requisitos: ctx.requisitos,
      reglas,
      nombreContacto: "PEDRO LUIS TORRES MERCADO",
      preguntaExamen: cerrado ? null : preguntaExamen,
      correoPsico: cerrado ? null : correoPsico,
      examen: cerrado ? null : examen,
      ahora,
      licenciaVerificada: licenciaVerificadaDesdeRunt(estado.runt ?? null, reglas, ahora, null),
      antecedentesEnRevision: enRevision,
      cerradoPorAntecedentes: cerrado,
      autorizada: true,
      cita,
      regreso: null,
    };
  }

  /** Un mensaje de Pedro, como lo atiende el chat de prueba (enviar → respuestaCitaPrueba / exámenes / asistente). */
  async function pedroEscribe(texto: string): Promise<{ atendidoPorGestivo: boolean; respuesta: string | null }> {
    entra(texto);
    const { data: pr } = await db.from("procesos_contratacion").select("estado").eq("id", id).single();
    const est = pr?.estado as string;
    if (["citado", "prueba_manejo", "reconocimiento_ruta"].includes(est)) {
      const { data: cs } = await db.from("seleccion_citas").select("*").eq("proceso_id", id);
      const cita = ((cs ?? []) as Cita[]).filter((c) => citaVigente(c) && c.tipo === "prueba_manejo").sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      const r = cita ? interpretarRespuestaCita(texto) : null;
      if (cita && r === "confirma" && cita.estado !== "confirmada") {
        await confirmarCita(cita.id, actor);
        transcripcion.push("   (Gestivo: la cita quedó confirmada)");
      }
      if (cita && r === "pide_otra_fecha" && cita.estado !== "pide_otra_fecha") {
        await pedirOtraFecha(cita.id, actor);
        transcripcion.push("   (Gestivo: quedó «Pide otra fecha»)");
      }
    }
    if (["en_examenes", "en_examenes_fase2", "reconocimiento_ruta"].includes(est)) {
      const r = await atenderRespuestaExamenesPrueba(id, texto);
      if (r.atendida) {
        transcripcion.push("   (Gestivo atiende la respuesta como el webhook; el asistente no responde)");
        for (const m of r.mensajes) sale(`${m.texto}${m.adjuntos?.length ? `\n📎 ${m.adjuntos.join(", ")}` : ""}`, `Gestivo · ${m.clave}`);
        return { atendidoPorGestivo: true, respuesta: r.mensajes.map((m) => m.texto).join("\n") };
      }
    }
    const ctx = await contexto();
    const resp = await responderSimulado(chat, ctx);
    let textoResp = resp.motivo && !resp.texto ? ctx.config.mensajeTransferencia.trim() : resp.texto;
    if (resp.reprogramar && ctx.cita && !resp.motivo) {
      const movida = await reprogramarPorAsistente(id, resp.reprogramar, actor);
      transcripcion.push(movida.ok ? `   (Gestivo: el asistente movió la cita al ${resp.reprogramar})` : `   (Gestivo: no se pudo mover la cita: ${movida.error})`);
      if (!movida.ok) textoResp = "Déjame confirmar ese día con Gestión Humana y te escribimos enseguida para dejar lista tu nueva cita.";
    }
    sale(textoResp, `IA · ${resp.modelo ?? "sin modelo"}${resp.motivo ? ` · pasa a una persona (${resp.motivo})` : ""}`);
    return { atendidoPorGestivo: false, respuesta: textoResp };
  }

  // ── 1. Queda «Listo para citar» (antes: «Lo revisé a mano» a las 8:15) ────
  titulo("1. Queda listo para citar: la cita automática");
  const auto = await citarAutomaticamente(id);
  revisar("lo cita solo", !!auto?.ok, auto);
  const cita1 = await citaVigenteDeProceso(id);
  revisar(`la cita es desde mañana, no hoy (${cita1 ? `${fechaEnTexto(cita1.fecha)} ${horaEnTexto(cita1.hora)}` : "sin cita"})`, !!cita1 && cita1.fecha > hoy, cita1);
  // Lo que pone el chat de prueba (citacionAutomaticaPrueba): la citación entra al chat.
  const vista = cita1 ? await vistaCitacion(id, { fecha: cita1.fecha, hora: cita1.hora }) : null;
  revisar("la citación llega al chat (antes no llegaba)", !!vista?.texto && cita1?.creada_por === "Sistema", { creada_por: cita1?.creada_por });
  if (vista?.texto) sale(vista.texto, "Citación automática (quedó «Listo para citar»)");

  // ── 2. Los mismos mensajes de Pedro con la cita ──────────────────────────
  titulo("2. Pedro pregunta, confirma y luego no puede (matrimonio)");
  const r1 = await pedroEscribe("hola como va mi proceso?");
  revisar("la IA le dice su cita (la del día que es, no «hoy»)", !!r1.respuesta && !/\bhoy\b/i.test(r1.respuesta), r1.respuesta);
  await pedroEscribe("si confirmo");
  await pedroEscribe("anda que pena no voy asistir a la cita");
  await pedroEscribe("porque tengo un matrimonio");
  await pedroEscribe("para ucnado me podrias reprogramar?");
  await pedroEscribe("ok asistire ese dia");
  const cita2 = await citaVigenteDeProceso(id);
  revisar(`la cita se movió al siguiente día disponible (${cita2 ? `${fechaEnTexto(cita2.fecha)} ${horaEnTexto(cita2.hora)}` : "sin cita"})`, !!cita2 && !!cita1 && cita2.fecha > cita1.fecha, { antes: cita1?.fecha, ahora: cita2?.fecha });

  // ── 3. El profesor marca «Llegó» antes de tiempo y aprueba ───────────────
  titulo("3. El profesor marca «Llegó» hoy (la cita era otro día) y aprueba");
  if (cita2) await marcarLlegada(cita2.id, actor);
  const { data: cita3 } = await db.from("seleccion_citas").select("fecha, estado").eq("id", cita2?.id ?? "").maybeSingle();
  revisar("la cita pasa a hoy (antes quedaba en el día futuro)", cita3?.fecha === hoy && cita3?.estado === "asistio", cita3);
  const rp = await registrarPrueba(id, { resultado: "aprobo", rutaEscrita: "si", partesMotor: "si" }, actor);
  revisar("guarda «aprobó»", rp.ok, rp);
  const plan = await planExamenes(id);
  transcripcion.push(
    `\n(«Listo para exámenes» propone: ${fechaEnTexto(plan.fecha)} ${horaEnTexto(plan.hora)} en ${plan.laboratorio}. Si toca «Elegir otra fecha y hora», le sale marcado ${plan.laboratorios.find((l) => l.id === plan.laboratorioFechaElegida)?.nombre ?? "—"}; puede elegir entre ${plan.laboratorios.map((l) => l.nombre).join(", ")}.)`
  );
  revisar(`los exámenes quedan después de hoy y después de la prueba (${fechaEnTexto(plan.fecha)} ${horaEnTexto(plan.hora)})`, plan.fecha > hoy, plan);
  const ex = await enviarAExamenes(id, actor);
  revisar("lo envía a exámenes", ex.ok, ex);
  if (ex.texto) sale(ex.texto, "Cita de exámenes, fase 1");

  // ── 4. «No tengo cuenta» y lo que preguntó después ───────────────────────
  titulo("4. Pedro responde «No tengo cuenta» y pregunta por los exámenes");
  const b = await pedroEscribe("No tengo cuenta");
  revisar("Gestivo atiende la respuesta del banco (antes la contestaba la IA)", b.atendidoPorGestivo, b);
  const { data: pb } = await db.from("procesos_contratacion").select("banco_cuenta, rutas_preguntado_at").eq("id", id).single();
  revisar("queda guardado «no tiene cuenta» y sigue el aviso de las rutas", pb?.banco_cuenta === "no" && !!pb?.rutas_preguntado_at, pb);
  const q1 = await pedroEscribe("pero ya hice la prueba y en el mensaje anterior sale que me dieron orden de examanes medicos. lo que no tengo es cuenta en el banco de bogota");
  const q2 = await pedroEscribe("no tengo cita de examanes medicos?");
  const q3 = await pedroEscribe("ya asisti a la prueba");
  const niega = /no (sali[oó]|lo envi|te lo puedo confirmar|puedo confirmar|lo puedo verificar|puedo verificar)|no vayas|no ir a esa direcci[oó]n|no tengo registrada|fecha ya pas[oó]|es el que vale/i;
  for (const [n, q] of [["1", q1], ["2", q2], ["3", q3]] as const) {
    revisar(`respuesta ${n}: la IA no desconoce el mensaje de exámenes`, !!q.respuesta && !niega.test(q.respuesta), q.respuesta);
  }
  revisar("la IA le recuerda la cita de exámenes (fecha o laboratorio)", [q1, q2, q3].some((q) => !!q.respuesta && (q.respuesta.includes(fechaEnTexto(plan.fecha).split(" ").slice(1).join(" ")) || (plan.laboratorio ? q.respuesta.toUpperCase().includes(plan.laboratorio.toUpperCase().split(" ")[0]) : false))), [q1.respuesta, q2.respuesta]);
  const r2 = await pedroEscribe("conozco 2 rutas");
  revisar("la respuesta de las rutas la atiende Gestivo", r2.atendidoPorGestivo, r2);
} finally {
  await limpiar();
  const { count } = await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`);
  console.log(`\nLimpieza: quedan ${count ?? 0} candidatos de esta prueba.`);
  if (salida) writeFileSync(salida, transcripcion.join("\n"), "utf8");
}

console.log(`\n${ok} bien, ${fallos.length} mal.`);
if (fallos.length) {
  for (const f of fallos) console.log(` - ${f}`);
  process.exitCode = 1;
}
