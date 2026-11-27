// La fase 1 de punta a punta (24-nov-2026): del «Listo para exámenes» del
// profesor hasta que llega el resultado del laboratorio, en todos los casos.
//   1. Paso a exámenes (prueba aprobada y escuela terminada): cita, laboratorio,
//      mensaje con la pregunta del banco y orden automática al laboratorio.
//   2. Las respuestas del aspirante: banco, aviso del reconocimiento, rutas y correo.
//   3. La orden: por correo (Biobac) y por WhatsApp (Rescate), sin repetirse.
//   4. El resultado del laboratorio: la frase acordada, sus variantes, no apto,
//      aplazado, otro resultado, «en proceso», sin nombre (uno y dos esperando),
//      varias personas, cédula desconocida, un saludo, otra fase, frases propias
//      del laboratorio, un PDF, por el webhook y lo que queda para una persona.
//
// Usa la IA de «Documentos» para leer al laboratorio (unas 12 llamadas
// pequeñas). Los aspirantes son del chat de prueba: al aspirante no le sale
// nada; la orden sale de verdad solo si el laboratorio apunta a un correo o
// número de la lista de pruebas (si no, simulada). Crea un laboratorio temporal
// «LAB PRUEBA FASE 1» (para que nadie real espere resultado allí), aspirantes
// con cédula 99900095NN y lo borra todo al terminar.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-fase-1.mts
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { confirmarAviso, descartarAviso, leerYGuardarAvisos, procesarMensajeLaboratorio } from "@/lib/seleccion/laboratorio-lectura";
import { asignarLaboratorio, enviarOrdenAlCitar, hiloLaboratorio, leerLaboratorios } from "@/lib/seleccion/laboratorios-servidor";
import { cerrarPorExamenes, decidirNoApto, examenesPorRevisar, registrarExamen } from "@/lib/seleccion/examenes-servidor";
import { crearCitaSimple } from "@/lib/seleccion/agenda-servidor";
import { cambiarEstadoProceso } from "@/lib/contratacion/servidor";
import { cerradoPorAntecedentesDeConversacion } from "@/lib/seleccion/servidor";
import { procesarCorreoPsico } from "@/lib/seleccion/correo-psico-servidor";
import { pantallaReconocimiento } from "@/lib/seleccion/reconocimiento-servidor";
import { enviarAExamenes, planExamenes, registrarClase, registrarPrueba } from "@/lib/seleccion/profesor-servidor";
import { atiende } from "@/lib/seleccion/laboratorios";
import { horaEnTexto } from "@/lib/seleccion/agenda";
import { horaBogota } from "@/lib/comunicaciones/seguimiento";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { preguntaExamenDeConversacion, procesarRespuestaExamenes } from "@/lib/seleccion/respuestas-examenes-servidor";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");
const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-fase1@gestivo.test" };
const PREFIJO = "99900095";
const TEL_LAB = "573009990995";
const TEL_ASP = "573009990950";
const NOMBRE_LAB = "LAB PRUEBA FASE 1";

