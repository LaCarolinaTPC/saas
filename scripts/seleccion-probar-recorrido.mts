// Recorrido completo de Selección (23-nov-2026): un aspirante de punta a punta,
// del registro desde el chat hasta «Contratado», más las ramas que no cubren las
// baterías de cada entrega: cierre automático de la preselección (el de verdad,
// con los 30 minutos), conductor activo y reingreso, contratar con excepción y
// los mensajes (borrador, enviado y sin plantilla).
//
// Sin IA y sin Croma: Croma va simulado y WhatsApp sale simulado (desarrollo).
// Solo crea aspirantes «chat_prueba» con cédulas 99900070NN y los borra al terminar.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-recorrido.mts [--conservar]
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEstadoProceso, type ActorProceso } from "@/lib/contratacion/servidor";
import { PREFILTRO_VACIO, type DatosPrefiltro } from "@/lib/seleccion/extraccion";
import { ESCENARIO_BASE, ESCENARIOS, type EscenarioCroma } from "@/lib/seleccion/escenario-croma";
import { registrarAspirante } from "@/lib/seleccion/proceso-desde-chat";
import { ESPERA_CIERRE_MINUTOS, cerrarNoPreseleccionados, leerMensaje, marcarListoParaCitar, marcarRevisionAntecedentes } from "@/lib/seleccion/servidor";
import { simularCromaProceso } from "@/lib/verificacion/servidor";
import { citarProceso, citasDeProceso, confirmarCita, leerAjustesAgenda, marcarLlegada } from "@/lib/seleccion/agenda-servidor";
import { horaDelDia, hhmm } from "@/lib/seleccion/agenda";
import { enviarAExamenes, registrarPrueba, registrarReconocimientos } from "@/lib/seleccion/profesor-servidor";
import { registrarExamen } from "@/lib/seleccion/examenes-servidor";
import { itemsCarpeta, marcarItemCarpeta } from "@/lib/seleccion/carpeta-servidor";
import { rutasObligatorias } from "@/lib/seleccion/rutas-servidor";
import { aprobarContratacion, condicionesDeProceso } from "@/lib/seleccion/contratacion-servidor";
import { registrarEntrevista, registrarInduccion, registrarPsicotecnicaExterna } from "@/lib/seleccion/dia-contratacion-servidor";
import { enviarMensajeSeleccion } from "@/lib/seleccion/envio";
import { PREFIJO_WAMID_SIMULADO } from "@/lib/comunicaciones/whatsapp";
// La fecha de hoy en Colombia (en la noche, la de UTC ya es mañana y se rechaza por futura).
const hoyBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-recorrido@gestivo.test" };
const CONSERVAR = process.argv.includes("--conservar");
const PREFIJO = "99900070";
const TELEFONO = "570000000701";
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
    const d = detalle !== undefined ? ` → ${JSON.stringify(detalle)}` : "";
    fallos.push(`${seccion}: ${nombre}${d}`);
    console.log(`  ✘ ${nombre}${d}`);
  }
};

async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").eq("origen", "chat_prueba").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((x) => x.id as string);
  // Las órdenes simuladas al laboratorio (envío automático al citar a exámenes, 23-nov-2026).
  if (ids.length) await db.from("seleccion_envios_laboratorio").delete().overlaps("proceso_ids", ids);
  if (ids.length) await db.from("procesos_contratacion").delete().in("id", ids);
  // Lo que deja «Contratado» y los conductores ficticios del vínculo.
  await db.from("employees").delete().like("document_number", `${PREFIJO}%`);
  await db.from("conductores").delete().like("cedula", `${PREFIJO}%`);
  const { data: contacto } = await db.from("wa_contactos").select("id").eq("telefono", TELEFONO).maybeSingle();
  if (contacto) await db.from("wa_contactos").delete().eq("id", contacto.id);
  return ids.length;
}

