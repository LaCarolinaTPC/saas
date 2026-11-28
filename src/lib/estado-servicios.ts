/**
 * Estado de los servicios externos (24-nov-2026): Croma, la IA, WhatsApp y el
 * correo, según sus últimos resultados guardados. No consulta a los
 * servicios: mira lo que ya pasó (consultas a Croma, ejecuciones del
 * asistente, mensajes enviados y correos a los laboratorios). Lo muestran
 * Selección › Tiempos y reglas y un aviso en Candidatos y Comunicaciones
 * cuando uno está fallando. Solo servidor (evaluarEventos es puro).
 */

import { PORTALES_FUENTE } from "@/lib/verificacion/portales";

export type IdServicio = "croma" | "ia" | "whatsapp" | "correo";
export type NivelServicio = "ok" | "fallando" | "sin_datos" | "pausado" | "sin_configurar";

/** Un resultado, del más nuevo al más viejo. */
export interface EventoServicio {
  ok: boolean;
  at: string;
  error?: string | null;
}

export interface EstadoServicio {
  id: IdServicio;
  nombre: string;
  nivel: NivelServicio;
  /** Errores seguidos desde el último que salió bien. */
  seguidos: number;
  errores24h: number;
  total24h: number;
  ultimoError: { texto: string; at: string } | null;
  ultimoOkAt: string | null;
  /** Qué hacer, en una línea. */
  consejo: string | null;
  /**
   * Croma por fuente (26-nov-2026): una fuente puede caerse mientras las demás
   * responden (el RNMC, por ejemplo), y juntas nunca sumaban errores seguidos.
   */
  partes?: ParteServicio[];
  /**
   * Croma: lo que dice su página de estado pública (27-nov-2026). Croma no tiene
   * una API de estado por fuente; la página solo dice si su API funciona.
   * Leerla no gasta créditos. Correo: la de Brevo (componentes SMTP y envíos).
   */
  paginaEstado?: PaginaEstado | null;
  /** Correo: el inicio de sesión en el SMTP, sin enviar nada (27-nov-2026). */
  smtp?: { ok: boolean; error: string | null; at: string } | null;
}

export interface PaginaEstado {
  estado: "operativo" | "problemas" | "desconocido";
  /** La frase de la página («All Systems Operational»…). */
  texto: string | null;
  url: string;
  revisadoAt: string;
}

export const URL_ESTADO_CROMA = "https://status.usecroma.com";

/** Lo que dice la página de estado de Croma (HTML; no tiene JSON). Puro. */
export function interpretarPaginaEstado(html: string): Pick<PaginaEstado, "estado" | "texto"> {
  const texto = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (/all systems operational/i.test(texto)) return { estado: "operativo", texto: "All Systems Operational" };
  const problema = texto.match(/(major outage|partial outage|degraded performance|service disruption|outage|degraded|under maintenance|investigating|identified)/i);
  if (problema) return { estado: "problemas", texto: problema[1] };
  return { estado: "desconocido", texto: null };
}

let cachePagina: { hasta: number; datos: Promise<PaginaEstado | null> } | null = null;

