// Batería de laboratorios, órdenes, documentos y «aplazado» contra la base de .env.local (desarrollo).
// Necesita la migración 20261121194842. Crea candidatos ficticios «chat_prueba» (no sale nada por WhatsApp ni
// por correo) y lo borra todo al terminar. Hace UNA llamada real al modelo (la lectura del mensaje simulado del
// laboratorio). Si los laboratorios no tienen plantillas, se pueden subir con:
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-laboratorios.mts --orden <orden.docx> --carta <carta.docx>
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractText, getDocumentProxy } from "unpdf";

async function textoPdf(b: Buffer): Promise<string> {
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(b)), { mergePages: true });
  return String(text).replace(/\s+/g, " ");
}
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { avisarProceso, crearCitaSimple } from "@/lib/seleccion/agenda-servidor";
import { registrarExamen } from "@/lib/seleccion/examenes-servidor";
import { leerYGuardarAvisos } from "@/lib/seleccion/laboratorio-lectura";
import {
  asegurarLaboratorio, asignarLaboratorio, documentosAspirante, enviarDocumentosAspirante, enviarOrdenLaboratorio, leerLaboratorios,
  hiloLaboratorio, pendientesPrueba, planFase1, subirPlantillaCarta, subirPlantillaOrden, vistaOrden,
} from "@/lib/seleccion/laboratorios-servidor";

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-laboratorios@gestivo.test" };
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
    fallos.push(`${seccion}: ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 400)}` : ""}`);
    console.log(`  ✘ ${nombre}${detalle !== undefined ? ` → ${JSON.stringify(detalle).slice(0, 400)}` : ""}`);
  }
};
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : null;
};

const PREFIJO = "99900031";
const avisosCreados: string[] = [];
async function limpiar() {
  if (avisosCreados.length) await db.from("seleccion_avisos_laboratorio").delete().in("id", avisosCreados);
  const { data } = await db.from("procesos_contratacion").select("id").eq("origen", "chat_prueba").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((p) => p.id as string);
  if (ids.length) {
    await db.from("seleccion_envios_laboratorio").delete().overlaps("proceso_ids", ids);
    await db.from("seleccion_avisos_laboratorio").delete().in("proceso_id", ids);
    await db.from("seleccion_examenes").delete().in("proceso_id", ids);
    await db.from("seleccion_citas").delete().in("proceso_id", ids);
    await db.from("procesos_contratacion_eventos").delete().in("proceso_id", ids);
    await db.from("procesos_contratacion").delete().in("id", ids);
  }
  await db.from("candidates").delete().like("document_number", `${PREFIJO}%`);
}

async function crearProceso(n: number, nombre: string): Promise<string> {
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({ fecha_creacion: new Date().toISOString().slice(0, 10), nombre, cedula: `${PREFIJO}${String(n).padStart(2, "0")}`, estado: "en_examenes", origen: "chat_prueba", medio_postulacion: "whatsapp", simit_valor: 0, reingreso: false })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

const textoDocx = async (b: Buffer) => (await (await JSZip.loadAsync(b)).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, "");
const manana = () => {
  const d = new Date(Date.now() + 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
};

await limpiar();
try {
  titulo("Configuración");
  const labs = await leerLaboratorios();
  revisar("hay laboratorios (migración aplicada)", labs.length >= 2, labs.map((l) => l.nombre));
  const biobac = labs.find((l) => /biobac/i.test(l.nombre))!;
  const rescate = labs.find((l) => /rescate/i.test(l.nombre))!;
  // En desarrollo los correos de Biobac pueden estar cambiados por la lista de pruebas (soporte).
  const biobacDePrueba = !!biobac && !biobac.correos.some((c) => /biobacips/i.test(c));
  revisar(biobacDePrueba ? "Biobac por correo (en desarrollo, a la lista de pruebas), predeterminado" : "Biobac por correo a recepción y comercial, predeterminado", biobac?.canal === "correo" && (biobacDePrueba || (biobac.correos.includes("recepcion@biobacips.com") && biobac.correos.includes("comercial2@biobacips.com"))) && biobac.predeterminado, biobac);
  revisar("Rescate por WhatsApp", rescate?.canal === "whatsapp", rescate);
  const orden = arg("orden");
  const carta = arg("carta");
  if (orden && biobac) revisar("se sube la plantilla de la orden a Biobac", (await subirPlantillaOrden(biobac.id, readFileSync(orden), actor.userEmail)).ok);
  if (orden && rescate) revisar("y a Rescate", (await subirPlantillaOrden(rescate.id, readFileSync(orden), actor.userEmail)).ok);
  if (carta) revisar("se sube la carta del banco", (await subirPlantillaCarta(readFileSync(carta), actor.userEmail)).ok);

  titulo("Reparto y días de atención");
  const { data: conDias, error: sinDias } = await db.from("seleccion_laboratorios").select("id, dias_atencion, dias_preferidos, activo");
  if (sinDias) {
    console.log("  (sin la migración 20261121202736: se salta)");
  } else {
    // El próximo sábado y el lunes siguiente.
    const hoyF = new Date();
    const sab = new Date(hoyF);
    sab.setUTCDate(hoyF.getUTCDate() + ((6 - hoyF.getUTCDay() + 7) % 7 || 7));
    const sabado = sab.toISOString().slice(0, 10);
    const lun = new Date(sab);
    lun.setUTCDate(sab.getUTCDate() + 2);
    const lunes = lun.toISOString().slice(0, 10);
    const antes = conDias ?? [];
    // Estas revisiones son del reparto «predeterminado»; si en la base está «por porcentaje», se cambia mientras tanto.
    const { data: reparto } = await db.from("seleccion_ajustes").select("valor").eq("clave", "laboratorio_reparto").maybeSingle();
    try {
      if (reparto) await db.from("seleccion_ajustes").update({ valor: "predeterminado" }).eq("clave", "laboratorio_reparto");
      await db.from("seleccion_laboratorios").update({ dias_atencion: [1, 2, 3, 4, 5, 6], dias_preferidos: [6], activo: true }).eq("id", rescate.id);
      await db.from("seleccion_laboratorios").update({ dias_atencion: [1, 2, 3, 4, 5, 6], dias_preferidos: [], activo: true }).eq("id", biobac.id);
      const s = await planFase1(sabado);
      revisar("el sábado va a Rescate (preferido)", s.laboratorio?.id === rescate.id && s.fecha === sabado, s);
      const l = await planFase1(lunes);
      revisar("entre semana, al predeterminado (Biobac)", l.laboratorio?.id === biobac.id, l);
      await db.from("seleccion_laboratorios").update({ dias_atencion: [1, 2, 3, 4, 5], dias_preferidos: [] }).eq("id", rescate.id);
      await db.from("seleccion_laboratorios").update({ dias_atencion: [1, 2, 3, 4, 5] }).eq("id", biobac.id);
      const corrida = await planFase1(sabado);
      revisar("si nadie atiende el sábado, la cita pasa al lunes", corrida.fecha === lunes && corrida.laboratorio, corrida);
    } finally {
      if (reparto) await db.from("seleccion_ajustes").update({ valor: reparto.valor }).eq("clave", "laboratorio_reparto");
      for (const a of antes) await db.from("seleccion_laboratorios").update({ dias_atencion: a.dias_atencion, dias_preferidos: a.dias_preferidos, activo: a.activo }).eq("id", a.id);
    }
  }

  titulo("Aspirantes de prueba: uno a cada laboratorio, por turnos");
  {
    // 23-nov-2026: los de prueba alternan entre los laboratorios (aunque el reparto real diga otra cosa).
    const diaHabil = (() => {
      const d = new Date(Date.now() + 86_400_000);
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const turnos: (string | null)[] = [];
    for (let i = 0; i < 3; i++) turnos.push((await asegurarLaboratorio(await crearProceso(80 + i, `ASPIRANTE TURNO ${i + 1}`), actor, diaHabil))?.nombre ?? null);
    revisar("tres seguidos: uno, el otro y otra vez el primero", turnos.every(Boolean) && turnos[0] !== turnos[1] && turnos[0] === turnos[2], turnos);
  }

  titulo("Citar la fase 1: laboratorio, mensaje y documentos");
  const p1 =await crearProceso(1, "NIXON ALEXANDER LEAL GARCIA");
  const lab1 = await asegurarLaboratorio(p1, actor);
  revisar("sin laboratorio, queda el predeterminado (Biobac)", lab1?.id === biobac.id, lab1?.nombre);
  const cuando = { fecha: manana(), hora: "06:30" };
  const cita1 = await crearCitaSimple(p1, "examen_f1", cuando, actor);
  revisar("se crea la cita de la fase 1", cita1);
  const aviso = await avisarProceso(p1, "examenes_fase1", cuando);
  revisar("el mensaje dice el laboratorio del aspirante, la fecha y pregunta por el Banco de Bogotá", /BIOBAC/i.test(aviso.texto) && /Fecha:/.test(aviso.texto) && /Banco de Bogot/i.test(aviso.texto) && !/Mañana/.test(aviso.texto), aviso.texto);
  const docs = await documentosAspirante(p1, cuando);
  const ordenDoc = docs.documentos.find((d) => d.tipo === "orden");
  const cartaDoc = docs.documentos.find((d) => d.tipo === "carta");
  revisar("se generan la orden y la carta", ordenDoc && cartaDoc, docs.avisos);
  if (ordenDoc) {
    const t = await textoDocx(ordenDoc.contenido);
    revisar("la orden lleva nombre, cédula, cargo y el laboratorio", t.includes("NIXON ALEXANDER LEAL GARCIA") && t.includes(`${PREFIJO}01`) && t.includes("CONDUCTOR - COBRADOR") && /BIOBAC/i.test(t) && !/\{[a-z_]+\}/.test(t), { faltan: ordenDoc.faltan });
  }
  if (cartaDoc) {
    // 23-nov-2026: si la plantilla de la carta es PDF, la carta sale en PDF.
    const t = cartaDoc.mime === "application/pdf" ? await textoPdf(cartaDoc.contenido) : await textoDocx(cartaDoc.contenido);
    // En PDF (modo limpio, 23-nov-2026) el texto de la plantilla se quita y se reescribe: tampoco quedan marcas.
    const pdf = cartaDoc.mime === "application/pdf";
    revisar(
      "la carta lleva nombre, cédula y fecha, sin marcas",
      t.includes("NIXON ALEXANDER LEAL GARCIA") && t.includes(`${PREFIJO}01`) && (pdf ? /\d+ de [a-z]+ de \d{4}/ : /Soledad, \d+ de [a-z]+ de \d{4}/).test(t) && !/\{[a-z_]+\}/.test(t),
      t.slice(0, 200)
    );
    revisar("y la carta no tiene marcas sin valor", cartaDoc.faltan.length === 0, cartaDoc.faltan);
  }
  const envio = await enviarDocumentosAspirante(cita1!);
  revisar("al candidato de prueba no se le envía nada: «prueba»", envio.resultado === "prueba", envio);
  revisar("al aspirante solo le va la carta del banco (la orden es para el laboratorio)", envio.documentos.length === 1 && envio.documentos[0].tipo === "carta", envio.documentos);
  const { data: c1 } = await db.from("seleccion_citas").select("orden_aspirante_at").eq("id", cita1!).maybeSingle();
  revisar("y la cita queda marcada como enviada", c1?.orden_aspirante_at);

  titulo("Orden al laboratorio por correo (Biobac)");
  const v = await vistaOrden(biobac.id, cuando.fecha, { incluirPrueba: true });
  revisar("la vista previa trae el correo a los destinatarios del laboratorio con el aspirante", v?.correo?.para.length === biobac.correos.length && v.correo.texto.includes("NIXON ALEXANDER LEAL GARCIA") && v.correo.adjuntos.some((a) => a.includes(`${PREFIJO}01`)), v?.correo);
  const sim = await enviarOrdenLaboratorio(biobac.id, cuando.fecha, actor, { simular: true });
  revisar("simular no envía nada", sim.ok && sim.simulado, sim);
  const real = await enviarOrdenLaboratorio(biobac.id, cuando.fecha, actor);
  // 24-nov-2026: con el laboratorio apuntando a un correo de la lista de pruebas, la de los candidatos de prueba sale de verdad.
  revisar(`«Enviar» con solo candidatos de prueba: ${real.simulado ? "simulada" : "sale al destino de prueba"} y los marca`, real.ok, real);
  const { data: c1b } = await db.from("seleccion_citas").select("orden_laboratorio_at").eq("id", cita1!).maybeSingle();
  revisar("la cita queda con la orden enviada (no se repite)", c1b?.orden_laboratorio_at);
  const hilo1 = await hiloLaboratorio(biobac.id, { soloPrueba: true });
  const enviada = hilo1.find((m) => m.direccion === "saliente" && m.adjuntos?.some((a) => a.procesoId === p1));
  revisar("la orden simulada queda en la conversación con Biobac, con su adjunto", enviada?.resultado === "simulado" && enviada.canal === "correo" && enviada.texto.includes("NIXON ALEXANDER LEAL GARCIA"), enviada);

  titulo("Orden al laboratorio por WhatsApp (Rescate)");
  const p2 = await crearProceso(2, "ROYMAN ANTONIO GOMEZ LASSO");
  revisar("se le asigna Rescate", (await asignarLaboratorio(p2, rescate.id, actor)).ok);
  const cita2 = await crearCitaSimple(p2, "examen_f1", cuando, actor);
  const pend = await pendientesPrueba(rescate.id);
  revisar("Rescate lo tiene pendiente de orden (para el chat de prueba)", pend.some((p) => p.citaIds.includes(cita2!)), pend);
  const v2 = await vistaOrden(rescate.id, cuando.fecha, { incluirPrueba: true });
  revisar("la vista previa trae el WhatsApp con el aspirante y su cédula", v2?.whatsapp?.mensajes.some((m) => m.includes("ROYMAN ANTONIO GOMEZ LASSO") && m.includes(`${PREFIJO}02`)), v2?.whatsapp);
  revisar("y el de Biobac no aparece en Rescate", !v2?.aspirantes.some((a) => a.procesoId === p1));
  const env2 = await enviarOrdenLaboratorio(rescate.id, cuando.fecha, actor, { citaIds: [cita2!] });
  const hilo2 = await hiloLaboratorio(rescate.id, { soloPrueba: true });
  revisar("la orden por WhatsApp queda simulada en la conversación con Rescate", env2.ok && hilo2.some((m) => m.direccion === "saliente" && m.canal === "whatsapp" && m.texto.includes("ROYMAN")), hilo2.slice(-1));

  titulo("Respuesta simulada del laboratorio");
  const r = await leerYGuardarAvisos({ texto: `Buenas tardes. NIXON ALEXANDER LEAL GARCIA CC ${PREFIJO}01 puede continuar a segunda fase.`, laboratorioId: biobac.id, simulado: true });
  avisosCreados.push(...r.ids);
  revisar("deja un aviso", r.avisos >= 1, r);
  const { data: av } = await db.from("seleccion_avisos_laboratorio").select("proceso_id, fase, resultado_propuesto, simulado, laboratorio_id").in("id", r.ids);
  revisar("asociado al aspirante, fase 1 apto, marcado como simulado y del laboratorio", av?.some((a) => a.proceso_id === p1 && a.fase === 1 && a.resultado_propuesto === "apto" && a.simulado && a.laboratorio_id === biobac.id), av);
  const hilo3 = await hiloLaboratorio(biobac.id, { soloPrueba: true });
  // Después de la respuesta puede venir la orden de la fase 2 (sale sola al registrarse la fase 1 apta).
  const iOrden = hilo3.findIndex((m) => m.direccion === "saliente" && m.adjuntos?.some((a) => a.procesoId === p1));
  const iResp = hilo3.findIndex((m) => m.direccion === "entrante" && m.aviso?.procesoId === p1);
  revisar("la respuesta aparece en la conversación con Biobac después de la orden", iOrden >= 0 && iResp > iOrden, { iOrden, iResp });

  titulo("Fase 2 en el mismo laboratorio y «aplazado»");
  // «Puede continuar a segunda fase» es una variante de la frase acordada (24-nov-2026): se registra sola
  // y trae el mensaje de la fase 2 para el aspirante.
  const f1 = r.confirmados.find((c) => c.procesoId === p1);
  revisar("la variante de la frase registra sola la fase 1 apta y trae el mensaje de la fase 2", f1?.resultado === "apto" && /ayuno/i.test(f1.texto ?? "") && /BIOBAC/i.test(f1.texto ?? ""), r.confirmados);
  const { data: citas2 } = await db.from("seleccion_citas").select("tipo, hora").eq("proceso_id", p1).eq("tipo", "examen_f2");
  revisar("queda citado a la fase 2 a las 6:30", citas2?.length === 1 && String(citas2[0].hora).startsWith("06:30"), citas2);
  const { data: proc } = await db.from("procesos_contratacion").select("estado, laboratorio_id").eq("id", p1).maybeSingle();
  revisar("en el mismo laboratorio", proc?.estado === "en_examenes_fase2" && proc.laboratorio_id === biobac.id, proc);
  const sinMotivo = await registrarExamen(p1, { fase: 2, resultado: "aplazado", observacion: "" }, actor);
  revisar("aplazado sin motivo no se deja", !sinMotivo.ok);
  const apl = await registrarExamen(p1, { fase: 2, resultado: "aplazado", observacion: "Aplazado por hemograma" }, actor);
  const { data: proc2 } = await db.from("procesos_contratacion").select("estado").eq("id", p1).maybeSingle();
  revisar("aplazado: no propone cierre y sigue en fase 2", apl.ok && !apl.proponeCierre && proc2?.estado === "en_examenes_fase2", { apl, proc2 });
  const def = await registrarExamen(p1, { fase: 2, resultado: "apto", observacion: "Concepto definitivo" }, actor);
  const { data: proc3 } = await db.from("procesos_contratacion").select("estado").eq("id", p1).maybeSingle();
  revisar("luego el definitivo apto pasa a reconocimiento de ruta", def.ok && proc3?.estado === "reconocimiento_ruta", proc3);
} catch (e) {
  fallos.push(`excepción: ${e instanceof Error ? e.stack : String(e)}`);
  console.error(e);
} finally {
  await limpiar();
  const quedan = (await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`)).count;
  revisar("no quedan datos de prueba", quedan === 0, quedan);
}
console.log(`\n${ok} bien, ${fallos.length} mal.`);
for (const f of fallos) console.log(`  · ${f}`);
process.exit(fallos.length ? 1 : 0);
