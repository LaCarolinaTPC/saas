/**
 * Consulta del SIMIT de un proceso: llama al proveedor configurado (Croma),
 * guarda cada consulta en verificaciones_externas, actualiza el SIMIT del
 * proceso y recalcula el semáforo. Exige la autorización de datos (Ley 1581).
 * Si Croma responde con un trabajo asíncrono, la consulta queda pendiente y
 * `resolverSimitPendientes` (cron de seguimiento) la termina. La licencia se
 * consulta igual en el RUNT (`consultarRuntProceso`), con `resolverRuntPendientes`.
 */
import { cromaPausado, siCromaActivo } from "./pausa";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import {
  evaluarAntecedentesProceso,
  identidadConfirmadaRunt,
  marcarListoParaCitar,
  marcarRevisionAntecedentes,
  reevaluarPreseleccion,
  runtSinRespuesta,
  simitObligatorio,
} from "@/lib/seleccion/servidor";
import { hallazgoDe, type EvaluacionAntecedentes } from "@/lib/seleccion/antecedentes";
import { categoriasDeLicencia } from "@/lib/seleccion/preseleccion";
import { ESCENARIO_BASE, type EscenarioCroma } from "@/lib/seleccion/escenario-croma";
import { cedulaLeidaDeProceso } from "@/lib/seleccion/lectura-fotos";
import {
  consultarRuntConIdentidad,
  interpretarPoliciaCroma,
  interpretarRnmcCroma,
  interpretarRuntCroma,
  interpretarSimitCroma,
  nombresCoinciden,
  proveedorAntecedentes,
  proveedorPolicia,
  proveedorRnmc,
  errorTransitorio,
  proveedorAdres,
  interpretarAdresCroma,
  primerApellidoDeApellidos,
  proveedorRunt,
  proveedorSimit,
  type FuenteAntecedenteCroma,
  type ResultadoPolicia,
  type ResultadoRnmc,
  type ResultadoRunt,
  type ResultadoSimit,
  type ResumenRunt,
} from "./proveedores";

/**
 * Días que se reutiliza una respuesta buena de Croma para la misma cédula
 * (ajuste `croma_cache_dias`, migración 20261118230056; sin el ajuste, 3).
 * 0 = consultar siempre.
 */
async function diasCacheCroma(): Promise<number> {
  const { data } = await createAdminClient().from("seleccion_ajustes").select("valor").eq("clave", "croma_cache_dias").maybeSingle();
  const n = Number(data?.valor);
  return data && Number.isFinite(n) && n >= 0 ? Math.min(n, 365) : 3;
}

/**
 * Reintenta hasta dos veces una consulta a Croma que falló por algo pasajero
 * (tiempo agotado, 502, 429…), con una pausa corta (pedido de GH del
 * 18-nov-2026). Solo mientras quede tiempo del turno: si la falla ya gastó el
 * tiempo, no se insiste aquí y la retoma el cron. Lo que no es pasajero (por
 * ejemplo, la fecha no coincide) no se reintenta.
 */
async function conReintentos<T extends { estado: string; error?: string | null }>(consultar: () => Promise<T>, veces = 2, presupuestoMs = 70_000): Promise<T> {
  const inicio = Date.now();
  let r = await consultar();
  // Croma avisa cuando la fuente está caída («Try again in about N minute(s); retrying sooner will fail the
  // same way»): insistir enseguida no sirve; se deja al cron.
  const pideEsperar = (e: string | null | undefined) => /try again in about|retrying sooner/i.test(e ?? "");
  for (let i = 0; i < veces && r.estado === "error" && errorTransitorio(r.error ?? null) && !pideEsperar(r.error) && Date.now() - inicio < presupuestoMs; i++) {
    await new Promise((ok) => setTimeout(ok, 3_000));
    r = await consultar();
  }
  return r;
}

type FuenteCache = "simit" | "runt" | "policia" | "procuraduria" | "contraloria";

/**
 * Última respuesta buena de Croma para esa cédula y fuente dentro del caché,
 * en cualquier proceso (pedido de GH del 18-nov-2026: no repetir consultas ya
 * hechas). Nunca una que dio error ni una en curso. Cuentan también las de un
 * candidato de prueba reiniciado, si habían salido bien.
 */
async function consultaReciente(fuente: FuenteCache, cedula: string): Promise<{ resultado: Record<string, unknown>; proveedor: string; del: string } | null> {
  const dias = await diasCacheCroma();
  if (dias <= 0) return null;
  const limpia = cedula.replace(/\D/g, "");
  const { data, error } = await createAdminClient()
    .from("verificaciones_externas")
    .select("resultado, proveedor, created_at, cedula")
    .eq("fuente", fuente)
    // Solo respuestas de verdad: ni las simuladas del chat de prueba ni las revisiones manuales.
    .not("proveedor", "in", "(simulado,manual)")
    .in("cedula", [...new Set([cedula, limpia])])
    .in("estado", ["ok", "hallazgo", "reiniciada"])
    .is("error", null)
    .gte("created_at", new Date(Date.now() - dias * 24 * 3_600_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return null;
  for (const f of data ?? []) {
    const r = f.resultado as Record<string, unknown> | null;
    // Una consulta que quedó en curso solo guarda el id del trabajo: no sirve.
    if (!r || typeof r !== "object" || "trabajo_id" in r) continue;
    return { resultado: r, proveedor: f.proveedor as string, del: f.created_at as string };
  }
  return null;
}

/** Texto de «consultado por» cuando la respuesta se tomó del caché. */
const reutilizada = (actor: ActorProceso, del: string) => `${actor.userEmail ?? "Sistema"} (reutilizada de la consulta del ${del.slice(0, 10)})`;

export type ResultadoConsultaSimit =
  | { modo: "manual"; mensaje: string }
  | { modo: "consultado"; estado: "ok" | "hallazgo"; valor: number }
  | { modo: "pendiente"; mensaje: string }
  | { modo: "error"; mensaje: string };

/** Lleva un resultado terminado al proceso: SIMIT, historial y semáforo. */
async function aplicarResultado(procesoId: string, r: ResultadoSimit, proveedor: string, actor: ActorProceso): Promise<void> {
  if (r.valor == null || (r.estado !== "ok" && r.estado !== "hallazgo")) return;
  await createAdminClient()
    .from("procesos_contratacion")
    .update({ simit: r.valor > 0 ? "deuda" : "ok", simit_valor: r.valor })
    .eq("id", procesoId);
  await registrarEvento(procesoId, { tipo: "dato", detalle: { simit: r.valor, proveedor } }, actor);
  await reevaluarPreseleccion(procesoId);
}

export async function consultarSimitProceso(
  procesoId: string,
  actor: ActorProceso,
  /** `seguirMs`: cuánto se sigue el trabajo si Croma lo deja en curso (un minuto en el turno del aspirante). */
  opciones: { seguirMs?: number } = {}
): Promise<ResultadoConsultaSimit> {
  const admin = createAdminClient();
  const { data: p } = await admin
    .from("procesos_contratacion")
    .select("id, cedula, autorizacion_datos")
    .eq("id", procesoId)
    .maybeSingle();
  if (!p) return { modo: "error", mensaje: "El proceso no existe." };
  if (p.autorizacion_datos !== "si") {
    return { modo: "error", mensaje: "El aspirante no ha autorizado el tratamiento de datos: no se puede consultar." };
  }
  const cedula = String(p.cedula ?? "").trim();
  if (!cedula) return { modo: "error", mensaje: "El proceso no tiene cédula." };

  const proveedor = await siCromaActivo(proveedorSimit({ seguirMs: opciones.seguirMs }));
  if (!proveedor) {
    return { modo: "manual", mensaje: "No hay proveedor configurado (falta CROMA_API_KEY): registre el SIMIT a mano en la ficha." };
  }

  // Si ya hay una consulta en curso, no se lanza otra.
  const { data: enCurso } = await admin
    .from("verificaciones_externas")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("fuente", "simit")
    .eq("estado", "pendiente")
    .limit(1)
    .maybeSingle();
  if (enCurso) return { modo: "pendiente", mensaje: "La consulta del SIMIT sigue en curso en Croma; el resultado llega solo." };

  const cache = await consultaReciente("simit", cedula);
  const enCache = cache ? interpretarSimitCroma(cache.resultado as never) : null;
  const usaCache = !!cache && !!enCache && enCache.valor != null && (enCache.estado === "ok" || enCache.estado === "hallazgo");
  const r = usaCache ? enCache! : await conReintentos(() => proveedor.consultarSimit(cedula));
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: usaCache ? cache!.proveedor : proveedor.nombre,
    fuente: "simit",
    estado: r.estado,
    valor: r.valor,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    costo: usaCache ? null : (r.costo ?? null),
    error: r.error ?? null,
    consultado_por: usaCache ? reutilizada(actor, cache!.del) : actor.userEmail,
  });

  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando el SIMIT; el resultado llega en unos minutos." };
  if (r.estado === "error" || r.valor == null) return { modo: "error", mensaje: r.error ?? "La consulta del SIMIT falló." };
  await aplicarResultado(procesoId, r, proveedor.nombre, actor);
  return { modo: "consultado", estado: r.estado, valor: r.valor };
}

/**
 * Termina las consultas del SIMIT que quedaron como trabajo asíncrono de
 * Croma. Lo llama el cron de seguimiento cada 15 minutos. Las que pasan de
 * 24 horas sin resultado se dan por fallidas.
 */