let n = 0;
const cedula = () => `${PREFIJO}${String(++n).padStart(2, "0")}`;
const datosDe = (ced: string, extra: Partial<DatosPrefiltro> = {}): DatosPrefiltro => ({
  ...PREFILTRO_VACIO,
  cedula: ced,
  primer_apellido: "RECORRIDO",
  fecha_expedicion: "2008-03-10",
  edad: 35,
  ciudad: "Barranquilla",
  licencia: "C2",
  experiencia_meses: 60,
  disponibilidad: "inmediata",
  hoja_vida: true,
  autorizacion: "si",
  busca_trabajo: true,
  recomendado: false,
  ...extra,
});
/** Como el chat de prueba con Croma simulado: registra, simula Croma y revisa «Listo para citar». */
async function aspirante(d: DatosPrefiltro, escenario: EscenarioCroma = ESCENARIO_BASE) {
  const r = await registrarAspirante({ datos: d, celular: null, autorizacionAt: null, autorizacionMensajeId: null, origen: "chat_prueba", antecedentesSiempre: true, sinCroma: true });
  if (!r) throw new Error(`no se registró ${d.cedula}`);
  await simularCromaProceso(r.procesoId, { licencia: d.licencia, nombre: `NESTOR ${d.primer_apellido} RUIZ`, simit: null, escenario }, actor);
  const listo = await marcarListoParaCitar(r.procesoId, d);
  await marcarRevisionAntecedentes(r.procesoId);
  return { id: r.procesoId, listo };
}
const proceso = async (id: string) => (await db.from("procesos_contratacion").select("*").eq("id", id).single()).data as Record<string, unknown>;
const citaDe = async (id: string, tipo: string) => (await citasDeProceso(id)).find((c) => c.tipo === tipo && ["programada", "confirmada"].includes(c.estado)) ?? null;
const ajuste = async (clave: string) => (await db.from("seleccion_ajustes").select("valor").eq("clave", clave).maybeSingle()).data?.valor;

