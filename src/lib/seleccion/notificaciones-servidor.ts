/**
 * Avisos de revisiones manuales (27-nov-2026). Solo servidor. Nunca lanza.
 *
 * `notificar` deja la novedad en la bitácora (seleccion_notificaciones: la ven
 * las «Novedades del día» de Candidatos aunque el correo esté apagado) y avisa
 * por correo a quien diga Selección › Notificaciones. El mismo aviso (tipo y
 * clave) no se repite; uno que falló se reintenta pasada media hora. Sin la
 * migración 20261127235511 avisa igual, pero sin bitácora ni freno.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/correo/enviar";
import { leerAjustes, valorAjuste } from "./servidor";
import { NOTIFICACIONES, armarCorreoNotificacion, destinatariosDeAjustes, type TipoNotificacion } from "./notificaciones";

export type ResultadoNotificacion = "enviado" | "fallido" | "apagado" | "sin_destinatarios" | "ya_avisado";

export const urlApp = () =>
  process.env.GESTIVO_ENTORNO === "desarrollo"
    ? "http://localhost:3000"
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://saas-six-vert.vercel.app";

/** Enlace a la ficha del candidato (por cédula, como el resto de avisos). */
export const enlaceProceso = (cedula: string | null | undefined, procesoId: string) => `${urlApp()}/candidatos?q=${encodeURIComponent(String(cedula ?? "").trim() || procesoId)}`;

export async function destinatariosNotificacion(tipo: TipoNotificacion) {
  const a = await leerAjustes().catch(() => []);
  return destinatariosDeAjustes(tipo, (clave) => valorAjuste<unknown>(a, clave, undefined));
}

/** El día en Bogotá (AAAA-MM-DD) y su comienzo en UTC. */
export function diaBogota(d: Date = new Date()): { fecha: string; desde: string } {
  const fecha = new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
  return { fecha, desde: `${fecha}T05:00:00.000Z` };
}

async function enviar(tipo: TipoNotificacion, prueba: boolean, correo: ReturnType<typeof armarCorreoNotificacion>) {
  const destino = await destinatariosNotificacion(tipo);
  if (!destino.activo) return { resultado: "apagado" as const, destinatarios: 0 };
  if (!destino.para.length) return { resultado: "sin_destinatarios" as const, destinatarios: 0 };
  const salir = () => enviarCorreo({ para: destino.para, copia: destino.copia, ...correo });
  // Un candidato del chat de prueba: sale de verdad también en desarrollo, con «[Prueba]».
  const r = prueba ? await (await import("@/lib/entorno-pruebas")).conEnvioRealDePrueba(salir) : await salir();
  return { resultado: r.ok ? ("enviado" as const) : ("fallido" as const), error: r.ok ? null : r.error, destinatarios: destino.para.length + destino.copia.length };
}

export interface Novedad {
  /** Lo que no se repite: un aviso por tipo y clave. */
  clave: string;
  titulo: string;
  detalle?: string | null;
  enlace?: string | null;
  procesoId?: string | null;
  conversacionId?: string | null;
  prueba?: boolean;
}

/** Registra la novedad y avisa por correo. */
export async function notificar(tipo: TipoNotificacion, n: Novedad): Promise<ResultadoNotificacion> {
  try {
    const db = createAdminClient();
    const { data: previa, error: eLeer } = await db.from("seleccion_notificaciones").select("id, resultado, created_at").eq("tipo", tipo).eq("clave", n.clave).maybeSingle();
    const conBitacora = !eLeer;
    if (previa && (previa.resultado !== "fallido" || Date.now() - new Date(previa.created_at as string).getTime() < 30 * 60_000)) return "ya_avisado";
    const fila = {
      tipo,
      clave: n.clave,
      proceso_id: n.procesoId ?? null,
      conversacion_id: n.conversacionId ?? null,
      titulo: n.titulo.slice(0, 300),
      detalle: n.detalle?.slice(0, 1000) ?? null,
      enlace: n.enlace ?? null,
      prueba: n.prueba === true,
      resultado: "pendiente",
    };
    let id = previa?.id as string | undefined;
    if (conBitacora && !id) {
      // Si otro proceso lo registró al mismo tiempo, el índice único lo frena: ese avisa.
      const { data: nueva, error } = await db.from("seleccion_notificaciones").insert(fila).select("id").maybeSingle();
      if (error) return "ya_avisado";
      id = nueva?.id as string | undefined;
    }
    const correo = armarCorreoNotificacion({ tipo, titulo: n.titulo, detalle: n.detalle, enlace: n.enlace, prueba: n.prueba, desarrollo: process.env.GESTIVO_ENTORNO === "desarrollo" });
    const r = await enviar(tipo, n.prueba === true, correo);
    if (conBitacora && id) {
      await db
        .from("seleccion_notificaciones")
        .update({ resultado: r.resultado, error: "error" in r ? (r.error ?? null) : null, destinatarios: r.destinatarios, ...(previa ? { created_at: new Date().toISOString() } : {}) })
        .eq("id", id);
    }
    return r.resultado;
  } catch (e) {
    console.error(`[seleccion] aviso «${tipo}»:`, e);
    return "fallido";
  }
}

