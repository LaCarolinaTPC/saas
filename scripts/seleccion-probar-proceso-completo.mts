// El proceso de selección completo, de punta a punta y con sus variantes (24-nov-2026).
//
// Camino principal (A): preselección → (tablero) citado → aprobó la prueba → exámenes fase 1 →
//   pregunta del banco y recordatorio del certificado → resultado del laboratorio (frase acordada) →
//   radiografía suelta a la carpeta → fase 2 apta → reconocimiento de ruta → correo y PsicoAlianza
//   (no la presentó, se vuelve a inscribir, informes Ethikos + Ten DISC) → carpeta con el
//   certificado bancario → condiciones para contratar (con la psicosensotécnica exigida) → contratado.
// Variantes: escuela (E), no apto que sigue (B), no apto que no sigue (C: cerrado, nada más le
//   llega), sin cuenta en el banco (D: el primer recordatorio a las 72 h), la prueba sin terminar
//   (informe con preguntas sin contestar), el tablero hacia atrás y el reporte diario con alertas.
//
// Aspirantes ficticios del chat de prueba (cédulas 99900091NN): no sale nada por WhatsApp. Usa la IA
// de «Documentos» para leer al laboratorio (unas 4 llamadas pequeñas). Crea un laboratorio temporal
// y lo borra todo al terminar, también el empleado que crea al contratar.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-proceso-completo.mts
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEstadoProceso, type ActorProceso } from "@/lib/contratacion/servidor";
import { siguienteDiaHabil } from "@/lib/seleccion/agenda";
import { citarProceso } from "@/lib/seleccion/agenda-servidor";
import { enviarAExamenes, registrarClase, registrarPrueba } from "@/lib/seleccion/profesor-servidor";
import { decidirNoApto, examenesPorRevisar, registrarExamen } from "@/lib/seleccion/examenes-servidor";
import { leerYGuardarAvisos } from "@/lib/seleccion/laboratorio-lectura";
import { finalizarReconocimiento } from "@/lib/seleccion/reconocimiento-servidor";
import { itemsCarpeta, marcarItemCarpeta } from "@/lib/seleccion/carpeta-servidor";
import { aprobarContratacion, condicionesDeProceso } from "@/lib/seleccion/contratacion-servidor";
import { ejecutarRecordatoriosCertificado } from "@/lib/seleccion/certificado-banco-servidor";
import { guardarResultados, listasPsico, marcarInscritos, plantillaPsicoAlianza, reprogramarPsico, vistaResultados } from "@/lib/seleccion/psico-servidor";
import { movimientoAlSoltar, siguientePaso } from "@/lib/seleccion/mover-tablero";
import { armarReporteDiario, alertasDelReporte } from "@/lib/seleccion/reporte-diario";
import { datosReporteDiario, listosParaContratar } from "@/lib/seleccion/reporte-diario-servidor";
import { sincronizarListoContratar } from "@/lib/seleccion/listo-contratar-servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");
const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-completo@gestivo.test" };
const PREFIJO = "99900091";
const NOMBRE_LAB = "LAB PRUEBA COMPLETO";

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
    fallos.push(`${seccion}: ${nombre}`);
    console.log(`  ✘ ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 400)}` : ""}`);
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
    for (const t of [
      "seleccion_adjuntos",
      "seleccion_avisos_laboratorio",
      "seleccion_examenes",
      "seleccion_pruebas_manejo",
      "seleccion_clases_escuela",
      "seleccion_citas",
      "seleccion_reconocimientos_ruta",
      "seleccion_carpeta_items",
      "procesos_contratacion_eventos",
    ]) {
      await db.from(t).delete().in("proceso_id", ids);
    }
    await db.from("seleccion_envios_laboratorio").delete().overlaps("proceso_ids", ids);
    await db.from("procesos_contratacion").delete().in("id", ids);
  }
  // Lo que se crea al contratar.
  await db.from("employees").delete().like("document_number", `${PREFIJO}%`);
  await db.from("conductores").delete().like("cedula", `${PREFIJO}%`);
  const { data: labs } = await db.from("seleccion_laboratorios").select("id").ilike("nombre", `${NOMBRE_LAB}%`);
  for (const lab of labs ?? []) {
    await db.from("seleccion_avisos_laboratorio").delete().eq("laboratorio_id", lab.id);
    await db.from("seleccion_envios_laboratorio").delete().eq("laboratorio_id", lab.id);
    await db.from("seleccion_laboratorios").delete().eq("id", lab.id);
  }
  if (archivosWhatsapp.length) await db.storage.from("whatsapp").remove(archivosWhatsapp);
}

let n = 0;
async function crear(nombre: string, extra: Record<string, unknown> = {}) {
  const cedula = `${PREFIJO}${String(++n).padStart(2, "0")}`;
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({ fecha_creacion: fechaBogota(new Date().toISOString()), nombre, cedula, estado: "pendiente", origen: "chat_prueba", medio_postulacion: "whatsapp", simit_valor: 0, reingreso: false, autorizacion_datos: "si", licencia_categoria: "C2", ...extra })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, cedula, nombre };
}
const proceso = async (id: string) => (await db.from("procesos_contratacion").select("*").eq("id", id).single()).data as Record<string, unknown>;
const eventos = async (id: string, clave: string) =>
  ((await db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", id).not(`detalle->>${clave}`, "is", null)).data ?? []).map((e) => e.detalle as Record<string, unknown>);
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const manana = siguienteDiaHabil(fechaBogota(new Date().toISOString()));

/** El paso «Aprobó la prueba / terminó la escuela: pasar a exámenes» de la ficha (tablero-actions). */
async function pasarAExamenes(id: string) {
  let r = await enviarAExamenes(id, actor);
  if (!r.ok) {
    const p = await proceso(id);
    const g = p.estado === "en_escuela" ? await registrarClase(id, { resultado: "listo", observacion: "Prueba completa" }, actor) : await registrarPrueba(id, { resultado: "aprobo", observacion: "Prueba completa" }, actor);
    if (!g.ok) return g;
    r = await enviarAExamenes(id, actor);
  }
  return r;
}

async function pdf(lineas: string[]) {
  const doc = await PDFDocument.create();
  const pg = doc.addPage([612, 792]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  lineas.forEach((t, i) => pg.drawText(t, { x: 40, y: 740 - i * 20, size: 10, font: f }));
  return Buffer.from(await doc.save());
}
const informeEthikos = (cedula: string, pct: number, faltan = 0) =>
  pdf(["Datos del Candidato", "Nombre: Prueba Completa", `Identificacion: ${cedula}`, "Fecha: 22-11-2026 09:59:26", "RESUMEN", "RESULTADO FINAL", `${pct}%RESULTADO OBTENIDO`, "RESPUESTAS", "TOTAL DE PREGUNTAS 72", `CONTESTADAS SIN CONTESTAR ${72 - faltan} ${faltan}`]);
const informeDisc = (cedula: string, pct: number) =>
  pdf(["Datos del Candidato", "Nombre: Prueba Completa", `Identificacion: ${cedula}`, "Fecha: 22-11-2026 09:45:01", "AJUSTE DEL CANDIDATO AL PERFIL:", `0% 100% ${pct}%`, "0% a 50% 51% a 75% 76% a 100%", "No Recomendado Recomendado con sugerencias Recomendado"]);

await limpiar();
const ajustesOriginales = (await db.from("seleccion_ajustes").select("clave, valor").in("clave", ["contratar_exige_psicotecnica"])).data ?? [];
try {
  titulo("0. Preparación");
  const { data: lab } = await db
    .from("seleccion_laboratorios")
    .insert({ nombre: NOMBRE_LAB, canal: "whatsapp", whatsapp: "573009990993", activo: true, predeterminado: false, orden: 99, dias_atencion: [0, 1, 2, 3, 4, 5, 6], actualizado_por: actor.userEmail })
    .select("id")
    .single();
  const labId = lab!.id as string;
  const items = await itemsCarpeta();
  revisar("la carpeta pide el certificado bancario", items.includes("Certificado bancario"), items);

  const A = await crear("COMPLETO ANA PRINCIPAL");
  const E = await crear("COMPLETO EDU ESCUELA");
  const B = await crear("COMPLETO BETO NOAPTO SIGUE");
  const C = await crear("COMPLETO CARLA NOAPTO CIERRA");
  const D = await crear("COMPLETO DORA SIN CUENTA");

  titulo("1. Tablero: arrastrar hacia adelante abre la ficha con el paso que toca");
  const mov = movimientoAlSoltar("pendiente", "en_examenes");
  revisar("de preselección a exámenes: abre la ficha (no se mueve solo)", mov.tipo === "ficha");
  revisar("el primer paso es citar a la prueba de manejo", siguientePaso("pendiente", "en_examenes") === "citado");
  revisar("hacia atrás se mueve directo", movimientoAlSoltar("en_examenes_fase2", "en_examenes").tipo === "directo");
  for (const x of [A, E, B, C, D]) {
    const r = await citarProceso(x.id, { fecha: manana, hora: "08:00" }, actor);
    if (!r.ok) revisar(`citar a ${x.nombre}`, false, r.error);
  }
  revisar("citados a la prueba de manejo, con la citación", (await proceso(A.id)).estado === "citado" && (await proceso(E.id)).estado === "citado");
  revisar("el siguiente paso ya es pasar a exámenes", siguientePaso("citado", "en_examenes") === "en_examenes");

  titulo("2. Prueba de manejo: aprobó (A, B, C, D) o va a escuela (E)");
  for (const x of [A, B, C, D]) {
    const r = await pasarAExamenes(x.id);
    if (!r.ok) revisar(`a exámenes: ${x.nombre}`, false, r.error);
  }
  const pa = await proceso(A.id);
  revisar("A: en exámenes fase 1, con su cita y la pregunta del banco", pa.estado === "en_examenes" && !!pa.fecha_examenes && !!pa.banco_preguntado_at, { estado: pa.estado, banco: pa.banco_preguntado_at });
  const esc = await registrarPrueba(E.id, { resultado: "escuela", clasesSugeridas: 2, observacion: "Le falta práctica" }, actor);
  revisar("E: pasa a escuela", esc.ok && (await proceso(E.id)).estado === "en_escuela", esc);
  revisar("E: desde escuela el siguiente paso es exámenes", siguientePaso("en_escuela", "en_examenes_fase2") === "en_examenes");
  const e2 = await pasarAExamenes(E.id);
  revisar("E: terminó la escuela y pasa a exámenes", e2.ok && (await proceso(E.id)).estado === "en_examenes", e2);
  // Todos al laboratorio temporal (nadie real espera resultado allí).
  await db.from("procesos_contratacion").update({ laboratorio_id: labId }).in("id", [A.id, E.id, B.id, C.id, D.id]);

  titulo("3. Banco: respondió y el recordatorio del certificado");
  await db.from("procesos_contratacion").update({ banco_cuenta: "si", banco_respondido_at: horasAtras(50) }).in("id", [A.id, B.id, C.id, E.id]);
  await db.from("procesos_contratacion").update({ banco_cuenta: "no", banco_respondido_at: horasAtras(50) }).eq("id", D.id);
  const rc = await ejecutarRecordatoriosCertificado(new Date(), { soloProcesos: [A.id, D.id], sinHorario: true });
  revisar("A (tiene cuenta, 50 h): se le recuerda el certificado", (await eventos(A.id, "certificado_banco")).length === 1, rc);
  revisar("D (no tenía cuenta): todavía no, se le dan 72 h para abrirla", (await eventos(D.id, "certificado_banco")).length === 0);

  titulo("4. Resultado del laboratorio, fase 1");
  await leerYGuardarAvisos({ texto: `${A.nombre} CC ${A.cedula}: Sí, puede pasar a fase 2`, laboratorioId: labId, simulado: true });
  const paF2 = await proceso(A.id);
  revisar("A: la frase acordada lo pasa a fase 2 con su cita", paF2.estado === "en_examenes_fase2" && !!paF2.fecha_examenes_fase2, paF2.estado);
  // La radiografía llega aparte, sin nombre: va a su carpeta.
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const ruta = `pruebas/rx-completo-${Date.now()}.png`;
  await db.storage.from("whatsapp").upload(ruta, PNG, { contentType: "image/png" });
  archivosWhatsapp.push(ruta);
  await leerYGuardarAvisos({ texto: "", laboratorioId: labId, simulado: true, mediaPath: ruta, mime: "image/png", nombreArchivo: "radiografia.png" });
  const rx = (await db.from("seleccion_adjuntos").select("tipo").eq("proceso_id", A.id).eq("tipo", "examen_f1")).data ?? [];
  revisar("A: la radiografía quedó en su carpeta (exámenes fase 1)", rx.length === 1, rx);
  // Para B y C el aviso anterior ya no es «reciente».
  await db.from("seleccion_avisos_laboratorio").update({ created_at: horasAtras(2) }).eq("laboratorio_id", labId);
  await leerYGuardarAvisos({ texto: `${B.nombre} CC ${B.cedula}: no puede continuar, escoliosis leve en la radiografía.`, laboratorioId: labId, simulado: true });
  await leerYGuardarAvisos({ texto: `${C.nombre} CC ${C.cedula}: No puede pasar a fase 2. Positivo en prueba de drogas.`, laboratorioId: labId, simulado: true });
  const marcas = await examenesPorRevisar([B.id, C.id]);
  revisar("B y C: no aptos, marcados en el tablero para revisar", marcas.get(B.id)?.resultado === "no_apto" && marcas.get(C.id)?.resultado === "no_apto", [...marcas.entries()]);
  const sigue = await decidirNoApto(B.id, true, "Lo valoró el médico de la empresa: puede conducir.", actor);
  revisar("B: «sigue» → fase 2 con su cita y el mensaje", sigue.ok && (await proceso(B.id)).estado === "en_examenes_fase2", sigue);
  const noSigue = await decidirNoApto(C.id, false, "Positivo confirmado: no continúa.", actor);
  const pc = await proceso(C.id);
  revisar("C: «no sigue» → cerrado por exámenes médicos", noSigue.ok && pc.estado === "cierre" && pc.causa_no_contrato === "Exámenes médicos", pc.estado);
  revisar("C: ya cerrado no se puede volver a decidir", !(await decidirNoApto(C.id, true, "Cambio de opinión", actor)).ok);
  const rcC = await ejecutarRecordatoriosCertificado(new Date(), { soloProcesos: [C.id], sinHorario: true });
  revisar("C: cerrado, ya no se le recuerda el certificado", rcC.recordatorios === 0 && (await eventos(C.id, "certificado_banco")).length === 0, rcC);
  // E: fase 1 apta desde la ficha (paso del tablero «Fase 1 apta»).
  const eF1 = await registrarExamen(E.id, { fase: 1, resultado: "apto", observacion: "" }, actor);
  revisar("E: fase 1 apta desde la ficha → fase 2", eF1.ok && (await proceso(E.id)).estado === "en_examenes_fase2", eF1);

  titulo("5. Fase 2 y reconocimiento de ruta");
  const aF2 = await registrarExamen(A.id, { fase: 2, resultado: "apto", observacion: "" }, actor);
  revisar("A: fase 2 apta → reconocimiento de ruta", aF2.ok && (await proceso(A.id)).estado === "reconocimiento_ruta", aF2);
  const minimas = Number((await db.from("seleccion_ajustes").select("valor").eq("clave", "rutas_minimas").maybeSingle()).data?.valor ?? 2);
  const { data: obligatorias } = await db.from("seleccion_ajustes").select("valor").eq("clave", "rutas_obligatorias").maybeSingle();
  const rutas = [...(Array.isArray(obligatorias?.valor) ? (obligatorias!.valor as string[]) : [])];
  for (let i = 1; rutas.length < minimas; i++) rutas.push(`RUTA PRUEBA ${i}`);
  for (const r of rutas) await db.from("seleccion_reconocimientos_ruta").insert({ proceso_id: A.id, fecha: fechaBogota(new Date().toISOString()), ruta: r, resultado: "aprendida" });
  const fin = await finalizarReconocimiento(A.id, "Aprendió las rutas en las salidas.", actor);
  revisar("A: reconocimiento de ruta terminado", fin.ok && (await proceso(A.id)).reconocimiento_estado === "finalizado", fin);

  titulo("6. Psicosensotécnica en PsicoAlianza");
  await db.from("procesos_contratacion").update({ correo: "ana.completo@example.com", correo_estado: "validado", correo_validado_at: new Date().toISOString(), correo_validado_por: "enlace" }).eq("id", A.id);
  await db.from("procesos_contratacion").update({ correo: "edu.completo@example.com", correo_estado: "validado", correo_validado_at: new Date().toISOString(), correo_validado_por: "enlace" }).eq("id", E.id);
  let l = await listasPsico();
  revisar("A y E: por inscribir", [A, E].every((x) => l.porInscribir.some((p) => p.procesoId === x.id)));
  const pl = await plantillaPsicoAlianza([A.id, E.id]);
  revisar("plantilla de carga masiva con los 2", pl.ok && pl.filas === 2, pl);
  revisar("marcados inscritos (se les avisa)", (await marcarInscritos([A.id, E.id], actor)).marcados === 2);
  const rp = await reprogramarPsico(A.id, "no_presento", actor);
  l = await listasPsico();
  revisar("A no la presentó: vuelve a «Por inscribir» (2.ª vez)", rp.ok && l.porInscribir.find((p) => p.procesoId === A.id)?.reprogramaciones === 1, rp);
  revisar("A: inscrito otra vez", (await marcarInscritos([A.id], actor)).marcados === 1);
  const archivos = [
    { nombre: `Ethikos - Riesgos_${A.cedula}_Ana_20261122.pdf`, mime: "application/pdf", buffer: await informeEthikos(A.cedula, 82) },
    { nombre: `Ten DISC_${A.cedula}_Ana_20261122.pdf`, mime: "application/pdf", buffer: await informeDisc(A.cedula, 81.43) },
    { nombre: `Ethikos - Riesgos_${E.cedula}_Edu_20261122.pdf`, mime: "application/pdf", buffer: await informeEthikos(E.cedula, 70, 20) },
  ];
  const v = await vistaResultados(archivos);
  const fa = v.filas.find((x) => x.procesoId === A.id);
  const fe = v.filas.find((x) => x.procesoId === E.id);
  revisar("A: sus 2 informes en una fila, recomendado (Ethikos deducido: por confirmar)", fa?.archivos.length === 2 && fa?.resultado === "apto" && fa?.deducido === true, fa);
  revisar("E: preguntas sin contestar → «no la terminó»", fe?.estadoPrueba === "incompleta", fe);
  const g = await guardarResultados([{ clave: fa!.clave, procesoId: A.id, resultado: "apto", fecha: fa!.fecha, puntaje: fa!.puntaje, archivos: fa!.archivos, detalle: fa!.detalle }], archivos, actor);
  const pA = await proceso(A.id);
  revisar("A: psicosensotécnica apta guardada, con el detalle por prueba", g.guardados === 1 && pA.psicotecnica_resultado === "apto" && /Ten DISC/.test(String(pA.psicotecnica_entidad)), { g, ent: pA.psicotecnica_entidad });
  revisar("A: los 2 informes en su carpeta", ((await db.from("seleccion_adjuntos").select("id").eq("proceso_id", A.id).eq("tipo", "psicotecnica")).data ?? []).length === 2);
  const rpE = await reprogramarPsico(E.id, "incompleta", actor);
  revisar("E: no la terminó → se vuelve a inscribir", rpE.ok && (await proceso(E.id)).correo_estado === "validado", rpE);

  titulo("7. Condiciones para contratar");
  await db.from("seleccion_ajustes").update({ valor: true }).eq("clave", "contratar_exige_psicotecnica");
  await db.from("procesos_contratacion").update({ antecedentes_resultado: "revision", antecedentes_decision: "aprobado" }).eq("id", A.id);
  let cond = await condicionesDeProceso(A.id);
  const id = (k: string) => cond.condiciones.find((x) => x.id === k)?.cumple;
  revisar("exámenes, rutas, antecedentes y psicosensotécnica: cumplidos", id("examenes") && id("rutas") && id("antecedentes") && id("psicotecnica"), cond.condiciones.map((c) => [c.id, c.cumple]));
  revisar("falta la carpeta (con el certificado bancario) y el visto bueno", !id("carpeta") && !id("aprobacion"), cond.faltan);
  let error = "";
  try {
    await cambiarEstadoProceso(A.id, "contratado", { actor });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revisar("contratar sin eso falla y dice qué falta", /falta/i.test(error) && (await proceso(A.id)).estado === "reconocimiento_ruta", error);
  // Llega el certificado: el recordatorio se detiene.
  await marcarItemCarpeta(A.id, "Certificado bancario", "recibido", "Recibido por WhatsApp", actor);
  await db.from("procesos_contratacion_eventos").update({ created_at: horasAtras(60) }).eq("proceso_id", A.id).not("detalle->>certificado_banco", "is", null);
  const rcA = await ejecutarRecordatoriosCertificado(new Date(), { soloProcesos: [A.id], sinHorario: true });
  revisar("con el certificado recibido ya no se le recuerda", rcA.recordatorios === 0 && (await eventos(A.id, "certificado_banco")).length === 1, rcA);
  for (const i of items) await marcarItemCarpeta(A.id, i, "validado", null, actor);
  // 25-nov-2026: con todo menos el visto bueno pasa solo a «Listo para contratar».
  revisar("carpeta validada: pasa solo a «Listo para contratar»", (await proceso(A.id)).estado === "listo_contratar", (await proceso(A.id)).estado);
  const entradas = async () => ((await db.from("procesos_contratacion_eventos").select("id, detalle").eq("proceso_id", A.id).eq("tipo", "estado").eq("estado_nuevo", "listo_contratar")).data ?? []);
  revisar("queda en el historial como automático", (await entradas()).length === 1 && (await entradas())[0].detalle?.listo_para_contratar === true, await entradas());
  revisar("revisarlo otra vez no lo mueve ni repite el aviso", (await sincronizarListoContratar(A.id)).movido === null && (await entradas()).length === 1);
  // Deja de cumplir (se le quita la validación a un documento): vuelve a la etapa de la que venía.
  await marcarItemCarpeta(A.id, items[0], "recibido", null, actor);
  revisar("deja de cumplir: vuelve solo a «Reconocimiento de ruta»", (await proceso(A.id)).estado === "reconocimiento_ruta", (await proceso(A.id)).estado);
  await marcarItemCarpeta(A.id, items[0], "validado", null, actor);
  revisar("vuelve a cumplir: otra vez «Listo para contratar»", (await proceso(A.id)).estado === "listo_contratar" && (await entradas()).length === 2);
  const listosHoy = await listosParaContratar();
  revisar("sale en la lista de listos del reporte diario, sin visto bueno", listosHoy.some((l) => l.cedula === A.cedula && !l.conVistoBueno) || (await proceso(A.id)).origen === "chat_prueba", listosHoy.map((l) => l.cedula));
  // En la etapa todavía no se puede contratar: falta el visto bueno.
  error = "";
  try {
    await cambiarEstadoProceso(A.id, "contratado", { actor });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revisar("listo, pero sin el visto bueno todavía no se contrata", /visto bueno/i.test(error) && (await proceso(A.id)).estado === "listo_contratar", error);
  await aprobarContratacion(A.id, true, actor);
  cond = await condicionesDeProceso(A.id);
  revisar("con la carpeta validada y el visto bueno: se puede contratar", cond.ok, cond.faltan);
  await cambiarEstadoProceso(A.id, "contratado", { actor });
  revisar("A: CONTRATADO", (await proceso(A.id)).estado === "contratado");
  revisar("se creó su registro de empleado", ((await db.from("employees").select("id").eq("document_number", A.cedula)).data ?? []).length === 1);
  revisar("contratado: ya no se reprograma la psicosensotécnica", !(await reprogramarPsico(A.id, "no_presento", actor)).ok);

  titulo("8. Reporte diario con alertas");
  const datos = await datosReporteDiario();
  const rep = armarReporteDiario(datos, { desarrollo: true });
  const alertas = alertasDelReporte(datos);
  revisar("se arma el reporte (lo de ayer y 30 días)", /reporte del/.test(rep.asunto) && rep.html.includes("Embudo"), rep.asunto);
  revisar("las alertas, si hay, van en el asunto y arriba", alertas.length === 0 ? !rep.asunto.includes("⚠") : rep.asunto.includes(`⚠ ${alertas.length}`) && rep.html.indexOf("para revisar") < rep.html.indexOf("Embudo"), alertas.map((a) => a.clave));
} finally {
  for (const a of ajustesOriginales) await db.from("seleccion_ajustes").update({ valor: a.valor }).eq("clave", a.clave);
  await limpiar();
}

console.log(`\n${ok} bien, ${fallos.length} mal.`);
if (fallos.length) {
  console.log("Fallas:\n" + fallos.map((f) => `  - ${f}`).join("\n"));
  process.exitCode = 1;
}
