/**
 * «Lo revisé a mano» (solo servidor): el visto bueno de una persona cuando
 * Croma no respondió una fuente y la revisó en el portal oficial (pedido de GH
 * del 18-nov-2026). Queda como una consulta más del proceso, marcada «revisión
 * manual», con la nota y el certificado en PDF si lo adjunta. Desde ahí esa
 * fuente cuenta como respondida: ni el cron ni el asistente la vuelven a
 * consultar en Croma para este proceso, y el proceso sigue solo (listo para
 * citar, revisión de antecedentes).
 *
 * Separado de la acción el 26-nov-2026 para poder probarlo de punta a punta
 * (scripts/seleccion-probar-servicio-caido.mts). Lo llaman la ficha en
 * Candidatos, en Comunicaciones y en el chat de prueba. No toca la
 * conversación: no pausa al asistente.
 */
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { marcarListoParaCitar, marcarRevisionAntecedentes, reevaluarPreseleccion } from "@/lib/seleccion/servidor";
import { categoriasDeLicencia } from "@/lib/seleccion/preseleccion";
import { limpiarRegistros, type RegistroCertificado } from "@/lib/verificacion/lectura-certificado";
import { completarConductaRnmc } from "@/lib/verificacion/rnmc-portal";

export const FUENTES_REVISION = ["policia", "procuraduria", "contraloria", "rnmc", "simit", "runt"] as const;
export type FuenteRevision = (typeof FUENTES_REVISION)[number];

export interface DatosRevisionManual {
  hallazgo: boolean;
  valor?: number | null;
  nota?: string | null;
  pdf?: { base64: string; nombre?: string | null } | null;
  /** RUNT (24-nov-2026): la licencia revisada en el portal o en la foto que mandó el aspirante. */
  licencia?: { categoria: string; vence?: string | null; restricciones?: string | null } | null;
  /**
   * Lo que la IA leyó del certificado (27-nov-2026): el veredicto y cada anotación.
   * Se guarda donde las reglas lo buscan, para contar las medidas del RNMC, buscar
   * las palabras de cada fuente y aplicar las tolerancias de la Contraloría.
   */
  lectura?: { veredicto?: string | null; registros?: unknown } | null;
}

/** Medidas que el certificado da por cumplidas: no son «pendientes por cumplir». */
const CUMPLIDA = /cumplid|pagad|archivad|terminad|cerrad|revocad/i;

/**
 * El detalle leído, con las claves que entienden las reglas (`accionDeHallazgo`,
 * `textoParaPalabras`). Puro. Sin hallazgo, el RNMC queda sin medidas.
 */
export function detalleParaReglas(fuente: FuenteRevision, hallazgo: boolean, l: DatosRevisionManual["lectura"]): Record<string, unknown> {
  if (!l) return {};
  const registros: RegistroCertificado[] = limpiarRegistros(l.registros);
  const status = typeof l.veredicto === "string" && l.veredicto.trim() ? l.veredicto.trim().slice(0, 300) : undefined;
  const conStatus = status ? { status } : {};
  switch (fuente) {
    case "rnmc": {
      if (!hallazgo) return { ...conStatus, pending_measures: [] };
      const pendientes = registros.filter((r) => !CUMPLIDA.test(String(r.estado ?? "")));
      // Si todas dicen «cumplida» pero la persona marcó hallazgo, cuentan todas (lo decide quien revisa).
      const medidas = pendientes.length ? pendientes : registros;
      return medidas.length ? { ...conStatus, pending_measures: medidas } : conStatus;
    }
    case "contraloria":
      return {
        ...conStatus,
        ...(hallazgo && registros.length ? { records: registros.map((r) => ({ ...r, amount: r.valor ?? null, ruling_date: r.fecha ?? null })) } : {}),
      };
    case "policia":
    case "procuraduria":
    case "simit":
      return { ...conStatus, ...(hallazgo && registros.length ? { records: registros } : {}) };
    default:
      return {};
  }
}