console.log(`Limpieza previa: ${await limpiar()} aspirantes de una corrida anterior.`);
const a = await leerAjustesAgenda();
try {
  // ───────────────────────────────────────────────────────────────────────
  titulo("1. Camino completo: del chat a «Contratado»");
  const ced1 = cedula();
  const d1 = datosDe(ced1);
  const { id: p1, listo } = await aspirante(d1);
  let pr = await proceso(p1);
  revisar("se crea el candidato desde el chat, con origen de prueba", pr.origen === "chat_prueba" && pr.cedula === ced1, { origen: pr.origen });
  revisar("con todo en verde queda «Listo para citar»", listo, { estado: pr.estado, ant: pr.antecedentes_resultado });
  revisar("preselección «pasa» y antecedentes limpios", (pr.preseleccion as { global?: string } | null)?.global === "pasa" && pr.antecedentes_resultado === "limpio", { pre: pr.preseleccion, ant: pr.antecedentes_resultado });
  let cita = await citaDe(p1, "prueba_manejo");
  if (!cita) {
    // Sin cita automática (o sin dirección de la sede): la cita GH a mano un día que haya cupo.
    let f = new Date(Date.now() + 2 * 86_400_000);
    while (horaDelDia(f.toISOString().slice(0, 10), a, []) == null) f = new Date(f.getTime() + 86_400_000);
    const dia = f.toISOString().slice(0, 10);
    const r = await citarProceso(p1, { fecha: dia, hora: horaDelDia(dia, a, []) ?? "13:00" }, actor);
    revisar("Gestión Humana lo cita a la prueba de manejo", r.ok, r);
    cita = await citaDe(p1, "prueba_manejo");
  } else {
    revisar("se citó solo a la prueba de manejo (cita automática)", true);
  }
  pr = await proceso(p1);
  revisar("queda «Citado» con su cita", pr.estado === "citado" && !!cita, { estado: pr.estado });
  if (!cita) throw new Error("sin cita de prueba de manejo: no se puede seguir el recorrido");
  revisar("«Sí, voy»: la cita queda confirmada", (await confirmarCita(cita.id, actor)).ok && (await citaDe(p1, "prueba_manejo"))?.estado === "confirmada");
  revisar("llega: pasa a «Prueba de manejo»", (await marcarLlegada(cita.id, actor)).ok && (await proceso(p1)).estado === "prueba_manejo");

  const rp0 = await registrarPrueba(p1, { resultado: "aprobo", rutaEscrita: "si", partesMotor: "si", observacion: "Buen manejo (recorrido)" }, actor);
  revisar("guarda «aprobó»: no se envía nada todavía", rp0.ok && rp0.porEnviarExamenes === true && !rp0.texto && (await proceso(p1)).estado === "prueba_manejo", rp0);
  const rp = await enviarAExamenes(p1, actor);
  pr = await proceso(p1);
  revisar("«Listo para exámenes»: pasa a exámenes (fase 1)", rp.ok && pr.estado === "en_examenes", { rp, estado: pr.estado });
  const f1 = await citaDe(p1, "examen_f1");
  revisar(`cita de la fase 1 a la hora del laboratorio (${a.laboratorioHora}), con laboratorio asignado`, f1 && hhmm(f1.hora) === a.laboratorioHora && !!pr.laboratorio_id, { f1, lab: pr.laboratorio_id });
  revisar("el mensaje de la fase 1 habla de la carta y no de la orden", /carta/i.test(rp.texto ?? "") && !/orden de ex[aá]menes/i.test(rp.texto ?? ""), rp.texto);
  revisar("al aspirante solo le va la carta del banco", (rp.documentos ?? []).length > 0 && (rp.documentos ?? []).every((d) => /carta/i.test(d)), rp.documentos);
  // 23-nov-2026: la orden al laboratorio sale sola al citar (en el chat de prueba, simulada y enseguida).
  const automatica = (await ajuste("orden_laboratorio_automatica")) !== false;
  const ordenDe = async (citaId: string | undefined) => {
    if (!citaId) return { marcada: false, envios: 0 };
    const { data: c } = await db.from("seleccion_citas").select("orden_laboratorio_at").eq("id", citaId).maybeSingle();
    const { count } = await db.from("seleccion_envios_laboratorio").select("id", { count: "exact", head: true }).contains("cita_ids", [citaId]).eq("resultado", "simulado");
    return { marcada: !!c?.orden_laboratorio_at, envios: count ?? 0 };
  };
  const o1 = await ordenDe(f1?.id);
  revisar(automatica ? "la orden de la fase 1 sale sola al laboratorio (simulada)" : "envío manual: la orden de la fase 1 espera a «Enviar»", automatica ? o1.marcada && o1.envios === 1 : !o1.marcada && o1.envios === 0, o1);

  const e1 = await registrarExamen(p1, { fase: 1, resultado: "apto" }, actor);
  revisar("fase 1 apta: pasa a la fase 2 con su cita", e1.ok && (await proceso(p1)).estado === "en_examenes_fase2" && !!(await citaDe(p1, "examen_f2")), e1);
  const o2 = await ordenDe((await citaDe(p1, "examen_f2"))?.id);
  revisar(automatica ? "y la de la fase 2 también" : "envío manual: la de la fase 2 también espera", automatica ? o2.marcada && o2.envios === 1 : !o2.marcada && o2.envios === 0, o2);
  const e2 = await registrarExamen(p1, { fase: 2, resultado: "apto" }, actor);
  revisar("fase 2 apta: pasa a reconocimiento de ruta con su cita", e2.ok && (await proceso(p1)).estado === "reconocimiento_ruta" && !!(await citaDe(p1, "reconocimiento")), e2);

  const obligatorias = await rutasObligatorias();
  const minimas = Math.max(Number(await ajuste("rutas_minimas")) || 2, obligatorias.length);
  const rutas = [...obligatorias, ...Array.from({ length: minimas }, (_, i) => `RUTA RECORRIDO ${i + 1}`)].slice(0, minimas);
  // Todas en un solo guardado del día, como lo hace el profesor desde el celular.
  const s = await registrarReconocimientos(p1, { salidas: rutas.map((ruta) => ({ ruta, resultado: "aprendida" as const })) }, actor);
  revisar(`aprende ${rutas.length} rutas (${obligatorias.length} obligatorias) en un guardado: «rutas completas», sin mensaje`, s.ok && !!s.rutasCompletas && !s.texto, { s, rutas });

  let cond = await condicionesDeProceso(p1);
  console.log(`  (antes de completar: falta ${cond.faltan.join("; ") || "nada"})`);
  revisar("todavía no se puede contratar: falta carpeta y visto bueno", cond.exigir ? !cond.ok && cond.faltan.some((f) => /carpeta/.test(f)) && cond.faltan.some((f) => /visto bueno/.test(f)) : true, cond.faltan);
  for (const item of await itemsCarpeta()) await marcarItemCarpeta(p1, item, "validado", null, actor);
  if (await ajuste("contratar_exige_psicotecnica")) {
    revisar("psicotécnica externa apta", (await registrarPsicotecnicaExterna(p1, { resultado: "apto", fecha: hoyBogota, entidad: "IPS de prueba" }, actor)).ok);
  }
  revisar("entrevista e inducción del día de contratación", (await registrarEntrevista(p1, { nota: "Recorrido" }, actor)).ok && (await registrarInduccion(p1, hoyBogota, actor)).ok);
  revisar("visto bueno de la directora", (await aprobarContratacion(p1, true, actor)).ok);
  cond = await condicionesDeProceso(p1);
  revisar("con todo cumplido, se puede contratar", cond.ok, cond.faltan);
  const c1 = await cambiarEstadoProceso(p1, "contratado", { actor });
  pr = await proceso(p1);
  revisar("pasa a «Contratado»", c1.cambiado && pr.estado === "contratado", pr.estado);
  const enPie = (await citasDeProceso(p1)).filter((c) => ["programada", "confirmada", "pide_otra_fecha"].includes(c.estado));
  revisar("no le quedan citas en pie (el cron no le recordaría nada)", enPie.length === 0, enPie);
  const { data: alta } = await db.from("employees").select("id, status").eq("document_number", ced1).maybeSingle();
  revisar("queda dado de alta (sin vacante de conductor: en empleados)", alta?.status === "activo", alta);
  const { data: evs } = await db.from("procesos_contratacion_eventos").select("estado_nuevo").eq("proceso_id", p1).eq("tipo", "estado").order("created_at");
  const camino = (evs ?? []).map((e) => e.estado_nuevo as string);
  const esperado = ["antecedentes", "citado", "prueba_manejo", "en_examenes", "en_examenes_fase2", "reconocimiento_ruta", "contratado"];
  revisar("el historial tiene el camino completo, en orden", esperado.every((e, i) => camino.indexOf(e) >= 0 && (i === 0 || camino.indexOf(e) > camino.indexOf(esperado[i - 1]))), camino);

  // ───────────────────────────────────────────────────────────────────────
  titulo("2. Contratar con excepción");
  const { id: p2 } = await aspirante(datosDe(cedula()));
  await db.from("procesos_contratacion").update({ estado: "reconocimiento_ruta" }).eq("id", p2);
  let error = "";
  try {
    await cambiarEstadoProceso(p2, "contratado", { actor });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revisar("sin cumplir: no deja contratar y dice qué falta", /Para contratar falta/.test(error), error);
  const c2 = await cambiarEstadoProceso(p2, "contratado", { actor, excepcion: { justificacion: "Urgencia operativa (recorrido)" } });
  const { data: ev2 } = await db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", p2).eq("estado_nuevo", "contratado").maybeSingle();
  const det2 = ev2?.detalle as { contratado_con_excepcion?: boolean; faltaban?: string[]; justificacion?: string } | null;
  revisar("con justificación: contrata y deja en el historial qué faltaba", c2.cambiado && det2?.contratado_con_excepcion && (det2.faltaban?.length ?? 0) > 0 && !!det2.justificacion, det2);

  // ───────────────────────────────────────────────────────────────────────
  titulo(`3. Cierre automático de la preselección (el del cron, a los ${ESPERA_CIERRE_MINUTOS} min)`);
  const tope = Number(await ajuste("simit_tope")) || 3_000_000;
  const rojos = [
    { nombre: "menor de edad", d: datosDe(cedula(), { edad: 17 }), esc: ESCENARIO_BASE },
    { nombre: "fuera de la zona y sin traslado", d: datosDe(cedula(), { ciudad: "Bogotá", dispuesto_traslado: false }), esc: ESCENARIO_BASE },
    { nombre: "licencia inferior", d: datosDe(cedula(), { licencia: null }), esc: ESCENARIOS.find((e) => e.id === "inferior")!.escenario },
    { nombre: `SIMIT sobre el tope ($${tope.toLocaleString("es-CO")})`, d: datosDe(cedula()), esc: { ...ESCENARIO_BASE, simit: tope + 1_000_000 } },
  ];
  const ids: { nombre: string; id: string }[] = [];
  for (const r of rojos) {
    const { id } = await aspirante(r.d, r.esc);
    const p = await proceso(id);
    revisar(`${r.nombre}: semáforo en rojo, sigue en Preselección`, p.estado === "pendiente" && !!p.requisito_incumplido && (p.preseleccion as { global?: string } | null)?.global === "no_cumple", { estado: p.estado, req: p.requisito_incumplido, pre: (p.preseleccion as { global?: string } | null)?.global });
    ids.push({ nombre: r.nombre, id });
  }
  const soloIds = ids.map((x) => x.id);
  revisar("recién en rojo: no se cierra (le da tiempo de corregir)", (await cerrarNoPreseleccionados(new Date(), soloIds)).cerrados === 0);
  const despues = new Date(Date.now() + (ESPERA_CIERRE_MINUTOS + 1) * 60_000);
  const cierre = await cerrarNoPreseleccionados(despues, soloIds);
  revisar(`a los ${ESPERA_CIERRE_MINUTOS + 1} min: se cierran los ${ids.length}`, cierre.cerrados === ids.length, cierre);
  for (const x of ids) {
    const p = await proceso(x.id);
    revisar(`${x.nombre}: cerrado con la causa del requisito («${p.causa_no_contrato}»)`, p.estado === "cierre" && p.causa_no_contrato === p.requisito_incumplido, { estado: p.estado, causa: p.causa_no_contrato, req: p.requisito_incumplido });
  }

  // ───────────────────────────────────────────────────────────────────────
  titulo("4. Ya trabaja en la empresa / reingreso");
  const cedActivo = cedula();
  const cedRetirado = cedula();
  await db.from("conductores").insert([
    { cedula: cedActivo, nombre: "CONDUCTOR ACTIVO RECORRIDO", estado: "ACTIVO" },
    { cedula: cedRetirado, nombre: "CONDUCTOR RETIRADO RECORRIDO", estado: "RETIRADO" },
  ]);
  const rAct = await registrarAspirante({ datos: datosDe(cedActivo), celular: null, autorizacionAt: null, autorizacionMensajeId: null, origen: "chat_prueba", sinCroma: true });
  const pAct = rAct ? await proceso(rAct.procesoId) : null;
  revisar("conductor activo: se cierra «Ya trabaja en la empresa» sin consultar nada", pAct?.estado === "cierre" && pAct.causa_no_contrato === "Ya trabaja en la empresa", { estado: pAct?.estado, causa: pAct?.causa_no_contrato });
  const { count: consultasAct } = await db.from("verificaciones_externas").select("id", { count: "exact", head: true }).eq("proceso_id", rAct?.procesoId ?? "");
  revisar("ni el RUNT", (consultasAct ?? 0) === 0, consultasAct);
  const { id: pRet, listo: listoRet } = await aspirante(datosDe(cedRetirado));
  const prRet = await proceso(pRet);
  revisar("retirado: queda como reingreso y sigue la selección", prRet.reingreso === true && prRet.estado !== "cierre", { reingreso: prRet.reingreso, estado: prRet.estado });
  revisar("el reingreso no se cita solo: lo revisa una persona", !listoRet && !(await citaDe(pRet, "prueba_manejo")));
  const { count: revReing } = await db.from("procesos_contratacion_eventos").select("id", { count: "exact", head: true }).eq("proceso_id", pRet).eq("detalle->>revision_reingreso", "true");
  revisar("con el aviso «revisión de reingreso» en el historial", (revReing ?? 0) > 0);
  revisar("el reingreso no necesita rutas para contratar", (await condicionesDeProceso(pRet)).condiciones.find((c) => c.id === "rutas")?.cumple === true);

  // ───────────────────────────────────────────────────────────────────────
  titulo("5. Mensajes: borrador, enviado (simulado) y sin plantilla");
  const { data: contacto } = await db.from("wa_contactos").insert({ telefono: TELEFONO, nombre: "Prueba recorrido" }).select("id").single();
  const { data: conv } = await db.from("wa_conversaciones").insert({ contacto_id: contacto!.id, proceso_id: pRet }).select("id").single();
  const base = await leerMensaje("citacion");
  if (!base) {
    revisar("existe el mensaje «citacion» en el catálogo", false);
  } else {
    const valores = { nombre: "NESTOR", fecha: "lunes 30 de noviembre", hora: "1:00 p. m.", direccion: "Sede de prueba", contacto: "300 000 0000" };
    const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const r1 = await enviarMensajeSeleccion({ conversacionId: conv!.id, telefono: TELEFONO, ultimoEntranteAt: hace(1), mensaje: { ...base, modo: "revisar" }, valores });
    const { data: c1v } = await db.from("wa_conversaciones").select("borrador_sugerido, requiere_humano").eq("id", conv!.id).single();
    revisar("modo «revisar»: queda como borrador y pide a una persona", r1 === "borrador" && !!c1v?.borrador_sugerido && c1v.requiere_humano === true, { r1, c1v });
    const r2 = await enviarMensajeSeleccion({ conversacionId: conv!.id, telefono: TELEFONO, ultimoEntranteAt: hace(1), mensaje: { ...base, modo: "automatico" }, valores });
    const { data: sal } = await db.from("wa_mensajes").select("wamid, contenido").eq("conversacion_id", conv!.id).eq("direccion", "saliente").order("timestamp", { ascending: false }).limit(1).maybeSingle();
    revisar("con la ventana de 24 h abierta: sale como texto (simulado en desarrollo)", r2 === "enviado" && String(sal?.wamid ?? "").startsWith(PREFIJO_WAMID_SIMULADO), { r2, wamid: sal?.wamid });
    revisar("y con los datos puestos (sin marcas sin llenar)", !!sal?.contenido && !/\{[a-z_]+\}/.test(String(sal.contenido)), sal?.contenido);
    const r3 = await enviarMensajeSeleccion({ conversacionId: conv!.id, telefono: TELEFONO, ultimoEntranteAt: hace(48), mensaje: { ...base, modo: "automatico", plantilla_nombre: null, plantilla_estado: null }, valores });
    revisar("ventana cerrada y sin plantilla aprobada: «sin_plantilla» (no se manda nada)", r3 === "sin_plantilla", r3);
  }
} catch (e) {
  fallos.push(`excepción: ${e instanceof Error ? e.stack : String(e)}`);
  console.error(e);
} finally {
  if (CONSERVAR) {
    console.log("\n(--conservar: los aspirantes de prueba quedan en la base; la próxima corrida los borra)");
  } else {
    await limpiar();
    const quedan = (await db.from("procesos_contratacion").select("id", { count: "exact", head: true }).like("cedula", `${PREFIJO}%`)).count;
    const empleados = (await db.from("employees").select("id", { count: "exact", head: true }).like("document_number", `${PREFIJO}%`)).count;
    revisar("no quedan datos de prueba (procesos, empleados, conductores, contacto)", quedan === 0 && empleados === 0, { quedan, empleados });
  }
}
console.log(`\n${ok} bien, ${fallos.length} mal.`);
for (const f of fallos) console.log(`  · ${f}`);
process.exit(fallos.length ? 1 : 0);
