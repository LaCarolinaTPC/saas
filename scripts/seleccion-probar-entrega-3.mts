// Batería simulada de la Entrega 3 de Selección contra la base de .env.local (desarrollo): reglas de
// antecedentes, exámenes, carpeta y adjuntos, condiciones para contratar, consumos y laboratorio.
// Solo crea candidatos ficticios «chat_prueba» (no sale WhatsApp ni se consulta Croma) y lo borra todo al terminar.
// No contrata a nadie de verdad: contratar crea el conductor o el empleado en Gestivo.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-entrega-3.mts
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEstadoProceso, type ActorProceso } from "@/lib/contratacion/servidor";
import { evaluarAntecedentesProceso, marcarRevisionAntecedentes } from "@/lib/seleccion/servidor";
import { cerrarPorExamenes, registrarExamen } from "@/lib/seleccion/examenes-servidor";
import { anularAdjuntoSeleccion, carpetaDeProceso, guardarAdjuntoSeleccion, itemsCarpeta, marcarItemCarpeta, tipoDeItem } from "@/lib/seleccion/carpeta-servidor";
import { aprobarContratacion, condicionesDeProceso } from "@/lib/seleccion/contratacion-servidor";
import { gastoDelMes, registrarConsumo } from "@/lib/seleccion/consumos-servidor";
import { conversacionesDeLaboratorio, esConversacionDeLaboratorio, marcarTipoContacto } from "@/lib/seleccion/laboratorio-servidor";
import { citasDeProceso } from "@/lib/seleccion/agenda-servidor";
import { confirmarAviso, procesarMensajeLaboratorio } from "@/lib/seleccion/laboratorio-lectura";

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-e3@gestivo.test" };
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

