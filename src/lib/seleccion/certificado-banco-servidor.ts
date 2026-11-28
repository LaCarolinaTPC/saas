/**
 * Recordatorio del certificado bancario (24-nov-2026). Solo servidor; la regla
 * está en ./certificado-banco. Lo llama el cron dentro del horario de los
 * recordatorios de WhatsApp.
 *
 * No necesita columnas nuevas: la cuenta de recordatorios sale del historial
 * del proceso (eventos `dato` con `certificado_banco`), lo que falta del ítem
 * «Certificado bancario» de la carpeta y si ya se leyó un certificado que
 * mandó (seleccion_lecturas).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { enHorario } from "@/lib/comunicaciones/seguimiento";
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { avisarProceso, type EnvioAgenda } from "./agenda-servidor";
import { leerAjustes, valorAjuste } from "./servidor";
import { ESTADOS_CERTIFICADO, ITEM_CERTIFICADO, accionCertificado, ajustesCertificado, type AjustesCertificado } from "./certificado-banco";

const ACTOR_SISTEMA: ActorProceso = { tipo: "sistema", userId: null, userEmail: "Sistema" };
const MAX_POR_VUELTA = 40;
export const MENSAJE_RECORDATORIO_CERTIFICADO = "recordatorio_certificado_banco";

export async function leerAjustesCertificado(): Promise<AjustesCertificado> {
  const ajustes = await leerAjustes().catch(() => []);
  return ajustesCertificado((clave) => valorAjuste<unknown>(ajustes, clave, undefined));
}

/** No salió y hay que intentarlo en la próxima vuelta (plantilla sin aprobar o falta un dato). */
const reintentar = (e: EnvioAgenda) => e === "sin_plantilla" || e === "falta_dato" || e === "sin_catalogo";

export interface ResultadoCertificado {
  recordatorios: number;
  escalados: number;
  omitida?: string;
}

export async function ejecutarRecordatoriosCertificado(ahora = new Date(), opciones: { soloProcesos?: string[]; sinHorario?: boolean } = {}): Promise<ResultadoCertificado> {
  const r: ResultadoCertificado = { recordatorios: 0, escalados: 0 };
  const a = await leerAjustesCertificado();
  if (!a.activo) return { ...r, omitida: "apagado en Tiempos y reglas" };
  if (!opciones.sinHorario) {
    const { config } = await leerConfigSeguimiento();
    if (!enHorario(ahora, config.horaDesde, config.horaHasta)) return { ...r, omitida: "fuera del horario de los recordatorios" };
  }
  const db = createAdminClient();
  let consulta = db
    .from("procesos_contratacion")
    .select("id, estado, banco_cuenta, banco_respondido_at")
    .in("estado", [...ESTADOS_CERTIFICADO])
    .in("banco_cuenta", ["si", "no"])
    .not("banco_respondido_at", "is", null)
    .order("banco_respondido_at", { ascending: true })
    .limit(300);
  if (opciones.soloProcesos) consulta = consulta.in("id", opciones.soloProcesos);
  const { data: procesos, error } = await consulta;
  // Sin la migración 20261124194635 no existen las columnas del banco.
  if (error) return { ...r, omitida: `consulta: ${error.message}` };
  if (!procesos?.length) return r;
  const ids = procesos.map((p) => p.id as string);

  const [items, eventos, lecturas] = await Promise.all([
    db.from("seleccion_carpeta_items").select("proceso_id, estado").eq("item", ITEM_CERTIFICADO).in("proceso_id", ids),
    db.from("procesos_contratacion_eventos").select("proceso_id, detalle, created_at").eq("tipo", "dato").in("proceso_id", ids).not("detalle->>certificado_banco", "is", null),
    db.from("seleccion_lecturas").select("proceso_id, clase, resumen").in("proceso_id", ids).eq("estado", "leido").or('clase.eq.certificado_bancario,resumen.ilike."Certificado bancario:*"'),
  ]);
  const itemDe = new Map((items.data ?? []).map((i) => [i.proceso_id as string, i.estado as string]));
  const enviados = new Set((lecturas.data ?? []).map((l) => l.proceso_id as string));
  const cuenta = new Map<string, { n: number; ultimo: string | null; escalado: boolean }>();
  for (const e of eventos.data ?? []) {
    const id = e.proceso_id as string;
    const c = cuenta.get(id) ?? { n: 0, ultimo: null, escalado: false };
    const tipo = (e.detalle as Record<string, unknown> | null)?.certificado_banco;
    if (tipo === "recordatorio") {
      c.n++;
      if (!c.ultimo || String(e.created_at) > c.ultimo) c.ultimo = String(e.created_at);
    } else if (tipo === "sin_respuesta") c.escalado = true;
    cuenta.set(id, c);
  }

  let hechos = 0;
  for (const p of procesos) {
    if (hechos >= MAX_POR_VUELTA) break;
    const id = p.id as string;
    const c = cuenta.get(id) ?? { n: 0, ultimo: null, escalado: false };
    const accion = accionCertificado(
      {
        estado: p.estado as string,
        banco_cuenta: p.banco_cuenta as string | null,
        banco_respondido_at: p.banco_respondido_at as string | null,
        itemEstado: itemDe.get(id) ?? null,
        enviado: enviados.has(id),
        recordatorios: c.n,
        ultimoAt: c.ultimo,
        escalado: c.escalado,
      },
      a,
      ahora
    );
    if (!accion) continue;
    hechos++;
    if (accion === "recordar") {
      const { envio } = await avisarProceso(id, MENSAJE_RECORDATORIO_CERTIFICADO, { fecha: fechaBogota(ahora.toISOString()), hora: "08:00" }, { directo: false });
      if (reintentar(envio)) continue;
      await registrarEvento(id, { tipo: "dato", detalle: { certificado_banco: "recordatorio", vez: c.n + 1, envio } }, ACTOR_SISTEMA);
      r.recordatorios++;
    } else {
      await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("proceso_id", id);
      await registrarEvento(id, { tipo: "dato", detalle: { certificado_banco: "sin_respuesta" } }, ACTOR_SISTEMA);
      r.escalados++;
    }
  }
  return r;
}