export async function resolverSimitPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number }> {
  const proveedor = await siCromaActivo(proveedorSimit());
  if (!proveedor) return { revisadas: 0, terminadas: 0 };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, resultado, created_at")
    .eq("fuente", "simit")
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0 };

  let terminadas = 0;
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajoSimit(trabajoId);
    if (r.estado === "pendiente") continue;
    await admin
      .from("verificaciones_externas")
      .update({ estado: r.estado, valor: r.valor, resultado: r.crudo ?? null, error: r.error ?? null })
      .eq("id", f.id);
    terminadas++;
    if (f.proceso_id) await aplicarResultado(f.proceso_id as string, r, proveedor.nombre, ACTOR_SISTEMA);
  }
  return { revisadas: filas.length, terminadas };
}

/**
 * Croma simulado para un candidato del chat de prueba (casilla «Consultar
 * Croma de verdad» apagada): deja en el candidato lo que habría respondido
 * Croma según el escenario elegido al abrir el chat (por defecto «Todo bien»:
 * la licencia que dijo, vigente; SIMIT en $0; antecedentes limpios), sin
 * gastar consultas, para probar el recorrido completo y sus variantes (licencia
 * vencida, multas, antecedentes, Croma caído…). Todo queda marcado «simulado»
 * en «Consultas a Croma» y nunca se reutiliza como caché. Cada fuente se
 * simula una sola vez por candidato. Solo procesos «chat_prueba».
 */
export async function simularCromaProceso(
  procesoId: string,
  d: { licencia: string | null; nombre: string | null; simit: number | null; escenario?: EscenarioCroma | null },
  actor: ActorProceso
): Promise<void> {
  const admin = createAdminClient();
  const esc: EscenarioCroma = d.escenario ?? { ...ESCENARIO_BASE, simit: d.simit != null && Number.isFinite(d.simit) ? Math.max(0, Math.round(d.simit)) : 0 };
  const leer = async () =>
    (await admin.from("procesos_contratacion").select("origen, estado, cedula, nombre, simit, licencia_runt, autorizacion_datos").eq("id", procesoId).maybeSingle()).data;
  let p = await leer();
  if (!p || p.origen !== "chat_prueba" || p.autorizacion_datos !== "si") return;
  if (p.estado !== "pendiente" && p.estado !== "antecedentes") return;
  const cedula = String(p.cedula ?? "").replace(/\D/g, "");
  const nombre = (String(p.nombre ?? "") !== "POR CONFIRMAR" ? String(p.nombre ?? "") : (d.nombre ?? "")).trim().toUpperCase() || "ASPIRANTE DE PRUEBA";
  const fila = (fuente: string, estado: string, resultado: Record<string, unknown> | null, valor: number | null = null) => ({
    proceso_id: procesoId,
    cedula,
    proveedor: "simulado",
    fuente,
    estado,
    valor,
    resultado: { ...(resultado ?? {}), simulado: true },
    error: estado === "error" ? "Croma no respondió (simulado en el chat de prueba)." : null,
    consultado_por: `${actor.userEmail ?? "Usuario"} (simulado en el chat de prueba)`,
  });
  // Fuentes ya simuladas (o consultadas) en este candidato: no se repiten con cada mensaje.
  const hechas = async () => {
    const { data } = await admin.from("verificaciones_externas").select("fuente, estado, proveedor").eq("proceso_id", procesoId).neq("estado", "reiniciada");
    return new Set((data ?? []).filter((f) => f.proveedor === "simulado" || f.estado === "ok" || f.estado === "pendiente").map((f) => f.fuente as string));
  };
  let ya = await hechas();

  // RUNT. Como en el real, trae la licencia aunque el aspirante todavía no la haya dicho
  // (así el asistente no se la pregunta): la que dijo o, si no ha dicho, C2.
  const dichas = categoriasDeLicencia(d.licencia);
  const categorias = dichas.length ? dichas : ["C2"];
  if (!p.licencia_runt && !ya.has("runt")) {
    if (esc.runt === "error") {
      await admin.from("verificaciones_externas").insert(fila("runt", "error", null));
    } else {
      const persona = { full_name: nombre, has_licenses: esc.runt !== "sin_licencia" };
      const licencia = (cats: string[], vence: string) => [{ status: "ACTIVA", is_retained: false, cancellation_date: null, categories: cats.map((c) => ({ category: c, expiry_date: vence })) }];
      const crudo =
        esc.runt === "no_aparece"
          ? { found: false }
          : esc.runt === "sin_licencia"
            ? { found: true, person: persona, licenses: [] }
            : esc.runt === "inferior"
              ? { found: true, person: persona, licenses: licencia(["B1"], "2031-12-31") }
              : { found: true, person: persona, licenses: licencia(categorias, esc.runt === "vencida" ? "2024-03-31" : "2031-12-31") };
      const r = interpretarRuntCroma(crudo as never);
      await admin.from("verificaciones_externas").insert(fila("runt", "ok", crudo));
      await aplicarRunt(procesoId, r.resumen ? { ...r, resumen: { ...r.resumen, identidadVerificada: esc.runt !== "no_aparece" } } : r, "simulado", actor, cedula, null);
    }
  }
  // SIMIT.
  if (!p.simit && !ya.has("simit")) {
    if (esc.simit === "error") {
      await admin.from("verificaciones_externas").insert(fila("simit", "error", null));
      await reevaluarPreseleccion(procesoId);
    } else {
      const valor = esc.simit;
      await admin.from("verificaciones_externas").insert(fila("simit", valor > 0 ? "hallazgo" : "ok", { summary: { total: valor } }, valor));
      await aplicarResultado(procesoId, { estado: valor > 0 ? "hallazgo" : "ok", valor, crudo: { summary: { total: valor } } } as ResultadoSimit, "simulado", actor);
    }
  } else {
    await reevaluarPreseleccion(procesoId);
  }
  // Antecedentes, si ya pasó la preselección.
  p = await leer();
  if (p?.estado !== "antecedentes") return;
  ya = await hechas();
  const respuesta = (fuente: "policia" | "procuraduria" | "contraloria" | "rnmc"): Record<string, unknown> => {
    const con = esc[fuente] === "hallazgo";
    switch (fuente) {
      case "policia":
        return { full_name: nombre, has_records: con, status: con ? "TIENE ASUNTOS PENDIENTES CON LAS AUTORIDADES JUDICIALES" : "NO TIENE ASUNTOS PENDIENTES CON LAS AUTORIDADES JUDICIALES" };
      case "procuraduria":
        return { found: true, has_records: con, status: con ? "REGISTRA SANCIONES DISCIPLINARIAS" : "NO REGISTRA SANCIONES NI INHABILIDADES VIGENTES" };
      case "contraloria":
        return {
          is_fiscal_responsible: con,
          records: con ? [{ ruling_number: "SIMULADO-001", ruling_date: esc.contraloriaFecha, affected_entity: "Entidad simulada", amount: esc.contraloriaValor }] : [],
          status: con ? "SE ENCUENTRA REPORTADO COMO RESPONSABLE FISCAL" : "NO SE ENCUENTRA REPORTADO COMO RESPONSABLE FISCAL",
        };
      case "rnmc":
        return {
          found: true,
          full_name: nombre,
          has_pending_measures: con,
          pending_measures: con ? Array.from({ length: esc.rnmcMedidas }, (_, i) => ({ descripcion: `Medida correctiva simulada ${i + 1}` })) : [],
          status: con ? "TIENE MEDIDAS CORRECTIVAS PENDIENTES" : "NO TIENE MEDIDAS CORRECTIVAS PENDIENTES" };
    }
  };
  const nuevas = (["policia", "procuraduria", "contraloria", "rnmc"] as const)
    .filter((f) => !ya.has(f))
    .map((f) => (esc[f] === "error" ? fila(f, "error", null) : fila(f, "ok", respuesta(f))));
  if (nuevas.length) await admin.from("verificaciones_externas").insert(nuevas);
  await evaluarAntecedentesProceso(procesoId);
}

/** Etapas después de «Antecedentes» en las que todavía puede faltar una fuente que no respondió. */
const ESTADOS_DESPUES_DE_ANTECEDENTES = ["citado", "prueba_manejo", "en_escuela", "en_examenes", "en_examenes_fase2", "reconocimiento_ruta", "listo_contratar"];

/**
 * SIMIT que Croma no completó (el trabajo terminó en error): el cron lo vuelve
 * a lanzar. Solo procesos del asistente de WhatsApp, en preselección, con
 * autorización y sin SIMIT registrado (si una persona lo revisó a mano y lo
 * escribió en la ficha, ya no se insiste). Freno: último error hace 30 min o
 * más y menos de 6 errores en 24 horas.
 */
export async function relanzarSimitFallidos(limite = 3): Promise<{ relanzados: number }> {
  if (!(await siCromaActivo(proveedorSimit()))) return { relanzados: 0 };
  const admin = createAdminClient();
  const desde = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const { data: procesos } = await admin
    .from("procesos_contratacion")
    .select("id")
    // 27-nov-2026: también quien siguió sin el SIMIT (opcional o con aval): si llega tarde y no cumple, se avisa.
    .in("estado", ["pendiente", "antecedentes", ...ESTADOS_DESPUES_DE_ANTECEDENTES])
    .eq("origen", "whatsapp_agente")
    .eq("autorizacion_datos", "si")
    .is("simit", null)
    .gte("updated_at", desde)
    .order("updated_at", { ascending: false })
    .limit(40);
  let relanzados = 0;
  for (const p of procesos ?? []) {
    if (relanzados >= limite) break;
    const { data: filas } = await admin
      .from("verificaciones_externas")
      .select("estado, created_at")
      .eq("proceso_id", p.id)
      .eq("fuente", "simit")
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(10);
    const ultima = filas?.[0];
    // Sin intento previo (lo lanza el flujo normal), en curso o ya resuelto: nada que relanzar.
    if (!ultima || ultima.estado !== "error") continue;
    if ((filas ?? []).filter((f) => f.estado === "error").length >= 6) continue;
    if (Date.now() - Date.parse(ultima.created_at as string) < 30 * 60_000) continue;
    await consultarSimitProceso(p.id as string, ACTOR_SISTEMA).catch((e) => console.error("[seleccion] SIMIT (reintento del cron):", e));
    relanzados++;
  }
  return { relanzados };
}