const PREFIJO = "99900003";
const TELEFONO_LAB = "570000000399";
async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").eq("origen", "chat_prueba").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((x) => x.id as string);
  for (const id of ids) {
    const { data: archivos } = await db.storage.from("seleccion").list(id, { limit: 100 });
    for (const carpeta of archivos ?? []) {
      const { data: dentro } = await db.storage.from("seleccion").list(`${id}/${carpeta.name}`, { limit: 100 });
      const rutas = (dentro ?? []).map((f) => `${id}/${carpeta.name}/${f.name}`);
      if (rutas.length) await db.storage.from("seleccion").remove(rutas);
    }
  }
  // Las órdenes simuladas al laboratorio (envío automático al citar a exámenes, 23-nov-2026).
  if (ids.length) await db.from("seleccion_envios_laboratorio").delete().overlaps("proceso_ids", ids);
  if (ids.length) await db.from("procesos_contratacion").delete().in("id", ids);
  await db.from("seleccion_consumos").delete().eq("modelo", "prueba-e3");
  // Los avisos del laboratorio de prueba (sus mensajes se borran con el contacto).
  const { data: convLab } = await db.from("wa_contactos").select("wa_conversaciones(id, wa_mensajes(id))").eq("telefono", TELEFONO_LAB).maybeSingle();
  const idsMsj = ((convLab?.wa_conversaciones ?? []) as { wa_mensajes: { id: string }[] }[]).flatMap((c) => c.wa_mensajes.map((m) => m.id));
  if (idsMsj.length) await db.from("seleccion_avisos_laboratorio").delete().in("wa_mensaje_id", idsMsj);
  const { data: contacto } = await db.from("wa_contactos").select("id").eq("telefono", TELEFONO_LAB).maybeSingle();
  if (contacto) await db.from("wa_contactos").delete().eq("id", contacto.id);
  return ids.length;
}
let n = 0;
async function crear(estado: string, extra: Record<string, unknown> = {}): Promise<string> {
  n++;
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({
      fecha_creacion: "2026-11-20",
      nombre: `PRUEBA E3 ${String(n).padStart(2, "0")}`,
      cedula: `${PREFIJO}${String(n).padStart(2, "0")}`,
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

/** Las cuatro fuentes limpias, cambiando las que se den. */
async function antecedentes(procesoId: string, cambios: Partial<Record<"policia" | "procuraduria" | "contraloria" | "rnmc", Record<string, unknown>>>) {
  const base = {
    policia: { has_records: false },
    procuraduria: { found: true, has_records: false },
    contraloria: { is_fiscal_responsible: false, records: [] },
    rnmc: { found: true, full_name: "PRUEBA E3", has_pending_measures: false, pending_measures: [] },
    ...cambios,
  };
  const cedula = String((await proceso(procesoId)).cedula);
  await db.from("verificaciones_externas").insert(
    Object.entries(base).map(([fuente, resultado]) => ({ proceso_id: procesoId, cedula, proveedor: "simulado", fuente, estado: "ok", resultado: { ...resultado, simulado: true } }))
  );
}
const medidas = (k: number) => ({ found: true, full_name: "PRUEBA E3", has_pending_measures: true, pending_measures: Array.from({ length: k }, (_, i) => ({ descripcion: `Medida ${i + 1}` })) });

/** Un PDF mínimo válido con líneas de texto (Helvetica), con su tabla de referencias bien calculada. */
function pdfConTexto(lineas: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const flujo = `BT /F1 12 Tf 50 750 Td 16 TL ${lineas.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(flujo)} >>\nstream\n${flujo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let salida = "%PDF-1.4\n";
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(Buffer.byteLength(salida));
    salida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(salida);
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(salida, "latin1");
}

await limpiar();
try {
  // ───────────────────────────────────────────────────────────────────────
  titulo("1. Reglas de antecedentes con los valores de la base");
  const { data: reglas } = await db.from("seleccion_ajustes").select("clave, valor").like("clave", "ant\\_%");
  console.log(`  (reglas: ${(reglas ?? []).map((r) => `${r.clave}=${JSON.stringify(r.valor)}`).join(", ")})`);
  const valor = (c: string) => (reglas ?? []).find((r) => r.clave === c)?.valor;
  revisar("están sembradas las 8 reglas", (reglas ?? []).length === 8, reglas?.length);

  const limpio = await crear("antecedentes");
  await antecedentes(limpio, {});
  revisar("las cuatro limpias: limpio y puede seguir", (await evaluarAntecedentesProceso(limpio))?.permite === true);
  revisar("el veredicto queda en el proceso", (await proceso(limpio)).antecedentes_resultado === "limpio");

  const policia = await crear("antecedentes");
  await antecedentes(policia, { policia: { has_records: true } });
  const evP = await evaluarAntecedentesProceso(policia);
  revisar(`Policía con hallazgo: ${valor("ant_policia_accion")}`, evP?.veredicto === (valor("ant_policia_accion") === "tolera" ? "tolerable" : valor("ant_policia_accion")), evP?.veredicto);
  if (evP?.veredicto === "revision") {
    await marcarRevisionAntecedentes(policia);
    const { data: ev } = await db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", policia).eq("detalle->>revision_antecedentes", "true");
    revisar("queda marcado para revisión de una persona", (ev ?? []).length === 1);
  }

  const fiscal = await crear("antecedentes");
  await antecedentes(fiscal, { contraloria: { is_fiscal_responsible: true, records: [{ amount: 5_000_000, ruling_date: "2024-06-15" }] } });
  const evF = await evaluarAntecedentesProceso(fiscal);
  revisar(`Contraloría responsable fiscal: ${valor("ant_contraloria_accion")}`, evF?.veredicto === (valor("ant_contraloria_accion") === "tolera" ? "tolerable" : valor("ant_contraloria_accion")), evF?.veredicto);
  if (evF?.veredicto === "descarta") {
    await marcarRevisionAntecedentes(fiscal);
    const { data: ev } = await db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", fiscal).eq("detalle->>propone_cierre", "true");
    revisar("descarta: propone el cierre y no cierra solo", (ev ?? []).length === 1 && (await proceso(fiscal)).estado === "antecedentes");
  }

  const max = Number(valor("ant_rnmc_max_toleradas") ?? 0);
  const rnmcOk = await crear("antecedentes");
  await antecedentes(rnmcOk, { rnmc: medidas(Math.max(1, max)) });
  const evR = await evaluarAntecedentesProceso(rnmcOk);
  revisar(`RNMC con ${Math.max(1, max)} medida(s): ${max >= 1 ? "tolerable" : "no tolerable"}`, max >= 1 ? evR?.veredicto === "tolerable" && evR.permite : evR?.permite === false, evR?.veredicto);
  const rnmcMal = await crear("antecedentes");
  await antecedentes(rnmcMal, { rnmc: medidas(max + 1) });
  const evR2 = await evaluarAntecedentesProceso(rnmcMal);
  revisar(`RNMC con ${max + 1} medidas: no se tolera`, evR2?.veredicto !== "tolerable" && evR2?.permite === false, evR2?.veredicto);

  await db.from("procesos_contratacion").update({ antecedentes_decision: "aprobado" }).eq("id", rnmcMal);
  revisar("aprobado por una persona: puede seguir", (await evaluarAntecedentesProceso(rnmcMal))?.permite === true);
  await db.from("procesos_contratacion").update({ antecedentes_decision: "rechazado" }).eq("id", rnmcOk);
  revisar("rechazado por una persona: no sigue aunque se tolere", (await evaluarAntecedentesProceso(rnmcOk))?.permite === false);

  // ───────────────────────────────────────────────────────────────────────
  titulo("2. Exámenes médicos");
  const ex = await crear("en_examenes", { fecha_prueba_manejo: "2026-11-19" });
  revisar("la fase 2 no se registra antes de la 1", (await registrarExamen(ex, { fase: 2, resultado: "apto" }, actor)).ok === false);
  revisar("no apto exige la observación", (await registrarExamen(ex, { fase: 1, resultado: "no_apto" }, actor)).ok === false);
  const f1 = await registrarExamen(ex, { fase: 1, resultado: "apto" }, actor);
  const p1 = await proceso(ex);
  revisar("fase 1 apta: pasa a exámenes fase 2", f1.ok && p1.estado === "en_examenes_fase2", { f1, estado: p1.estado });
  revisar("queda la fecha de la fase 2", !!p1.fecha_examenes_fase2, p1.fecha_examenes_fase2);
  revisar("queda la cita de la fase 2", (await citasDeProceso(ex)).some((c) => c.tipo === "examen_f2"));
  revisar("el mensaje de la fase 2 no sale en el chat de prueba", f1.envio === "prueba", f1.envio);
  const f2 = await registrarExamen(ex, { fase: 2, resultado: "apto" }, actor);
  revisar("fase 2 apta: pasa a reconocimiento de ruta", f2.ok && (await proceso(ex)).estado === "reconocimiento_ruta");
  const ex2 = await crear("en_examenes");
  const na = await registrarExamen(ex2, { fase: 1, resultado: "no_apto", observacion: "Hipertensión no controlada" }, actor);
  revisar("no apto: propone el cierre y no cierra solo", na.ok && na.proponeCierre === true && (await proceso(ex2)).estado === "en_examenes");
  await cerrarPorExamenes(ex2, actor);
  const pc = await proceso(ex2);
  revisar("al confirmarlo se cierra con «Exámenes médicos»", pc.estado === "cierre" && pc.causa_no_contrato === "Exámenes médicos", pc.causa_no_contrato);

  // ───────────────────────────────────────────────────────────────────────
  titulo("3. Carpeta, adjuntos y referencias");
  const items = await itemsCarpeta();
  console.log(`  (carpeta: ${items.join(", ")})`);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const idAdj = await guardarAdjuntoSeleccion({ procesoId: ex, tipo: tipoDeItem(items[0]), nombre: "hoja.pdf", mime: "application/pdf", buffer: pdf }, actor);
  let c = await carpetaDeProceso(ex);
  revisar("subir un archivo deja el documento «recibido»", c?.items[0].estado === "recibido" && c.items[0].archivos.length === 1, c?.items[0]);
  revisar("el archivo tiene URL firmada", !!c?.items[0].archivos[0]?.url);
  revisar("anular exige motivo", (await anularAdjuntoSeleccion(idAdj, "no", actor)).ok === false);
  revisar("anular con motivo lo saca de la carpeta", (await anularAdjuntoSeleccion(idAdj, "Era de otra persona", actor)).ok && (await carpetaDeProceso(ex))?.items[0].archivos.length === 0);
  revisar("un documento que no está en la lista se rechaza", (await marcarItemCarpeta(ex, "Pasaporte", "validado", null, actor)).ok === false);
  for (const i of items) await marcarItemCarpeta(ex, i, "validado", null, actor);
  c = await carpetaDeProceso(ex);
  revisar("todos validados, con quién validó", c?.items.every((i) => i.estado === "validado" && i.validadoPor === actor.userEmail));

  // ───────────────────────────────────────────────────────────────────────
  titulo("4. Condiciones para contratar");
  const { data: aj } = await db.from("seleccion_ajustes").select("clave, valor").in("clave", ["contratar_exige_condiciones", "contratar_exige_psicotecnica", "rutas_minimas"]);
  console.log(`  (ajustes: ${(aj ?? []).map((a) => `${a.clave}=${JSON.stringify(a.valor)}`).join(", ")})`);
  const conPsico = (aj ?? []).find((a) => a.clave === "contratar_exige_psicotecnica")?.valor === true;
  // Antecedentes (23-nov-2026): sin resolver, o con un hallazgo sin decidir, frenan la contratación.
  const antecedentesCumple = async () => (await condicionesDeProceso(ex)).condiciones.find((x) => x.id === "antecedentes")?.cumple;
  revisar("sin antecedentes consultados: frenan la contratación", (await antecedentesCumple()) === false);
  await db.from("procesos_contratacion").update({ antecedentes_resultado: "revision" }).eq("id", ex);
  revisar("con un hallazgo en revisión sin decidir: frenan", (await antecedentesCumple()) === false);
  await db.from("procesos_contratacion").update({ antecedentes_decision: "aprobado" }).eq("id", ex);
  revisar("aprobados por una persona: ya no frenan", (await antecedentesCumple()) === true);
  let cond = await condicionesDeProceso(ex);
  revisar("sin rutas ni visto bueno: no se puede", cond.exigir && !cond.ok && cond.faltan.length === (conPsico ? 3 : 2), cond.faltan);
  let error = "";
  try {
    await cambiarEstadoProceso(ex, "contratado", { actor });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revisar("pasar a «Contratado» falla y dice qué falta", /Para contratar falta/.test(error) && (await proceso(ex)).estado === "reconocimiento_ruta", error);
  const minimas = Number((aj ?? []).find((a) => a.clave === "rutas_minimas")?.valor ?? 2);
  for (let i = 0; i < minimas; i++) await db.from("seleccion_reconocimientos_ruta").insert({ proceso_id: ex, fecha: "2026-11-20", ruta: `RUTA PRUEBA ${i + 1}`, resultado: "aprendida" });
  await aprobarContratacion(ex, true, actor);
  cond = await condicionesDeProceso(ex);
  revisar(conPsico ? "con todo menos la psicotécnica: falta solo esa" : "con todo cumplido: se puede contratar", conPsico ? cond.faltan.length === 1 : cond.ok, cond.faltan);
  const reing = await crear("reconocimiento_ruta", { reingreso: true });
  revisar("el reingreso no necesita rutas", (await condicionesDeProceso(reing)).condiciones.find((x) => x.id === "rutas")?.cumple === true);

  // ───────────────────────────────────────────────────────────────────────
  titulo("5. Consumos y tope");
  const antes = await gastoDelMes();
  await registrarConsumo({ concepto: "asistente", modelo: "prueba-e3", tokensEntrada: 1_000_000, tokensSalida: 0, costoUsd: 1 });
  const despues = await gastoDelMes();
  revisar("el consumo suma al gasto del mes", !!antes && !!despues && despues.gastoCop - antes.gastoCop === despues.trm, { antes: antes?.gastoCop, despues: despues?.gastoCop });
  console.log(`  (gasto del mes: $${despues?.gastoCop.toLocaleString("es-CO")} de $${despues?.topeCop.toLocaleString("es-CO")}, ${despues?.porcentaje} %)`);

  // ───────────────────────────────────────────────────────────────────────
  titulo("6. Contacto de laboratorio");
  const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TELEFONO_LAB, nombre: "LABORATORIO PRUEBA" }).select("id").single();
  const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id }).select("id").single();
  revisar("por defecto es una persona", (await esConversacionDeLaboratorio(conv!.id as string)) === false);
  await marcarTipoContacto(TELEFONO_LAB, "laboratorio");
  revisar("marcado como laboratorio, el asistente lo salta", (await esConversacionDeLaboratorio(conv!.id as string)) === true);
  revisar("y el seguimiento y la reactivación también", (await conversacionesDeLaboratorio([conv!.id as string])).has(conv!.id as string));

  // ───────────────────────────────────────────────────────────────────────
  titulo("7. Lectura de un mensaje del laboratorio (una llamada corta al modelo del asistente)");
  const enLab = await crear("en_examenes");
  const pLab = await proceso(enLab);
  const { data: msj } = await db
    .from("wa_mensajes")
    .insert({ conversacion_id: conv!.id, direccion: "entrante", contenido: `Buenas tardes. Resultados de ingreso: ${pLab.nombre}, CC ${pLab.cedula}, exámenes generales APTO.`, timestamp: new Date().toISOString() })
    .select("id")
    .single();
  const leidos = await procesarMensajeLaboratorio(conv!.id as string, msj!.id as string);
  const { data: avisos } = await db.from("seleccion_avisos_laboratorio").select("*").eq("wa_mensaje_id", msj!.id);
  const aviso = (avisos ?? [])[0];
  revisar("queda un aviso para confirmar", leidos === 1 && !!aviso && aviso.estado === "pendiente", { leidos, aviso });
  revisar("asociado al aspirante por la cédula", aviso?.proceso_id === enLab, aviso?.proceso_id);
  revisar("con el resultado y la fase leídos", aviso?.resultado_propuesto === "apto" && aviso?.fase === 1, { resultado: aviso?.resultado_propuesto, fase: aviso?.fase });
  revisar("el proceso no cambia hasta confirmar", (await proceso(enLab)).estado === "en_examenes");
  const conf = await confirmarAviso(aviso!.id as string, { procesoId: enLab, fase: 1, resultado: "apto" }, actor);
  revisar("al confirmar se registra el examen y pasa a fase 2", conf.ok && (await proceso(enLab)).estado === "en_examenes_fase2", conf);
  const { data: saludo } = await db.from("wa_mensajes").insert({ conversacion_id: conv!.id, direccion: "entrante", contenido: "Buenos días, ¿a qué hora abren mañana?", timestamp: new Date().toISOString() }).select("id").single();
  revisar("un saludo sin resultados no deja aviso", (await procesarMensajeLaboratorio(conv!.id as string, saludo!.id as string)) === 0);

  // ───────────────────────────────────────────────────────────────────────
  titulo("8. PDF de resultados del laboratorio (una llamada al modelo con el documento)");
  const enPdf = await crear("en_examenes_fase2");
  const pPdf = await proceso(enPdf);
  const ruta = `${conv!.id}/prueba-e3-${Date.now()}.pdf`;
  await db.storage.from("whatsapp").upload(ruta, pdfConTexto([`LABORATORIO CLINICO PRUEBA`, `Paciente: ${pPdf.nombre}`, `Documento: CC ${pPdf.cedula}`, `Examenes de ingreso - segunda toma (ayunas)`, `Concepto: APTO`]), { contentType: "application/pdf" });
  const { data: msjPdf } = await db
    .from("wa_mensajes")
    .insert({ conversacion_id: conv!.id, direccion: "entrante", contenido: "", media_tipo: "document", mime_type: "application/pdf", nombre_archivo: "resultado.pdf", media_path: ruta, timestamp: new Date().toISOString() })
    .select("id")
    .single();
  await procesarMensajeLaboratorio(conv!.id as string, msjPdf!.id as string);
  const { data: avPdf } = await db.from("seleccion_avisos_laboratorio").select("*").eq("wa_mensaje_id", msjPdf!.id);
  const a2 = (avPdf ?? [])[0];
  revisar("del PDF sale el aviso asociado al aspirante", a2?.proceso_id === enPdf, { proceso: a2?.proceso_id, nombre: a2?.nombre_leido, cedula: a2?.cedula_leida });
  revisar("con apto y la fase 2", a2?.resultado_propuesto === "apto" && a2?.fase === 2, { resultado: a2?.resultado_propuesto, fase: a2?.fase });
  await db.storage.from("whatsapp").remove([ruta]);
} catch (e) {
  fallos.push(`${seccion}: EXCEPCIÓN ${e instanceof Error ? e.stack : String(e)}`);
  console.log(`  ✘ EXCEPCIÓN ${e instanceof Error ? e.message : String(e)}`);
} finally {
  const borrados = await limpiar();
  const quedan = (await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`)).count;
  console.log(`\nLimpieza: ${borrados} candidatos ficticios borrados; quedan ${quedan}.`);
}
console.log(`\nRESULTADO: ${ok} correctas, ${fallos.length} con problema.`);
for (const f of fallos) console.log(` ✘ ${f}`);
