/**
 * Alerta por correo cuando un servicio externo está fallando (24-nov-2026).
 * La revisión periódica (cron seguimiento-whatsapp, cada 15 min) le escribe a
 * Gestión Humana cuando Croma, la IA, WhatsApp o el correo empiezan a fallar
 * (según src/lib/estado-servicios.ts), le recuerda cada 6 horas si sigue igual
 * y le avisa cuando vuelve a funcionar. Destinatarios: ajuste
 * `alerta_servicios_correos` (vacío = no se envía). Cada episodio queda en la
 * tabla `alertas_servicios` (migración 20261124191635): sin ella no se envía
 * nada, para no repetir el correo en cada revisión. Desde el entorno de
 * pruebas el correo sale igual, marcado como de pruebas.
 *
 * armarCorreoAlerta es puro; lo demás, solo servidor.
 */
import type { EstadoServicio, IdServicio } from "./estado-servicios";

export type TipoAlerta = "falla" | "recordatorio" | "recuperado" | "prueba";

/** Horas entre recordatorios mientras sigue fallando. */
export const HORAS_RECORDATORIO = 6;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** El correo de la alerta. En pruebas lo dice en el asunto y al comienzo. */
export function armarCorreoAlerta(
  tipo: TipoAlerta,
  s: Pick<EstadoServicio, "nombre" | "seguidos" | "errores24h" | "total24h" | "ultimoError" | "ultimoOkAt" | "consejo">,
  o: { desarrollo: boolean; url: string; desdeAt?: string | null }
): { asunto: string; texto: string; html: string } {
  const prefijo = o.desarrollo ? "[PRUEBAS] " : "";
  const titulo =
    tipo === "recuperado"
      ? `${s.nombre} volvió a funcionar`
      : tipo === "recordatorio"
        ? `${s.nombre} sigue fallando`
        : tipo === "prueba"
          ? `Correo de prueba de las alertas de Gestivo (${s.nombre})`
          : `${s.nombre} está fallando`;
  const asunto = `${prefijo}Gestivo: ${titulo}`;
  const aviso = o.desarrollo
    ? "Este correo viene del ENTORNO DE PRUEBAS de Gestivo (copia de producción), no del sistema real. No hay que hacer nada."
    : null;
  const lineas: string[] = [];
  if (tipo === "recuperado") {
    lineas.push(`${s.nombre} volvió a responder bien${o.desdeAt ? ` (fallaba desde ${fechaHora(o.desdeAt)})` : ""}.`);
    lineas.push("Gestivo retoma solo lo que había quedado pendiente. Lo que se revisó a mano mientras tanto queda como está.");
  } else {
    if (tipo === "prueba") lineas.push("Así se ve la alerta que Gestivo envía cuando un servicio externo está fallando. Este es un ejemplo con los datos de hoy.");
    lineas.push(
      `${s.seguidos > 0 ? `${s.seguidos} error${s.seguidos === 1 ? "" : "es"} seguido${s.seguidos === 1 ? "" : "s"}` : `${s.errores24h} error${s.errores24h === 1 ? "" : "es"}`} · ${s.errores24h} de ${s.total24h} intentos fallaron en las últimas 24 horas.`
    );
    if (s.ultimoError) lineas.push(`Último error (${fechaHora(s.ultimoError.at)}): ${s.ultimoError.texto}`);
    lineas.push(`Último que salió bien: ${fechaHora(s.ultimoOkAt)}.`);
    if (s.consejo) lineas.push(s.consejo);
    if (tipo === "recordatorio") lineas.push(`Se vuelve a avisar cada ${HORAS_RECORDATORIO} horas mientras siga así, y cuando vuelva a funcionar.`);
  }
  const texto = [...(aviso ? [aviso, ""] : []), titulo, "", ...lineas, "", `Ver el estado: ${o.url}`, "", "Gestivo · Transportes La Carolina"].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#0f172a;max-width:560px">
${aviso ? `<p style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:8px 10px;color:#92400e;font-weight:bold">${esc(aviso)}</p>` : ""}
<h2 style="font-size:17px;margin:12px 0 8px;color:${tipo === "recuperado" ? "#047857" : "#b91c1c"}">${esc(titulo)}</h2>
${lineas.map((l) => `<p style="margin:6px 0">${esc(l)}</p>`).join("\n")}
<p style="margin:16px 0"><a href="${esc(o.url)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;display:inline-block">Ver el estado de los servicios</a></p>
<p style="font-size:12px;color:#64748b">Gestivo · Transportes La Carolina. Los destinatarios se cambian en Selección › Tiempos y reglas › Verificaciones con Croma.</p>
</div>`;
  return { asunto, texto, html };
}

function urlEstado(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    (process.env.GESTIVO_ENTORNO === "desarrollo" ? "http://localhost:3000" : process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://saas-six-vert.vercel.app");
  return `${base}/candidatos/seleccion?pestana=tiempos`;
}

const enDesarrollo = () => process.env.GESTIVO_ENTORNO?.trim().toLowerCase() === "desarrollo";

async function listaAjuste(clave: string): Promise<string[]> {
  const { leerAjustes, valorAjuste } = await import("@/lib/seleccion/servidor");
  const v = valorAjuste<unknown>(await leerAjustes().catch(() => []), clave, []);
  return (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[,;\s]+/)).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@"));
}

/** Los destinatarios de la alerta (ajuste editable). */
export async function destinatariosAlerta(): Promise<string[]> {
  return listaAjuste("alerta_servicios_correos");
}

/** Con copia (ajuste `alerta_servicios_copia`, soporte por defecto), para que verifiquen. Sin repetir los destinatarios. */
export async function copiaAlerta(para: string[]): Promise<string[]> {
  return (await listaAjuste("alerta_servicios_copia")).filter((c) => !para.includes(c));
}

async function enviar(tipo: TipoAlerta, s: EstadoServicio, para: string[], desdeAt?: string | null, copia?: string[]): Promise<{ ok: boolean; error?: string }> {
  const { enviarCorreo } = await import("@/lib/correo/enviar");
  const c = armarCorreoAlerta(tipo, s, { desarrollo: enDesarrollo(), url: urlEstado(), desdeAt });
  const cc = copia ?? (await copiaAlerta(para));
  // Sale también desde pruebas, marcado como de pruebas (pedido del 24-nov-2026).
  const r = await enviarCorreo({ para, copia: cc.length ? cc : undefined, asunto: c.asunto, texto: c.texto, html: c.html, salirEnDesarrollo: true });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/**
 * La revisión periódica: abre un episodio y avisa cuando un servicio empieza a
 * fallar, recuerda cada 6 horas y avisa cuando vuelve a funcionar. Croma en
 * pausa no cuenta ni como falla ni como recuperado.
 */
export async function alertarServicios(ahora = new Date()): Promise<{ avisos: number; recuperados: number; omitida?: string }> {
  const r = { avisos: 0, recuperados: 0 };
  const para = await destinatariosAlerta();
  if (!para.length) return { ...r, omitida: "sin destinatarios" };
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { leerEstadoServicios, olvidarEstadoServicios } = await import("./estado-servicios");
  const db = createAdminClient();
  const { data: abiertas, error } = await db.from("alertas_servicios").select("id, servicio, inicio_at, ultimo_aviso_at, avisos").is("fin_at", null);
  // Sin la tabla no se sabe qué ya se avisó: mejor no enviar que enviar cada 15 minutos.
  if (error) return { ...r, omitida: "falta la migración 20261124191635" };
  olvidarEstadoServicios();
  const estados = await leerEstadoServicios();
  const abierta = new Map(((abiertas ?? []) as { id: string; servicio: IdServicio; inicio_at: string; ultimo_aviso_at: string; avisos: number }[]).map((a) => [a.servicio, a]));
  for (const s of estados) {
    const a = abierta.get(s.id);
    if (s.nivel === "fallando") {
      if (!a) {
        const { error: eIns } = await db
          .from("alertas_servicios")
          .insert({ servicio: s.id, ultimo_error: s.ultimoError?.texto ?? null, destinatarios: para, inicio_at: ahora.toISOString(), ultimo_aviso_at: ahora.toISOString() });
        if (eIns) continue; // Otra revisión ya lo abrió (índice único).
        if ((await enviar("falla", s, para)).ok) r.avisos++;
      } else if (ahora.getTime() - new Date(a.ultimo_aviso_at).getTime() >= HORAS_RECORDATORIO * 3_600_000) {
        const { data: tomada } = await db
          .from("alertas_servicios")
          .update({ ultimo_aviso_at: ahora.toISOString(), avisos: a.avisos + 1, ultimo_error: s.ultimoError?.texto ?? null })
          .eq("id", a.id)
          .eq("ultimo_aviso_at", a.ultimo_aviso_at)
          .select("id");
        if (tomada?.length && (await enviar("recordatorio", s, para)).ok) r.avisos++;
      }
    } else if (a && s.nivel === "ok") {
      const { data: tomada } = await db.from("alertas_servicios").update({ fin_at: ahora.toISOString() }).eq("id", a.id).is("fin_at", null).select("id");
      if (tomada?.length && (await enviar("recuperado", s, para, a.inicio_at)).ok) r.recuperados++;
    }
  }
  return r;
}

/**
 * Un correo de prueba a los destinatarios configurados, con copia, y el estado
 * de hoy. Con `para`, solo a esos (sin copia): lo usan los scripts de prueba.
 */
export async function enviarAlertaDePrueba(para?: string[]): Promise<{ ok: boolean; error?: string; para?: string[]; copia?: string[] }> {
  const destino = para?.length ? para : await destinatariosAlerta();
  const copia = para?.length ? [] : await copiaAlerta(destino);
  if (!destino.length) return { ok: false, error: "No hay correos configurados para la alerta." };
  const { leerEstadoServicios, olvidarEstadoServicios } = await import("./estado-servicios");
  olvidarEstadoServicios();
  const estados = await leerEstadoServicios();
  const s = estados.find((e) => e.nivel === "fallando") ?? estados.find((e) => e.id === "croma") ?? estados[0];
  if (!s) return { ok: false, error: "No se pudo leer el estado de los servicios." };
  const r = await enviar("prueba", s, destino, null, copia);
  return { ...r, para: destino, copia };
}
