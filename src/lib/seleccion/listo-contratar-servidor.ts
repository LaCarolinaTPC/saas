/**
 * Etapa «Listo para contratar» (25-nov-2026, pedido de Gestión Humana): el
 * proceso entra solo cuando cumple todas las condiciones para contratar menos
 * el visto bueno de la directora, y vuelve solo a la etapa de la que venía si
 * una deja de cumplirse (se anula un documento, cambia la lista de la carpeta…).
 * Al entrar sale un correo a Gestión Humana, que lo revisa, da el visto bueno y
 * lo pasa a «Contratado».
 *
 * La etapa es un reflejo de las condiciones: si alguien lo devuelve a mano y
 * sigue cumpliendo, vuelve a subir (a más tardar con el cron de 15 minutos).
 * Con `contratar_exige_condiciones` apagado nadie se mueve solo.
 *
 * Solo servidor. Quien cambia una condición llama a `revisarListoContratar`
 * (./listo-contratar-revisar), que importa este módulo en diferido: este usa
 * las condiciones, que a su vez usan exámenes, carpeta y psicotécnica.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/correo/enviar";
import { ACTOR_SISTEMA, cambiarEstadoProceso, type ActorProceso } from "@/lib/contratacion/servidor";
import { ESTADO_LISTO, ETAPAS_ANTES_DE_LISTO, listoParaContratar, movimientoListo } from "./contratacion";
import { armarCorreoListo } from "./listo-contratar";
import { condicionesDeProceso } from "./contratacion-servidor";
import { leerConfigReporte } from "./reporte-diario-servidor";
import { leerAjustes, valorAjuste } from "./servidor";

const urlApp = () =>
  process.env.GESTIVO_ENTORNO === "desarrollo"
    ? "http://localhost:3000"
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://saas-six-vert.vercel.app";

const correos = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : []).map((x) => String(x).trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));

/**
 * A quién se le avisa: el ajuste `listo_contratar_correos`; vacío, los del
 * reporte diario. `listo_contratar_avisar` en «no» lo apaga.
 */
export async function destinatariosListo(): Promise<{ activo: boolean; para: string[]; copia: string[] }> {
  const a = await leerAjustes().catch(() => []);
  const activo = valorAjuste<unknown>(a, "listo_contratar_avisar", true) !== false;
  const propios = correos(valorAjuste<unknown>(a, "listo_contratar_correos", []));
  if (propios.length) return { activo, para: propios, copia: [] };
  const reporte = await leerConfigReporte();
  return { activo, para: reporte.para, copia: reporte.copia };
}

export interface ResultadoListo {
  movido: "sube" | "baja" | null;
  estado: string | null;
  /** Solo al subir: si salió el correo, o por qué no. */
  correo?: "enviado" | "apagado" | "sin_destinatarios" | "prueba" | string;
}

/**
 * Pone la etapa de acuerdo con las condiciones. Idempotente: si ya está donde
 * debe, no hace nada (ni repite el correo).
 */
export async function sincronizarListoContratar(procesoId: string, actor: ActorProceso = ACTOR_SISTEMA): Promise<ResultadoListo> {
  const db = createAdminClient();
  const { data: p, error } = await db.from("procesos_contratacion").select("estado, nombre, cedula, origen, vacancies(title)").eq("id", procesoId).maybeSingle();
  if (error || !p) return { movido: null, estado: null };
  const estado = String(p.estado ?? "");
  if (estado !== ESTADO_LISTO && !(ETAPAS_ANTES_DE_LISTO as readonly string[]).includes(estado)) return { movido: null, estado };

  const c = await condicionesDeProceso(procesoId);
  const { listo, faltan } = listoParaContratar(c.condiciones);
  const movimiento = movimientoListo(estado, c.exigir, listo);
  if (!movimiento) return { movido: null, estado };

  if (movimiento === "baja") {
    // A la etapa de la que venía cuando entró; si no se sabe, al reconocimiento de ruta.
    const { data: entrada } = await db
      .from("procesos_contratacion_eventos")
      .select("estado_anterior")
      .eq("proceso_id", procesoId)
      .eq("tipo", "estado")
      .eq("estado_nuevo", ESTADO_LISTO)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const anterior = String(entrada?.estado_anterior ?? "");
    const destino = (ETAPAS_ANTES_DE_LISTO as readonly string[]).includes(anterior) ? anterior : "reconocimiento_ruta";
    const r = await cambiarEstadoProceso(procesoId, destino, { actor, detalle: { automatico: true, ya_no_esta_listo: true, falta: faltan } });
    return { movido: r.cambiado ? "baja" : null, estado: r.cambiado ? destino : estado };
  }

  const r = await cambiarEstadoProceso(procesoId, ESTADO_LISTO, { actor, detalle: { automatico: true, listo_para_contratar: true } });
  // Otro lo movió al mismo tiempo: el correo sale una sola vez, con quien hizo el cambio.
  if (!r.cambiado) return { movido: null, estado: ESTADO_LISTO };
  // Los procesos del chat de prueba no avisan a nadie.
  if (p.origen === "chat_prueba") return { movido: "sube", estado: ESTADO_LISTO, correo: "prueba" };
  const destino = await destinatariosListo();
  if (!destino.activo) return { movido: "sube", estado: ESTADO_LISTO, correo: "apagado" };
  if (!destino.para.length) return { movido: "sube", estado: ESTADO_LISTO, correo: "sin_destinatarios" };
  const vacante = ((Array.isArray(p.vacancies) ? p.vacancies[0] : p.vacancies) as { title?: string } | null)?.title ?? null;
  const correo = armarCorreoListo({ nombre: String(p.nombre ?? ""), cedula: String(p.cedula ?? ""), vacante }, c.condiciones, urlApp(), process.env.GESTIVO_ENTORNO === "desarrollo");
  const envio = await enviarCorreo({ para: destino.para, copia: destino.copia, ...correo });
  if (!envio.ok) console.error("[seleccion] correo de «Listo para contratar»:", envio.error);
  return { movido: "sube", estado: ESTADO_LISTO, correo: envio.ok ? "enviado" : envio.error };
}

/**
 * Red de seguridad del cron: revisa los procesos de las últimas etapas, por si
 * cambió algo que no pasa por una acción (la lista de la carpeta, las reglas
 * de antecedentes, exigir o no la psicotécnica).
 */
export async function sincronizarListosPendientes(max = 30): Promise<{ revisados: number; suben: number; bajan: number; omitida?: string }> {
  const r = { revisados: 0, suben: 0, bajan: 0 };
  const { data, error } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id")
    .in("estado", [...ETAPAS_ANTES_DE_LISTO, ESTADO_LISTO])
    .order("updated_at", { ascending: false })
    .limit(max);
  if (error) return { ...r, omitida: `consulta: ${error.message}` };
  for (const p of data ?? []) {
    r.revisados++;
    const s = await sincronizarListoContratar(p.id as string).catch((e) => {
      console.error("[seleccion] listo para contratar:", e);
      return null;
    });
    if (s?.movido === "sube") r.suben++;
    if (s?.movido === "baja") r.bajan++;
  }
  return r;
}