// ── RUNT: licencia de conducción ───────────────────────────────────────────

export type ResultadoConsultaRunt =
  | { modo: "manual"; mensaje: string }
  | { modo: "consultado"; tieneLicencia: boolean }
  | { modo: "pendiente"; mensaje: string }
  | { modo: "error"; mensaje: string };

/**
 * Nombre de la persona según el RNMC (registro civil, validado con la fecha de
 * expedición): el que manda. null si no se ha consultado o la fecha no coincidió.
 */
export async function nombreRegistroRnmc(procesoId: string): Promise<string | null> {
  const admin = createAdminClient();
  // Solo el RNMC de la cédula actual del proceso: si el aspirante la corrigió, el de la anterior no vale.
  const cedula = await cedulaDeProceso(procesoId);
  if (!cedula) return null;
  const { data } = await admin
    .from("verificaciones_externas")
    .select("resultado")
    .eq("proceso_id", procesoId)
    .eq("fuente", "rnmc")
    .eq("cedula", cedula)
    .eq("estado", "ok")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const r = (data?.resultado ?? null) as { found?: boolean; full_name?: string | null } | null;
  if (!r || r.found === false) return null;
  return interpretarRnmcCroma(r).resumen?.nombre ?? null;
}

/**
 * Lleva el RUNT al proceso: guarda el resumen, marca la licencia como
 * verificada (ya no lo hace una persona), deja las categorías del RUNT en la
 * ficha y recalcula el semáforo. Si el RUNT trae la cédula a nombre de otra
 * persona (no coincide con el RNMC), nada de ese registro se usa.
 */
async function aplicarRunt(
  procesoId: string,
  r: ResultadoRunt,
  proveedor: string,
  actor: ActorProceso,
  cedula: string,
  nombreRegistro?: string | null
): Promise<void> {
  if (r.estado !== "ok" || !r.resumen) return;
  const registro = nombreRegistro ?? r.resumen.nombreRegistro ?? (await nombreRegistroRnmc(procesoId));
  const resumen: ResumenRunt = { ...r.resumen, cedula: cedula.replace(/\D/g, ""), nombreRegistro: registro };
  if (registro && resumen.registrado !== false && resumen.nombre && !nombresCoinciden(resumen.nombre, registro)) {
    resumen.nombreNoCoincide = true;
  }
  const ajeno = resumen.nombreNoCoincide === true;
  // En la ficha, solo las categorías de licencias en firme: el RUNT trae también el historial (INACTIVA).
  const enFirme = resumen.categorias.filter((c) => c.activa);
  const categorias = ajeno ? [] : [...new Set((enFirme.length ? enFirme : resumen.categorias).map((c) => c.categoria))];
  const admin = createAdminClient();
  // El asistente ya no pregunta el nombre. Manda el del RNMC; el del RUNT solo
  // si el RNMC todavía no lo dio (se demoró y el RUNT salió con el apellido de
  // la foto o de ADRES) y el registro no es de otra persona. Los procesos que
  // creó Gestión Humana no se tocan.
  const { data: actual } = await admin.from("procesos_contratacion").select("origen, nombre, candidate_id").eq("id", procesoId).maybeSingle();
  const nombreRnmc = await nombreRegistroRnmc(procesoId);
  const nombreNuevo =
    !nombreRnmc && !ajeno && resumen.nombre && (actual?.origen === "whatsapp_agente" || actual?.origen === "chat_prueba") && actual.nombre !== resumen.nombre
      ? resumen.nombre
      : null;
  await admin
    .from("procesos_contratacion")
    .update({
      licencia_runt: resumen,
      // Si la cédula no aparece en el RUNT o el registro es de otra persona, la licencia no queda verificada.
      licencia_verificada_runt: resumen.registrado !== false && !ajeno,
      ...(categorias.length ? { licencia_categoria: categorias.join(", ") } : {}),
      ...(nombreNuevo ? { nombre: nombreNuevo } : {}),
    })
    .eq("id", procesoId);
  if (nombreNuevo && actual?.candidate_id) {
    await admin.from("candidates").update({ full_name: nombreNuevo }).eq("id", actual.candidate_id);
  }
  await registrarEvento(
    procesoId,
    {
      tipo: "dato",
      detalle: {
        runt: {
          registrado: resumen.registrado !== false,
          tiene_licencia: resumen.tieneLicencia,
          categorias: resumen.categorias,
          ...(resumen.restricciones?.length ? { restricciones: resumen.restricciones } : {}),
          ...(ajeno ? { nombre_no_coincide: true } : {}),
          ...(resumen.identidadVerificada ? { identidad_verificada: true } : {}),
        },
        ...(nombreNuevo ? { nombre: { anterior: actual?.nombre ?? null, nuevo: nombreNuevo, origen: "runt" } } : {}),
        proveedor,
      },
    },
    actor
  );
  await reevaluarPreseleccion(procesoId);
}

export async function consultarRuntProceso(
  procesoId: string,
  actor: ActorProceso,
  opciones: {
    /** Nombre con que se compara el del RUNT (RNMC, foto de la cédula o ADRES). */
    nombreRegistro?: string | null;
    /** Primer apellido ya conocido (foto de la cédula): se manda primero. */
    apellido?: string | null;
    /** Cuánto se sigue el trabajo si Croma lo deja en curso (un minuto en el turno del aspirante). */
    seguirMs?: number;
  } = {}
): Promise<ResultadoConsultaRunt> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("id, cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p) return { modo: "error", mensaje: "El proceso no existe." };
  if (p.autorizacion_datos !== "si") {
    return { modo: "error", mensaje: "El aspirante no ha autorizado el tratamiento de datos: no se puede consultar." };
  }
  const cedula = String(p.cedula ?? "").trim();
  if (!cedula) return { modo: "error", mensaje: "El proceso no tiene cédula." };

  const proveedor = await siCromaActivo(proveedorRunt({ seguirMs: opciones.seguirMs }));
  if (!proveedor) {
    return { modo: "manual", mensaje: "No hay proveedor configurado (falta CROMA_API_KEY): verifique la licencia a mano en el RUNT." };
  }
  const { data: enCurso } = await admin
    .from("verificaciones_externas")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("fuente", "runt")
    .eq("estado", "pendiente")
    .limit(1)
    .maybeSingle();
  if (enCurso) return { modo: "pendiente", mensaje: "La consulta del RUNT sigue en curso en Croma; el resultado llega solo." };

  // Con el nombre del registro civil (RNMC) se consulta con su primer apellido.
  const nombreRegistro = opciones.nombreRegistro ?? (await nombreRegistroRnmc(procesoId));
  // Caché: la misma cédula ya consultada bien hace poco, con el mismo primer apellido si se conoce.
  const cache = await consultaReciente("runt", cedula);
  if (cache && cache.resultado.found !== false) {
    const apellidoCache = String(cache.resultado.first_surname ?? "").trim().toUpperCase();
    const apellido = (opciones.apellido ?? "").trim().toUpperCase();
    const enCache = interpretarRuntCroma(cache.resultado as never);
    if (enCache.estado === "ok" && enCache.resumen && (!apellido || !apellidoCache || apellido.split(/\s+/)[0] === apellidoCache.split(/\s+/)[0])) {
      await admin.from("verificaciones_externas").insert({
        proceso_id: procesoId,
        cedula,
        proveedor: cache.proveedor,
        fuente: "runt",
        estado: "ok",
        valor: null,
        resultado: cache.resultado,
        error: null,
        consultado_por: reutilizada(actor, cache.del),
      });
      await aplicarRunt(procesoId, enCache, cache.proveedor, actor, cedula, nombreRegistro);
      return { modo: "consultado", tieneLicencia: enCache.resumen.tieneLicencia };
    }
  }
  const { resultado: r, intentos } = await consultarRuntConIdentidad(proveedor, cedula, nombreRegistro, opciones.apellido ?? null);
  for (const i of intentos) {
    await admin.from("verificaciones_externas").insert({
      proceso_id: procesoId,
      cedula,
      proveedor: proveedor.nombre,
      fuente: "runt",
      estado: i.resultado.estado,
      valor: null,
      resultado: i.resultado.estado === "pendiente" ? { trabajo_id: i.resultado.trabajoId ?? null } : (i.resultado.crudo ?? null),
      error: i.resultado.error ?? null,
      consultado_por: actor.userEmail,
    });
  }

  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando el RUNT; el resultado llega en unos minutos." };
  if (r.estado === "error" || !r.resumen) return { modo: "error", mensaje: r.error ?? "La consulta del RUNT falló." };
  await aplicarRunt(procesoId, r, proveedor.nombre, actor, cedula, nombreRegistro);
  return { modo: "consultado", tieneLicencia: r.resumen.tieneLicencia };
}