/**
 * Deja en la bitácora un aviso que mandó otro módulo con su propio correo
 * (antecedentes, listo para contratar), para que salga en las novedades del día.
 */
export async function anotarNovedad(tipo: TipoNotificacion, n: Novedad, resultado: string, error?: string | null): Promise<void> {
  try {
    await createAdminClient()
      .from("seleccion_notificaciones")
      .upsert(
        { tipo, clave: n.clave, proceso_id: n.procesoId ?? null, conversacion_id: n.conversacionId ?? null, titulo: n.titulo.slice(0, 300), detalle: n.detalle?.slice(0, 1000) ?? null, enlace: n.enlace ?? null, prueba: n.prueba === true, resultado, error: error ?? null },
        { onConflict: "tipo,clave" }
      );
  } catch {
    // Sin la migración: sin bitácora.
  }
}

/**
 * Chats que requieren una persona (cron cada 15 min): un solo correo con los
 * que aparecieron desde la última vuelta (cada chat, una vez por día mientras
 * siga esperando). Sin los de laboratorios. Devuelve cuántos avisó.
 */
export async function notificarChatsHumano(): Promise<number> {
  try {
    const db = createAdminClient();
    const { data: convs } = await db
      .from("wa_conversaciones")
      .select("id, proceso_id, ultimo_entrante_at, wa_contactos(telefono, nombre, tipo)")
      .eq("requiere_humano", true)
      .order("ultimo_mensaje_at", { ascending: false })
      .limit(200);
    const { fecha } = diaBogota();
    const lista = ((convs ?? []) as unknown as { id: string; proceso_id: string | null; wa_contactos: { telefono?: string; nombre?: string | null; tipo?: string | null } | { telefono?: string; nombre?: string | null; tipo?: string | null }[] | null }[])
      .map((c) => ({ ...c, contacto: Array.isArray(c.wa_contactos) ? c.wa_contactos[0] : c.wa_contactos }))
      .filter((c) => c.contacto?.tipo !== "laboratorio");
    if (!lista.length) return 0;
    const claves = lista.map((c) => `${c.id}:${fecha}`);
    const { data: ya, error } = await db.from("seleccion_notificaciones").select("clave").eq("tipo", "chats").in("clave", claves);
    if (error) return 0; // Sin la bitácora no se sabe cuáles ya se avisaron: no se manda nada (para no repetir cada 15 min).
    const avisados = new Set((ya ?? []).map((x) => x.clave as string));
    const nuevos = lista.filter((c) => !avisados.has(`${c.id}:${fecha}`));
    if (!nuevos.length) return 0;
    const items = nuevos.map((c) => ({
      titulo: c.contacto?.nombre?.trim() || c.contacto?.telefono || "Contacto sin nombre",
      detalle: c.proceso_id ? "Aspirante con proceso en Selección" : null,
      enlace: `${urlApp()}/comunicaciones?c=${c.id}`,
    }));
    const titulo = `${nuevos.length} ${nuevos.length === 1 ? "chat requiere" : "chats requieren"} una persona`;
    const correo = armarCorreoNotificacion({ tipo: "chats", titulo, detalle: "El asistente los pasó a una persona: revíselos en Comunicaciones (bandeja «Requieren humano»).", items: items.slice(0, 30), enlace: `${urlApp()}/comunicaciones`, desarrollo: process.env.GESTIVO_ENTORNO === "desarrollo" });
    const r = await enviar("chats", false, correo);
    await db.from("seleccion_notificaciones").upsert(
      nuevos.map((c, i) => ({
        tipo: "chats",
        clave: `${c.id}:${fecha}`,
        proceso_id: c.proceso_id,
        conversacion_id: c.id,
        titulo: `Chat de ${items[i].titulo} requiere una persona`,
        enlace: items[i].enlace,
        resultado: r.resultado,
        error: "error" in r ? (r.error ?? null) : null,
        destinatarios: r.destinatarios,
      })),
      { onConflict: "tipo,clave", ignoreDuplicates: true }
    );
    return nuevos.length;
  } catch (e) {
    console.error("[seleccion] aviso de chats que requieren una persona:", e);
    return 0;
  }
}

