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
import { inicioVigenteProceso } from "./servidor";

export type CausaAlertaAntecedentes = "hallazgo" | "sin_respuesta" | "requisito" | "tardio" | "simit_sin_respuesta";

const TITULO: Record<CausaAlertaAntecedentes, string> = {
  hallazgo: "tiene una anotación en sus antecedentes",
  sin_respuesta: "una fuente de antecedentes no respondió",
  requisito: "no cumple un requisito que las reglas mandan a revisión",
  tardio: "llegó tarde un resultado con anotación después del aval",
  // 27-nov-2026: Croma no respondió el SIMIT; sin él (si es obligatorio) el aspirante se queda esperando.
  simit_sin_respuesta: "Croma no respondió el SIMIT",
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

const urlApp = () =>
  process.env.GESTIVO_ENTORNO === "desarrollo"
    ? "http://localhost:3000"
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://saas-six-vert.vercel.app";

/** Lista propia; si no, los correos por defecto de Selección › Notificaciones; si no, los del reporte diario. */
export async function destinatariosAlertaAntecedentes(): Promise<{ activo: boolean; para: string[]; copia: string[] }> {
  const { destinatariosNotificacion } = await import("./notificaciones-servidor");
  const d = await destinatariosNotificacion("antecedentes");
  return { activo: d.activo, para: d.para, copia: d.copia };
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
          : causa === "simit_sin_respuesta"
            ? "Croma no respondió el SIMIT. Revíselo a mano en el portal del SIMIT y regístrelo en la ficha («Lo revisé a mano»). Gestivo lo reintenta solo hasta que alguien lo revise a mano."
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

export type ResultadoAlerta = "enviado" | "ya_avisado" | "apagado" | "sin_destinatarios" | "fallido";

export interface DetalleAlerta {
  resultado: ResultadoAlerta;
  error?: string;
  /** A quién iba (antes del desvío de desarrollo, que deja solo los correos de prueba). */
  para?: string[];
  copia?: string[];
  asunto?: string;
}

/**
 * Avisa por correo que el aspirante necesita una revisión de antecedentes.
 * Una vez por proceso y causa. Devuelve qué pasó (para el historial y las pruebas).
 */
export async function alertarAntecedentes(procesoId: string, causa: CausaAlertaAntecedentes, fuentes: string[] = []): Promise<ResultadoAlerta> {
  return (await alertarAntecedentesDetalle(procesoId, causa, fuentes)).resultado;
}

/**
 * Lo mismo, con el detalle. `forzar` (botón «Reenviar la alerta» del chat de
 * prueba, 27-nov-2026): sale aunque ya se haya avisado.
 */
export async function alertarAntecedentesDetalle(
  procesoId: string,
  causa: CausaAlertaAntecedentes,
  fuentes: string[] = [],
  opciones: { forzar?: boolean } = {}
): Promise<DetalleAlerta> {
  try {
    const db = createAdminClient();
    if (!opciones.forzar) {
      // Solo cuenta como avisado si el correo salió; uno fallido se reintenta pasada media hora
      // (27-nov-2026: Brevo rechazó dos alertas con 535 y quedaban como «ya avisado» para siempre).
      const { data: previas } = await db
        .from("procesos_contratacion_eventos")
        .select("created_at, detalle")
        .eq("proceso_id", procesoId)
        .eq("detalle->>alerta_antecedentes", causa)
        .gte("created_at", await inicioVigenteProceso(procesoId))
        .order("created_at", { ascending: false })
        .limit(20);
      const hace30 = Date.now() - 30 * 60_000;
      const ya = (previas ?? []).some((e) => {
        const d = e.detalle as { correo?: string } | null;
        return d?.correo !== "fallido" || new Date(e.created_at as string).getTime() > hace30;
      });
      if (ya) return { resultado: "ya_avisado" };
    }
    const destino = await destinatariosAlertaAntecedentes();
    if (!destino.activo) return { resultado: "apagado" };
    if (!destino.para.length) return { resultado: "sin_destinatarios" };
    const { data: p } = await db.from("procesos_contratacion").select("nombre, cedula, origen").eq("id", procesoId).maybeSingle();
    if (!p) return { resultado: "fallido", error: "El proceso no existe." };
    const correo = armarCorreoAlerta(
      { nombre: String(p.nombre ?? ""), cedula: String(p.cedula ?? ""), prueba: p.origen === "chat_prueba" },
      causa,
      fuentes,
      urlApp(),
      process.env.GESTIVO_ENTORNO === "desarrollo"
    );
    // Un candidato del chat de prueba: sale de verdad también en desarrollo (27-nov-2026), con «[Prueba]» en el asunto.
    const enviar = () => enviarCorreo({ para: destino.para, copia: destino.copia, ...correo });
    const envio = p.origen === "chat_prueba" ? await (await import("@/lib/entorno-pruebas")).conEnvioRealDePrueba(enviar) : await enviar();
    const resultado = envio.ok ? "enviado" : "fallido";
    await registrarEvento(
      procesoId,
      { tipo: "dato", detalle: { alerta_antecedentes: causa, fuentes, correo: resultado, ...(opciones.forzar ? { reenvio: true } : {}), ...(envio.ok ? {} : { error: envio.error }) } },
      { tipo: "sistema", userId: null, userEmail: "Sistema" }
    );
    // En la bitácora de avisos: sale en las novedades del día de Candidatos.
    const { anotarNovedad, enlaceProceso } = await import("./notificaciones-servidor");
    await anotarNovedad(
      "antecedentes",
      {
        clave: `${procesoId}:${causa}:${new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)}`,
        procesoId,
        prueba: p.origen === "chat_prueba",
        titulo: `${String(p.nombre ?? "").trim() || `Aspirante CC ${p.cedula ?? ""}`}: ${TITULO[causa]}`,
        detalle: fuentes.length ? `Fuentes: ${fuentes.map((f) => NOMBRE_FUENTE[f] ?? f).join(", ")}` : null,
        enlace: enlaceProceso(p.cedula as string | null, procesoId),
      },
      resultado,
      envio.ok ? null : envio.error
    );
    return { resultado, ...(envio.ok ? {} : { error: envio.error }), para: destino.para, copia: destino.copia, asunto: correo.asunto };
  } catch (e) {
    console.error("[seleccion] alerta de antecedentes:", e);
    return { resultado: "fallido", error: e instanceof Error ? e.message : "Error desconocido" };
  }
}
