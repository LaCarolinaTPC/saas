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
  correo: "Correo (órdenes a laboratorios)",
};

const CONSEJO: Record<IdServicio, string> = {
  croma: "Si Croma está caído, páuselo en Selección › Tiempos y reglas › Verificaciones con Croma: el proceso sigue y lo que falta se revisa a mano.",
  ia: "Los chats donde falló quedan en la Bandeja como «Requieren humano». Revise la clave o el saldo del proveedor en Selección › IA.",
  whatsapp: "Revise el canal en Selección › Canal de WhatsApp («Probar conexión») y los mensajes con ⚠ en la Bandeja.",
  correo: "Revise el SMTP del servidor; las órdenes que no salieron se envían a mano desde Selección › Laboratorios.",
};

// ── Croma por fuente ────────────────────────────────────────────────────────

export const FUENTES_CROMA: Record<string, { nombre: string; consejo: string }> = {
  rnmc: {
    nombre: "RNMC (medidas correctivas)",
    consejo:
      "Para que el proceso siga, revíselo a mano: en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano» (abre el portal de la Policía; adjunte el certificado). Gestivo sigue reintentando solo.",
  },
  policia: {
    nombre: "Policía (antecedentes judiciales)",
    consejo: "Revíselo a mano en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano» (portal de antecedentes de la Policía). Gestivo sigue reintentando solo.",
  },
  procuraduria: {
    nombre: "Procuraduría",
    consejo: "Revíselo a mano en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano» (portal de la Procuraduría). Gestivo sigue reintentando solo.",
  },
  contraloria: {
    nombre: "Contraloría",
    consejo: "Revíselo a mano en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano» (portal de la Contraloría). Gestivo sigue reintentando solo.",
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
          : `${nombres.join(" y ")}: revíselos a mano en la ficha del candidato, pestaña Antecedentes › «Lo revisé a mano». Gestivo sigue reintentando solo.`,
    },
  };
}

let cache: { hasta: number; datos: Promise<EstadoServicio[]> } | null = null;

/** Los cuatro servicios. Un minuto en memoria (lo piden varias pantallas). */
export async function leerEstadoServicios(): Promise<EstadoServicio[]> {
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
  const db = createAdminClient();
  const [croma, ia, wa, correo, pausado] = await Promise.all([
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
  ]);
  const filas = (r: { data: unknown }) => (r.data ?? []) as Record<string, unknown>[];
  const eventos: Record<Exclude<IdServicio, "croma">, EventoServicio[]> = {
    // «WhatsApp rechazó el envío» queda como error del asistente, pero es de WhatsApp.
    ia: filas(ia)
      .filter((f) => !/WhatsApp rechaz/i.test(String(f.error ?? "")))
      .map((f) => ({ ok: f.resultado !== "error", at: f.created_at as string, error: f.error as string | null })),
    whatsapp: filas(wa).map((f) => ({ ok: f.estado !== "failed", at: f.created_at as string, error: f.error_mensaje as string | null })),
    correo: filas(correo).map((f) => ({ ok: f.resultado !== "fallido", at: f.created_at as string, error: f.error as string | null })),
  };
  const porFuente = evaluarCroma(
    filas(croma).map((f) => ({ fuente: String(f.fuente ?? "otra"), ok: f.estado !== "error", at: f.created_at as string, error: f.error as string | null }))
  );
  return (Object.keys(NOMBRES) as IdServicio[]).map((id): EstadoServicio => {
    if (id === "croma") {
      const nivel: NivelServicio = !process.env.CROMA_API_KEY?.trim() ? "sin_configurar" : pausado ? "pausado" : porFuente.resumen.nivel;
      const fallando = nivel === "fallando";
      return { id, ...porFuente.resumen, nivel, nombre: fallando ? porFuente.resumen.nombre : NOMBRES.croma, consejo: fallando ? porFuente.resumen.consejo : null, partes: porFuente.partes };
    }
    const ev = evaluarEventos(eventos[id]);
    let nivel = ev.nivel;
    if (id === "correo" && !correoConfigurado()) nivel = "sin_configurar";
    return { id, nombre: NOMBRES[id], ...ev, nivel, consejo: nivel === "fallando" ? CONSEJO[id] : null };
  });
}

/** Para las pruebas. */
export function olvidarEstadoServicios(): void {
  cache = null;
}