/** Termina las consultas del RUNT que quedaron como trabajo asíncrono (cron de seguimiento). */
export async function resolverRuntPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number; terminados: string[] }> {
  const proveedor = await siCromaActivo(proveedorRunt());
  if (!proveedor) return { revisadas: 0, terminadas: 0, terminados: [] };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, cedula, resultado, created_at")
    .eq("fuente", "runt")
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0, terminados: [] };

  let terminadas = 0;
  // Procesos cuyo RUNT acaba de llegar: el asistente le cuenta el resultado al
  // aspirante, que se quedó esperando («espera un momento mientras consultamos»).
  const terminados: string[] = [];
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajoRunt(trabajoId);
    if (r.estado === "pendiente") continue;
    await admin.from("verificaciones_externas").update({ estado: r.estado, resultado: r.crudo ?? null, error: r.error ?? null }).eq("id", f.id);
    terminadas++;
    if (f.proceso_id) {
      await aplicarRunt(f.proceso_id as string, r, proveedor.nombre, ACTOR_SISTEMA, String(f.cedula ?? ""));
      if (r.estado === "ok") terminados.push(f.proceso_id as string);
    }
  }
  return { revisadas: filas.length, terminadas, terminados };
}

// ── Policía: antecedentes judiciales y, si el RUNT no lo trae, el nombre ────

export type ResultadoConsultaPolicia =
  | { modo: "manual" | "omitida"; mensaje: string }
  | { modo: "consultado"; nombre: string | null }
  | { modo: "pendiente"; mensaje: string }
  | { modo: "error"; mensaje: string };

/**
 * Lleva la consulta de la Policía al proceso. El nombre solo se usa si el
 * RUNT no trajo uno y el proceso lo creó el asistente o el chat de prueba: si
 * la cédula quedó mal escrita, sería el nombre de otra persona, así que el
 * asistente nunca lo usa con el aspirante (solo queda en la ficha).
 */
async function aplicarPolicia(procesoId: string, r: ResultadoPolicia, proveedor: string, actor: ActorProceso): Promise<string | null> {
  if (r.estado !== "ok" || !r.resumen) return null;
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("origen, nombre, candidate_id, licencia_runt").eq("id", procesoId).maybeSingle();
  const runt = (p?.licencia_runt as ResumenRunt | null) ?? null;
  const runtNombre = runt && !runt.nombreNoCoincide ? (runt.nombre ?? null) : null;
  const nombre = r.resumen.nombre;
  const usar = nombre && !runtNombre && !(await nombreRegistroRnmc(procesoId)) && (p?.origen === "whatsapp_agente" || p?.origen === "chat_prueba") && p.nombre !== nombre ? nombre : null;
  if (usar) {
    await admin.from("procesos_contratacion").update({ nombre: usar }).eq("id", procesoId);
    if (p?.candidate_id) await admin.from("candidates").update({ full_name: usar }).eq("id", p.candidate_id);
  }
  await registrarEvento(
    procesoId,
    {
      tipo: "dato",
      detalle: {
        policia: { tiene_antecedentes: r.resumen.tieneAntecedentes, estado: r.resumen.estadoTexto },
        ...(usar ? { nombre: { anterior: p?.nombre ?? null, nuevo: usar, origen: "policia" } } : {}),
        proveedor,
      },
    },
    actor
  );
  return usar;
}

/**
 * Consulta la Policía para el proceso, una sola vez por cédula. Exige la
 * autorización (que incluye consultar antecedentes). El resultado de
 * antecedentes queda guardado para la entrega 3; hoy se usa por el nombre.
 */
export async function consultarPoliciaProceso(procesoId: string, actor: ActorProceso, opciones: { seguirMs?: number } = {}): Promise<ResultadoConsultaPolicia> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("id, cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p) return { modo: "error", mensaje: "El proceso no existe." };
  if (p.autorizacion_datos !== "si") return { modo: "error", mensaje: "El aspirante no ha autorizado el tratamiento de datos: no se puede consultar." };
  const cedula = String(p.cedula ?? "").replace(/\D/g, "");
  if (!cedula) return { modo: "error", mensaje: "El proceso no tiene cédula." };
  const proveedor = await siCromaActivo(proveedorPolicia({ seguirMs: opciones.seguirMs }));
  if (!proveedor) return { modo: "manual", mensaje: "No hay proveedor configurado (falta CROMA_API_KEY)." };
  const { data: previa } = await admin
    .from("verificaciones_externas")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("fuente", "policia")
    .eq("cedula", cedula)
    .in("estado", ["ok", "pendiente"])
    .limit(1)
    .maybeSingle();
  if (previa) return { modo: "omitida", mensaje: "La Policía ya se consultó para esta cédula." };

  const cache = await consultaReciente("policia", cedula);
  const enCache = cache ? interpretarPoliciaCroma(cache.resultado as never) : null;
  const usaCache = !!cache && enCache?.estado === "ok" && !!enCache.resumen;
  const r = usaCache ? enCache! : await conReintentos(() => proveedor.consultarPolicia(cedula));
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: usaCache ? cache!.proveedor : proveedor.nombre,
    fuente: "policia",
    estado: r.estado,
    valor: null,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    error: r.error ?? null,
    consultado_por: usaCache ? reutilizada(actor, cache!.del) : actor.userEmail,
  });
  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando la Policía; el resultado llega en unos minutos." };
  if (r.estado === "error" || !r.resumen) return { modo: "error", mensaje: r.error ?? "La consulta de la Policía falló." };
  return { modo: "consultado", nombre: await aplicarPolicia(procesoId, r, proveedor.nombre, actor) };
}

/** Termina las consultas de la Policía que quedaron como trabajo asíncrono (cron de seguimiento). */
export async function resolverPoliciaPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number }> {
  const proveedor = await siCromaActivo(proveedorPolicia());
  if (!proveedor) return { revisadas: 0, terminadas: 0 };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, resultado, created_at")
    .eq("fuente", "policia")
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0 };
  let terminadas = 0;
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajoPolicia(trabajoId);
    if (r.estado === "pendiente") continue;
    await admin.from("verificaciones_externas").update({ estado: r.estado, resultado: r.crudo ?? null, error: r.error ?? null }).eq("id", f.id);
    terminadas++;
    if (f.proceso_id) await aplicarPolicia(f.proceso_id as string, r, proveedor.nombre, ACTOR_SISTEMA);
  }
  return { revisadas: filas.length, terminadas };
}

// ── RNMC: medidas correctivas (solo se guarda; las reglas llegan en la E3) ──

export type ResultadoConsultaRnmc =
  | { modo: "manual" | "omitida"; mensaje: string }
  | { modo: "consultado"; medidasPendientes: boolean | null; fechaCoincide: boolean }
  | { modo: "pendiente"; mensaje: string }
  | { modo: "error"; mensaje: string };

/** Cédula del proceso, solo dígitos (como se guarda en verificaciones_externas); null si no hay. */
async function cedulaDeProceso(procesoId: string): Promise<string | null> {
  const { data } = await createAdminClient().from("procesos_contratacion").select("cedula").eq("id", procesoId).maybeSingle();
  const c = String(data?.cedula ?? "").replace(/\D/g, "");
  return c || null;
}

/** Error que se guarda cuando el RNMC dice que la fecha no corresponde a la cédula (lleva la fecha, para no repetirla). */
const errorFechaNoCoincide = (fecha: string | null) =>
  `La fecha de expedición${fecha ? ` ${fecha}` : ""} no coincide con la cédula según el RNMC.`;

/**
 * ¿La última consulta del RNMC dijo que la fecha de expedición no corresponde
 * a la cédula? Devuelve esa fecha y cuántas fechas se han rechazado, para que
 * el asistente la vuelva a pedir (pedido de GH del 18-nov-2026). null si no.
 */
export async function fechaExpedicionRechazada(procesoId: string): Promise<{ fecha: string | null; intentos: number } | null> {
  // Con la cédula corregida, el rechazo de la anterior ya no cuenta.
  const cedula = await cedulaDeProceso(procesoId);
  if (!cedula) return null;
  const { data } = await createAdminClient()
    .from("verificaciones_externas")
    .select("estado, error")
    .eq("proceso_id", procesoId)
    .eq("fuente", "rnmc")
    .eq("cedula", cedula)
    .order("created_at", { ascending: false })
    .limit(10);
  const filas = data ?? [];
  const rechazo = (f: { estado: unknown; error: unknown }) => f.estado === "error" && /no coincide/i.test(String(f.error ?? ""));
  if (!filas.length || !rechazo(filas[0])) return null;
  const fecha = /\d{4}-\d{2}-\d{2}/.exec(String(filas[0].error ?? ""))?.[0] ?? null;
  return { fecha, intentos: filas.filter(rechazo).length };
}

/**
 * ¿La verificación de la cédula (RNMC) está demorada? Sí, si la última
 * consulta de la cédula actual quedó en curso en Croma o falló por Croma o la
 * red (tiempo agotado, caída), y todavía no hay una respuesta buena. Mientras
 * tanto no se consulta nada más y el asistente no dice que ya revisamos.
 */
export async function rnmcDemorado(procesoId: string): Promise<boolean> {
  const cedula = await cedulaDeProceso(procesoId);
  if (!cedula) return false;
  const { data } = await createAdminClient()
    .from("verificaciones_externas")
    .select("estado, error")
    .eq("proceso_id", procesoId)
    .eq("fuente", "rnmc")
    .eq("cedula", cedula)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  if (data.estado === "pendiente") return true;
  const error = String(data.error ?? "");
  return data.estado === "error" && !/no coincide/i.test(error);
}

