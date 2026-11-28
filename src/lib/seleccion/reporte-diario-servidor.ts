/**
 * Reporte diario de selección por correo (24-nov-2026). Solo servidor; el
 * armado está en ./reporte-diario. Lo envía el cron /api/cron/reporte-seleccion
 * a las 7:00 de Bogotá, y «Enviar ahora» en Candidatos › Indicadores.
 * Destinatarios: ajustes `reporte_diario_correos` y `reporte_diario_copia`
 * (vacío = no se envía); `reporte_diario_activo` lo apaga.
 */
import { enviarCorreo } from "@/lib/correo/enviar";
import { diaBogota, sumarDias } from "@/lib/comunicaciones/indicadores";
import { leerIndicadoresDelPeriodo } from "@/lib/comunicaciones/indicadores-servidor";
import { leerIndicadoresRespuesta, leerIndicadoresSeleccion } from "./indicadores-servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarReporteDiario, type DatosReporte, type ListoParaContratar, type PeriodoReporte } from "./reporte-diario";
import { umbralesAlertas } from "./alertas-indicadores";
import { leerAjustes, valorAjuste } from "./servidor";

const urlApp = () =>
  process.env.GESTIVO_ENTORNO === "desarrollo"
    ? "http://localhost:3000"
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://saas-six-vert.vercel.app";

const lista = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));

export interface ConfigReporte {
  activo: boolean;
  para: string[];
  copia: string[];
}

export async function leerConfigReporte(): Promise<ConfigReporte> {
  const a = await leerAjustes().catch(() => []);
  const activo = valorAjuste<unknown>(a, "reporte_diario_activo", true);
  return {
    activo: activo === true || activo === "true",
    para: lista(valorAjuste<unknown>(a, "reporte_diario_correos", [])),
    copia: lista(valorAjuste<unknown>(a, "reporte_diario_copia", [])),
  };
}

async function periodo(desde: string, hasta: string): Promise<PeriodoReporte> {
  const rango = { desde, hasta };
  const [{ ind }, chat, resp] = await Promise.all([
    leerIndicadoresSeleccion(rango),
    leerIndicadoresDelPeriodo(desde, hasta).catch(() => null),
    leerIndicadoresRespuesta(rango),
  ]);
  return { ind, chat, resp };
}

/** Lo de ayer y los últimos 30 días hasta ayer (Bogotá). */
export async function datosReporteDiario(ahora = new Date()): Promise<DatosReporte> {
  const ayer = sumarDias(diaBogota(ahora), -1);
  const [a, m, ajustes, listos] = await Promise.all([periodo(ayer, ayer), periodo(sumarDias(ayer, -29), ayer), leerAjustes().catch(() => []), listosParaContratar(ahora).catch(() => [])]);
  return { dia: ayer, ayer: a, mes: m, url: urlApp(), umbrales: umbralesAlertas((k) => valorAjuste<unknown>(ajustes, k, undefined)), listos };
}

/** Los que están hoy en «Listo para contratar», primero los que más llevan esperando (sin los del chat de prueba). */
export async function listosParaContratar(ahora = new Date()): Promise<ListoParaContratar[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("procesos_contratacion")
    .select("id, nombre, cedula, updated_at, aprobacion_contratacion_at")
    .eq("estado", "listo_contratar")
    .neq("origen", "chat_prueba")
    .limit(50);
  if (error || !data?.length) return [];
  // Desde cuándo: el último paso a la etapa, del historial (updated_at cambia con cualquier dato).
  const { data: eventos } = await db
    .from("procesos_contratacion_eventos")
    .select("proceso_id, created_at")
    .in("proceso_id", data.map((p) => p.id as string))
    .eq("tipo", "estado")
    .eq("estado_nuevo", "listo_contratar")
    .order("created_at", { ascending: true });
  const entro = new Map((eventos ?? []).map((e) => [e.proceso_id as string, String(e.created_at)]));
  return data
    .map((p) => ({
      nombre: String(p.nombre ?? ""),
      cedula: String(p.cedula ?? ""),
      dias: Math.max(0, Math.floor((ahora.getTime() - new Date(entro.get(p.id as string) ?? String(p.updated_at)).getTime()) / 86_400_000)),
      conVistoBueno: !!p.aprobacion_contratacion_at,
    }))
    .sort((a, b) => b.dias - a.dias);
}

export async function enviarReporteDiario(opciones: { ahora?: Date; manual?: boolean } = {}): Promise<{ ok: boolean; error?: string; para?: string[]; copia?: string[]; omitido?: string }> {
  const cfg = await leerConfigReporte();
  if (!opciones.manual && !cfg.activo) return { ok: true, omitido: "apagado" };
  if (!cfg.para.length) return { ok: false, error: "No hay destinatarios: escriba al menos un correo en «Reporte diario por correo»." };
  const datos = await datosReporteDiario(opciones.ahora);
  const c = armarReporteDiario(datos, { desarrollo: process.env.GESTIVO_ENTORNO === "desarrollo" });
  const r = await enviarCorreo({ para: cfg.para, copia: cfg.copia, asunto: c.asunto, texto: c.texto, html: c.html });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, para: cfg.para, copia: cfg.copia };
}
