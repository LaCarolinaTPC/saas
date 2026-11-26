// Servicios caídos y cambios manuales (26-nov-2026): el proceso de selección cuando
// Croma no responde una fuente (como el RNMC ese día), o varias, o el RUNT y el SIMIT,
// y una persona lo revisa a mano en la ficha («Lo revisé a mano») para que siga.
//
// Comprueba, de punta a punta, con aspirantes ficticios del chat de prueba:
//  1. RNMC caído: no avanza ni se cita solo; revisado a mano sin novedad → listo y citado.
//  2. Todos los antecedentes caídos: revisados a mano los cuatro → sigue.
//  3. RUNT y SIMIT caídos: licencia y SIMIT a mano → licencia verificada, SIMIT en $0, sigue.
//  4. RNMC revisado a mano CON hallazgo: no sigue solo; queda para revisión de una persona.
//  5. Lo que «Lo revisé a mano» rechaza (hallazgo sin nota, RUNT sin categoría o vencido).
//  6. Después de la revisión manual, Croma no se vuelve a consultar para esa fuente.
//  7. La revisión manual no pausa al asistente de la conversación.
//  8. Barra de estado: lo simulado no cuenta; y el RNMC caído de verdad aparece con su solución.
//  9. Registro de llamadas y estadísticas de proveedores.
// Usa los ajustes de hoy (fuentes obligatorias, cita automática) para saber qué esperar.
// No consulta Croma ni envía WhatsApp. Borra todo al terminar.
//   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/seleccion-probar-servicio-caido.mts
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActorProceso } from "@/lib/contratacion/servidor";
import { revisarFuenteManual, type DatosRevisionManual, type FuenteRevision } from "@/lib/contratacion/revision-manual";
import { PREFILTRO_VACIO, type DatosPrefiltro } from "@/lib/seleccion/extraccion";
import { ESCENARIO_BASE, type EscenarioCroma } from "@/lib/seleccion/escenario-croma";
import { evaluarAntecedentesProceso, marcarListoParaCitar, marcarRevisionAntecedentes } from "@/lib/seleccion/servidor";
import { simularCromaProceso } from "@/lib/verificacion/servidor";
import { leerEstadoServicios, olvidarEstadoServicios } from "@/lib/estado-servicios";
import { registrarLlamada } from "@/lib/servicios/registro-llamadas";
import { leerEstadisticasProveedores } from "@/lib/servicios/estadisticas-servidor";

if (process.env.GESTIVO_ENTORNO !== "desarrollo") throw new Error("Solo en desarrollo (WhatsApp simulado).");
const db = createAdminClient();
const actor: ActorProceso = { tipo: "usuario", userId: null, userEmail: "prueba-servicio-caido@gestivo.test" };
const PREFIJO = "99900127";
const TELEFONO = "573009991270";

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

async function limpiar() {
  const { data } = await db.from("procesos_contratacion").select("id").like("cedula", `${PREFIJO}%`);
  const ids = (data ?? []).map((x) => x.id as string);
  const { data: contactos } = await db.from("wa_contactos").select("id").eq("telefono", TELEFONO);
  const cids = (contactos ?? []).map((c) => c.id as string);
  if (cids.length) {
    await db.from("wa_conversaciones").delete().in("contacto_id", cids);
    await db.from("wa_contactos").delete().in("id", cids);
  }
  if (ids.length) {
    await db.from("seleccion_citas").delete().in("proceso_id", ids);
    await db.from("procesos_contratacion").delete().in("id", ids);
  }
  await db.from("servicios_llamadas").delete().eq("proveedor", "prueba-bateria");
  return ids.length;
}

// Ajustes de hoy: con qué fuentes obligatorias y si se cita solo.
const { data: aj } = await db.from("seleccion_ajustes").select("clave, valor");
const ajuste = (k: string, def: unknown) => (aj ?? []).find((a) => a.clave === k)?.valor ?? def;
const rnmcObligatorio = ajuste("rnmc_obligatorio", true) !== false;
const citaAutomatica = ajuste("cita_automatica", true) !== false;
const pausado = ajuste("croma_pausado", false) === true;
console.log(`Ajustes: RNMC ${rnmcObligatorio ? "obligatorio" : "opcional"} · cita automática ${citaAutomatica ? "sí" : "no"} · Croma ${pausado ? "EN PAUSA" : "activo"}`);
if (pausado) throw new Error("Croma está en pausa: quite la pausa para correr esta batería (prueba el flujo con Croma activo).");

