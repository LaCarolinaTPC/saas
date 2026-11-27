/**
 * Correo a Gestión Humana cuando un aspirante necesita que una persona revise
 * sus antecedentes (reunión de soporte, 27-nov-2026). Antes solo se veía
 * entrando a Candidatos. Un correo por aspirante y causa (no se repite en el
 * mismo proceso), con nombre, cédula, la causa y el enlace.
 *
 * Destinatarios: ajustes `antecedentes_alerta_correos` / `_copia`; vacíos, los
 * del reporte diario. `antecedentes_alerta_activo` lo apaga. En desarrollo el
 * correo solo sale a la lista de pruebas (enviarCorreo). Nunca lanza. Solo servidor.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento } from "@/lib/contratacion/servidor";
import { enviarCorreo } from "@/lib/correo/enviar";
import { leerConfigReporte } from "./reporte-diario-servidor";
import { inicioVigenteProceso, leerAjustes, valorAjuste } from "./servidor";

export type CausaAlertaAntecedentes = "hallazgo" | "sin_respuesta" | "requisito" | "tardio";

const TITULO: Record<CausaAlertaAntecedentes, string> = {
  hallazgo: "tiene una anotación en sus antecedentes",
  sin_respuesta: "una fuente de antecedentes no respondió",
  requisito: "no cumple un requisito que las reglas mandan a revisión",
  tardio: "llegó tarde un resultado con anotación después del aval",
};

const NOMBRE_FUENTE: Record<string, string> = {
  policia: "Policía",
  procuraduria: "Procuraduría",
  contraloria: "Contraloría",
  rnmc: "RNMC",
  runt: "RUNT",
  simit: "SIMIT",
  licencia: "licencia",
  edad: "edad",
  residencia: "residencia",
};

const correos = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : []).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));

const urlApp = () =>
  process.env.GESTIVO_ENTORNO === "desarrollo"
    ? "http://localhost:3000"
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://saas-six-vert.vercel.app";

export async function destinatariosAlertaAntecedentes(): Promise<{ activo: boolean; para: string[]; copia: string[] }> {
  const a = await leerAjustes().catch(() => []);
  const activo = valorAjuste<unknown>(a, "antecedentes_alerta_activo", true) !== false;
  const para = correos(valorAjuste<unknown>(a, "antecedentes_alerta_correos", []));
  if (para.length) return { activo, para, copia: correos(valorAjuste<unknown>(a, "antecedentes_alerta_copia", [])) };
  const reporte = await leerConfigReporte();
  return { activo, para: reporte.para, copia: reporte.copia };
}

/** El correo, armado (puro: se prueba sin enviarlo). */
export function armarCorreoAlerta(p: { nombre: string; cedula: string; prueba: boolean }, causa: CausaAlertaAntecedentes, fuentes: string[], url: string, desarrollo: boolean) {
  const nombre = p.nombre && p.nombre !== "POR CONFIRMAR" ? p.nombre : `Aspirante CC ${p.cedula}`;
  const lista = fuentes.map((f) => NOMBRE_FUENTE[f] ?? f).join(", ");
  const enlace = `${url}/candidatos?q=${encodeURIComponent(p.cedula)}`;
  const marca = `${desarrollo ? "[Desarrollo] " : ""}${p.prueba ? "[Prueba] " : ""}`;
  const asunto = `${marca}Antecedentes por revisar: ${nombre}`;
  const detalle =
    causa === "hallazgo"
      ? `Anotación en: ${lista || "una fuente"}. Revise y decida si continúa (Candidatos › ficha › Antecedentes).`
      : causa === "sin_respuesta"
        ? `No respondió: ${lista || "una fuente"}. Revísela a mano («Lo revisé a mano») o dé el aval para seguir sin ella.`
        : causa === "requisito"
          ? `Requisito: ${lista || "uno"}. Las reglas lo dejan para una persona (no se cierra solo).`
          : `Resultado tardío con anotación en: ${lista || "una fuente"}. El aval que se había dado quedó anulado: vuelva a decidir.`;
  const texto = [`${nombre} (CC ${p.cedula}) ${TITULO[causa]}.`, "", detalle, "", `Abrir: ${enlace}`].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;max-width:560px">
<p><b>${esc(nombre)}</b> (CC ${esc(p.cedula)}) ${esc(TITULO[causa])}.</p>
<p>${esc(detalle)}</p>
<p style="margin:20px 0"><a href="${esc(enlace)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:bold">Abrir en Candidatos</a></p>
<p style="font-size:12px;color:#64748b">Alerta automática de Gestivo (Selección). Se cambia en Selección › Tiempos y reglas › Alerta de antecedentes.</p>
</div>`;
  return { asunto, texto, html };
}

/**
 * Avisa por correo que el aspirante necesita una revisión de antecedentes.
 * Una vez por proceso y causa. Devuelve qué pasó (para el historial y las pruebas).
 */
export async function alertarAntecedentes(procesoId: string, causa: CausaAlertaAntecedentes, fuentes: string[] = []): Promise<"enviado" | "ya_avisado" | "apagado" | "sin_destinatarios" | "fallido"> {
  try {
    const db = createAdminClient();
    const { data: ya } = await db
      .from("procesos_contratacion_eventos")
      .select("id")
      .eq("proceso_id", procesoId)
      .eq("detalle->>alerta_antecedentes", causa)
      .gte("created_at", await inicioVigenteProceso(procesoId))
      .limit(1)
      .maybeSingle();
    if (ya) return "ya_avisado";
    const destino = await destinatariosAlertaAntecedentes();
    if (!destino.activo) return "apagado";
    if (!destino.para.length) return "sin_destinatarios";
    const { data: p } = await db.from("procesos_contratacion").select("nombre, cedula, origen").eq("id", procesoId).maybeSingle();
    if (!p) return "fallido";
    const correo = armarCorreoAlerta(
      { nombre: String(p.nombre ?? ""), cedula: String(p.cedula ?? ""), prueba: p.origen === "chat_prueba" },
      causa,
      fuentes,
      urlApp(),
      process.env.GESTIVO_ENTORNO === "desarrollo"
    );
    const envio = await enviarCorreo({ para: destino.para, copia: destino.copia, ...correo });
    const resultado = envio.ok ? "enviado" : "fallido";
    await registrarEvento(procesoId, { tipo: "dato", detalle: { alerta_antecedentes: causa, fuentes, correo: resultado, ...(envio.ok ? {} : { error: envio.error }) } }, { tipo: "sistema", userId: null, userEmail: "Sistema" });
    return resultado;
  } catch (e) {
    console.error("[seleccion] alerta de antecedentes:", e);
    return "fallido";
  }
}