/** Corre después de responder (after de Next); fuera de una petición (baterías), enseguida. */
function diferir(fn: () => Promise<unknown>) {
  try {
    after(fn);
  } catch {
    void fn();
  }
}

export async function revisarFuenteManual(
  procesoId: string,
  fuente: FuenteRevision,
  d: DatosRevisionManual,
  actor: ActorProceso
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!FUENTES_REVISION.includes(fuente)) return { ok: false, error: "Fuente no válida." };
    const admin = createAdminClient();
    const { data: p } = await admin.from("procesos_contratacion").select("id, cedula, nombre, estado").eq("id", procesoId).maybeSingle();
    if (!p) return { ok: false, error: "El proceso no existe." };
    const cedula = String(p.cedula ?? "").replace(/\D/g, "");
    const nota = String(d.nota ?? "").trim().slice(0, 500) || null;
    if (d.hallazgo && !nota && fuente !== "simit") return { ok: false, error: "Escribe qué encontraste." };
    const valor = fuente === "simit" ? Math.max(0, Math.round(Number(d.valor ?? 0))) : null;
    if (fuente === "simit" && !Number.isFinite(valor)) return { ok: false, error: "Escribe el valor del SIMIT (0 si no tiene deuda)." };
    // RUNT: la categoría es obligatoria; una licencia vencida no se da por buena aquí.
    let licencia: { categorias: string[]; vence: string | null; restricciones: string | null } | null = null;
    if (fuente === "runt") {
      const categorias = categoriasDeLicencia(d.licencia?.categoria ?? null);
      if (!categorias.length) return { ok: false, error: "Escribe la categoría de la licencia (por ejemplo, C2)." };
      const vence = String(d.licencia?.vence ?? "").trim() || null;
      if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) return { ok: false, error: "La fecha de vencimiento no es válida." };
      const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
      if (vence && vence < hoy) return { ok: false, error: "La licencia está vencida: si es así, cierre el proceso por la licencia." };
      licencia = { categorias, vence, restricciones: String(d.licencia?.restricciones ?? "").trim().slice(0, 200) || null };
    }

    // Certificado en PDF (opcional): al bucket privado, junto a los documentos del proceso.
    let pdfPath: string | null = null;
    if (d.pdf?.base64) {
      const b64 = d.pdf.base64;
      if (typeof b64 !== "string" || !b64.startsWith("JVBERi0")) return { ok: false, error: "El archivo no es un PDF." };
      if (b64.length > 950_000) return { ok: false, error: "El PDF pesa más de 700 KB: no se puede subir desde aquí." };
      pdfPath = `procesos/${procesoId}/${Date.now()}-${fuente}-manual.pdf`;
      const { error: eSubida } = await admin.storage.from("whatsapp").upload(pdfPath, Buffer.from(b64, "base64"), { contentType: "application/pdf", upsert: false });
      if (eSubida) return { ok: false, error: `No se pudo guardar el PDF (${eSubida.message}).` };
    }

    // Con la forma que entiende la evaluación de antecedentes (hallazgoDe).
    let detalle = detalleParaReglas(fuente, fuente === "simit" ? (valor ?? 0) > 0 : d.hallazgo, d.lectura);
    // RNMC con expediente y sin la conducta (el PDF solo trae la tabla): se busca en el portal (27-nov-2026).
    if (fuente === "rnmc" && d.hallazgo) detalle = await completarConductaRnmc(detalle);
    const base = { manual: true, nota, revisado_por: actor.userEmail ?? null, ...detalle, ...(d.lectura ? { leido_por_ia: true } : {}) };
    const { data: fx } = await admin.from("procesos_contratacion").select("cedula_fecha_expedicion").eq("id", procesoId).maybeSingle();
    const resultado =
      fuente === "policia"
        ? { ...base, has_records: d.hallazgo }
        : fuente === "procuraduria"
          ? { ...base, found: true, has_records: d.hallazgo }
          : fuente === "contraloria"
            ? { ...base, is_fiscal_responsible: d.hallazgo }
            : fuente === "rnmc"
              ? { ...base, found: true, full_name: String(p.nombre ?? "").trim() || "REVISIÓN MANUAL", has_pending_measures: d.hallazgo, fecha_expedicion_consultada: (fx?.cedula_fecha_expedicion as string | null) ?? undefined }
              : fuente === "runt"
                ? { ...base, ...licencia }
                : { ...base, summary: { total: valor } };
    // Lo que seguía en curso en Croma para esta fuente ya no se espera.
    await admin
      .from("verificaciones_externas")
      .update({ estado: "error", error: "Reemplazada por la revisión manual." })
      .eq("proceso_id", procesoId)
      .eq("fuente", fuente)
      .eq("estado", "pendiente");
    // Guardada dos veces seguidas (la ficha tardó y se volvió a guardar): la anterior se reemplaza.
    await admin
      .from("verificaciones_externas")
      .delete()
      .eq("proceso_id", procesoId)
      .eq("fuente", fuente)
      .eq("proveedor", "manual")
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    const { error } = await admin.from("verificaciones_externas").insert({
      proceso_id: procesoId,
      cedula,
      proveedor: "manual",
      fuente,
      estado: fuente === "simit" && (valor ?? 0) > 0 ? "hallazgo" : "ok",
      valor,
      resultado,
      pdf_path: pdfPath,
      error: null,
      consultado_por: `${actor.userEmail ?? "Usuario"} (revisión manual)`,
    });
    if (error) return { ok: false, error: error.message };
    // H1 (25-nov-2026): el certificado también queda en la carpeta del aspirante (bucket «seleccion»).
    if (d.pdf?.base64) {
      const { ITEM_CERTIFICADOS_ANTECEDENTES, guardarAdjuntoSeleccion, tipoDeItem } = await import("@/lib/seleccion/carpeta-servidor");
      const nombres: Record<string, string> = { policia: "Policía", procuraduria: "Procuraduría", contraloria: "Contraloría", rnmc: "RNMC", runt: "RUNT", simit: "SIMIT" };
      await guardarAdjuntoSeleccion(
        { procesoId, tipo: tipoDeItem(ITEM_CERTIFICADOS_ANTECEDENTES), nombre: `Certificado ${nombres[fuente] ?? fuente} (revisión manual).pdf`, mime: "application/pdf", buffer: Buffer.from(d.pdf.base64, "base64") },
        actor
      ).catch((e) => console.error("[seleccion] certificado de antecedentes a la carpeta:", e));
    }
    if (fuente === "simit") {
      await admin.from("procesos_contratacion").update({ simit: (valor ?? 0) > 0 ? "deuda" : "ok", simit_valor: valor ?? 0 }).eq("id", procesoId);
    }
    if (fuente === "runt" && licencia) {
      // La licencia queda verificada por una persona: cuenta como el RUNT para avanzar y para citar.
      await admin
        .from("procesos_contratacion")
        .update({ licencia_categoria: licencia.categorias.join(", "), licencia_verificada_runt: true, ...(licencia.restricciones ? { licencia_restricciones: licencia.restricciones } : {}) })
        .eq("id", procesoId);
    }
    await registrarEvento(
      procesoId,
      { tipo: "dato", detalle: { revision_manual: { fuente, hallazgo: fuente === "runt" ? false : d.hallazgo, valor, nota, pdf: Boolean(pdfPath), ...(licencia ? { licencia } : {}) } } },
      actor
    );
    await reevaluarPreseleccion(procesoId);
    await marcarListoParaCitar(procesoId).catch(() => false);
    // El aviso al aspirante (WhatsApp) y el correo a Gestión Humana, después de responder
    // (27-nov-2026): con una anotación esperaba a Meta y la ficha tardaba un montón.
    diferir(() => marcarRevisionAntecedentes(procesoId).catch(() => null));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar la revisión." };
  }
}