/**
 * ¿La verificación del aspirante sigue en curso? El RUNT todavía no se
 * consulta pero ya hay con qué (cédula y apellido: no cupo en el turno y lo
 * termina el cron, o Croma no respondió). No cuenta si lo declarado ya
 * descarta por edad o residencia (ahí el RUNT no se consulta).
 */
export async function verificacionEnCurso(procesoId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("estado, simit, licencia_runt, preseleccion, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p || p.autorizacion_datos !== "si") return false;
  // Croma en pausa: no hay nada en curso; lo que falta queda para revisar a mano (24-nov-2026).
  if (await cromaPausado()) return false;
  const pre = p.preseleccion as { edad?: { color?: string }; residencia?: { color?: string }; licencia?: { color?: string } } | null;
  if (pre?.edad?.color === "rojo" || pre?.residencia?.color === "rojo") return false;
  // El RUNT todavía no se consulta pero ya hay con qué. Si ya falló, no se dice que sigue
  // en curso: el asistente le pide la licencia (24-nov-2026) y se reintenta por detrás.
  if (!p.licencia_runt && !(await runtSinRespuesta(procesoId))) {
    const d = await datosNombreDeProceso(procesoId);
    if ((await nombreParaRunt(procesoId, d.foto, d.apellidoEscrito)).nombre) return true;
  }
  if (pre?.licencia?.color === "rojo") return false;
  // Otra fuente que frena al aspirante no ha respondido (falló o sigue en curso) y
  // se sigue reintentando: el asistente le dice que seguimos verificando
  // (pedido de GH del 18-nov-2026). Si la fuente es opcional, no frena y no se avisa.
  if (p.estado === "pendiente" && !p.simit && (await simitObligatorio())) {
    const { data: s } = await admin
      .from("verificaciones_externas")
      .select("estado")
      .eq("proceso_id", procesoId)
      .eq("fuente", "simit")
      .neq("estado", "reiniciada")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return s?.estado === "error" || s?.estado === "pendiente";
  }
  if (p.estado === "antecedentes") {
    const ev = await evaluarAntecedentesProceso(procesoId).catch(() => null);
    return ev?.resultado === "pendiente" && ev.fuentes.some((f) => f.estado === "error" || f.estado === "pendiente");
  }
  return false;
}

/**
 * Lo que hay en la conversación de WhatsApp del proceso para el apellido del
 * RUNT: la foto de la cédula leída (con el número de la cédula) y el primer
 * apellido que escribió la persona.
 */
export async function datosNombreDeProceso(
  procesoId: string
): Promise<{ foto: { nombres: string | null; apellidos: string | null } | null; apellidoEscrito: string | null }> {
  const cedula = await cedulaDeProceso(procesoId);
  const foto = cedula ? await cedulaLeidaDeProceso(procesoId, cedula).catch(() => null) : null;
  const { data: conv } = await createAdminClient()
    .from("wa_conversaciones")
    .select("prefiltro")
    .eq("proceso_id", procesoId)
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const apellidoEscrito = (conv?.prefiltro as { primer_apellido?: string | null } | null)?.primer_apellido ?? null;
  return { foto, apellidoEscrito };
}

/**
 * ADRES (afiliación a salud) del proceso: da el nombre sin la fecha de
 * expedición. Hoy no se usa en el flujo (el apellido lo da la persona o la
 * foto de la cédula); queda por si hace falta otra fuente del nombre.
 */
export async function consultarAdresProceso(
  procesoId: string,
  actor: ActorProceso,
  opciones: { esperarMs?: number } = {}
): Promise<{ nombre: string | null; estado: "ok" | "pendiente" | "error" | "manual" }> {
  const proveedor = proveedorAdres();
  if (!proveedor) return { nombre: null, estado: "manual" };
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  const cedula = String(p?.cedula ?? "").replace(/\D/g, "");
  if (!cedula || p?.autorizacion_datos !== "si") return { nombre: null, estado: "error" };
  const { data: previa } = await admin
    .from("verificaciones_externas")
    .select("estado, resultado")
    .eq("proceso_id", procesoId)
    .eq("fuente", "adres")
    .eq("cedula", cedula)
    .in("estado", ["ok", "pendiente"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previa?.estado === "ok") return { nombre: interpretarAdresCroma(previa.resultado as never).nombre, estado: "ok" };
  if (previa?.estado === "pendiente") return { nombre: null, estado: "pendiente" };

  const hasta = Date.now() + (opciones.esperarMs ?? 0);
  let r = await proveedor.consultarAdres(cedula, { esperaSegundos: 25 });
  while (r.estado === "pendiente" && r.trabajoId && Date.now() + 3_000 <= hasta) {
    await new Promise((ok) => setTimeout(ok, 3_000));
    r = await proveedor.consultarTrabajoAdres(r.trabajoId);
  }
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: proveedor.nombre,
    fuente: "adres",
    estado: r.estado,
    valor: null,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    error: r.error ?? null,
    consultado_por: actor.userEmail,
  });
  return { nombre: r.nombre, estado: r.estado };
}

/** De dónde sale el nombre con que se consulta el RUNT. */
export interface NombreParaRunt {
  /** Nombre con que se compara el del RUNT (con el apellido escrito, solo el apellido). */
  nombre: string | null;
  /** Primer apellido ya conocido (foto o escrito); si no, se calcula del nombre. */
  apellido: string | null;
  origen: "rnmc" | "foto" | "chat" | null;
}

/**
 * Nombre para consultar el RUNT (pedido de GH del 18-nov-2026): el asistente
 * pide la cédula con el primer apellido, o la foto de la cédula, y con eso se
 * consulta el RUNT de una vez. En este orden: el del RNMC si ya se consultó
 * (en antecedentes; validado con la fecha de expedición), el primer apellido
 * que escribió o confirmó la persona (si corrigió el de la foto, vale el suyo)
 * y el de la foto de la cédula (si el número leído es el de la cédula). La foto y el apellido los pasa quien los tenga
 * (WhatsApp o el chat de prueba).
 */
export async function nombreParaRunt(
  procesoId: string,
  foto?: { nombres: string | null; apellidos: string | null } | null,
  apellidoEscrito?: string | null
): Promise<NombreParaRunt> {
  const rnmc = await nombreRegistroRnmc(procesoId);
  if (rnmc) return { nombre: rnmc, apellido: null, origen: "rnmc" };
  const apellidoFoto = primerApellidoDeApellidos(foto?.apellidos);
  const escrito = primerApellidoDeApellidos(apellidoEscrito);
  // Lo que la persona escribió o confirmó manda sobre la lectura de la foto (si
  // corrigió el apellido leído, vale el suyo); si coinciden, se compara con el nombre de la foto.
  if (escrito) {
    const fotoCoincide = foto && apellidoFoto === escrito;
    return { nombre: fotoCoincide ? [foto.nombres, foto.apellidos].filter(Boolean).join(" ") : escrito, apellido: escrito, origen: "chat" };
  }
  if (foto && apellidoFoto) return { nombre: [foto.nombres, foto.apellidos].filter(Boolean).join(" "), apellido: apellidoFoto, origen: "foto" };
  return { nombre: null, apellido: null, origen: null };
}

/**
 * RUNT (y luego SIMIT) de los procesos que ya tienen con qué consultarlo
 * (cédula con el apellido escrito o la foto) pero el RUNT no cupo en el turno
 * del webhook o Croma no respondió (cron). Solo procesos del
 * asistente de WhatsApp (los del chat de prueba no), en «Pendiente», con
 * autorización y movidos en las últimas 6 horas. Devuelve los que se consultaron, para que el
 * asistente avise el resultado.
 */
/**
 * Freno del RUNT (24-nov-2026), como el de los antecedentes: se vuelve a
 * consultar solo si el último error fue hace al menos 30 min y lleva menos de
 * 6 errores en 24 h. Después queda para revisar a mano (la licencia se la pide
 * el asistente y la valida una persona en «Lo revisé a mano»).
 */
export async function puedeReintentarRunt(procesoId: string): Promise<boolean> {
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data } = await createAdminClient()
    .from("verificaciones_externas")
    .select("created_at")
    .eq("proceso_id", procesoId)
    .eq("fuente", "runt")
    .eq("estado", "error")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(10);
  const fallas = data ?? [];
  if (fallas.length >= 6) return false;
  const ultima = fallas[0] ? Date.parse(fallas[0].created_at as string) : 0;
  return Date.now() - ultima >= 30 * 60_000;
}

export async function consultarRuntFaltantes(limite = 5): Promise<string[]> {
  if (!(await siCromaActivo(proveedorRunt()))) return [];
  const admin = createAdminClient();
  const desde = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const { data } = await admin
    .from("procesos_contratacion")
    .select("id")
    .eq("estado", "pendiente")
    .eq("autorizacion_datos", "si")
    // Solo los del asistente de WhatsApp: el cron no gasta consultas en los del chat de prueba.
    .eq("origen", "whatsapp_agente")
    .is("licencia_runt", null)
    .gte("updated_at", desde)
    .limit(50);
  const hechos: string[] = [];
  for (const p of data ?? []) {
    if (hechos.length >= limite) break;
    const id = p.id as string;
    const { data: enCurso } = await admin.from("verificaciones_externas").select("id").eq("proceso_id", id).eq("fuente", "runt").eq("estado", "pendiente").limit(1).maybeSingle();
    if (enCurso || !(await puedeReintentarRunt(id))) continue;
    // Si ya falló, verificacionEnCurso dice que no (el asistente pide la licencia), pero se reintenta igual.
    if (!(await runtSinRespuesta(id)) && !(await verificacionEnCurso(id))) continue;
    const d = await datosNombreDeProceso(id);
    const n = await nombreParaRunt(id, d.foto, d.apellidoEscrito);
    if (!n.nombre) continue;
    await consultarRuntProceso(id, ACTOR_SISTEMA, { nombreRegistro: n.nombre, apellido: n.apellido });
    const reeval = await reevaluarPreseleccion(id);
    if (reeval?.consultarSimit) await consultarSimitProceso(id, ACTOR_SISTEMA);
    hechos.push(id);
  }
  return hechos;
}