let n = 0;
async function crear(escenario: EscenarioCroma): Promise<{ id: string; datos: DatosPrefiltro }> {
  n++;
  const cedula = `${PREFIJO}${String(n).padStart(2, "0")}`;
  const { data, error } = await db
    .from("procesos_contratacion")
    .insert({
      fecha_creacion: new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10),
      nombre: "POR CONFIRMAR",
      cedula,
      celular: null,
      reingreso: false,
      estado: "pendiente",
      medio_postulacion: "whatsapp",
      origen: "chat_prueba",
      autorizacion_datos: "si",
      edad: 35,
      ciudad_residencia: "Barranquilla",
      experiencia_meses: 60,
      hoja_vida_recibida_at: new Date().toISOString(),
      licencia_categoria: "C2",
      cedula_fecha_expedicion: "2008-03-10",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = data.id as string;
  const datos: DatosPrefiltro = {
    ...PREFILTRO_VACIO,
    cedula,
    primer_apellido: "PRUEBA",
    fecha_expedicion: "2008-03-10",
    edad: 35,
    ciudad: "Barranquilla",
    licencia: "C2",
    experiencia_meses: 60,
    hoja_vida: true,
    autorizacion: "si",
    busca_trabajo: true,
  };
  // Como en cada mensaje del chat: Croma (simulado) y, si se puede, «Listo para citar».
  await simularCromaProceso(id, { licencia: "C2", nombre: "NESTOR CAIDO PRUEBA", simit: null, escenario }, actor);
  await marcarListoParaCitar(id, datos);
  await marcarRevisionAntecedentes(id);
  return { id, datos };
}

async function estado(id: string) {
  const [{ data: p }, { data: v }, { data: citas }, { data: ev }] = await Promise.all([
    db.from("procesos_contratacion").select("estado, licencia_verificada_runt, licencia_categoria, simit, simit_valor").eq("id", id).single(),
    db.from("verificaciones_externas").select("fuente, estado, proveedor").eq("proceso_id", id).order("created_at"),
    db.from("seleccion_citas").select("estado, fecha, hora").eq("proceso_id", id),
    db.from("procesos_contratacion_eventos").select("detalle").eq("proceso_id", id),
  ]);
  const eventos = (ev ?? []).map((e) => e.detalle as Record<string, unknown>);
  return {
    p,
    consultas: (v ?? []) as { fuente: string; estado: string; proveedor: string }[],
    citas: citas ?? [],
    listo: eventos.some((d) => d.listo_para_citar === true),
    revision: eventos.some((d) => Boolean(d.revision_antecedentes) || d.tipo === "revision_antecedentes" || Boolean(d.propone_cierre)),
    manuales: eventos.filter((d) => d.revision_manual).length,
  };
}

const ultima = (consultas: { fuente: string; estado: string; proveedor: string }[], fuente: string) => [...consultas].reverse().find((c) => c.fuente === fuente);
const manual = (id: string, fuente: FuenteRevision, d: DatosRevisionManual) => revisarFuenteManual(id, fuente, d, actor);

await limpiar();
try {
  // ── 1 ────────────────────────────────────────────────────────────────────
  titulo("1. Solo el RNMC caído (como el 26-nov) y revisión manual sin novedad");
  const uno = await crear({ ...ESCENARIO_BASE, rnmc: "error" });
  let e = await estado(uno.id);
  revisar("Croma respondió las demás fuentes y el RNMC quedó en error", ultima(e.consultas, "rnmc")?.estado === "error" && ultima(e.consultas, "policia")?.estado === "ok", e.consultas);
  if (rnmcObligatorio) {
    revisar("con el RNMC obligatorio, no queda «Listo para citar»", !e.listo);
    revisar("y no se cita solo", e.citas.length === 0, e.citas);
  } else {
    revisar("con el RNMC opcional, queda listo pero sin citar solo (falta el RNMC)", e.listo && e.citas.length === 0, e);
  }
  const ev1 = await evaluarAntecedentesProceso(uno.id);
  revisar("las reglas no lo dejan pasar como limpio mientras falta el RNMC", rnmcObligatorio ? !ev1?.permite : (ev1?.faltan ?? []).includes("rnmc"), ev1);
  const r1 = await manual(uno.id, "rnmc", { hallazgo: false, nota: "Revisado en el portal de la Policía: sin medidas." });
  revisar("«Lo revisé a mano» guarda la revisión", r1.ok, r1);
  e = await estado(uno.id);
  revisar("queda una consulta manual del RNMC, sin novedad", ultima(e.consultas, "rnmc")?.proveedor === "manual" && ultima(e.consultas, "rnmc")?.estado === "ok", ultima(e.consultas, "rnmc"));
  revisar("queda en el historial como revisión manual", e.manuales === 1, e.manuales);
  const ev1b = await evaluarAntecedentesProceso(uno.id);
  revisar("las reglas ya lo dejan pasar, sin nada pendiente", ev1b?.permite && !(ev1b.faltan ?? []).length, ev1b);
  revisar("queda «Listo para citar»", e.listo);
  if (citaAutomatica) revisar("y se cita solo, como si Croma hubiera respondido", e.citas.length === 1 && e.p?.estado === "citado", { estado: e.p?.estado, citas: e.citas });

  // ── 2 ────────────────────────────────────────────────────────────────────
  titulo("2. Croma no responde ningún antecedente y se revisan los cuatro a mano");
  const dos = await crear({ ...ESCENARIO_BASE, policia: "error", procuraduria: "error", contraloria: "error", rnmc: "error" });
  e = await estado(dos.id);
  revisar("no avanza ni se cita solo", !e.listo && e.citas.length === 0, e);
  for (const f of ["policia", "procuraduria", "contraloria"] as const) {
    const r = await manual(dos.id, f, { hallazgo: false });
    revisar(`${f} revisado a mano`, r.ok, r);
    e = await estado(dos.id);
    revisar(`con ${f} revisado y el RNMC todavía sin respuesta, sigue sin citarse`, e.citas.length === 0, e.citas);
  }
  await manual(dos.id, "rnmc", { hallazgo: false });
  e = await estado(dos.id);
  revisar("con las cuatro revisadas, queda «Listo para citar»", e.listo);
  if (citaAutomatica) revisar("y se cita solo", e.citas.length === 1, e.citas);

  // ── 3 ────────────────────────────────────────────────────────────────────
  titulo("3. Croma no responde el RUNT ni el SIMIT; licencia y SIMIT a mano");
  const tres = await crear({ ...ESCENARIO_BASE, runt: "error", simit: "error" });
  e = await estado(tres.id);
  revisar("sin RUNT la licencia no queda verificada", !e.p?.licencia_verificada_runt, e.p);
  revisar("no se cita solo", e.citas.length === 0, e.citas);
  const rSimit = await manual(tres.id, "simit", { hallazgo: false, valor: 0 });
  revisar("SIMIT a mano en $0", rSimit.ok, rSimit);
  const rRunt = await manual(tres.id, "runt", { hallazgo: false, licencia: { categoria: "C2", vence: "2030-12-31", restricciones: "" } });
  revisar("licencia a mano (C2, vence 2030)", rRunt.ok, rRunt);
  e = await estado(tres.id);
  revisar("la licencia queda verificada (cuenta como el RUNT)", e.p?.licencia_verificada_runt === true && /C2/.test(String(e.p?.licencia_categoria)), e.p);
  revisar("el SIMIT queda «ok» en $0", e.p?.simit === "ok" && Number(e.p?.simit_valor) === 0, e.p);
  revisar("la preselección pasa y entra a antecedentes", e.p?.estado === "antecedentes", e.p?.estado);
  // Los antecedentes se consultan con el siguiente mensaje (chat) o el cron, no dentro del botón:
  // el RNMC puede tardar hasta 90 s y la persona no tiene por qué esperarlo.
  await simularCromaProceso(tres.id, { licencia: "C2", nombre: "NESTOR CAIDO PRUEBA", simit: null, escenario: { ...ESCENARIO_BASE, runt: "error", simit: "error" } }, actor);
  await marcarListoParaCitar(tres.id);
  e = await estado(tres.id);
  revisar("con el siguiente paso se consultan los antecedentes (no repite RUNT ni SIMIT)", ultima(e.consultas, "policia")?.estado === "ok" && ultima(e.consultas, "runt")?.proveedor === "manual", e.consultas);
  revisar("queda «Listo para citar»", e.listo);
  if (citaAutomatica) revisar("y se cita solo", e.citas.length === 1, e.citas);

  // ── 4 ────────────────────────────────────────────────────────────────────
  titulo("4. RNMC revisado a mano CON hallazgo");
  const cuatro = await crear({ ...ESCENARIO_BASE, rnmc: "error" });
  const r4 = await manual(cuatro.id, "rnmc", { hallazgo: true, nota: "Tiene una medida correctiva pendiente por riña (portal de la Policía)." });
  revisar("se guarda con la nota", r4.ok, r4);
  e = await estado(cuatro.id);
  const ev4 = await evaluarAntecedentesProceso(cuatro.id);
  revisar("las reglas lo ven como hallazgo (no limpio)", ev4?.veredicto !== "limpio", ev4?.veredicto);
  revisar("no se cita solo: lo decide una persona", e.citas.length === 0 || ev4?.permite === true, { citas: e.citas, veredicto: ev4?.veredicto, permite: ev4?.permite });
  console.log(`  · veredicto: ${ev4?.veredicto} · permite seguir: ${ev4?.permite ? "sí (las reglas lo toleran)" : "no"} · revisión: ${e.revision ? "sí" : "no"}`);

  // ── 5 ────────────────────────────────────────────────────────────────────
  titulo("5. Lo que «Lo revisé a mano» no acepta");
  const cinco = await crear({ ...ESCENARIO_BASE, rnmc: "error", runt: "error" });
  const sinNota = await manual(cinco.id, "rnmc", { hallazgo: true, nota: "" });
  revisar("un hallazgo sin decir qué se encontró", !sinNota.ok && /qué encontraste/i.test(sinNota.error ?? ""), sinNota);
  const sinCat = await manual(cinco.id, "runt", { hallazgo: false, licencia: { categoria: "" } });
  revisar("la licencia sin categoría", !sinCat.ok && /categoría/i.test(sinCat.error ?? ""), sinCat);
  const vencida = await manual(cinco.id, "runt", { hallazgo: false, licencia: { categoria: "C2", vence: "2020-01-01" } });
  revisar("una licencia vencida", !vencida.ok && /vencida/i.test(vencida.error ?? ""), vencida);
  const noPdf = await manual(cinco.id, "rnmc", { hallazgo: false, pdf: { base64: "aG9sYQ==", nombre: "x.pdf" } });
  revisar("un archivo que no es PDF", !noPdf.ok && /PDF/.test(noPdf.error ?? ""), noPdf);
  e = await estado(cinco.id);
  revisar("los rechazos no dejan consultas manuales", !e.consultas.some((c) => c.proveedor === "manual"), e.consultas);

  // ── 6 ────────────────────────────────────────────────────────────────────
  titulo("6. Después de la revisión manual, Croma no vuelve a consultar esa fuente");
  const antes = (await estado(uno.id)).consultas.filter((c) => c.fuente === "rnmc").length;
  await simularCromaProceso(uno.id, { licencia: "C2", nombre: "NESTOR CAIDO PRUEBA", simit: null, escenario: { ...ESCENARIO_BASE, rnmc: "error" } }, actor);
  const despues = (await estado(uno.id)).consultas.filter((c) => c.fuente === "rnmc").length;
  revisar("el siguiente mensaje del aspirante no repite la consulta del RNMC", despues === antes, { antes, despues });

  // ── 7 ────────────────────────────────────────────────────────────────────
  titulo("7. La revisión manual no pausa al asistente");
  const siete = await crear({ ...ESCENARIO_BASE, rnmc: "error" });
  const { data: contacto, error: eC } = await db.from("wa_contactos").insert({ telefono: TELEFONO, nombre: "PRUEBA SERVICIO CAIDO" }).select("id").single();
  if (eC) throw new Error(eC.message);
  const { data: conv, error: eV } = await db
    .from("wa_conversaciones")
    .insert({ contacto_id: contacto.id, proceso_id: siete.id, agente_pausado: false, estado: "abierta" })
    .select("id")
    .single();
  if (eV) throw new Error(eV.message);
  const r7 = await manual(siete.id, "rnmc", { hallazgo: false });
  revisar("revisión guardada", r7.ok, r7);
  const { data: c7 } = await db.from("wa_conversaciones").select("agente_pausado, agente_motivo_pausa").eq("id", conv.id).single();
  revisar("el asistente sigue activo en la conversación", c7?.agente_pausado === false, c7);
  const { count: mensajes } = await db.from("wa_mensajes").select("id", { count: "exact", head: true }).eq("conversacion_id", conv.id);
  revisar("no se le escribió nada al aspirante por la revisión", (mensajes ?? 0) === 0 || (await estado(siete.id)).citas.length > 0, mensajes);

  // ── 8 ────────────────────────────────────────────────────────────────────
  titulo("8. Barra de estado de los servicios");
  olvidarEstadoServicios();
  const estados = await leerEstadoServicios();
  const croma = estados.find((s) => s.id === "croma");
  revisar("Croma se evalúa por fuente", Array.isArray(croma?.partes), croma);
  revisar("los errores simulados de esta batería no cuentan (solo las respuestas reales de Croma)", !(croma?.partes ?? []).some((p) => (p.ultimoError?.texto ?? "").includes("simulado")), croma?.partes);
  const rnmcReal = croma?.partes?.find((p) => p.id === "rnmc");
  if (rnmcReal?.nivel === "fallando") {
    revisar("el RNMC caído de verdad sale como «fallando» con la solución y el portal", /Lo revisé a mano/.test(rnmcReal.consejo ?? "") && Boolean(rnmcReal.portal), rnmcReal);
    revisar("el aviso dice qué fuente es", /RNMC/.test(croma?.nombre ?? ""), croma?.nombre);
  } else {
    console.log(`  · el RNMC real está «${rnmcReal?.nivel ?? "sin datos"}» ahora: no se puede comprobar el aviso de caída con datos reales.`);
  }

  // ── 9 ────────────────────────────────────────────────────────────────────
  titulo("9. Registro de llamadas y estadísticas de proveedores");
  const { error: sinTabla } = await db.from("servicios_llamadas").select("id").limit(1);
  if (sinTabla) {
    console.log("  · falta la migración 20261126191610 (servicios_llamadas): el registro no guarda nada y la operación sigue igual.");
    registrarLlamada({ servicio: "ia", proveedor: "prueba-bateria", fuente: "chat", ok: true, duracionMs: 10 });
    revisar("registrar sin la tabla no rompe nada", true);
  } else {
    registrarLlamada({ servicio: "ia", proveedor: "prueba-bateria", fuente: "chat", ok: false, duracionMs: 1234, error: "prueba" });
    await new Promise((r) => setTimeout(r, 2000));
    const { data: fila } = await db.from("servicios_llamadas").select("ok, duracion_ms, error").eq("proveedor", "prueba-bateria").maybeSingle();
    revisar("una llamada queda registrada con su tiempo y su error", fila?.ok === false && fila.duracion_ms === 1234 && fila.error === "prueba", fila);
  }
  const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
  const desde = new Date(Date.now() - 5 * 3_600_000 - 6 * 86_400_000).toISOString().slice(0, 10);
  const est = await leerEstadisticasProveedores({ desde, hasta: hoy });
  revisar("las estadísticas de los últimos 7 días se leen", est.dias.length === 7, est.dias);
  const filaRnmc = est.filas.find((f) => f.servicio === "croma" && f.fuente === "rnmc");
  if (filaRnmc) {
    console.log(`  · RNMC en 7 días: ${filaRnmc.respondio} de ${filaRnmc.intentos} respondieron · caídas ${filaRnmc.caidas.length} · ${filaRnmc.recomendacion ?? "sin recomendación"}`);
    revisar("el RNMC aparece con su tasa de respuesta", filaRnmc.intentos > 0 && filaRnmc.tasa != null, filaRnmc);
  }
  revisar("las consultas simuladas no entran en las estadísticas", !est.filas.some((f) => f.proveedor === "simulado"), est.filas.map((f) => f.clave));
} finally {
  const borrados = await limpiar();
  console.log(`\nLimpieza: ${borrados} candidatos ficticios borrados (y su conversación de prueba).`);
}
console.log(`\nRESULTADO: ${ok} de ${ok + fallos.length} comprobaciones bien.`);
if (fallos.length) {
  console.log("Fallaron:");
  for (const f of fallos) console.log(`  - ${f}`);
  process.exitCode = 1;
}