/** La página de estado de Croma, cinco minutos en memoria. null si no se pudo leer. Nunca lanza. */
export async function leerPaginaEstadoCroma(): Promise<PaginaEstado | null> {
  if (cachePagina && cachePagina.hasta > Date.now()) return cachePagina.datos;
  const datos = (async () => {
    try {
      const res = await fetch(URL_ESTADO_CROMA, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      return { ...interpretarPaginaEstado(await res.text()), url: URL_ESTADO_CROMA, revisadoAt: new Date().toISOString() };
    } catch {
      return null;
    }
  })();
  cachePagina = { hasta: Date.now() + 5 * 60_000, datos };
  return datos;
}

/** Una fuente de Croma (RNMC, Policía, SIMIT…), evaluada por separado. */
export interface ParteServicio {
  id: string;
  nombre: string;
  nivel: NivelServicio;
  seguidos: number;
  errores24h: number;
  total24h: number;
  ultimoError: { texto: string; at: string } | null;
  ultimoOkAt: string | null;
  /** La solución mientras no responde. */
  consejo: string | null;
  /** Consulta ciudadana para revisarla a mano, si la fuente tiene. */
  portal: string | null;
}

const HORA = 3_600_000;

/**
 * Fallando: 3 o más errores seguidos y el último hace menos de 3 horas, o en
 * la última hora 5 o más errores que son la mitad o más de los intentos.
 */
export function evaluarEventos(eventos: EventoServicio[], ahora: Date = new Date()): Pick<EstadoServicio, "nivel" | "seguidos" | "errores24h" | "total24h" | "ultimoError" | "ultimoOkAt"> {
  const t = ahora.getTime();
  const orden = [...eventos].sort((a, b) => b.at.localeCompare(a.at));
  let seguidos = 0;
  for (const e of orden) {
    if (e.ok) break;
    seguidos++;
  }
  const dia = orden.filter((e) => t - new Date(e.at).getTime() <= 24 * HORA);
  const hora = orden.filter((e) => t - new Date(e.at).getTime() <= HORA);
  const erroresHora = hora.filter((e) => !e.ok).length;
  const error = orden.find((e) => !e.ok) ?? null;
  const ok = orden.find((e) => e.ok) ?? null;
  const reciente = error ? t - new Date(error.at).getTime() <= 3 * HORA : false;
  const fallando = (seguidos >= 3 && reciente) || (erroresHora >= 5 && erroresHora * 2 >= hora.length);
  return {
    nivel: !orden.length ? "sin_datos" : fallando ? "fallando" : "ok",
    seguidos,
    errores24h: dia.filter((e) => !e.ok).length,
    total24h: dia.length,
    ultimoError: error ? { texto: (error.error ?? "").trim().slice(0, 300) || "Sin detalle", at: error.at } : null,
    ultimoOkAt: ok?.at ?? null,
  };
}

const NOMBRES: Record<IdServicio, string> = {
  croma: "Croma (RUNT, SIMIT y antecedentes)",
  ia: "Asistente de IA",
  whatsapp: "WhatsApp (envíos)",
  correo: "Correo (órdenes, alertas y reportes)",
};

const CONSEJO: Record<IdServicio, string> = {
  croma: "Si Croma está caído, páuselo en Selección › Tiempos y reglas › Verificaciones con Croma: el proceso sigue y lo que falta se revisa a mano.",
  ia: "Los chats donde falló quedan en la Bandeja como «Requieren humano». Revise la clave o el saldo del proveedor en Selección › IA.",
  whatsapp: "Revise el canal en Selección › Canal de WhatsApp («Probar conexión») y los mensajes con ⚠ en la Bandeja.",
  correo: "Revise el SMTP del servidor; las órdenes que no salieron se envían a mano desde Selección › Laboratorios.",
};

const CONSEJO_CREDENCIALES =
  "El servidor de correo rechaza el usuario o la clave SMTP: revise que la clave siga activa en Brevo › SMTP & API › SMTP y que sea la misma de SMTP_PASS (en el servidor local y en Vercel). Mientras tanto no salen órdenes, alertas a GH ni reportes.";

// ── Croma por fuente ────────────────────────────────────────────────────────

export const FUENTES_CROMA: Record<string, { nombre: string; consejo: string }> = {
  rnmc: {
    nombre: "RNMC (medidas correctivas)",
    consejo:
      "Para que el proceso siga, revíselo a mano: en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano» (abre el portal de la Policía; adjunte el certificado). Gestivo lo reintenta solo hasta que alguien lo revise a mano.",
  },
  policia: {
    nombre: "Policía (antecedentes judiciales)",
    consejo: "Revíselo a mano en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano» (portal de antecedentes de la Policía). Gestivo lo reintenta solo hasta que alguien lo revise a mano.",
  },
  procuraduria: {
    nombre: "Procuraduría",
    consejo: "Revíselo a mano en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano» (portal de la Procuraduría). Gestivo lo reintenta solo hasta que alguien lo revise a mano.",
  },
  contraloria: {
    nombre: "Contraloría",
    consejo: "Revíselo a mano en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano» (portal de la Contraloría). Gestivo lo reintenta solo hasta que alguien lo revise a mano.",
  },
  simit: {
    nombre: "SIMIT (multas)",
    consejo: "Registre el SIMIT a mano en la ficha del candidato («Lo revisé a mano», portal del SIMIT) para que no se quede esperando.",
  },
  runt: {
    nombre: "RUNT (licencia)",
    consejo:
      "Verifique la licencia a mano en la ficha («Lo revisé a mano»: categoría y vigencia, en el portal del RUNT o con la foto de la licencia). Si el RUNT está como obligatorio, puede dejarlo opcional en Tiempos y reglas mientras vuelve.",
  },
  adres: {
    nombre: "ADRES (nombre)",
    consejo: "Solo afecta el nombre: el asistente lo toma del RNMC o del RUNT. Si el nombre queda «por confirmar», corríjalo en la ficha.",
  },
};

/**
 * Errores que no son caídas: la fuente respondió, pero el dato no sirve (la
 * fecha de expedición no coincide, el RNMC sin nombre). No cuentan para decir
 * que la fuente está fallando.
 */
export function esErrorDeDato(error: string | null | undefined): boolean {
  return /no coincide con la c[eé]dula|respondi[oó] sin el nombre/i.test(String(error ?? ""));
}

/**
 * Croma por fuente: cada una con sus últimos resultados. Croma está fallando
 * si alguna fuente lo está; con tres o más a la vez, el problema es de Croma
 * (la clave, el saldo o el servicio) y el consejo es pausarlo.
 */
export function evaluarCroma(
  filas: { fuente: string; ok: boolean; at: string; error?: string | null }[],
  ahora: Date = new Date()
): { partes: ParteServicio[]; resumen: Pick<EstadoServicio, "nivel" | "seguidos" | "errores24h" | "total24h" | "ultimoError" | "ultimoOkAt" | "nombre" | "consejo"> } {
  const evento = (f: { ok: boolean; at: string; error?: string | null }): EventoServicio => ({ ok: f.ok || esErrorDeDato(f.error), at: f.at, error: f.error ?? null });
  const porFuente = new Map<string, EventoServicio[]>();
  for (const f of [...filas].sort((a, b) => b.at.localeCompare(a.at))) {
    const lista = porFuente.get(f.fuente) ?? [];
    // 30 por fuente, como antes para todo Croma.
    if (lista.length < 30) lista.push(evento(f));
    porFuente.set(f.fuente, lista);
  }
  const partes: ParteServicio[] = [...porFuente.entries()]
    .map(([id, ev]) => {
      const r = evaluarEventos(ev, ahora);
      const info = FUENTES_CROMA[id];
      return { id, nombre: info?.nombre ?? id, ...r, consejo: r.nivel === "fallando" ? (info?.consejo ?? null) : null, portal: PORTALES_FUENTE[id] ?? null };
    })
    .sort((a, b) => Number(b.nivel === "fallando") - Number(a.nivel === "fallando") || a.nombre.localeCompare(b.nombre, "es"));

  const todo = evaluarEventos(filas.map(evento), ahora);
  const caidas = partes.filter((p) => p.nivel === "fallando");
  if (!caidas.length) return { partes, resumen: { ...todo, nombre: NOMBRES.croma, consejo: todo.nivel === "fallando" ? CONSEJO.croma : null } };
  const peor = caidas[0];
  const general = caidas.length >= 3 || todo.nivel === "fallando";
  const nombres = caidas.map((p) => p.nombre);
  return {
    partes,
    resumen: {
      nivel: "fallando",
      seguidos: peor.seguidos,
      errores24h: todo.errores24h,
      total24h: todo.total24h,
      ultimoError: peor.ultimoError,
      ultimoOkAt: peor.ultimoOkAt,
      nombre: general ? NOMBRES.croma : `Croma: ${nombres.join(", ")}`,
      consejo: general
        ? CONSEJO.croma
        : caidas.length === 1
          ? peor.consejo
          : `${nombres.join(" y ")}: revíselos a mano en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano». Gestivo lo reintenta solo hasta que alguien lo revise a mano.`,
    },
  };
}

/**
 * El correo con sus tres señales (27-nov-2026), puro: si el SMTP no deja iniciar
 * sesión, está fallando aunque los últimos envíos salieran bien (nadie se enteraba
 * hasta que una alerta no llegaba); si la página de Brevo reporta problemas, también.
 * Si no, mandan los envíos.
 */
export function evaluarCorreo(
  ev: Pick<EstadoServicio, "nivel" | "seguidos" | "errores24h" | "total24h" | "ultimoError" | "ultimoOkAt">,
  smtp: { ok: boolean; credenciales: boolean; error: string | null; at: string } | null,
  brevo: PaginaEstado | null
): Pick<EstadoServicio, "nivel" | "seguidos" | "errores24h" | "total24h" | "ultimoError" | "ultimoOkAt" | "consejo"> {
  if (smtp && !smtp.ok) {
    return {
      ...ev,
      nivel: "fallando",
      ultimoError: { texto: `Al iniciar sesión en el SMTP: ${smtp.error ?? "sin detalle"}`, at: smtp.at },
      consejo: smtp.credenciales
        ? CONSEJO_CREDENCIALES
        : "No se pudo conectar con el servidor de correo (puede ser pasajero): si sigue, revise SMTP_HOST y SMTP_PORT y la página de estado del proveedor.",
    };
  }
  if (brevo?.estado === "problemas") {
    return { ...ev, nivel: "fallando", consejo: `La página de estado de Brevo reporta problemas (${brevo.texto}). Los correos que no salgan se pueden reenviar cuando se normalice.` };
  }
  if (ev.nivel === "fallando") {
    const credenciales = /535|authentication failed|invalid login/i.test(ev.ultimoError?.texto ?? "");
    return { ...ev, consejo: credenciales ? CONSEJO_CREDENCIALES : CONSEJO.correo };
  }
  return { ...ev, consejo: null };
}

let cache: { hasta: number; datos: Promise<EstadoServicio[]> } | null = null;

/**
 * Los cuatro servicios. Un minuto en memoria (lo piden varias pantallas).
 * `forzar` («Actualizar el estado»): vuelve a revisar el SMTP y las páginas de estado.
 */
export async function leerEstadoServicios(opciones: { forzar?: boolean } = {}): Promise<EstadoServicio[]> {
  if (opciones.forzar) {
    cache = null;
    cachePagina = null;
    (await import("@/lib/correo/salud")).olvidarSaludCorreo();
  }
  if (cache && cache.hasta > Date.now()) return cache.datos;
  const datos = calcular().catch((e) => {
    console.error("[estado-servicios]", e);
    return [] as EstadoServicio[];
  });
  cache = { hasta: Date.now() + 60_000, datos };
  return datos;
}

async function calcular(): Promise<EstadoServicio[]> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { cromaPausado } = await import("@/lib/verificacion/pausa");
  const { correoConfigurado } = await import("@/lib/correo/enviar");
  const { revisarSmtp, leerEstadoBrevo } = await import("@/lib/correo/salud");
  const db = createAdminClient();
  const [croma, ia, wa, correo, pausado, pagina, bitacora, smtp, brevo] = await Promise.all([
    // Por fuente (26-nov-2026): las suficientes para tener las últimas de cada una.
    db.from("verificaciones_externas").select("fuente, estado, error, created_at").eq("proveedor", "croma").in("estado", ["ok", "hallazgo", "error"]).order("created_at", { ascending: false }).limit(300),
    db.from("wa_agente_ejecuciones").select("resultado, error, created_at").in("resultado", ["respondido", "transferido", "error"]).order("created_at", { ascending: false }).limit(30),
    db
      .from("wa_mensajes")
      .select("estado, error_mensaje, created_at")
      .eq("direccion", "saliente")
      .not("estado", "is", null)
      .not("wamid", "like", "simulado-%")
      .order("created_at", { ascending: false })
      .limit(30),
    db.from("seleccion_envios_laboratorio").select("resultado, error, created_at").eq("canal", "correo").in("resultado", ["enviado", "fallido"]).order("created_at", { ascending: false }).limit(20),
    cromaPausado(),
    process.env.CROMA_API_KEY?.trim() ? leerPaginaEstadoCroma() : Promise.resolve(null),
    // Todos los correos (27-nov-2026); sin la migración 20261127215621, solo las órdenes de arriba.
    db.from("correo_envios").select("resultado, error, created_at").order("created_at", { ascending: false }).limit(30),
    correoConfigurado() ? revisarSmtp() : Promise.resolve(null),
    correoConfigurado() ? leerEstadoBrevo() : Promise.resolve(null),
  ]);
  const filas = (r: { data: unknown }) => (r.data ?? []) as Record<string, unknown>[];
  const eventos: Record<Exclude<IdServicio, "croma">, EventoServicio[]> = {
    // «WhatsApp rechazó el envío» queda como error del asistente, pero es de WhatsApp.
    ia: filas(ia)
      .filter((f) => !/WhatsApp rechaz/i.test(String(f.error ?? "")))
      .map((f) => ({ ok: f.resultado !== "error", at: f.created_at as string, error: f.error as string | null })),
    whatsapp: filas(wa).map((f) => ({ ok: f.estado !== "failed", at: f.created_at as string, error: f.error_mensaje as string | null })),
    correo: (bitacora.error || !filas(bitacora).length ? filas(correo) : filas(bitacora)).map((f) => ({ ok: f.resultado !== "fallido", at: f.created_at as string, error: f.error as string | null })),
  };
  const porFuente = evaluarCroma(
    filas(croma).map((f) => ({ fuente: String(f.fuente ?? "otra"), ok: f.estado !== "error", at: f.created_at as string, error: f.error as string | null }))
  );
  return (Object.keys(NOMBRES) as IdServicio[]).map((id): EstadoServicio => {
    if (id === "croma") {
      let nivel: NivelServicio = !process.env.CROMA_API_KEY?.trim() ? "sin_configurar" : pausado ? "pausado" : porFuente.resumen.nivel;
      // Su página de estado reporta problemas: aunque nuestras últimas respuestas fueran buenas, se avisa.
      const problemasPagina = pagina?.estado === "problemas" && (nivel === "ok" || nivel === "sin_datos");
      if (problemasPagina) nivel = "fallando";
      const fallando = nivel === "fallando";
      const consejo = problemasPagina
        ? `La página de estado de Croma reporta «${pagina?.texto}». Si una fuente no responde, revísela a mano en la ficha («Lo revisé a mano»); Gestivo sigue reintentando.`
        : fallando
          ? porFuente.resumen.consejo
          : null;
      return { id, ...porFuente.resumen, nivel, nombre: fallando && !problemasPagina ? porFuente.resumen.nombre : NOMBRES.croma, consejo, partes: porFuente.partes, paginaEstado: pagina };
    }
    const ev = evaluarEventos(eventos[id]);
    const nivel = ev.nivel;
    if (id === "correo") {
      if (!correoConfigurado()) return { id, nombre: NOMBRES[id], ...ev, nivel: "sin_configurar", consejo: null };
      return { id, nombre: NOMBRES[id], ...evaluarCorreo(ev, smtp, brevo), paginaEstado: brevo, smtp: smtp ? { ok: smtp.ok, error: smtp.error, at: smtp.at } : null };
    }
    return { id, nombre: NOMBRES[id], ...ev, nivel, consejo: nivel === "fallando" ? CONSEJO[id] : null };
  });
}

/** Para las pruebas. */
export function olvidarEstadoServicios(): void {
  cache = null;
}