async function aplicarRnmc(
  procesoId: string,
  r: ResultadoRnmc,
  proveedor: string,
  actor: ActorProceso,
  opciones: { consultarRuntSiFalta?: boolean } = {}
): Promise<void> {
  if (r.estado !== "ok" || !r.resumen) return;
  const admin = createAdminClient();
  const nombre = r.resumen.fechaCoincide ? r.resumen.nombre : null;
  let nombreNuevo: string | null = null;
  let runt: ResumenRunt | null = null;
  let origen: string | null = null;
  if (nombre) {
    // El nombre del registro civil manda (en los procesos del asistente y del chat de prueba).
    const { data: p } = await admin.from("procesos_contratacion").select("origen, nombre, candidate_id, licencia_runt").eq("id", procesoId).maybeSingle();
    runt = (p?.licencia_runt as ResumenRunt | null) ?? null;
    origen = (p?.origen as string | null) ?? null;
    if ((p?.origen === "whatsapp_agente" || p?.origen === "chat_prueba") && p.nombre !== nombre) {
      nombreNuevo = nombre;
      await admin.from("procesos_contratacion").update({ nombre }).eq("id", procesoId);
      if (p.candidate_id) await admin.from("candidates").update({ full_name: nombre }).eq("id", p.candidate_id);
    }
  }
  await registrarEvento(
    procesoId,
    {
      tipo: "dato",
      detalle: {
        rnmc: {
          fecha_coincide: r.resumen.fechaCoincide,
          medidas_pendientes: r.resumen.medidasPendientes,
          cantidad: r.resumen.cantidad,
          estado: r.resumen.estadoTexto,
        },
        ...(nombreNuevo ? { nombre: { nuevo: nombreNuevo, origen: "rnmc" } } : {}),
        proveedor,
      },
    },
    actor
  );
  // El RUNT ya se había consultado sin el apellido: si el registro era de otra
  // persona o no apareció, se vuelve a consultar con el primer apellido.
  const revisar = runt && !runt.identidadVerificada && (runt.registrado === false || (runt.nombre && !nombresCoinciden(runt.nombre, nombre)));
  // El RNMC terminó por el cron (quedó en curso en el webhook): el RUNT esperaba
  // su nombre. Solo en los de WhatsApp: el cron no gasta consultas en el chat de prueba.
  const pendienteRunt = opciones.consultarRuntSiFalta && !runt && origen === "whatsapp_agente";
  if (nombre && (revisar || pendienteRunt)) await consultarRuntProceso(procesoId, actor, { nombreRegistro: nombre });
  // Lo demás también esperaba al RNMC: el SIMIT, si la preselección lo pide.
  if (nombre && pendienteRunt) {
    const reeval = await reevaluarPreseleccion(procesoId);
    if (reeval?.consultarSimit) await consultarSimitProceso(procesoId, actor);
  }
}

/**
 * El RNMC respondió sin el nombre y el RUNT no ha confirmado a la persona: no
 * se sabe si la cédula existe (se reintenta: errorTransitorio lo reconoce por «no respondió»).
 */
const ERROR_RNMC_SIN_NOMBRE = "El RNMC respondió sin el nombre de la persona y el RUNT no la ha confirmado (la fuente no respondió bien para confirmarla); se reintenta.";


/**
 * Respuesta del RNMC de los últimos días para esa cédula y fecha de
 * expedición, en cualquier proceso: buena (con su nombre y medidas) o con la
 * fecha rechazada. La fecha se lee de lo guardado con la consulta o, en las
 * anteriores a este cambio, de la fecha del proceso. Las «reiniciada» del chat
 * de prueba no cuentan (así «Reconsultar en Croma» sí vuelve a consultar).
 */
async function rnmcReciente(
  cedula: string,
  fecha: string,
  identidadConfirmada = false
): Promise<{ r: ResultadoRnmc; crudo: unknown; noCoincide: boolean; proveedor: string; del: string } | null> {
  const admin = createAdminClient();
  const dias = await diasCacheCroma();
  if (dias <= 0) return null;
  const desde = new Date(Date.now() - dias * 24 * 3_600_000).toISOString();
  const { data } = await admin
    .from("verificaciones_externas")
    .select("proceso_id, estado, error, resultado, proveedor, created_at")
    .eq("fuente", "rnmc")
    .eq("cedula", cedula)
    .not("proveedor", "in", "(simulado,manual)")
    .in("estado", ["ok", "error", "reiniciada"])
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(10);
  for (const f of data ?? []) {
    const error = String(f.error ?? "");
    // Una «reiniciada» (candidato de prueba reiniciado) vale como lo que era: buena si no guardó error.
    if (f.estado === "error" || (f.estado === "reiniciada" && error)) {
      // Solo el rechazo de esta misma fecha; los errores de Croma no se reutilizan.
      if (/no coincide/i.test(error) && error.includes(fecha)) {
        return { r: interpretarRnmcCroma(f.resultado as never), crudo: f.resultado, noCoincide: true, proveedor: f.proveedor as string, del: f.created_at as string };
      }
      continue;
    }
    const res = f.resultado as { fecha_expedicion_consultada?: string; found?: boolean } | null;
    const fechaFila = res?.fecha_expedicion_consultada ?? (f.proceso_id ? await fechaExpedicionDe(f.proceso_id as string) : null);
    if (fechaFila !== fecha || res?.found === false) continue;
    const r = interpretarRnmcCroma(res as never);
    // Sin nombre solo se reutiliza si el RUNT ya confirmó a la persona (el registro responde cualquier número).
    if (r.estado === "ok" && r.resumen?.fechaCoincide && (r.resumen.nombre || identidadConfirmada)) {
      return { r, crudo: f.resultado, noCoincide: false, proveedor: f.proveedor as string, del: f.created_at as string };
    }
  }
  return null;
}

/** Fecha de expedición guardada en el proceso; null si no hay o falta la migración 20261117214219. */
async function fechaExpedicionDe(procesoId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from("procesos_contratacion").select("cedula_fecha_expedicion").eq("id", procesoId).maybeSingle();
  if (error || !data) return null;
  return (data.cedula_fecha_expedicion as string | null)?.slice(0, 10) ?? null;
}

/**
 * Consulta el RNMC del proceso (Croma exige la fecha de expedición de la
 * cédula). Una sola vez por cédula y fecha: si el registro dijo que la fecha
 * no coincide, se vuelve a intentar solo cuando cambie la fecha.
 */