let ok = 0;
const fallos: string[] = [];
let seccion = "";
const titulo = (t: string) => {
  seccion = t;
  console.log(`\n── ${t}`);
};
const revisar = (nombre: string, condicion: unknown, detalle?: unknown) => {
  if (condicion) {
    ok++;
    console.log(`  ✔ ${nombre}`);
  } else {
    const d = detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 500)}` : "";
    fallos.push(`${seccion}: ${nombre}${d}`);
    console.log(`  ✘ ${nombre}${d}`);
  }
};

const archivosWhatsapp: string[] = [];
async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: adj } = await db.from("seleccion_adjuntos").select("ruta").in("proceso_id", ids);
    const rutas = (adj ?? []).map((a) => a.ruta as string).filter(Boolean);
    if (rutas.length) await db.storage.from("seleccion").remove(rutas);
    await db.from("seleccion_adjuntos").delete().in("proceso_id", ids);
    await db.from("seleccion_envios_laboratorio").delete().overlaps("proceso_ids", ids);
    await db.from("seleccion_avisos_laboratorio").delete().in("proceso_id", ids);
    await db.from("seleccion_examenes").delete().in("proceso_id", ids);
    await db.from("seleccion_pruebas_manejo").delete().in("proceso_id", ids);
    await db.from("seleccion_clases_escuela").delete().in("proceso_id", ids);
    await db.from("seleccion_citas").delete().in("proceso_id", ids);
    await db.from("procesos_contratacion_eventos").delete().in("proceso_id", ids);
    await db.from("wa_conversaciones").update({ proceso_id: null }).in("proceso_id", ids);
  }
  for (const tel of [TEL_LAB, TEL_ASP]) {
    const { data: c } = await db.from("wa_contactos").select("id").eq("telefono", tel).maybeSingle();
    if (!c) continue;
    const { data: convs } = await db.from("wa_conversaciones").select("id").eq("contacto_id", c.id);
    const cids = (convs ?? []).map((v) => v.id as string);
    if (cids.length) {
      const { data: ms } = await db.from("wa_mensajes").select("id").in("conversacion_id", cids);
      const mids = (ms ?? []).map((m) => m.id as string);
      if (mids.length) await db.from("seleccion_avisos_laboratorio").delete().in("wa_mensaje_id", mids);
      await db.from("wa_mensajes").delete().in("conversacion_id", cids);
      await db.from("wa_conversaciones").delete().in("id", cids);
    }
    await db.from("wa_contactos").delete().eq("id", c.id);
  }
  if (ids.length) await db.from("procesos_contratacion").delete().in("id", ids);
  const { data: labsTemp } = await db.from("seleccion_laboratorios").select("id").ilike("nombre", `${NOMBRE_LAB}%`);
  for (const lab of labsTemp ?? []) {
    await db.from("seleccion_avisos_laboratorio").delete().eq("laboratorio_id", lab.id);
    await db.from("seleccion_envios_laboratorio").delete().eq("laboratorio_id", lab.id);
    await db.from("seleccion_laboratorios").delete().eq("id", lab.id);
  }
  if (archivosWhatsapp.length) await db.storage.from("whatsapp").remove(archivosWhatsapp);
}

let n = 0;
async function crearProceso(nombre: string, estado: string, extra: Record<string, unknown> = {}): Promise<{ id: string; cedula: string }> {
  const cedula = `${PREFIJO}${String(++n).padStart(2, "0")}`;
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({ fecha_creacion: new Date().toISOString().slice(0, 10), nombre, cedula, estado, origen: "chat_prueba", medio_postulacion: "whatsapp", simit_valor: 0, reingreso: false, autorizacion_datos: "si", ...extra })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, cedula };
}
const proceso = async (id: string) => (await db.from("procesos_contratacion").select("*").eq("id", id).single()).data as Record<string, unknown>;
const examen = async (id: string, fase: 1 | 2) => (await db.from("seleccion_examenes").select("resultado, observacion, propuesto_por_laboratorio").eq("proceso_id", id).eq("fase", fase).maybeSingle()).data;
const avisos = async (ids: string[]) =>
  ids.length ? ((await db.from("seleccion_avisos_laboratorio").select("id, proceso_id, fase, resultado_propuesto, estado, por_frase").in("id", ids)).data ?? []) : [];

/** Un aspirante esperando el resultado de la fase 1 en el laboratorio temporal. */
async function esperando(nombre: string, labId: string) {
  const p = await crearProceso(nombre, "en_examenes", { laboratorio_id: labId });
  return p;
}

/** Lo que manda el laboratorio, leído como lo lee el webhook (sin IA de por medio en el armado). */
async function llega(texto: string, labId: string, extra: { mediaPath?: string; mime?: string; nombreArchivo?: string } = {}) {
  const r = await leerYGuardarAvisos({ texto, laboratorioId: labId, simulado: true, ...extra });
  return r;
}

await limpiar();
let labTemp = "";
try {
  titulo("Preparación");
  const labs = await leerLaboratorios();
  const biobac = labs.find((l) => /biobac/i.test(l.nombre));
  const rescate = labs.find((l) => /rescate/i.test(l.nombre));
  revisar("Biobac (correo) y Rescate (WhatsApp) configurados", biobac?.canal === "correo" && rescate?.canal === "whatsapp", labs.map((l) => `${l.nombre}:${l.canal}`));
  const { data: auto } = await db.from("seleccion_ajustes").select("valor").eq("clave", "orden_laboratorio_automatica").maybeSingle();
  revisar("el envío automático de la orden está activo", auto?.valor !== false, auto);
  const { data: lt, error: eLab } = await db
    .from("seleccion_laboratorios")
    .insert({ nombre: NOMBRE_LAB, canal: "whatsapp", whatsapp: TEL_LAB, activo: true, predeterminado: false, orden: 99, actualizado_por: actor.userEmail })
    .select("id")
    .single();
  if (eLab) throw new Error(`No se pudo crear el laboratorio temporal: ${eLab.message}`);
  labTemp = lt.id as string;
  // Para que el reparto de los de prueba no lo elija mientras corre la batería, solo atiende el domingo.
  await db.from("seleccion_laboratorios").update({ dias_atencion: [0] }).eq("id", labTemp);

  // ── 1 ───────────────────────────────────────────────────────────────────
  titulo("1. «Listo para exámenes» después de la prueba de manejo");
  const a = await crearProceso("ASPIRANTE FASE UNO PRUEBA", "citado");
  const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TEL_ASP, nombre: "Aspirante fase 1" }).select("id").single();
  const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: a.id, ultimo_entrante_at: new Date().toISOString() }).select("id").single();
  const convId = conv!.id as string;
  const plan = await planExamenes(a.id);
  const rp = await registrarPrueba(a.id, { resultado: "aprobo", rutaEscrita: "si", partesMotor: "si" }, actor);
  revisar("el profesor guarda «aprobó»", rp.ok, rp);
  revisar("guardar la prueba no lo cita todavía (falta «Listo para exámenes»)", (await proceso(a.id)).estado === "citado");
  const ex = await enviarAExamenes(a.id, actor);
  revisar("«Listo para exámenes» lo cita", ex.ok, ex);
  let p = await proceso(a.id);
  revisar("queda en exámenes, fase 1, con laboratorio y fecha", p.estado === "en_examenes" && !!p.laboratorio_id && !!p.fecha_examenes, { estado: p.estado, lab: p.laboratorio_id, fecha: p.fecha_examenes });
  revisar("en el día que anunciaba el plan", p.fecha_examenes === plan.fecha, { plan, fecha: p.fecha_examenes });
  const { data: citaA } = await db.from("seleccion_citas").select("id, fecha, hora, orden_laboratorio_at").eq("proceso_id", a.id).eq("tipo", "examen_f1").single();
  revisar("con la cita de la fase 1 a la hora del laboratorio", citaA && citaA.fecha === p.fecha_examenes && String(citaA.hora).slice(0, 5) === plan.hora, citaA);
  const labA = labs.find((l) => l.id === p.laboratorio_id);
  revisar("el mensaje dice su laboratorio, la fecha y pregunta por el Banco de Bogotá", !!labA && ex.texto?.toUpperCase().includes(labA.nombre.toUpperCase().split(" ")[0]) && /Fecha:/.test(ex.texto ?? "") && /Banco de Bogot/i.test(ex.texto ?? ""), ex.texto);
  revisar("queda marcada la pregunta del banco", !!p.banco_preguntado_at);
  revisar("y la orden al laboratorio sale enseguida (a su destino de prueba, o simulada)", !!citaA?.orden_laboratorio_at, citaA);
  if (labA) {
    const hilo = await hiloLaboratorio(labA.id, { soloPrueba: true });
    revisar(`la orden queda en la conversación con ${labA.nombre} con el aspirante`, hilo.some((m) => m.direccion === "saliente" && m.texto.includes("ASPIRANTE FASE UNO PRUEBA")), hilo.slice(-1));
  }
  revisar("pulsarlo otra vez no lo vuelve a citar", !(await enviarAExamenes(a.id, actor)).ok);
  const { count: citasF1 } = await db.from("seleccion_citas").select("id", { count: "exact", head: true }).eq("proceso_id", a.id).eq("tipo", "examen_f1");
  revisar("sigue con una sola cita de fase 1", citasF1 === 1, citasF1);

  titulo("1b. «Listo para exámenes» al terminar la escuela");
  const e = await crearProceso("ASPIRANTE ESCUELA PRUEBA", "en_escuela");
  const rc = await registrarClase(e.id, { resultado: "listo", asistio: true }, actor);
  revisar("el profesor guarda la clase «listo»", rc.ok, rc);
  const exE = await enviarAExamenes(e.id, actor);
  revisar("y «Listo para exámenes» lo cita a la fase 1", exE.ok && (await proceso(e.id)).estado === "en_examenes", exE);
  const sinPrueba = await crearProceso("ASPIRANTE SIN PRUEBA", "citado");
  revisar("sin la prueba aprobada no se puede", !(await enviarAExamenes(sinPrueba.id, actor)).ok);

  titulo("1c. El profesor elige la fecha, la hora y el laboratorio (27-nov-2026)");
  const fp = await crearProceso("ASPIRANTE FECHA PROFESOR", "citado");
  await registrarPrueba(fp.id, { resultado: "aprobo", rutaEscrita: "si", partesMotor: "si" }, actor);
  const planFp = await planExamenes(fp.id);
  revisar("el plan trae los laboratorios activos para elegir y la hora de ahora", planFp.laboratorios.length > 0 && !!planFp.ahora.fecha && !!planFp.ahora.hora, planFp);
  const hoyB = fechaBogota(new Date().toISOString());
  const ahoraB = horaBogota(new Date());
  if (rescate) {
    const antes = await enviarAExamenes(fp.id, actor, { fecha: hoyB, hora: "00:01", laboratorioId: rescate.id });
    revisar("no deja una hora anterior a este momento", !antes.ok && /anteriores/.test(antes.error ?? ""), antes);
    const festivo = await enviarAExamenes(fp.id, actor, { fecha: "2026-12-08", hora: "07:00", laboratorioId: rescate.id });
    revisar("no deja un festivo (8 de diciembre)", !festivo.ok && /festivo/.test(festivo.error ?? ""), festivo);
    const noAtiende = await enviarAExamenes(fp.id, actor, { fecha: "2026-12-01", hora: "07:00", laboratorioId: labTemp });
    revisar("no deja un laboratorio que no atiende ese día", !noAtiende.ok && /no atiende/.test(noAtiende.error ?? ""), noAtiende);
    // Hoy dentro de una hora si Rescate atiende hoy y alcanza; si no, el siguiente día que atienda a las 7:15.
    const enUnaHora = (() => { const [h, m] = ahoraB.split(":").map(Number); const t = h * 60 + m + 60; return t < 23 * 60 ? `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` : null; })();
    let dia = hoyB;
    let hora = enUnaHora && atiende(rescate, hoyB) ? enUnaHora : "07:15";
    if (hora === "07:15") { do { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); dia = d.toISOString().slice(0, 10); } while (!atiende(rescate, dia)); }
    const okFp = await enviarAExamenes(fp.id, actor, { fecha: dia, hora, laboratorioId: rescate.id });
    revisar(`con fecha válida lo cita (${dia} ${hora}${dia === hoyB ? ", el mismo día" : ""})`, okFp.ok, okFp);
    const pFp = await proceso(fp.id);
    const { data: citaFp } = await db.from("seleccion_citas").select("fecha, hora, orden_laboratorio_at").eq("proceso_id", fp.id).eq("tipo", "examen_f1").maybeSingle();
    revisar("la cita queda en la fecha y la hora elegidas", citaFp?.fecha === dia && String(citaFp?.hora).slice(0, 5) === hora && pFp.fecha_examenes === dia, citaFp);
    revisar("en el laboratorio elegido", pFp.laboratorio_id === rescate.id, pFp.laboratorio_id);
    revisar("el mensaje dice esa hora", (okFp.texto ?? "").includes(horaEnTexto(hora)), okFp.texto);
    revisar("y la orden sale enseguida", !!citaFp?.orden_laboratorio_at, citaFp);
  }

  // ── 2 ───────────────────────────────────────────────────────────────────
  titulo("2. Las respuestas del aspirante en la fase 1");
  const escribe = async (texto: string) => {
    const { data: m } = await db.from("wa_mensajes").insert({ conversacion_id: convId, direccion: "entrante", contenido: texto, timestamp: new Date().toISOString() }).select("id").single();
    return procesarRespuestaExamenes(convId, m!.id as string);
  };
  revisar("espera la respuesta del banco", (await preguntaExamenDeConversacion(convId)) === "banco");
  revisar("«no tengo cuenta»: Gestivo responde", await escribe("no tengo cuenta"));
  p = await proceso(a.id);
  revisar("queda «no» y le sale el aviso del reconocimiento con la pregunta de rutas", p.banco_cuenta === "no" && !!p.rutas_preguntado_at && p.reconocimiento_estado === "pendiente", { banco: p.banco_cuenta, rutas: p.rutas_preguntado_at, reco: p.reconocimiento_estado });
  revisar("«conozco tres rutas»: Gestivo responde", await escribe("conozco tres rutas"));
  p = await proceso(a.id);
  revisar("queda por verificar y se le pide el correo", p.rutas_declaradas === 3 && p.reconocimiento_estado === "por_verificar" && p.correo_estado === "pedido", { rutas: p.rutas_declaradas, reco: p.reconocimiento_estado, correo: p.correo_estado });

  // ── 3 ───────────────────────────────────────────────────────────────────
  titulo("3. La orden al laboratorio por cada canal");
  for (const lab of [biobac, rescate].filter(Boolean) as NonNullable<typeof biobac>[]) {
    const o = await crearProceso(`ASPIRANTE ORDEN ${lab.canal.toUpperCase()}`, "en_examenes");
    const asig = await asignarLaboratorio(o.id, lab.id, actor);
    const manana = new Date(Date.now() + 86_400_000);
    while (manana.getUTCDay() === 0) manana.setUTCDate(manana.getUTCDate() + 1);
    const fecha = manana.toISOString().slice(0, 10);
    const citaId = await crearCitaSimple(o.id, "examen_f1", { fecha, hora: "06:30" }, actor);
    const c = { id: citaId };
    await enviarOrdenAlCitar(c!.id as string, actor);
    const { data: c2 } = await db.from("seleccion_citas").select("orden_laboratorio_at").eq("id", c!.id).single();
    const { data: envs } = await db.from("seleccion_envios_laboratorio").select("canal, resultado, proceso_ids").contains("proceso_ids", [o.id]);
    // Con el laboratorio apuntando a un destino de prueba sale de verdad («enviado»); si no, simulada.
    revisar(
      `${lab.nombre} (${lab.canal}): la orden sale (${envs?.[0]?.resultado ?? "—"}) y marca la cita`,
      asig.ok && !!c2?.orden_laboratorio_at && envs?.length === 1 && ["simulado", "enviado"].includes(envs[0].resultado as string),
      { asig, envs }
    );
    await enviarOrdenAlCitar(c!.id as string, actor);
    const { count } = await db.from("seleccion_envios_laboratorio").select("id", { count: "exact", head: true }).contains("proceso_ids", [o.id]);
    revisar(`${lab.nombre}: no se repite`, count === 1, count);
  }

  // ── 4 ───────────────────────────────────────────────────────────────────
  titulo("4a. La frase acordada exacta, con cédula: apto y a la fase 2");
  const f1 = await esperando("CARLOS ANDRES PEREZ FRASE", labTemp);
  let r = await llega(`Buenas tardes. Paciente CARLOS ANDRES PEREZ FRASE CC ${f1.cedula}: Sí, puede pasar a fase 2`, labTemp);
  p = await proceso(f1.id);
  revisar("se registra solo: fase 1 apta", r.confirmados.some((c) => c.procesoId === f1.id && c.fase === 1 && c.resultado === "apto") && (await examen(f1.id, 1))?.resultado === "apto", r);
  revisar("pasa a la fase 2 con su cita", p.estado === "en_examenes_fase2" && !!p.fecha_examenes_fase2, { estado: p.estado });
  const t2 = r.confirmados.find((c) => c.procesoId === f1.id)?.texto ?? "";
  revisar("el mensaje de la fase 2 es en ayunas y ya no pregunta por las rutas", /ayuno/i.test(t2) && !/rutas/i.test(t2), t2);
  revisar("el aviso queda confirmado por frase", (await avisos(r.ids)).every((x) => x.estado === "confirmado" && x.por_frase), await avisos(r.ids));

  titulo("4b. La misma frase repetida cuando ya está en la fase 2: no registra la fase 2");
  r = await llega(`CARLOS ANDRES PEREZ FRASE CC ${f1.cedula}: Sí, puede pasar a fase 2`, labTemp);
  revisar("no confirma nada solo", !r.confirmados.length, r.confirmados);
  revisar("la fase 2 sigue sin resultado", !(await examen(f1.id, 2)), await examen(f1.id, 2));
  revisar("y sigue en fase 2", (await proceso(f1.id)).estado === "en_examenes_fase2");

  titulo("4c. Una variante de la frase (la reconoce la IA): apto");
  const f2 = await esperando("LUISA FERNANDA GOMEZ VARIANTE", labTemp);
  r = await llega(`Buen día. La señora Luisa Fernanda Gómez Variante, cédula ${f2.cedula}, puede continuar con la segunda fase.`, labTemp);
  revisar("apto por la variante", (await examen(f2.id, 1))?.resultado === "apto" && (await proceso(f2.id)).estado === "en_examenes_fase2", { r: r.lecturas, ex: await examen(f2.id, 1) });

  titulo("4d. La frase negada: no apto (con la propuesta de cierre)");
  const f3 = await esperando("JORGE IVAN RIOS NEGADO", labTemp);
  r = await llega(`JORGE IVAN RIOS NEGADO CC ${f3.cedula}: No puede pasar a fase 2, positivo para cocaína.`, labTemp);
  const ex3 = await examen(f3.id, 1);
  revisar("queda no apto, con lo que dijo el laboratorio", ex3?.resultado === "no_apto" && /coca/i.test(String(ex3?.observacion)), { ex3, lect: r.lecturas });
  revisar("no avanza: sigue en fase 1 hasta que una persona cierre", (await proceso(f3.id)).estado === "en_examenes");
  revisar("cerrar por exámenes lo deja en cierre", (await cerrarPorExamenes(f3.id, actor)).ok && (await proceso(f3.id)).estado === "cierre");

  titulo("4e. Aplazado: sigue en la fase 1");
  const f4 = await esperando("ANDREA PAOLA DIAZ APLAZADA", labTemp);
  r = await llega(`ANDREA PAOLA DIAZ APLAZADA CC ${f4.cedula}: aplazada, debe repetir la radiografía de columna.`, labTemp);
  const ex4 = await examen(f4.id, 1);
  revisar("queda aplazado con el motivo y sigue en fase 1", ex4?.resultado === "aplazado" && (await proceso(f4.id)).estado === "en_examenes", { ex4, lect: r.lecturas });
  r = await llega(`ANDREA PAOLA DIAZ APLAZADA CC ${f4.cedula}: Sí, puede pasar a fase 2`, labTemp);
  revisar("luego la frase de apto la pasa a la fase 2", (await examen(f4.id, 1))?.resultado === "apto" && (await proceso(f4.id)).estado === "en_examenes_fase2", await examen(f4.id, 1));

  titulo("4f. Otro resultado (sin la frase): no apto");
  const f5 = await esperando("PEDRO PABLO SUAREZ OTRO", labTemp);
  r = await llega(`PEDRO PABLO SUAREZ OTRO, CC ${f5.cedula}. Resultado: apto con restricciones, usa lentes.`, labTemp);
  revisar("cualquier otro resultado en la fase 1 cuenta como no apto", (await examen(f5.id, 1))?.resultado === "no_apto", { ex: await examen(f5.id, 1), lect: r.lecturas });

  titulo("4g. «En proceso»: no decide, queda para una persona");
  const f6 = await esperando("MARIA JOSE LOPEZ PROCESO", labTemp);
  r = await llega(`MARIA JOSE LOPEZ PROCESO CC ${f6.cedula}: los resultados todavía están en proceso, mañana los enviamos.`, labTemp);
  const av6 = await avisos(r.ids);
  revisar("deja un aviso pendiente asociado, sin resultado", av6.length === 1 && av6[0].estado === "pendiente" && av6[0].proceso_id === f6.id && !av6[0].resultado_propuesto, av6);
  revisar("sin examen registrado", !(await examen(f6.id, 1)));
  const man = await confirmarAviso(av6[0]?.id, { procesoId: f6.id, fase: 1, resultado: "apto" }, actor);
  revisar("una persona lo confirma a mano como apto y pasa a la fase 2", man.ok && (await proceso(f6.id)).estado === "en_examenes_fase2", man);

  titulo("4h. Solo la frase, sin nombre, con un único aspirante esperando en ese laboratorio");
  // En este punto, en el laboratorio temporal solo espera la fase 1 quien se crea ahora.
  const { data: quedan } = await db.from("procesos_contratacion").select("id").eq("laboratorio_id", labTemp).eq("estado", "en_examenes");
  for (const q of quedan ?? []) await db.from("procesos_contratacion").update({ estado: "pendiente" }).eq("id", q.id);
  const f7 = await esperando("SANDRA MILENA ORTIZ UNICA", labTemp);
  r = await llega("Sí, puede pasar a fase 2", labTemp);
  revisar("es de él: apto", (await examen(f7.id, 1))?.resultado === "apto", { r: r.confirmados, lect: r.lecturas });

  titulo("4i. Solo la frase, sin nombre, con dos esperando: no adivina");
  const f8 = await esperando("RAUL ESTEBAN MORA DOS", labTemp);
  const f9 = await esperando("DIANA CAROLINA RUIZ DOS", labTemp);
  r = await llega("Sí, puede pasar a fase 2", labTemp);
  const av8 = await avisos(r.ids);
  revisar("a ninguno se le registra nada", !(await examen(f8.id, 1)) && !(await examen(f9.id, 1)));
  revisar("pero queda un aviso pendiente (apto, sin aspirante) para asignarlo a mano", av8.length === 1 && av8[0].estado === "pendiente" && !av8[0].proceso_id && av8[0].resultado_propuesto === "apto", av8);

  titulo("4j. Varias personas en un mensaje, con resultados distintos");
  r = await llega(
    `Resultados de hoy:\n1. RAUL ESTEBAN MORA DOS CC ${f8.cedula}: Sí, puede pasar a fase 2\n2. DIANA CAROLINA RUIZ DOS CC ${f9.cedula}: no puede continuar, positivo para marihuana`,
    labTemp
  );
  revisar("al primero, apto", (await examen(f8.id, 1))?.resultado === "apto", { ex: await examen(f8.id, 1), lect: r.lecturas });
  revisar("a la segunda, no apto", (await examen(f9.id, 1))?.resultado === "no_apto", { ex: await examen(f9.id, 1), lect: r.lecturas });

  titulo("4k. Una cédula que no está en exámenes");
  r = await llega("JUAN CAMILO NADIE CC 9990009999: Sí, puede pasar a fase 2", labTemp);
  const avK = await avisos(r.ids);
  revisar("queda un aviso pendiente sin aspirante", avK.length === 1 && avK[0].estado === "pendiente" && !avK[0].proceso_id, avK);
  revisar("una persona puede descartarlo", (await descartarAviso(avK[0]?.id, actor)).ok);

  titulo("4l. Un saludo o una pregunta no es un resultado");
  r = await llega("Buenos días, ¿a qué hora nos mandan la orden de mañana?", labTemp);
  revisar("no deja avisos", r.avisos === 0, r);

  titulo("4m. El laboratorio habla de la fase 2 de alguien que está en la fase 1");
  const f10 = await esperando("OSCAR DAVID PINTO OTRAFASE", labTemp);
  r = await llega(`OSCAR DAVID PINTO OTRAFASE CC ${f10.cedula}: fase 2 (audiometría, optometría y hemograma): apto.`, labTemp);
  revisar("no se registra solo", !(await examen(f10.id, 1)) && !(await examen(f10.id, 2)), { lect: r.lecturas, av: await avisos(r.ids) });
  revisar("queda para una persona", (await avisos(r.ids)).some((x) => x.estado === "pendiente"), await avisos(r.ids));

  titulo("4n. Frases propias del laboratorio (no apto y aplazado)");
  await db.from("seleccion_laboratorios").update({ frase_no_apto: "No continúa en el proceso", frase_aplazado: "Queda pendiente de nueva toma" }).eq("id", labTemp);
  const f11 = await esperando("KAREN LILIANA VEGA PROPIA", labTemp);
  const f12 = await esperando("FABIAN ANDRES CRUZ PROPIA", labTemp);
  await llega(`KAREN LILIANA VEGA PROPIA CC ${f11.cedula}: No continúa en el proceso`, labTemp);
  await llega(`FABIAN ANDRES CRUZ PROPIA CC ${f12.cedula}: Queda pendiente de nueva toma`, labTemp);
  revisar("su frase de no apto: no apto", (await examen(f11.id, 1))?.resultado === "no_apto", await examen(f11.id, 1));
  revisar("su frase de aplazado: aplazado", (await examen(f12.id, 1))?.resultado === "aplazado", await examen(f12.id, 1));
  await db.from("seleccion_laboratorios").update({ frase_no_apto: null, frase_aplazado: null }).eq("id", labTemp);

  titulo("4o. El resultado en un PDF");
  const f13 = await esperando("HECTOR MANUEL SALAS PDF", labTemp);
  const pdf = await PDFDocument.create();
  const hoja = pdf.addPage([595, 842]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  [
    "LABORATORIO CLINICO - RESULTADOS DE INGRESO",
    `Paciente: HECTOR MANUEL SALAS PDF   Documento: CC ${f13.cedula}`,
    "Pruebas: alcohol, marihuana, cocaina y radiografia de columna",
    "Concepto: Si, puede pasar a fase 2",
  ].forEach((linea, i) => hoja.drawText(linea, { x: 50, y: 780 - i * 24, size: 12, font: fuente }));
  const ruta = `pruebas/fase1-${Date.now()}.pdf`;
  const { error: eSub } = await db.storage.from("whatsapp").upload(ruta, Buffer.from(await pdf.save()), { contentType: "application/pdf" });
  if (!eSub) archivosWhatsapp.push(ruta);
  r = await llega("", labTemp, { mediaPath: ruta, mime: "application/pdf", nombreArchivo: "resultados.pdf" });
  revisar("lo lee del PDF: apto", (await examen(f13.id, 1))?.resultado === "apto", { eSub: eSub?.message, lect: r.lecturas });
  const { data: adj } = await db.from("seleccion_adjuntos").select("tipo").eq("proceso_id", f13.id);
  revisar("y el PDF queda en su carpeta (exámenes, fase 1)", adj?.some((x) => x.tipo === "examen_f1"), adj);

  titulo("4p. Por el webhook: un mensaje del número del laboratorio");
  const f14 = await esperando("GLORIA INES MEJIA WEBHOOK", labTemp);
  const { data: cl } = await db.from("wa_contactos").insert({ telefono: TEL_LAB, nombre: NOMBRE_LAB, tipo: "laboratorio" }).select("id").single();
  const { data: cvl } = await db.from("wa_conversaciones").insert({ contacto_id: cl!.id, ultimo_entrante_at: new Date().toISOString() }).select("id").single();
  const { data: ml } = await db
    .from("wa_mensajes")
    .insert({ conversacion_id: cvl!.id, direccion: "entrante", contenido: `GLORIA INES MEJIA WEBHOOK CC ${f14.cedula} sí puede pasar a fase 2`, timestamp: new Date().toISOString() })
    .select("id")
    .single();
  const nAv = await procesarMensajeLaboratorio(cvl!.id as string, ml!.id as string);
  revisar("lo reconoce como del laboratorio temporal y registra apto", nAv === 1 && (await examen(f14.id, 1))?.resultado === "apto", { nAv, ex: await examen(f14.id, 1) });
  const { data: avW } = await db.from("seleccion_avisos_laboratorio").select("laboratorio_id").eq("wa_mensaje_id", ml!.id);
  revisar("el aviso queda con el laboratorio", avW?.[0]?.laboratorio_id === labTemp, avW);

  titulo("4q. A mano: lo que exige registrar un resultado");
  const f15 = await esperando("NELSON JAVIER ARIAS MANUAL", labTemp);
  revisar("no apto sin motivo no se deja", !(await registrarExamen(f15.id, { fase: 1, resultado: "no_apto", observacion: "" }, actor)).ok);
  revisar("aplazado sin motivo no se deja", !(await registrarExamen(f15.id, { fase: 1, resultado: "aplazado", observacion: "" }, actor)).ok);
  revisar("la fase 2 antes de la fase 1 apta no se deja", !(await registrarExamen(f15.id, { fase: 2, resultado: "apto", observacion: "" }, actor)).ok);
  const m15 = await registrarExamen(f15.id, { fase: 1, resultado: "no_apto", observacion: "Radiografía con hallazgos" }, actor);
  revisar("no apto con motivo: propone el cierre", m15.ok && m15.proponeCierre, m15);

  // ── 4r ──────────────────────────────────────────────────────────────────
  titulo("4r. La radiografía que el laboratorio manda aparte (sin nombre) queda en la carpeta");
  // Otro laboratorio temporal: en el primero ya hubo resultados de muchos aspirantes en estos minutos.
  const { data: lb } = await db
    .from("seleccion_laboratorios")
    .insert({ nombre: `${NOMBRE_LAB} B`, canal: "whatsapp", whatsapp: "573009990996", activo: true, predeterminado: false, orden: 99, dias_atencion: [0], actualizado_por: actor.userEmail })
    .select("id")
    .single();
  const labB = lb!.id as string;
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const subirImagen = async (nombre: string) => {
    const ruta = `pruebas/${nombre}-${Date.now()}.png`;
    const { error: eImg } = await db.storage.from("whatsapp").upload(ruta, PNG, { contentType: "image/png" });
    if (!eImg) archivosWhatsapp.push(ruta);
    return ruta;
  };
  const adjuntosF1 = async (id: string) => ((await db.from("seleccion_adjuntos").select("tipo").eq("proceso_id", id).eq("tipo", "examen_f1")).data ?? []).length;
  const r1 = await esperando("YOLANDA PATRICIA REYES RADIO", labB);
  await llega(`YOLANDA PATRICIA REYES RADIO CC ${r1.cedula}: Sí, puede pasar a fase 2`, labB);
  r = await llega("", labB, { mediaPath: await subirImagen("radiografia"), mime: "image/png", nombreArchivo: "radiografia.png" });
  revisar("después del resultado: la imagen va a su carpeta (exámenes, fase 1)", (await adjuntosF1(r1.id)) === 1, { av: await avisos(r.ids) });
  revisar("y su aviso queda resuelto (no queda para asignar)", (await avisos(r.ids)).every((x) => x.estado === "confirmado" && x.proceso_id === r1.id), await avisos(r.ids));
  // Al revés, en un laboratorio sin otros resultados recientes: primero la imagen, después el resultado.
  await db.from("seleccion_avisos_laboratorio").update({ created_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("laboratorio_id", labB);
  const r2 = await esperando("WILSON ENRIQUE PALMA RADIO", labB);
  const img2 = await llega("", labB, { mediaPath: await subirImagen("radiografia2"), mime: "image/png", nombreArchivo: "rx.png" });
  revisar("la imagen sola, sin resultado todavía: queda pendiente", (await avisos(img2.ids)).every((x) => x.estado === "pendiente" && !x.proceso_id), await avisos(img2.ids));
  await llega(`WILSON ENRIQUE PALMA RADIO CC ${r2.cedula}: Sí, puede pasar a fase 2`, labB);
  revisar("al llegar el resultado, la imagen pasa a su carpeta", (await adjuntosF1(r2.id)) === 1 && (await avisos(img2.ids)).every((x) => x.estado === "confirmado" && x.proceso_id === r2.id), await avisos(img2.ids));

  // ── 4s ──────────────────────────────────────────────────────────────────
  titulo("4s. No apto en la fase 1: marcado para revisarlo y decidir si sigue");
  const n1 = await esperando("ROBERTO CARLOS DUARTE REVISION", labTemp);
  await db.from("procesos_contratacion").update({ reconocimiento_estado: "en_curso" }).eq("id", n1.id);
  await llega(`ROBERTO CARLOS DUARTE REVISION CC ${n1.cedula}: no puede continuar, radiografía con escoliosis.`, labTemp);
  const marcas = await examenesPorRevisar([n1.id]);
  revisar("queda marcado en el tablero: «No apto fase 1»", marcas.get(n1.id)?.resultado === "no_apto" && marcas.get(n1.id)?.fase === 1, [...marcas.entries()]);
  const enReco = (await pantallaReconocimiento({ incluirPrueba: true })).aspirantes.find((x) => x.procesoId === n1.id);
  revisar("mientras se decide, sigue en el reconocimiento de ruta (con el aviso)", enReco?.examen?.resultado === "no_apto", enReco?.examen);
  revisar("decidir sin escribir el porqué no se deja", !(await decidirNoApto(n1.id, true, "", actor)).ok);
  const sigue = await decidirNoApto(n1.id, true, "Valoró el médico de la empresa: puede trabajar.", actor);
  p = await proceso(n1.id);
  revisar("«sigue»: pasa a la fase 2 con su cita y el mensaje", sigue.ok && p.estado === "en_examenes_fase2" && /segunda fase/i.test(sigue.texto ?? ""), { sigue, estado: p.estado });
  revisar("el examen queda apto con la decisión anotada", (await examen(n1.id, 1))?.resultado === "apto" && /Revisión manual/.test(String((await examen(n1.id, 1))?.observacion)), await examen(n1.id, 1));
  revisar("ya no está marcado en el tablero", !(await examenesPorRevisar([n1.id])).has(n1.id));
  const { count: citasF2 } = await db.from("seleccion_citas").select("id", { count: "exact", head: true }).eq("proceso_id", n1.id).eq("tipo", "examen_f2");
  revisar("con una sola cita de fase 2", citasF2 === 1, citasF2);
  const n2 = await esperando("MARTHA LUCIA ROJAS REVISION", labTemp);
  await llega(`MARTHA LUCIA ROJAS REVISION CC ${n2.cedula}: no puede continuar, positivo para marihuana.`, labTemp);
  const noSigue = await decidirNoApto(n2.id, false, "Confirmado el positivo: no continúa.", actor);
  p = await proceso(n2.id);
  revisar("«no sigue»: queda cerrado por exámenes médicos", noSigue.ok && p.estado === "cierre" && p.causa_no_contrato === "Exámenes médicos", { noSigue, estado: p.estado, causa: p.causa_no_contrato });
  const otraVez = await decidirNoApto(n2.id, true, "Cambio de opinión después del cierre.", actor);
  const eventosCierre = (await db.from("procesos_contratacion_eventos").select("id").eq("proceso_id", n2.id).eq("tipo", "estado")).data ?? [];
  revisar("ya cerrado, no se puede volver a decidir (ni sigue ni se cierra dos veces)", !otraVez.ok && (await proceso(n2.id)).estado === "cierre" && eventosCierre.length === 1, { otraVez, eventos: eventosCierre.length });

  // ── 5 ───────────────────────────────────────────────────────────────────
  titulo("5. Cerrarlo por cualquier razón detiene todo (como al arrastrarlo a «Cierre» en el tablero)");
  // El aspirante de la sección 1: en fase 1, con la cita, el correo pedido y el reconocimiento por verificar.
  await db.from("procesos_contratacion").update({ banco_respondido_at: null, banco_cuenta: null }).eq("id", a.id);
  const cierre = await cambiarEstadoProceso(a.id, "cierre", { actor, causa: "Se fue a vivir a otra ciudad" });
  revisar("una persona lo cierra con una causa escrita a mano", cierre.cambiado && (await proceso(a.id)).estado === "cierre", cierre);
  const { data: citasA } = await db.from("seleccion_citas").select("tipo, estado").eq("proceso_id", a.id);
  revisar("sus citas quedan canceladas (sin recordatorios ni «no asistió»)", (citasA ?? []).every((c) => c.estado === "cancelada"), citasA);
  revisar("la asistente sabe que el proceso terminó (no le pide nada más)", await cerradoPorAntecedentesDeConversacion(convId));
  revisar("su respuesta a la pregunta del banco ya no se atiende", !(await escribe("no tengo cuenta")));
  const { data: mc } = await db.from("wa_mensajes").insert({ conversacion_id: convId, direccion: "entrante", contenido: "mi correo es prueba.cerrado@gestivo.test", timestamp: new Date().toISOString() }).select("id").single();
  revisar("el correo que escriba ya no se procesa", !(await procesarCorreoPsico(convId, mc!.id as string)));
  r = await llega(`ASPIRANTE FASE UNO PRUEBA CC ${a.cedula}: Sí, puede pasar a fase 2`, labA?.id ?? labTemp);
  revisar("un resultado del laboratorio para él no se registra", !(await examen(a.id, 1)) && !r.confirmados.length, { conf: r.confirmados });
  revisar("y ya no sale en la pantalla de reconocimiento de ruta", !(await pantallaReconocimiento({ incluirPrueba: true })).aspirantes.some((x) => x.procesoId === a.id));
} catch (e) {
  fallos.push(`excepción: ${e instanceof Error ? e.stack : String(e)}`);
  console.error(e);
} finally {
  await limpiar();
  const quedan = (await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`)).count;
  const lab = (await db.from("seleccion_laboratorios").select("id", { count: "exact", head: true }).ilike("nombre", `${NOMBRE_LAB}%`)).count;
  revisar("no quedan datos de prueba", quedan === 0 && lab === 0, { quedan, lab });
}
console.log(`\n${ok} bien, ${fallos.length} mal.`);
for (const f of fallos) console.log(`  · ${f}`);
process.exit(fallos.length ? 1 : 0);