export interface NovedadDelDia {
  id: string;
  at: string;
  tipo: TipoNotificacion;
  tipoNombre: string;
  titulo: string;
  detalle: string | null;
  enlace: string | null;
  prueba: boolean;
  resultado: string;
  /** Ya se hizo la revisión (se decidió, se confirmó, se atendió el chat). null si no aplica. */
  resuelto: boolean | null;
}

/** Las novedades de un día (por defecto hoy) con si ya se resolvieron. null sin la migración. */
export async function novedadesDelDia(fecha?: string): Promise<NovedadDelDia[] | null> {
  const db = createAdminClient();
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : diaBogota().fecha;
  const desde = `${dia}T05:00:00.000Z`;
  const hasta = new Date(new Date(desde).getTime() + 86_400_000).toISOString();
  const { data, error } = await db
    .from("seleccion_notificaciones")
    .select("id, created_at, tipo, clave, proceso_id, conversacion_id, titulo, detalle, enlace, prueba, resultado")
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return null;
  const filas = (data ?? []) as { id: string; created_at: string; tipo: TipoNotificacion; clave: string; proceso_id: string | null; conversacion_id: string | null; titulo: string; detalle: string | null; enlace: string | null; prueba: boolean; resultado: string }[];

  // ¿Ya se resolvió? Una consulta por tipo.
  const ids = (t: TipoNotificacion) => [...new Set(filas.filter((f) => f.tipo === t && f.proceso_id).map((f) => f.proceso_id as string))];
  const resueltos = new Set<string>();
  const antecedentes = ids("antecedentes");
  if (antecedentes.length) {
    const { data: ps } = await db.from("procesos_contratacion").select("id, estado, antecedentes_decision").in("id", antecedentes);
    for (const p of ps ?? []) if (p.antecedentes_decision || ["cierre", "contratado"].includes(p.estado as string)) resueltos.add(`antecedentes:${p.id}`);
  }
  const examenes = ids("examenes");
  if (examenes.length) {
    const { examenesPorRevisar } = await import("./examenes-servidor");
    const pendientes = await examenesPorRevisar(examenes).catch(() => null);
    if (pendientes) for (const id of examenes) if (!pendientes.has(id)) resueltos.add(`examenes:${id}`);
  }
  const avisos = filas.filter((f) => f.tipo === "laboratorio").map((f) => f.clave);
  if (avisos.length) {
    const { data: av } = await db.from("seleccion_avisos_laboratorio").select("id, estado").in("id", avisos);
    for (const a of av ?? []) if (a.estado !== "pendiente") resueltos.add(`laboratorio:${a.id}`);
  }
  const lecturas = filas.filter((f) => f.tipo === "documentos").map((f) => f.clave);
  if (lecturas.length) {
    const { data: ls } = await db.from("seleccion_lecturas").select("id, revisado_at").in("id", lecturas);
    for (const l of ls ?? []) if (l.revisado_at) resueltos.add(`documentos:${l.id}`);
  }
  const chats = [...new Set(filas.filter((f) => f.tipo === "chats" && f.conversacion_id).map((f) => f.conversacion_id as string))];
  if (chats.length) {
    const { data: cs } = await db.from("wa_conversaciones").select("id, requiere_humano").in("id", chats);
    for (const c of cs ?? []) if (!c.requiere_humano) resueltos.add(`chats:${c.id}`);
  }
  const resuelto = (f: (typeof filas)[number]): boolean | null => {
    switch (f.tipo) {
      case "antecedentes":
      case "examenes":
        return f.proceso_id ? resueltos.has(`${f.tipo}:${f.proceso_id}`) : null;
      case "laboratorio":
      case "documentos":
        return resueltos.has(`${f.tipo}:${f.clave}`);
      case "chats":
        return f.conversacion_id ? resueltos.has(`chats:${f.conversacion_id}`) : null;
      default:
        return null;
    }
  };
  return filas.map((f) => ({
    id: f.id,
    at: f.created_at,
    tipo: f.tipo,
    tipoNombre: NOTIFICACIONES[f.tipo]?.nombre ?? f.tipo,
    titulo: f.titulo,
    detalle: f.detalle,
    enlace: f.enlace,
    prueba: f.prueba,
    resultado: f.resultado,
    resuelto: resuelto(f),
  }));
}