export async function consultarRnmcProceso(
  procesoId: string,
  actor: ActorProceso,
  fechaExpedicion?: string | null,
  opciones: {
    /** Tiempo total para esta consulta (llamadas, reintento y seguimiento del trabajo en curso). */
    esperarMs?: number;
    reintentos?: number;
    consultarRuntSiFalta?: boolean;
    /** Cuánto se le pide a Croma esperar en línea (por defecto 55 s, su máximo; la llamada se corta a los 90 s). */
    esperaSegundos?: number;
  } = {}
): Promise<ResultadoConsultaRnmc> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("id, cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p) return { modo: "error", mensaje: "El proceso no existe." };
  if (p.autorizacion_datos !== "si") return { modo: "error", mensaje: "El aspirante no ha autorizado el tratamiento de datos: no se puede consultar." };
  const cedula = String(p.cedula ?? "").replace(/\D/g, "");
  if (!cedula) return { modo: "error", mensaje: "El proceso no tiene cédula." };
  const fecha = fechaExpedicion ?? (await fechaExpedicionDe(procesoId));
  if (!fecha) return { modo: "omitida", mensaje: "Falta la fecha de expedición de la cédula." };
  const proveedor = await siCromaActivo(proveedorRnmc());
  if (!proveedor) return { modo: "manual", mensaje: "No hay proveedor configurado (falta CROMA_API_KEY)." };

  const { data: previa } = await admin
    .from("verificaciones_externas")
    .select("estado, error")
    .eq("proceso_id", procesoId)
    .eq("fuente", "rnmc")
    .eq("cedula", cedula)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previa?.estado === "ok" || previa?.estado === "pendiente") return { modo: "omitida", mensaje: "El RNMC ya se consultó para esta cédula." };
  // Fecha rechazada por el registro: con la misma fecha no se repite (va en el
  // error). Un error de Croma (caída, tiempo agotado) sí se reintenta.
  if (previa?.estado === "error" && /no coincide/i.test(String(previa.error ?? "")) && String(previa.error ?? "").includes(fecha)) {
    return { modo: "omitida", mensaje: "El RNMC ya se intentó con esa fecha de expedición." };
  }

  // Pedido de GH del 18-nov-2026: si la misma cédula con la misma fecha se
  // consultó hace poco (hasta 3 días, en cualquier proceso), se reutiliza: el
  // RNMC se demora y puede bloquear consultas repetidas.
  const reciente = await rnmcReciente(cedula, fecha, await identidadConfirmadaRunt(procesoId).catch(() => false));
  if (reciente) {
    await admin.from("verificaciones_externas").insert({
      proceso_id: procesoId,
      cedula,
      proveedor: reciente.proveedor,
      fuente: "rnmc",
      estado: reciente.noCoincide ? "error" : "ok",
      valor: reciente.r.resumen?.cantidad ?? null,
      resultado: reciente.noCoincide ? reciente.crudo : { ...(reciente.crudo as object), fecha_expedicion_consultada: fecha },
      error: reciente.noCoincide ? errorFechaNoCoincide(fecha) : null,
      consultado_por: `${actor.userEmail ?? "Sistema"} (reutilizada de la consulta del ${reciente.del.slice(0, 10)})`,
    });
    if (reciente.noCoincide) return { modo: "consultado", medidasPendientes: null, fechaCoincide: false };
    await aplicarRnmc(procesoId, reciente.r, reciente.proveedor, actor, { consultarRuntSiFalta: opciones.consultarRuntSiFalta });
    return { modo: "consultado", medidasPendientes: reciente.r.resumen?.medidasPendientes ?? null, fechaCoincide: true };
  }

  const hasta = Date.now() + (opciones.esperarMs ?? 0);
  // En el panel de Croma (18-nov-2026) el RNMC responde en línea: no respeta
  // `Prefer: wait` ni devuelve un trabajo; las buenas tardan de 7 a 25 s y,
  // cuando la fuente de la Policía se cae, Croma corta a los 180 s con 502.
  // El portal de la Policía tarda ~30 s por cédula (probado a mano el
  // 18-nov-2026) y Croma suma su parte: se espera hasta 90 s (si algún día
  // devuelve el trabajo, se sigue abajo) y se reintenta solo si queda tiempo;
  // si no, el cron lo vuelve a intentar. Ya no hace esperar al aspirante: el
  // RNMC solo se consulta en antecedentes.
  const espera = opciones.esperaSegundos ?? 55;
  const corte = 90_000;
  let r = await proveedor.consultarRnmc(cedula, fecha, { esperaSegundos: espera, timeoutMs: corte });
  for (let i = 0; i < (opciones.reintentos ?? 2) && r.estado === "error" && errorTransitorio(r.error) && Date.now() + 30_000 <= hasta; i++) {
    r = await proveedor.consultarRnmc(cedula, fecha, { esperaSegundos: espera, timeoutMs: Math.min(corte, hasta - Date.now()) });
  }
  while (r.estado === "pendiente" && r.trabajoId && Date.now() + 4_000 <= hasta) {
    await new Promise((ok) => setTimeout(ok, 4_000));
    const t = await proveedor.consultarTrabajoRnmc(r.trabajoId);
    // Un error al preguntar por el trabajo no lo pierde: sigue en curso en Croma.
    if (t.estado === "error" && errorTransitorio(t.error)) continue;
    r = t;
  }
  const noCoincide = r.estado === "ok" && r.resumen?.fechaCoincide === false;
  // «El registro responde cualquier número»: limpio sin nombre no confirma a la
  // persona, salvo que el RUNT ya la haya confirmado (el certificado de la
  // Policía ya no imprime el nombre, 18-nov-2026). Sin esa confirmación queda
  // como error que el cron reintenta.
  const sinNombre =
    r.estado === "ok" && r.resumen?.fechaCoincide === true && !r.resumen.nombre && !(await identidadConfirmadaRunt(procesoId).catch(() => false));
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: proveedor.nombre,
    fuente: "rnmc",
    // Fecha que no coincide: queda como error para poder reintentar con otra.
    estado: noCoincide || sinNombre ? "error" : r.estado,
    valor: r.resumen?.cantidad ?? null,
    // Con la fecha consultada, para reutilizar la respuesta (rnmcReciente).
    resultado:
      r.estado === "pendiente"
        ? { trabajo_id: r.trabajoId ?? null, fecha_expedicion_consultada: fecha }
        : r.crudo && typeof r.crudo === "object"
          ? { ...(r.crudo as object), fecha_expedicion_consultada: fecha }
          : (r.crudo ?? null),
    error: noCoincide
      ? errorFechaNoCoincide(fecha)
      : sinNombre
        ? ERROR_RNMC_SIN_NOMBRE
        : r.error
          ? `${r.error} (fecha de expedición ${fecha})`
          : null,
    consultado_por: actor.userEmail,
  });
  if (sinNombre) return { modo: "error", mensaje: ERROR_RNMC_SIN_NOMBRE };
  if (r.estado === "pendiente") return { modo: "pendiente", mensaje: "Croma está consultando el RNMC; el resultado llega en unos minutos." };
  if (r.estado === "error" || !r.resumen) return { modo: "error", mensaje: r.error ?? "La consulta del RNMC falló." };
  await aplicarRnmc(procesoId, r, proveedor.nombre, actor, { consultarRuntSiFalta: opciones.consultarRuntSiFalta });
  return { modo: "consultado", medidasPendientes: r.resumen.medidasPendientes, fechaCoincide: r.resumen.fechaCoincide };
}

/**
 * Termina las consultas del RNMC que quedaron como trabajo asíncrono y
 * reintenta las que fallaron por Croma (cron de seguimiento). `terminados`:
 * procesos cuyo RNMC ya respondió (bien o con la fecha rechazada), para que el
 * asistente le cuente el resultado al aspirante.
 */
export async function resolverRnmcPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number; terminados: string[] }> {
  const proveedor = await siCromaActivo(proveedorRnmc());
  if (!proveedor) return { revisadas: 0, terminadas: 0, terminados: [] };
  const terminados: string[] = [];
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, resultado, created_at")
    .eq("fuente", "rnmc")
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  let terminadas = 0;
  const pendientes = error ? [] : (filas ?? []);
  for (const f of pendientes) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajoRnmc(trabajoId);
    if (r.estado === "pendiente") continue;
    const noCoincide = r.estado === "ok" && r.resumen?.fechaCoincide === false;
    const sinNombre =
      r.estado === "ok" &&
      r.resumen?.fechaCoincide === true &&
      !r.resumen.nombre &&
      !(f.proceso_id && (await identidadConfirmadaRunt(f.proceso_id as string).catch(() => false)));
    // La fecha con que se consultó va con la consulta en curso (o, en las anteriores, es la del proceso).
    const fecha =
      (f.resultado as { fecha_expedicion_consultada?: string } | null)?.fecha_expedicion_consultada ??
      (f.proceso_id ? await fechaExpedicionDe(f.proceso_id as string) : null);
    await admin
      .from("verificaciones_externas")
      .update({
        estado: noCoincide || sinNombre ? "error" : r.estado,
        valor: r.resumen?.cantidad ?? null,
        resultado: r.crudo && typeof r.crudo === "object" && fecha ? { ...(r.crudo as object), fecha_expedicion_consultada: fecha } : (r.crudo ?? null),
        error: noCoincide ? errorFechaNoCoincide(fecha) : sinNombre ? ERROR_RNMC_SIN_NOMBRE : (r.error ?? null),
      })
      .eq("id", f.id);
    terminadas++;
    if (sinNombre) continue;
    if (f.proceso_id) {
      await aplicarRnmc(f.proceso_id as string, r, proveedor.nombre, ACTOR_SISTEMA, { consultarRuntSiFalta: true });
      if (r.estado === "ok") terminados.push(f.proceso_id as string);
    }
  }
  // Los RNMC que fallaron por Croma se reintentan con los demás antecedentes
  // (lanzarAntecedentesPendientes), con freno para no insistir contra la fuente caída.
  return { revisadas: pendientes.length, terminadas, terminados };
}

// ── Antecedentes: Policía, Procuraduría, Contraloría y RNMC ────────────────

/** Procuraduría o Contraloría para el proceso, una sola vez por cédula. */
async function consultarFuenteAntecedentes(procesoId: string, cedula: string, fuente: FuenteAntecedenteCroma, actor: ActorProceso): Promise<void> {
  const proveedor = await siCromaActivo(proveedorAntecedentes());
  if (!proveedor) return;
  const admin = createAdminClient();
  const { data: previa } = await admin
    .from("verificaciones_externas")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("fuente", fuente)
    .eq("cedula", cedula)
    .in("estado", ["ok", "pendiente"])
    .limit(1)
    .maybeSingle();
  if (previa) return;
  // Caché: solo una respuesta con veredicto (con o sin hallazgo).
  const cache = await consultaReciente(fuente, cedula);
  const usaCache = !!cache && hallazgoDe(fuente, cache.resultado) != null;
  const r = usaCache ? { estado: "ok" as const, crudo: cache!.resultado, error: null, trabajoId: null } : await conReintentos(() => proveedor.consultar(fuente, cedula));
  await admin.from("verificaciones_externas").insert({
    proceso_id: procesoId,
    cedula,
    proveedor: usaCache ? cache!.proveedor : proveedor.nombre,
    fuente,
    estado: r.estado,
    valor: null,
    resultado: r.estado === "pendiente" ? { trabajo_id: r.trabajoId ?? null } : (r.crudo ?? null),
    error: r.error ?? null,
    consultado_por: usaCache ? reutilizada(actor, cache!.del) : actor.userEmail,
  });
  if (r.estado === "ok") {
    await registrarEvento(procesoId, { tipo: "dato", detalle: { antecedente: { fuente, hallazgo: hallazgoDe(fuente, r.crudo) } } }, actor);
  }
}

