// Batería simulada de la Entrega 2 de Selección (agenda y profesor) contra la base de .env.local (desarrollo).
// Solo crea candidatos ficticios con origen «chat_prueba» (no sale WhatsApp ni se consulta Croma) y los borra al terminar.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-entrega-2.mts
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, cambiarEstadoProceso, type ActorProceso } from "@/lib/contratacion/servidor";
import { accionAgenda, horaDelDia, hhmm, reprogramacionesDe, type Cita } from "@/lib/seleccion/agenda";
import {
  citaParaAsistente,
  citarAutomaticamente,
  citarProceso,
  citasDeProceso,
  citasDelDia,
  confirmarCita,
  deshacerNoAsistio,
  guardarDisponibilidad,
  leerAjustesAgenda,
  leerDisponibilidad,
  marcarLlegada,
  marcarNoAsistio,
  pedirOtraFecha,
  quitarDisponibilidad,
  reprogramarCita,
  reprogramarCitasDelDia,
  reprogramarPorAsistente,
  vistaCitacion,
} from "@/lib/seleccion/agenda-servidor";
import {
  clasesPendientes,
  historialProfesor,
  pendientesDelProfesor,
  registrarClase,
  registrarConcepto,
  registrarObservacion,
  registrarPrueba,
  registrarReconocimiento,
} from "@/lib/seleccion/profesor-servidor";
import { deshacerRegistro, enviarAExamenes, planExamenes, registrarReconocimientos } from "@/lib/seleccion/profesor-servidor";
import { motivoRegreso, reabrirSiVuelve } from "@/lib/seleccion/proceso-desde-chat";
import { PREFILTRO_VACIO } from "@/lib/seleccion/extraccion";
import { reevaluarPreseleccion } from "@/lib/seleccion/servidor";
import { consultarSimitProceso } from "@/lib/verificacion/servidor";

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-e2@gestivo.test" };
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
    fallos.push(`${seccion}: ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
    console.log(`  ✘ ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : ""}`);
  }
};

const PREFIJO = "99900000";
async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").eq("origen", "chat_prueba").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((x) => x.id as string);
  // Las órdenes simuladas al laboratorio (envío automático al citar a exámenes, 23-nov-2026).
  if (ids.length) await db.from("seleccion_envios_laboratorio").delete().overlaps("proceso_ids", ids);
  if (ids.length) await db.from("procesos_contratacion").delete().in("id", ids);
  return ids.length;
}
let n = 0;
async function crear(estado = "antecedentes", extra: Record<string, unknown> = {}): Promise<string> {
  n++;
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({
      fecha_creacion: "2026-11-18",
      nombre: `PRUEBA E2 ${String(n).padStart(2, "0")}`,
      cedula: `${PREFIJO}${String(n).padStart(2, "0")}`,
      celular: null,
      reingreso: false,
      estado,
      medio_postulacion: "whatsapp",
      origen: "chat_prueba",
      simit_valor: 0,
      autorizacion_datos: "si",
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw new Error(`crear proceso: ${error.message}`);
  return data.id as string;
}
const proceso = async (id: string) => (await db.from("procesos_contratacion").select("*").eq("id", id).single()).data as Record<string, unknown>;
const vigente = async (id: string) => (await citasDeProceso(id)).find((c) => c.tipo === "prueba_manejo" && ["programada", "confirmada", "pide_otra_fecha"].includes(c.estado)) ?? null;

await limpiar();
const a = await leerAjustesAgenda();
// Días con prueba lejos de hoy (para no cruzarse con la agenda real).
const dias: string[] = [];
for (let d = new Date("2027-01-18T00:00:00Z"); dias.length < 8; d.setUTCDate(d.getUTCDate() + 1)) {
  const f = d.toISOString().slice(0, 10);
  if (horaDelDia(f, a, []) === "13:00") dias.push(f);
}
const H = "13:00";

try {
  // ───────────────────────────────────────────────────────────────────────
  titulo("1. Citar");
  const p1 = await crear();
  const vista = await vistaCitacion(p1, { fecha: dias[0], hora: H });
  revisar("la vista previa trae el texto y dice que es de prueba", vista?.canal === "prueba" && (vista?.texto.length ?? 0) > 20, vista);
  revisar("fecha inválida se rechaza", !(await citarProceso(p1, { fecha: "mañana", hora: H }, actor)).ok);
  revisar("hora inválida se rechaza", !(await citarProceso(p1, { fecha: dias[0], hora: "25:00" }, actor)).ok);
  const c1 = await citarProceso(p1, { fecha: dias[0], hora: H }, actor);
  revisar("cita creada y el mensaje no sale por WhatsApp (envío «prueba»)", c1.ok && c1.envio === "prueba" && !!c1.texto, c1);
  revisar("el mensaje trae la fecha y la hora en palabras", /de enero/.test(c1.texto ?? "") && /1:00 p\. m\./.test(c1.texto ?? ""), c1.texto);
  let pr = await proceso(p1);
  revisar("el proceso pasa a «Citado» con la fecha de citación", pr.estado === "citado" && pr.fecha_citacion === dias[0], { estado: pr.estado, f: pr.fecha_citacion });
  revisar("la cita queda «programada»", (await vigente(p1))?.estado === "programada");
  const { data: ev } = await db.from("procesos_contratacion_eventos").select("tipo, detalle").eq("proceso_id", p1).eq("tipo", "cita");
  revisar("queda el evento «citado» en el historial", (ev ?? []).some((e) => (e.detalle as { accion?: string })?.accion === "citado"));
  const cerrado = await crear("cierre", { causa_no_contrato: "Desistimiento" });
  revisar("no se cita un proceso cerrado", !(await citarProceso(cerrado, { fecha: dias[0], hora: H }, actor)).ok);
  const enEscuela = await crear("en_escuela");
  revisar("no se cita a quien ya pasó la prueba (en escuela)", !(await citarProceso(enEscuela, { fecha: dias[0], hora: H }, actor)).ok);
  const dos = await citarProceso(p1, { fecha: dias[1], hora: H }, actor);
  revisar("citar otra vez con cita en pie la reprograma (no crea dos en pie)", dos.ok && (await citasDeProceso(p1)).filter((c) => ["programada", "confirmada", "pide_otra_fecha"].includes(c.estado)).length === 1);
  revisar("esa reprogramación es «por la empresa» y no cuenta", reprogramacionesDe(await citasDeProceso(p1)) === 0);

  // ───────────────────────────────────────────────────────────────────────
  titulo("2. Confirmar, pedir otra fecha y reprogramar");
  let v = (await vigente(p1))!;
  revisar("confirmar deja la cita «confirmada»", (await confirmarCita(v.id, actor)).ok && (await vigente(p1))?.estado === "confirmada");
  revisar("cancela después de confirmar: queda «pide otra fecha»", (await pedirOtraFecha(v.id, actor)).ok && (await vigente(p1))?.estado === "pide_otra_fecha");
  revisar("reprogramar a la misma fecha y hora se rechaza", !(await reprogramarCita(v.id, { fecha: v.fecha, hora: hhmm(v.hora) }, "aspirante", actor)).ok);
  const r1 = await reprogramarCita(v.id, { fecha: dias[2], hora: H }, "aspirante", actor);
  revisar("1.ª reprogramación del aspirante: sin propuesta de cierre", r1.ok && r1.proponeCierre === false && r1.envio === "prueba", r1);
  revisar("la cita vieja ya no se puede volver a mover (doble clic)", !(await reprogramarCita(v.id, { fecha: dias[3], hora: H }, "aspirante", actor)).ok);
  v = (await vigente(p1))!;
  const r2 = await reprogramarCita(v.id, { fecha: dias[3], hora: H }, "aspirante", actor);
  revisar("2.ª reprogramación: todavía sin propuesta de cierre", r2.ok && r2.proponeCierre === false, r2);
  v = (await vigente(p1))!;
  const r3 = await reprogramarCita(v.id, { fecha: dias[4], hora: H }, "aspirante", actor);
  revisar("3.ª reprogramación: se propone el cierre (supera el máximo de 2)", r3.ok && r3.proponeCierre === true, r3);
  pr = await proceso(p1);
  revisar("pero el proceso NO se cierra solo", pr.estado === "citado", pr.estado);
  revisar("cuenta 3 reprogramaciones del aspirante", reprogramacionesDe(await citasDeProceso(p1)) === 3);
  revisar("la fecha de citación sigue a la última cita", pr.fecha_citacion === dias[4], pr.fecha_citacion);

  // ───────────────────────────────────────────────────────────────────────
  titulo("3. Llegada e inasistencia");
  v = (await vigente(p1))!;
  revisar("«Llegó»: cita «asistió» y proceso en «Prueba de manejo»", (await marcarLlegada(v.id, actor)).ok && (await proceso(p1)).estado === "prueba_manejo");
  revisar("marcar la llegada dos veces se rechaza", !(await marcarLlegada(v.id, actor)).ok);
  const p2 = await crear();
  await citarProceso(p2, { fecha: dias[0], hora: H }, actor);
  v = (await vigente(p2))!;
  const na = await marcarNoAsistio(v.id, ACTOR_SISTEMA);
  let citasP2 = await citasDeProceso(p2);
  revisar("«No asistió»: cita marcada y aviso de inasistencia preparado", na.ok && citasP2[0].estado === "no_asistio" && !!na.texto && na.envio === "prueba", na);
  revisar("marcar «No asistió» dos veces se rechaza", !(await marcarNoAsistio(v.id, ACTOR_SISTEMA)).ok);
  revisar("el proceso sigue «Citado» (no se cierra)", (await proceso(p2)).estado === "citado");
  revisar("deshacer: la cita vuelve a estar en pie", (await deshacerNoAsistio(v.id, actor)).ok && (await vigente(p2))?.estado === "programada");
  citasP2 = await citasDeProceso(p2);
  revisar("conserva la marca para que el cron no la vuelva a marcar sola", !!citasP2[0].inasistencia_at);
  const ahoraTarde = new Date(`${dias[0]}T14:30:00-05:00`);
  revisar("a las 2:30 p. m. el cron ya no la marcaría otra vez", accionAgenda(citasP2[0] as Cita, ahoraTarde, a) === null, accionAgenda(citasP2[0] as Cita, ahoraTarde, a));
  revisar("llegó después de un «No asistió»: se puede registrar", (await marcarNoAsistio(v.id, actor)).ok && (await marcarLlegada(v.id, actor)).ok && (await proceso(p2)).estado === "prueba_manejo");

  // ───────────────────────────────────────────────────────────────────────
  titulo("4. Automáticos según la hora (con una cita real de la base)");
  const p3 = await crear();
  await citarProceso(p3, { fecha: dias[0], hora: H }, actor);
  const cita3 = (await vigente(p3)) as Cita;
  const a_las = (h: string) => new Date(`${dias[0]}T${h}:00-05:00`);
  revisar("7:30 a. m.: nada", accionAgenda(cita3, a_las("07:30"), a) === null);
  revisar("8:05 a. m.: recordatorio", accionAgenda(cita3, a_las("08:05"), a) === "recordatorio");
  revisar("11:05 a. m. sin confirmar: alerta para llamar", accionAgenda({ ...cita3, recordatorio_at: "x" }, a_las("11:05"), a) === "alerta_no_confirmo");
  revisar("11:05 a. m. confirmada: nada", accionAgenda({ ...cita3, recordatorio_at: "x", estado: "confirmada" }, a_las("11:05"), a) === null);
  revisar("1:15 p. m.: todavía se le espera", accionAgenda({ ...cita3, recordatorio_at: "x", alerta_at: "x" }, a_las("13:15"), a) === null);
  revisar("1:30 p. m.: no asistió", accionAgenda({ ...cita3, recordatorio_at: "x", alerta_at: "x" }, a_las("13:30"), a) === "inasistencia");

  // ───────────────────────────────────────────────────────────────────────
  titulo("5. El asistente y la cita");
  let ca = await citaParaAsistente(p3);
  revisar("el asistente conoce la cita y tiene días para ofrecer", !!ca && !ca.noAsistio && ca.opciones.length > 0 && ca.puedeReprogramar, ca);
  revisar("no mueve la cita a un día sin prueba (domingo)", !(await reprogramarPorAsistente(p3, "2026-11-22", ACTOR_SISTEMA)).ok);
  revisar("no mueve la cita a un día que no ofreció", !(await reprogramarPorAsistente(p3, "2027-06-15", ACTOR_SISTEMA)).ok);
  const diaElegido = ca!.opciones[1]?.fecha ?? ca!.opciones[0].fecha;
  const ra = await reprogramarPorAsistente(p3, diaElegido, ACTOR_SISTEMA);
  revisar("mueve la cita al día que eligió el aspirante", ra.ok && (await vigente(p3))?.fecha === diaElegido, ra);
  revisar("no manda otro mensaje (el asistente ya se lo dijo)", ra.envio === undefined, ra.envio);
  revisar("le cuenta como 1 reprogramación", reprogramacionesDe(await citasDeProceso(p3)) === 1);
  ca = await citaParaAsistente(p3);
  await reprogramarPorAsistente(p3, ca!.opciones[0].fecha, ACTOR_SISTEMA);
  ca = await citaParaAsistente(p3);
  revisar("con 2 reprogramaciones ya no puede moverla solo", ca?.puedeReprogramar === false && !(await reprogramarPorAsistente(p3, ca!.opciones[0].fecha, ACTOR_SISTEMA)).ok, ca?.puedeReprogramar);
  const p4 = await crear();
  await citarProceso(p4, { fecha: dias[0], hora: H }, actor);
  await marcarNoAsistio((await vigente(p4))!.id, ACTOR_SISTEMA);
  ca = await citaParaAsistente(p4);
  revisar("no llegó: el asistente lo sabe y puede ofrecer reprogramar", ca?.noAsistio === true && ca.puedeReprogramar, ca);
  const rn = await reprogramarPorAsistente(p4, ca!.opciones[0].fecha, ACTOR_SISTEMA);
  revisar("reprograma después de la inasistencia: cita nueva en pie", rn.ok && (await vigente(p4))?.fecha === ca!.opciones[0].fecha, rn);
  revisar("sin cita, el asistente no tiene nada de la cita", (await citaParaAsistente(await crear())) === null);

  // ───────────────────────────────────────────────────────────────────────
  titulo("6. Profesor: prueba de manejo");
  const p5 = await crear();
  await citarProceso(p5, { fecha: dias[0], hora: H }, actor);
  revisar("«No continúa» sin observación se rechaza", !(await registrarPrueba(p5, { resultado: "no_continua" }, actor)).ok);
  revisar("resultado inventado se rechaza", !(await registrarPrueba(p5, { resultado: "quizas" as never }, actor)).ok);
  const rp0 = await registrarPrueba(p5, { resultado: "aprobo", rutaEscrita: "si", partesMotor: "no", observacion: "Buen manejo" }, actor);
  pr = await proceso(p5);
  // 23-nov-2026: guardar «aprobó» solo guarda; «Listo para exámenes» (enviarAExamenes) es el que cita y envía.
  revisar("guardar «aprobó» no cita ni envía nada: queda «por enviar a exámenes»", rp0.ok && rp0.porEnviarExamenes === true && !rp0.texto && pr.estado === "prueba_manejo" && !(await citasDeProceso(p5)).some((c) => c.tipo === "examen_f1"), { rp0, e: pr.estado });
  revisar("el historial lo marca pendiente y la prueba se puede deshacer hoy", (await historialProfesor(p5)).porEnviarExamenes === "prueba" && (await historialProfesor(p5)).registros.some((r) => r.tipo === "prueba" && r.deshacible));
  revisar("la lista del profesor lo pone en «Por enviar a exámenes»", (await pendientesDelProfesor(dias[0], { soloPrueba: true })).porEnviarExamenes.some((x) => x.procesoId === p5));
  revisar("«Listo para exámenes» muestra antes el día, la hora y el laboratorio", await planExamenes(p5).then((x) => !!x.fecha && x.hora === a.laboratorioHora));
  const rp = await enviarAExamenes(p5, actor);
  pr = await proceso(p5);
  revisar("«Listo para exámenes»: estado, fecha de la prueba y fecha de exámenes", rp.ok && pr.estado === "en_examenes" && !!pr.fecha_prueba_manejo && !!pr.fecha_examenes, { e: pr.estado, rp });
  revisar("enviado a exámenes, la prueba ya no se puede deshacer", !(await historialProfesor(p5)).registros.some((r) => r.tipo === "prueba" && r.deshacible));
  revisar("y no se puede enviar dos veces", !(await enviarAExamenes(p5, actor)).ok);
  revisar("registrar sin marcar la llegada la marca sola", (await citasDeProceso(p5)).some((c) => c.tipo === "prueba_manejo" && c.estado === "asistio"));
  revisar(`crea la cita del laboratorio (fase 1) a la hora del ajuste (${a.laboratorioHora})`, (await citasDeProceso(p5)).some((c) => c.tipo === "examen_f1" && hhmm(c.hora) === a.laboratorioHora));
  revisar("prepara el mensaje de exámenes (sin enviarlo: candidato de prueba)", rp.envio === "prueba" && rp.claveMensaje === "examenes_fase1" && !!rp.texto, rp);
  revisar("registrar la prueba dos veces se rechaza", !(await registrarPrueba(p5, { resultado: "aprobo" }, actor)).ok);
  // Deshacer la prueba de hoy (antes de enviarla a exámenes).
  const pd = await crear();
  await citarProceso(pd, { fecha: dias[0], hora: H }, actor);
  await registrarPrueba(pd, { resultado: "aprobo" }, actor);
  revisar("con la prueba guardada y sin enviar, no se puede guardar otra", !(await registrarPrueba(pd, { resultado: "escuela" }, actor)).ok);
  const idPrueba = (await historialProfesor(pd)).registros.find((r) => r.tipo === "prueba")?.id ?? "";
  revisar("deshacer la prueba de hoy: se borra y se puede volver a registrar", (await deshacerRegistro(pd, "prueba", idPrueba, actor)).ok && (await historialProfesor(pd)).porEnviarExamenes === null && (await registrarPrueba(pd, { resultado: "escuela" }, actor)).ok);
  const idEscuela = (await historialProfesor(pd)).registros.find((r) => r.tipo === "prueba")?.id ?? "";
  revisar("deshacer «va a escuela» (sin clases) lo devuelve a la prueba de manejo", (await deshacerRegistro(pd, "prueba", idEscuela, actor)).ok && (await proceso(pd)).estado === "prueba_manejo");
  const { count: deshechos } = await db.from("procesos_contratacion_eventos").select("id", { count: "exact", head: true }).eq("proceso_id", pd).eq("detalle->>accion", "deshecho");
  revisar("cada «deshacer» queda en el historial del proceso", deshechos === 2, deshechos);
  const p6 = await crear();
  const rc = await registrarPrueba(p6, { resultado: "no_continua", observacion: "No domina el vehículo" }, actor);
  pr = await proceso(p6);
  revisar("«No continúa»: cierra con «No pasó prueba de manejo»", rc.ok && pr.estado === "cierre" && pr.causa_no_contrato === "No pasó prueba de manejo", pr.causa_no_contrato);
  revisar("sin cita previa también se puede registrar (llegó sin citación)", rc.ok);

  // ───────────────────────────────────────────────────────────────────────
  titulo("7. Profesor: escuela (varias clases)");
  const p7 = await crear();
  revisar("«Va a escuela»: pasa a «En escuela»", (await registrarPrueba(p7, { resultado: "escuela", clasesSugeridas: 3 }, actor)).ok && (await proceso(p7)).estado === "en_escuela");
  revisar("clase a quien no está en escuela se rechaza", !(await registrarClase(p5, { resultado: "sigue" }, actor)).ok);
  for (let i = 0; i < 3; i++) await registrarClase(p7, { resultado: "sigue", observacion: `Clase ${i + 1}` }, actor);
  let h = await historialProfesor(p7);
  revisar("tres clases seguidas: quedan las tres, numeradas", h.clases === 3 && h.registros.filter((r) => r.tipo === "clase").map((r) => r.numero).sort().join() === "1,2,3", h.clases);
  revisar("sigue «En escuela» después de «sigue»", (await proceso(p7)).estado === "en_escuela");
  revisar("clase «No continúa» sin observación se rechaza", !(await registrarClase(p7, { resultado: "no_continua" }, actor)).ok);
  const rl0 = await registrarClase(p7, { resultado: "listo" }, actor);
  revisar("clase «Listo»: solo se guarda, sigue en escuela y queda por enviar", rl0.ok && rl0.porEnviarExamenes === true && !rl0.texto && (await proceso(p7)).estado === "en_escuela" && (await historialProfesor(p7)).porEnviarExamenes === "escuela", rl0);
  revisar("con la clase «Listo» guardada no se registran más clases", !(await registrarClase(p7, { resultado: "sigue" }, actor)).ok);
  const rl = await enviarAExamenes(p7, actor);
  revisar("«Listo para exámenes»: pasa a exámenes con su mensaje", rl.ok && (await proceso(p7)).estado === "en_examenes" && rl.claveMensaje === "examenes_fase1", rl);
  h = await historialProfesor(p7);
  revisar("el historial guarda la prueba y las 4 clases", h.registros.filter((r) => r.tipo === "prueba").length === 1 && h.clases === 4);
  const p8 = await crear();
  await registrarPrueba(p8, { resultado: "escuela" }, actor);
  await registrarClase(p8, { resultado: "no_continua", observacion: "No progresa" }, actor);
  revisar("clase «No continúa»: cierra el proceso", (await proceso(p8)).estado === "cierre");

  // ───────────────────────────────────────────────────────────────────────
  titulo("7b. Escuela: asistencia a la clase y clases que faltan");
  const conAsistencia = !(await db.from("seleccion_clases_escuela").select("asistio, clases_faltantes").limit(1)).error;
  const e1 = await crear();
  await registrarPrueba(e1, { resultado: "escuela", clasesSugeridas: 3 }, actor);
  revisar("lo calculado en la prueba (3 clases) aparece como pendiente", clasesPendientes([], 3) === 3 && (await historialProfesor(e1)).clasesPendientes === 3, (await historialProfesor(e1)).clasesPendientes);
  await registrarClase(e1, { resultado: "sigue", asistio: true }, actor);
  revisar("tras una clase dictada le faltan 2", (await historialProfesor(e1)).clasesPendientes === 2);
  // Cálculo puro (no depende de la migración).
  const C = (falto: boolean, clasesFaltantes: number | null = null) => ({ falto, clasesFaltantes });
  revisar("una falta no descuenta clases", clasesPendientes([C(false), C(true)], 3) === 2);
  revisar("el profesor sube el cálculo: manda el último que dijo", clasesPendientes([C(false), C(false, 4)], 3) === 4);
  revisar("las clases dictadas después de ese cálculo se descuentan; las faltas no", clasesPendientes([C(false, 4), C(false), C(true), C(false)], 3) === 2);
  revisar("nunca da negativo", clasesPendientes([C(false, 1), C(false), C(false)], null) === 0);
  revisar("sin cálculo de nadie: no dice nada", clasesPendientes([C(false)], null) === null);
  if (!conAsistencia) {
    const f = await registrarClase(e1, { resultado: "sigue", asistio: false }, actor);
    revisar("sin la migración 20261118222930, marcar la falta avisa qué falta aplicar", !f.ok && /20261118222930/.test(f.error ?? ""), f);
    revisar("y una clase normal se sigue guardando", (await registrarClase(e1, { resultado: "sigue", clasesFaltantes: 5 }, actor)).ok);
    console.log("  (asistencia y «le faltan N» en la base: pendientes de la migración 20261118222930)");
  } else {
    const f = await registrarClase(e1, { resultado: "listo", asistio: false, observacion: "No avisó" }, actor);
    let he = await historialProfesor(e1);
    revisar("«No llegó»: queda la falta, sigue en escuela y no cuenta como clase", f.ok && he.faltas === 1 && he.clases === 1 && (await proceso(e1)).estado === "en_escuela", { f, faltas: he.faltas, clases: he.clases });
    revisar("la falta no descuenta las clases que faltan", he.clasesPendientes === 2, he.clasesPendientes);
    await registrarClase(e1, { resultado: "sigue", asistio: true, clasesFaltantes: 4 }, actor);
    he = await historialProfesor(e1);
    revisar("el profesor decide que necesita más clases (4): queda el cálculo nuevo", he.clasesPendientes === 4 && he.clases === 2, he.clasesPendientes);
    revisar("las clases se numeran sin contar la falta", he.registros.filter((r) => r.tipo === "clase" && !r.falto).map((r) => r.numero).sort().join() === "1,2");
    const pe = await pendientesDelProfesor(dias[0], { soloPrueba: true });
    const fila = pe.escuela.find((x) => x.procesoId === e1);
    revisar("la lista del profesor muestra clases, faltas y las que faltan", fila?.clases === 2 && fila.faltas === 1 && fila.clasesPendientes === 4, fila);
    await registrarClase(e1, { resultado: "no_continua", asistio: false, observacion: "Faltó tres veces" }, actor);
    revisar("«No llegó» + «No continúa»: cierra el proceso", (await proceso(e1)).estado === "cierre");
  }

  // ───────────────────────────────────────────────────────────────────────
  titulo("8. Profesor: reconocimiento de ruta, observaciones y concepto");
  revisar("salida sin ruta se rechaza", !(await registrarReconocimiento(p7, { ruta: " ", resultado: "aprendida" }, actor)).ok);
  const s1 = await registrarReconocimiento(p7, { ruta: "A1", resultado: "repetir" }, actor);
  const s2 = await registrarReconocimiento(p7, { ruta: "A1", resultado: "aprendida" }, actor);
  const s3 = await registrarReconocimiento(p7, { ruta: "A1", resultado: "aprendida" }, actor);
  revisar("la misma ruta aprendida dos veces cuenta una", s1.ok && s2.ok && s3.ok && !s2.rutasCompletas && !s3.rutasCompletas && (await historialProfesor(p7)).rutasAprendidas.length === 1);
  const s4 = await registrarReconocimiento(p7, { ruta: "B2", resultado: "aprendida" }, actor);
  revisar("con la segunda ruta: «2 de 2 rutas» completas", s4.ok && s4.rutasCompletas === true, s4);
  const s5 = await registrarReconocimiento(p7, { ruta: "C3", resultado: "aprendida" }, actor);
  revisar("una tercera ruta no vuelve a avisar «completas»", s5.ok && !s5.rutasCompletas);
  revisar("el reconocimiento no cambia el estado del proceso", (await proceso(p7)).estado === "en_examenes");
  revisar("observación vacía se rechaza", !(await registrarObservacion(p7, "   ", actor)).ok);
  revisar("observación suelta queda guardada", (await registrarObservacion(p7, "Puntual y atento", actor)).ok && (await historialProfesor(p7)).registros.some((r) => r.tipo === "observacion"));
  revisar("«No lo acepto» sin motivo se rechaza", !(await registrarConcepto(p7, { concepto: "rechaza" }, actor)).ok);
  revisar("«Lo acepto» queda en la ficha y no cierra", (await registrarConcepto(p7, { concepto: "acepta" }, actor)).ok && (await historialProfesor(p7)).concepto?.concepto === "acepta" && (await proceso(p7)).estado === "en_examenes");
  revisar("«No lo acepto» con motivo cierra con su causa", (await registrarConcepto(p7, { concepto: "rechaza", nota: "Actitud" }, actor)).ok && (await proceso(p7)).causa_no_contrato === "No aceptado por el profesor");
  revisar("con el proceso cerrado ya no se registra nada", !(await registrarReconocimiento(p7, { ruta: "D4", resultado: "aprendida" }, actor)).ok);
  const p9 = await crear("en_examenes_fase2");
  await registrarReconocimiento(p9, { ruta: "A1", resultado: "no_continua", observacion: "Se pierde" }, actor);
  revisar("salida «No continúa»: cierra con «No pasó reconocimiento de ruta»", (await proceso(p9)).causa_no_contrato === "No pasó reconocimiento de ruta");
  // Rutas del día en un solo guardado (23-nov-2026). Desde el 24-nov-2026 no se cita sola la
  // siguiente salida: la cita la envía la encargada del reconocimiento (pantalla propia).
  const pr2 = await crear("reconocimiento_ruta");
  const reconoc = async () => (await citasDeProceso(pr2)).filter((c) => c.tipo === "reconocimiento");
  revisar("rutas del día: sin rutas o sin elegir la ruta se rechaza", !(await registrarReconocimientos(pr2, { salidas: [] }, actor)).ok && !(await registrarReconocimientos(pr2, { salidas: [{ ruta: " ", resultado: "aprendida" }] }, actor)).ok);
  const dia1 = await registrarReconocimientos(pr2, { salidas: [{ ruta: "A1", resultado: "repetir" }, { ruta: "A1", resultado: "aprendida" }], observacion: "Bien" }, actor);
  revisar("dos salidas en un guardado: sin cita automática (la cita la envía la encargada)", dia1.ok && (await reconoc()).length === 0, { dia1, citas: (await reconoc()).length });
  revisar("quedan las dos salidas en lo registrado", (await historialProfesor(pr2)).registros.filter((r) => r.tipo === "ruta").length === 2);
  revisar("y quedan en curso", (await proceso(pr2)).reconocimiento_estado === "en_curso");
  const dia2 = await registrarReconocimientos(pr2, { salidas: [{ ruta: "B2", resultado: "aprendida" }, { ruta: "C3", resultado: "aprendida" }] }, actor);
  revisar("las que completan: «rutas completas», sin mensaje, y la cita pendiente se cancela", dia2.ok && dia2.rutasCompletas === true && !dia2.texto && !(await reconoc()).some((c) => ["programada", "confirmada"].includes(c.estado)), { dia2, citas: await reconoc() });

  // ───────────────────────────────────────────────────────────────────────
  titulo("9. Lo que ve el profesor");
  const pa = await crear();
  const pb = await crear("en_escuela");
  const pc = await crear("reconocimiento_ruta");
  await citarProceso(pa, { fecha: dias[5], hora: H }, actor);
  const pend = await pendientesDelProfesor(dias[5], { soloPrueba: true });
  revisar("ve al citado de ese día", pend.citas.some((c) => c.proceso_id === pa));
  revisar("ve a los que están en escuela; el reconocimiento de ruta ya no es suyo", pend.escuela.some((x) => x.procesoId === pb) && !pend.rutas.some((x) => x.procesoId === pc));
  revisar("la vista real (/profesor) no muestra candidatos de prueba", !(await pendientesDelProfesor(dias[5])).citas.some((c) => c.proceso_id === pa));
  revisar("la agenda real tampoco", !(await citasDelDia(dias[5])).some((c) => c.proceso_id === pa));

  // ───────────────────────────────────────────────────────────────────────
  titulo("10. Días del profesor");
  const X = dias[6];
  const Y = dias[7];
  const libres = (await leerDisponibilidad(X, Y)).length === 0;
  if (!libres) revisar("los días de prueba están libres en la agenda", false);
  else {
    const q1 = await crear();
    const q2 = await crear();
    const q3 = await crear();
    await citarProceso(q1, { fecha: X, hora: H }, actor);
    await citarProceso(q2, { fecha: X, hora: H }, actor);
    await confirmarCita((await vigente(q2))!.id, actor);
    await citarProceso(q3, { fecha: Y, hora: H }, actor);
    revisar("reprogramar el día sin novedad marcada se rechaza", !(await reprogramarCitasDelDia(X, actor, { soloPrueba: true })).ok);
    const g = await guardarDisponibilidad({ fecha: X, disponible: false, motivo: "enfermedad" }, actor);
    revisar("«No puede»: avisa las 2 citas de ese día", g.ok && g.afectadas.length === 2, g);
    revisar("«Puede a otra hora» sin hora se rechaza", !(await guardarDisponibilidad({ fecha: Y, disponible: true }, actor)).ok);
    const propuesta = await citarProceso(await crear(), { fecha: X, hora: H }, actor);
    revisar("(se puede citar a mano ese día, pero el diálogo lo avisa)", propuesta.ok);
    const mov = await reprogramarCitasDelDia(X, actor, { soloPrueba: true });
    revisar("mueve las citas de candidatos de prueba de ese día", mov.ok && mov.movidas.length === 3, mov.movidas.length);
    const nueva1 = await vigente(q1);
    revisar("pasan al siguiente día con prueba (el del día Y)", nueva1?.fecha === Y && hhmm(nueva1.hora) === H, nueva1?.fecha);
    revisar("no les cuenta como reprogramación del aspirante", reprogramacionesDe(await citasDeProceso(q1)) === 0 && reprogramacionesDe(await citasDeProceso(q2)) === 0);
    revisar("cada uno recibe el aviso de la cita nueva", mov.movidas.every((m) => m.envio === "prueba" && !!m.texto));
    const g2 = await guardarDisponibilidad({ fecha: Y, disponible: true, hora: "15:00" }, actor);
    revisar("«Puede a las 3:00 p. m.»: las citas de la 1:00 quedan por mover", g2.ok && g2.afectadas.length >= 3, g2.afectadas.length);
    const mov2 = await reprogramarCitasDelDia(Y, actor, { soloPrueba: true });
    const nueva3 = await vigente(q3);
    revisar("solo cambia la hora: mismo día, 3:00 p. m.", mov2.ok && nueva3?.fecha === Y && hhmm(nueva3.hora) === "15:00", { f: nueva3?.fecha, h: nueva3?.hora });
    revisar("volver a pulsar no mueve nada (ya caben)", (await reprogramarCitasDelDia(Y, actor, { soloPrueba: true })).movidas.length === 0);
    await quitarDisponibilidad(X);
    await quitarDisponibilidad(Y);
    revisar("al quitar las novedades los días vuelven a ser normales", (await leerDisponibilidad(X, Y)).length === 0);
  }

  // ───────────────────────────────────────────────────────────────────────
  titulo("11. Cita automática al quedar listo");
  const pa1 = await crear();
  revisar("si falta el RNMC o el SIMIT no cita solo", (await citarAutomaticamente(pa1, { faltaRnmc: true })) === null && (await vigente(pa1)) === null);
  const auto = await citarAutomaticamente(pa1);
  revisar("cita solo al siguiente cupo y pasa a «Citado»", !!auto?.ok && (await proceso(pa1)).estado === "citado" && !!(await vigente(pa1)), auto);
  const va = await vigente(pa1);
  revisar("el cupo es un día con prueba, a su hora", !!va && horaDelDia(va.fecha, a, []) === hhmm(va.hora), va);
  revisar("si ya tiene cita no cita otra vez", (await citarAutomaticamente(pa1)) === null);
  revisar("no cita solo a quien ya pasó la prueba", (await citarAutomaticamente(enEscuela)) === null);

  // ───────────────────────────────────────────────────────────────────────
  titulo("12. Vuelve después de un cierre automático");
  const COLS = "id, estado, cedula, origen, nombre, edad, ciudad_residencia, dispuesto_traslado, licencia_categoria, experiencia_meses, hoja_vida_recibida_at, autorizacion_datos, licencia_verificada_runt";
  const leer = async (id: string) => (await db.from("procesos_contratacion").select(COLS).eq("id", id).single()).data as never;
  const datos = (extra: Record<string, unknown>) => ({ ...PREFILTRO_VACIO, busca_trabajo: true, cedula: "1", ...extra }) as never;
  const RES = "Fuera de la zona y sin traslado";
  const v1 = await crear("pendiente", { ciudad_residencia: "Cartagena", dispuesto_traslado: false });
  await cambiarEstadoProceso(v1, "cierre", { actor: ACTOR_SISTEMA, causa: RES, detalle: { automatico: true } });
  revisar("el asistente sabe por qué quedó detenido", (await motivoRegreso(v1)) === "residencia");
  revisar("vuelve con un saludo: sigue cerrado", (await reabrirSiVuelve(await leer(v1), datos({ ciudad: "Cartagena", dispuesto_traslado: false }))) === "sigue_cerrado" && (await proceso(v1)).estado === "cierre");
  revisar("ahora sí se traslada: se reabre el mismo candidato", (await reabrirSiVuelve(await leer(v1), datos({ ciudad: "Cartagena", dispuesto_traslado: true }))) === "reabierto");
  pr = await proceso(v1);
  revisar("queda en «Preselección» y sin causa de cierre", pr.estado === "pendiente" && pr.causa_no_contrato === null, pr);
  const { data: evr } = await db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", v1).eq("tipo", "estado");
  revisar("el historial dice que se reabrió y por qué se había cerrado", (evr ?? []).some((e) => (e.detalle as { reabierto?: boolean; causa_anterior?: string })?.reabierto && (e.detalle as { causa_anterior?: string }).causa_anterior === RES));
  revisar("un proceso abierto no se toca", (await reabrirSiVuelve(await leer(v1), datos({}))) === "no_aplica");
  const v2 = await crear("pendiente");
  await cambiarEstadoProceso(v2, "cierre", { actor: ACTOR_SISTEMA, causa: "Incomunicado" });
  revisar("incomunicado: se reabre con cualquier mensaje", (await motivoRegreso(v2)) === "incomunicado" && (await reabrirSiVuelve(await leer(v2), datos({}))) === "reabierto");
  const v3 = await crear("pendiente", { ciudad_residencia: "Cartagena", dispuesto_traslado: false });
  await cambiarEstadoProceso(v3, "cierre", { actor, causa: RES });
  revisar("si lo cerró una persona, no se reabre solo", (await motivoRegreso(v3)) === null && (await reabrirSiVuelve(await leer(v3), datos({ dispuesto_traslado: true }))) === "no_aplica");
  const v4 = await crear("pendiente");
  await cambiarEstadoProceso(v4, "cierre", { actor: ACTOR_SISTEMA, causa: "Antecedentes" });
  revisar("cierre por antecedentes: nunca se reabre solo", (await reabrirSiVuelve(await leer(v4), datos({ dispuesto_traslado: true, autorizacion: "si" }))) === "no_aplica");
  const v5 = await crear("pendiente");
  await cambiarEstadoProceso(v5, "cierre", { actor: ACTOR_SISTEMA, causa: "Ya trabaja en la empresa" });
  revisar("«Ya trabaja en la empresa»: tampoco", (await reabrirSiVuelve(await leer(v5), datos({}))) === "no_aplica");

  // ───────────────────────────────────────────────────────────────────────
  titulo("13. SIMIT sin respuesta (con el ajuste como está hoy en la base)");
  const { data: aj } = await db.from("seleccion_ajustes").select("valor").eq("clave", "simit_obligatorio").maybeSingle();
  const s9 = await crear("pendiente", { edad: 35, ciudad_residencia: "Barranquilla", licencia_categoria: "C2", licencia_verificada_runt: true });
  await db.from("verificaciones_externas").insert({ proceso_id: s9, cedula: `${PREFIJO}xx`, proveedor: "croma", fuente: "simit", estado: "error", error: "The job could not be completed." });
  const re = await reevaluarPreseleccion(s9);
  const opcional = aj?.valor === false;
  console.log(`  (ajuste simit_obligatorio en la base: ${aj ? JSON.stringify(aj.valor) : "sin la fila → obligatorio"}; semáforo: edad ${re?.resultado.edad.color}, residencia ${re?.resultado.residencia.color}, licencia ${re?.resultado.licencia.color}, simit ${re?.resultado.simit.color})`);
  if (opcional) revisar("SIMIT opcional: pasa a antecedentes sin el SIMIT", re?.avanzo === true && (await proceso(s9)).estado === "antecedentes", re);
  else revisar("SIMIT obligatorio: se queda en preselección esperando el SIMIT", re?.avanzo === false && (await proceso(s9)).estado === "pendiente", re);

  // ───────────────────────────────────────────────────────────────────────
  titulo("14. Caché de Croma (sin gastar consultas: la respuesta ya está guardada)");
  const viejo = await crear("cierre", { causa_no_contrato: "Desistimiento" });
  const cedulaCache = ((await proceso(viejo)).cedula as string) ?? "";
  await db.from("verificaciones_externas").insert({ proceso_id: viejo, cedula: cedulaCache, proveedor: "croma", fuente: "simit", estado: "ok", valor: 0, resultado: { found: false } });
  const nuevoP = await crear("pendiente");
  await db.from("procesos_contratacion").update({ cedula: cedulaCache }).eq("id", nuevoP);
  const cs = await consultarSimitProceso(nuevoP, actor);
  revisar("la misma cédula consultada hace poco no se vuelve a consultar", cs.modo === "consultado" && (cs as { valor?: number }).valor === 0, cs);
  const { data: filaCache } = await db.from("verificaciones_externas").select("consultado_por, estado, costo").eq("proceso_id", nuevoP).eq("fuente", "simit");
  revisar("queda anotado que se reutilizó y de qué día", filaCache?.length === 1 && /reutilizada de la consulta del/.test(String(filaCache[0].consultado_por)) && filaCache[0].costo == null, filaCache);
  revisar("el resultado llega a la ficha (SIMIT sin deuda)", (await proceso(nuevoP)).simit === "ok");
} catch (e) {
  fallos.push(`${seccion}: EXCEPCIÓN ${e instanceof Error ? e.stack : String(e)}`);
  console.log(`  ✘ EXCEPCIÓN ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await quitarDisponibilidad(dias[6]).catch(() => undefined);
  await quitarDisponibilidad(dias[7]).catch(() => undefined);
  const borrados = await limpiar();
  const quedan = (await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`)).count;
  console.log(`\nLimpieza: ${borrados} candidatos ficticios borrados; quedan ${quedan}.`);
}
console.log(`\nRESULTADO: ${ok} correctas, ${fallos.length} con problema.`);
for (const f of fallos) console.log(` ✘ ${f}`);
