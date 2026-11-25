/**
 * Recordatorio de documentos pendientes (entrega 3, H1): desde la prueba de
 * manejo, cada `documentos_pendientes_dias` le recuerda al aspirante lo que
 * le falta entregar de la carpeta, con el mensaje «documentos_pendientes» del
 * catálogo (que está en modo «revisar»: queda como borrador para que una
 * persona lo envíe). Lo llama el cron con `intentar()`.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTOR_SISTEMA, registrarEvento } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { avisarProceso } from "./agenda-servidor";
import { estadosCarpeta, itemsCarpeta } from "./carpeta-servidor";
import { topeAlcanzado } from "./consumos-servidor";
import { leerAjustes, valorAjuste } from "./servidor";
import { ITEM_CERTIFICADO } from "./certificado-banco";

const ESTADOS = ["en_escuela", "en_examenes", "en_examenes_fase2", "reconocimiento_ruta", "listo_contratar"];
const MAX_POR_CORRIDA = 30;

export interface ResultadoDocumentos {
  recordados: number;
  omitida?: string;
}

export async function ejecutarDocumentosPendientes(ahora: Date = new Date()): Promise<ResultadoDocumentos> {
  const r: ResultadoDocumentos = { recordados: 0 };
  if (await topeAlcanzado()) return { ...r, omitida: "tope mensual del gasto alcanzado" };
  const dias = Math.max(1, Number(valorAjuste<unknown>(await leerAjustes(), "documentos_pendientes_dias", 2)) || 2);
  const limite = new Date(ahora.getTime() - dias * 86_400_000).toISOString();
  const db = createAdminClient();
  const { data, error } = await db
    .from("procesos_contratacion")
    .select("id, fecha_prueba_manejo, documentos_recordatorio_at")
    .in("estado", ESTADOS)
    .neq("origen", "chat_prueba")
    .not("fecha_prueba_manejo", "is", null)
    .or(`documentos_recordatorio_at.is.null,documentos_recordatorio_at.lt.${limite}`)
    .limit(200);
  // Sin la migración de la entrega 3 no existe documentos_recordatorio_at.
  if (error) return { ...r, omitida: `consulta: ${error.message}` };
  // El certificado bancario tiene su propio recordatorio (24-nov-2026): no se repite aquí.
  const { leerAjustesCertificado } = await import("./certificado-banco-servidor");
  const conRecordatorioPropio = (await leerAjustesCertificado()).activo;
  const items = (await itemsCarpeta()).filter((i) => !(conRecordatorioPropio && i === ITEM_CERTIFICADO));
  const hoy = fechaBogota(ahora.toISOString());

  for (const p of data ?? []) {
    if (r.recordados >= MAX_POR_CORRIDA) break;
    // El primero, `dias` después de la prueba de manejo.
    if (!p.documentos_recordatorio_at && String(p.fecha_prueba_manejo) > fechaBogota(limite)) continue;
    const estados = await estadosCarpeta(p.id as string);
    const pendientes = items.filter((i) => (estados.find((e) => e.item === i)?.estado ?? "pendiente") === "pendiente");
    if (!pendientes.length) continue;
    // Se reserva antes de avisar: dos corridas a la vez no lo repiten.
    let reserva = db.from("procesos_contratacion").update({ documentos_recordatorio_at: ahora.toISOString() }).eq("id", p.id);
    reserva = p.documentos_recordatorio_at ? reserva.eq("documentos_recordatorio_at", p.documentos_recordatorio_at) : reserva.is("documentos_recordatorio_at", null);
    const { data: tomada } = await reserva.select("id");
    if (!tomada?.length) continue;
    const { envio } = await avisarProceso(p.id as string, "documentos_pendientes", { fecha: hoy, hora: "08:00" }, { directo: false, extra: { pendientes: pendientes.join(", ") } });
    await registrarEvento(p.id as string, { tipo: "carpeta", detalle: { recordatorio_documentos: pendientes, envio } }, ACTOR_SISTEMA);
    r.recordados++;
  }
  return r;
}