/**
 * Consulta las cuatro fuentes de antecedentes (en paralelo; Policía y RNMC se
 * reutilizan si ya se consultaron en la preselección) y, si salen limpias,
 * deja el chat «Listo para citar». Exige la autorización de datos.
 */
export async function consultarAntecedentesProceso(
  procesoId: string,
  actor: ActorProceso,
  /** Cuánto se sigue el trabajo del RNMC en Croma antes de dejarlo al cron (en el turno del asistente, más). */
  opciones: { esperarRnmcMs?: number; seguirMs?: number } = {}
): Promise<EvaluacionAntecedentes | null> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("procesos_contratacion").select("cedula, autorizacion_datos").eq("id", procesoId).maybeSingle();
  if (!p || p.autorizacion_datos !== "si") return null;
  const cedula = String(p.cedula ?? "").replace(/\D/g, "");
  if (!cedula || !(await siCromaActivo(proveedorAntecedentes()))) return null;
  const nunca = (fuente: string) => (e: unknown) => console.error(`[seleccion] antecedentes ${fuente}:`, e);
  await Promise.all([
    consultarPoliciaProceso(procesoId, actor, { seguirMs: opciones.seguirMs }).catch(nunca("policía")),
    consultarFuenteAntecedentes(procesoId, cedula, "procuraduria", actor).catch(nunca("procuraduría")),
    consultarFuenteAntecedentes(procesoId, cedula, "contraloria", actor).catch(nunca("contraloría")),
    consultarRnmcProceso(procesoId, actor, null, { esperarMs: opciones.esperarRnmcMs ?? 20_000 }).catch(nunca("rnmc")),
  ]);
  const evaluacion = await evaluarAntecedentesProceso(procesoId);
  await marcarListoParaCitar(procesoId);
  await marcarRevisionAntecedentes(procesoId).catch((e) => console.error("[seleccion] revisión de antecedentes:", e));
  return evaluacion;
}

/** Termina las consultas de Procuraduría y Contraloría que quedaron en curso (cron) y revisa si ya queda listo para citar. */
export async function resolverAntecedentesPendientes(limite = 20): Promise<{ revisadas: number; terminadas: number }> {
  const proveedor = await siCromaActivo(proveedorAntecedentes());
  if (!proveedor) return { revisadas: 0, terminadas: 0 };
  const admin = createAdminClient();
  const { data: filas, error } = await admin
    .from("verificaciones_externas")
    .select("id, proceso_id, fuente, resultado, created_at")
    .in("fuente", ["procuraduria", "contraloria"])
    .eq("estado", "pendiente")
    .order("created_at")
    .limit(limite);
  if (error || !filas?.length) return { revisadas: 0, terminadas: 0 };
  let terminadas = 0;
  const procesos = new Set<string>();
  for (const f of filas) {
    const trabajoId = (f.resultado as { trabajo_id?: string } | null)?.trabajo_id;
    const vencida = Date.now() - new Date(f.created_at as string).getTime() > 24 * 3_600_000;
    if (!trabajoId || vencida) {
      await admin
        .from("verificaciones_externas")
        .update({ estado: "error", error: trabajoId ? "Croma no terminó la consulta en 24 horas." : "Consulta pendiente sin id de trabajo." })
        .eq("id", f.id);
      terminadas++;
      continue;
    }
    const r = await proveedor.consultarTrabajo(trabajoId);
    if (r.estado === "pendiente") continue;
    await admin.from("verificaciones_externas").update({ estado: r.estado, resultado: r.crudo ?? null, error: r.error ?? null }).eq("id", f.id);
    terminadas++;
    if (f.proceso_id) {
      procesos.add(f.proceso_id as string);
      if (r.estado === "ok") {
        const fuente = f.fuente as FuenteAntecedenteCroma;
        await registrarEvento(f.proceso_id as string, { tipo: "dato", detalle: { antecedente: { fuente, hallazgo: hallazgoDe(fuente, r.crudo) } } }, ACTOR_SISTEMA);
      }
    }
  }
  for (const id of procesos) {
    await marcarListoParaCitar(id);
    await marcarRevisionAntecedentes(id).catch((e) => console.error("[seleccion] revisión de antecedentes:", e));
  }
  return { revisadas: filas.length, terminadas };
}

/**
 * Lanza los antecedentes de los procesos que ya están en «Antecedentes» con la
 * autorización y todavía no los tienen completos (cron). Así no dependen de
 * que el aspirante vuelva a escribir ni de que quepan en el tiempo del webhook.
 */
// Cada proceso puede tardar hasta ~60 s (RNMC): pocos por pasada para caber en el cron.
/**
 * Freno para no insistir contra una fuente caída (RNMC y Procuraduría son
 * consultas en línea que el 18-nov-2026 se colgaron por horas; repetir puede
 * hacer que bloqueen): un proceso se vuelve a consultar solo si su último error
 * fue hace al menos 30 min y lleva menos de 8 errores en 24 h. Si llega a 8, ya
 * no se insiste y queda para Gestión Humana (sigue en «Antecedentes»).
 */
async function puedeReintentarAntecedentes(procesoId: string): Promise<boolean> {
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data } = await createAdminClient()
    .from("verificaciones_externas")
    .select("error, created_at")
    .eq("proceso_id", procesoId)
    .in("fuente", ["policia", "procuraduria", "contraloria", "rnmc"])
    .eq("estado", "error")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(20);
  const fallas = (data ?? []).filter((f) => errorTransitorio(String(f.error ?? "")));
  if (fallas.length >= 8) return false;
  const ultima = fallas[0] ? Date.parse(fallas[0].created_at as string) : 0;
  return Date.now() - ultima >= 30 * 60_000;
}

// Cada proceso puede tardar hasta ~110 s (Procuraduría): pocos por pasada para caber en los 300 s del cron.
export async function lanzarAntecedentesPendientes(limite = 2): Promise<{ revisados: number; fechaRechazada: string[] }> {
  if (!(await siCromaActivo(proveedorAntecedentes()))) return { revisados: 0, fechaRechazada: [] };
  const fechaRechazada: string[] = [];
  const admin = createAdminClient();
  const desde = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  const { data: procesos } = await admin
    .from("procesos_contratacion")
    .select("id")
    .eq("estado", "antecedentes")
    .eq("autorizacion_datos", "si")
    // Solo los del asistente de WhatsApp: los que lleva Gestión Humana a mano no
    // se consultan solos, y los del chat de prueba tampoco (pedido de GH del
    // 18-nov-2026: no gastar consultas a Croma en pruebas; se consultan al
    // escribir en el chat de prueba).
    .eq("origen", "whatsapp_agente")
    .gte("updated_at", desde)
    .order("updated_at", { ascending: false })
    .limit(50);
  let revisados = 0;
  for (const p of procesos ?? []) {
    if (revisados >= limite) break;
    const ev = await evaluarAntecedentesProceso(p.id as string);
    if (ev && ev.fuentes.every((f) => f.estado !== "sin_consultar" && f.estado !== "error")) {
      // Ya consultados: puede que ahora sí quede listo (por ejemplo, llegó la hoja de vida).
      await marcarListoParaCitar(p.id as string).catch(() => false);
      await marcarRevisionAntecedentes(p.id as string).catch(() => null);
      continue;
    }
    // Con el RNMC opcional, las otras tres limpias ya bastan (con la observación de que falta el RNMC).
    await marcarListoParaCitar(p.id as string).catch(() => false);
    if (!(await puedeReintentarAntecedentes(p.id as string))) continue;
    const antes = await fechaExpedicionRechazada(p.id as string).catch(() => null);
    await consultarAntecedentesProceso(p.id as string, ACTOR_SISTEMA).catch((e) => console.error("[seleccion] antecedentes:", e));
    // El RNMC acaba de rechazar la fecha de expedición: el asistente se la pide de nuevo.
    const despues = await fechaExpedicionRechazada(p.id as string).catch(() => null);
    if (despues && despues.intentos !== antes?.intentos) fechaRechazada.push(p.id as string);
    revisados++;
  }
  // 27-nov-2026 (reunión de soporte): quien siguió sin una fuente (aval de una persona o fuente
  // opcional) ya pasó de «Antecedentes»; se sigue consultando lo que falta, con el mismo freno.
  // Si llega una anotación nueva, evaluarAntecedentesProceso anula el aval y avisa.
  if (revisados < limite) {
    const { data: siguieron } = await admin
      .from("procesos_contratacion")
      .select("id")
      .in("estado", ESTADOS_DESPUES_DE_ANTECEDENTES)
      .eq("autorizacion_datos", "si")
      .eq("origen", "whatsapp_agente")
      .gte("updated_at", desde)
      .order("updated_at", { ascending: false })
      .limit(50);
    for (const p of siguieron ?? []) {
      if (revisados >= limite) break;
      const ev = await evaluarAntecedentesProceso(p.id as string);
      if (!ev || ev.fuentes.every((f) => f.estado !== "sin_consultar" && f.estado !== "error")) continue;
      if (!(await puedeReintentarAntecedentes(p.id as string))) continue;
      await consultarAntecedentesProceso(p.id as string, ACTOR_SISTEMA).catch((e) => console.error("[seleccion] antecedentes (después del aval):", e));
      await evaluarAntecedentesProceso(p.id as string).catch(() => null);
      revisados++;
    }
  }
  return { revisados, fechaRechazada };
}
