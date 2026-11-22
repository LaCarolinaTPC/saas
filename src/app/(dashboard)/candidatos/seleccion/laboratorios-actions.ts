"use server";

/**
 * Candidatos › Selección › Laboratorios (Salud Ocupacional, 21-nov-2026):
 * configuración de los laboratorios y de las plantillas en Word, envío de la
 * orden del día y el simulador (envíos y respuestas del laboratorio sin que
 * salga nada de verdad).
 */
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import { correoConfigurado } from "@/lib/correo/enviar";
import { parsearCorreos, type Laboratorio, type ModoReparto } from "@/lib/seleccion/laboratorios";
import { leerYGuardarAvisos } from "@/lib/seleccion/laboratorio-lectura";
import type { LecturaLaboratorio } from "@/lib/seleccion/laboratorio";
import {
  asignacionesRecientes, asignarLaboratorio, documentosAspirante, enviarDocumentosAspirante, enviarOrdenLaboratorio, estadoPlantillas, guardarLaboratorio,
  guardarReparto, hiloLaboratorio, leerLaboratorios, modoReparto, pendientesPrueba, planFase1, subirPlantillaCarta, subirPlantillaOrden, vistaOrden,
  type MensajeHiloLaboratorio, type ResultadoOrden, type VistaOrden,
} from "@/lib/seleccion/laboratorios-servidor";

const RUTA = "/candidatos/seleccion";
type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fallo = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function exigirConfig() {
  const perms = await getCurrentPermissions();
  if (!puedeEditarEn(perms, "candidatos.seleccion_config")) throw new Error("No tienes permiso para cambiar la configuración de la selección.");
  return perms;
}
async function exigirLectura() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("No tienes acceso a Candidatos.");
  return perms;
}
async function exigirEdicion() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !puedeEditarEn(perms, "candidatos")) throw new Error("No tienes permiso para gestionar procesos.");
  return perms;
}

export interface PantallaLaboratorios {
  laboratorios: Laboratorio[];
  plantillas: { carta: string[] | null; ordenes: Record<string, string[] | null> };
  smtp: boolean;
  puedeEditar: boolean;
  puedeEnviar: boolean;
  reparto: ModoReparto;
  /** Aspirantes asignados a cada laboratorio en los últimos 30 días. */
  asignados: Record<string, number>;
}

export async function datosLaboratorios(): Promise<Resultado<PantallaLaboratorios>> {
  try {
    const perms = await exigirLectura();
    const [laboratorios, plantillas, reparto, asignados] = await Promise.all([leerLaboratorios(), estadoPlantillas(), modoReparto(), asignacionesRecientes()]);
    return {
      ok: true,
      laboratorios,
      plantillas,
      smtp: correoConfigurado(),
      puedeEditar: puedeEditarEn(perms, "candidatos.seleccion_config"),
      puedeEnviar: puedeEditarEn(perms, "candidatos") || tienePermiso(perms, "candidatos.editar"),
      reparto,
      asignados,
    };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarLaboratorioAccion(d: {
  id?: string | null;
  nombre: string;
  direccion: string;
  telefono_contacto: string;
  canal: "whatsapp" | "correo";
  whatsapp: string;
  correos: string;
  correos_copia: string;
  asunto: string;
  activo: boolean;
  predeterminado: boolean;
  dias_atencion: number[];
  dias_preferidos: number[];
  porcentaje: number;
}): Promise<Resultado<{ id: string }>> {
  try {
    const perms = await exigirConfig();
    const r = await guardarLaboratorio(
      { ...d, correos: parsearCorreos(d.correos), correos_copia: parsearCorreos(d.correos_copia), canal: d.canal === "whatsapp" ? "whatsapp" : "correo" },
      perms.userEmail
    );
    revalidatePath(RUTA);
    return r.ok ? { ok: true, id: r.id! } : { ok: false, error: r.error ?? "No se pudo guardar." };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarRepartoAccion(modo: ModoReparto): Promise<Resultado> {
  try {
    const perms = await exigirConfig();
    const r = await guardarReparto(modo, perms.userEmail);
    revalidatePath(RUTA);
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? "No se pudo guardar." };
  } catch (e) {
    return fallo(e);
  }
}

/** Simulador: a qué laboratorio y qué día iría un aspirante que pasa a exámenes con esa fecha propuesta (no asigna nada). */
export async function simularRepartoAccion(fecha: string): Promise<Resultado<{ fecha: string; laboratorio: string | null; motivo: string }>> {
  try {
    await exigirLectura();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha no válida." };
    const p = await planFase1(fecha);
    return { ok: true, fecha: p.fecha, laboratorio: p.laboratorio?.nombre ?? null, motivo: p.motivo };
  } catch (e) {
    return fallo(e);
  }
}

async function archivoDe(form: FormData): Promise<Buffer> {
  const f = form.get("archivo");
  if (!(f instanceof File) || !f.size) throw new Error("Elija el archivo de Word (.docx).");
  if (f.size > 8_000_000) throw new Error("El archivo pesa más de 8 MB.");
  return Buffer.from(await f.arrayBuffer());
}

export async function subirPlantillaOrdenAccion(labId: string, form: FormData): Promise<Resultado<{ marcas: string[] }>> {
  try {
    const perms = await exigirConfig();
    const r = await subirPlantillaOrden(String(labId), await archivoDe(form), perms.userEmail);
    revalidatePath(RUTA);
    return r.ok ? { ok: true, marcas: r.marcas ?? [] } : { ok: false, error: r.error ?? "No se pudo subir." };
  } catch (e) {
    return fallo(e);
  }
}

export async function subirPlantillaCartaAccion(form: FormData): Promise<Resultado<{ marcas: string[] }>> {
  try {
    const perms = await exigirConfig();
    const r = await subirPlantillaCarta(await archivoDe(form), perms.userEmail);
    revalidatePath(RUTA);
    return r.ok ? { ok: true, marcas: r.marcas ?? [] } : { ok: false, error: r.error ?? "No se pudo subir." };
  } catch (e) {
    return fallo(e);
  }
}

export interface ProcesoSimulador {
  id: string;
  nombre: string;
  cedula: string;
  estado: string;
  prueba: boolean;
  laboratorioId: string | null;
  candidateId: string | null;
}

/** Aspirantes en exámenes (incluye los del chat de prueba) para el simulador. */
export async function procesosEnExamenesAccion(): Promise<ProcesoSimulador[]> {
  await exigirLectura();
  const { data, error } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id, nombre, cedula, estado, origen, laboratorio_id, candidate_id")
    .in("estado", ["en_examenes", "en_examenes_fase2"])
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nombre: String(p.nombre ?? ""),
    cedula: String(p.cedula ?? ""),
    estado: p.estado as string,
    prueba: p.origen === "chat_prueba",
    laboratorioId: (p.laboratorio_id as string | null) ?? null,
    candidateId: (p.candidate_id as string | null) ?? null,
  }));
}

export async function asignarLaboratorioAccion(procesoId: string, laboratorioId: string | null): Promise<Resultado> {
  try {
    const perms = await exigirEdicion();
    const r = await asignarLaboratorio(String(procesoId), laboratorioId ? String(laboratorioId) : null, actorUsuario(perms));
    revalidatePath("/candidatos");
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? "No se pudo guardar." };
  } catch (e) {
    return fallo(e);
  }
}

export interface DocumentoDescarga {
  tipo: "orden" | "carta";
  nombre: string;
  base64: string;
  faltan: string[];
}

/** La orden y la carta del aspirante, listas para descargar (ficha y simulador). */
export async function documentosAspiranteAccion(procesoId: string): Promise<Resultado<{ documentos: DocumentoDescarga[]; avisos: string[] }>> {
  try {
    await exigirLectura();
    const { documentos, avisos } = await documentosAspirante(String(procesoId));
    return { ok: true, avisos, documentos: documentos.map((d) => ({ tipo: d.tipo, nombre: d.nombre, base64: d.docx.toString("base64"), faltan: d.faltan })) };
  } catch (e) {
    return fallo(e);
  }
}

/** Envía (o simula) la orden y la carta al aspirante, para su cita de fase 1 vigente. */
export async function enviarDocumentosAccion(procesoId: string, simular: boolean): Promise<Resultado<{ resultado: string; documentos: string[]; avisos: string[] }>> {
  try {
    await exigirEdicion();
    const { data: cita } = await createAdminClient()
      .from("seleccion_citas")
      .select("id")
      .eq("proceso_id", String(procesoId))
      .eq("tipo", "examen_f1")
      .not("estado", "in", "(reprogramada,cancelada)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cita) return { ok: false, error: "El aspirante no tiene cita de fase 1." };
    const r = await enviarDocumentosAspirante(cita.id as string, { simular, forzar: true });
    return { ok: true, resultado: r.resultado, documentos: r.documentos.map((d) => d.nombre), avisos: r.avisos };
  } catch (e) {
    return fallo(e);
  }
}

export async function vistaOrdenAccion(labId: string, fecha: string, incluirPrueba: boolean): Promise<VistaOrden | null> {
  await exigirLectura();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  return vistaOrden(String(labId), fecha, { incluirPrueba, incluirEnviadas: true });
}

export async function enviarOrdenAccion(labId: string, fecha: string, simular: boolean): Promise<Resultado<{ resultado: ResultadoOrden }>> {
  try {
    const perms = await exigirEdicion();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha no válida." };
    const r = await enviarOrdenLaboratorio(String(labId), fecha, actorUsuario(perms), { simular });
    revalidatePath("/candidatos");
    return r.ok ? { ok: true, resultado: r } : { ok: false, error: r.error ?? "No se pudo enviar." };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Simula un mensaje del laboratorio (texto y, si quiere, un PDF o una foto):
 * pasa por la misma lectura que un mensaje real de WhatsApp y deja el aviso
 * en «Avisos del laboratorio» para confirmarlo.
 */
export async function simularRespuestaLaboratorioAccion(labId: string, form: FormData): Promise<Resultado<{ avisos: number; lecturas: LecturaLaboratorio[] }>> {
  try {
    await exigirEdicion();
    const texto = String(form.get("texto") ?? "").trim().slice(0, 4000);
    const f = form.get("archivo");
    let mediaPath: string | null = null;
    let mime: string | null = null;
    let nombreArchivo: string | null = null;
    if (f instanceof File && f.size) {
      if (f.size > 8_000_000) return { ok: false, error: "El archivo pesa más de 8 MB." };
      mime = (f.type || "application/octet-stream").split(";")[0];
      if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mime)) return { ok: false, error: "Suba un PDF o una foto (JPG o PNG)." };
      nombreArchivo = f.name || "resultado";
      const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1].replace("jpeg", "jpg");
      mediaPath = `simulacion-laboratorio/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await createAdminClient().storage.from("whatsapp").upload(mediaPath, Buffer.from(await f.arrayBuffer()), { contentType: mime });
      if (error) return { ok: false, error: `No se pudo guardar el archivo (${error.message}).` };
    }
    if (!texto && !mediaPath) return { ok: false, error: "Escriba el mensaje del laboratorio o adjunte un archivo." };
    const r = await leerYGuardarAvisos({ texto, mediaPath, mime, nombreArchivo, laboratorioId: labId ? String(labId) : null, simulado: true });
    revalidatePath("/candidatos");
    return { ok: true, avisos: r.avisos, lecturas: r.lecturas };
  } catch (e) {
    return fallo(e);
  }
}

/** El laboratorio del aspirante y la lista para elegir (ficha del candidato). */
export async function laboratorioDelProcesoAccion(procesoId: string): Promise<{ laboratorios: { id: string; nombre: string }[]; laboratorioId: string | null; predeterminado: string | null } | null> {
  await exigirLectura();
  const [labs, { data, error }] = await Promise.all([
    leerLaboratorios(),
    createAdminClient().from("procesos_contratacion").select("laboratorio_id").eq("id", String(procesoId)).maybeSingle(),
  ]);
  if (error || !labs.length) return null;
  return {
    laboratorios: labs.filter((l) => l.activo).map((l) => ({ id: l.id, nombre: l.nombre })),
    laboratorioId: (data?.laboratorio_id as string | null) ?? null,
    predeterminado: labs.find((l) => l.activo && l.predeterminado)?.nombre ?? null,
  };
}

// ── Chat de prueba: la conversación con cada laboratorio ────────────────────

/** Lo que se le envió (simulado) al laboratorio y lo que respondió, en el chat de prueba. */
export async function hiloLaboratorioPruebaAccion(labId: string): Promise<MensajeHiloLaboratorio[]> {
  await exigirLectura();
  return hiloLaboratorio(String(labId), { soloPrueba: true });
}

/** Días con candidatos de prueba citados en ese laboratorio sin la orden enviada. */
export async function pendientesPruebaAccion(labId: string): Promise<{ fecha: string; citaIds: string[]; nombres: string[] }[]> {
  await exigirLectura();
  return pendientesPrueba(String(labId));
}

/** Simula el envío de la orden al laboratorio para los candidatos de prueba de ese día (queda en la conversación). */
export async function enviarOrdenPruebaAccion(labId: string, fecha: string, citaIds: string[]): Promise<Resultado<{ detalle: string[] }>> {
  try {
    const perms = await exigirEdicion();
    const pendientes = await pendientesPrueba(String(labId));
    const permitidas = new Set(pendientes.flatMap((p) => p.citaIds));
    const ids = citaIds.map(String).filter((id) => permitidas.has(id));
    if (!ids.length) return { ok: false, error: "No hay candidatos de prueba pendientes ese día en este laboratorio." };
    const r = await enviarOrdenLaboratorio(String(labId), fecha, actorUsuario(perms), { citaIds: ids });
    return r.ok ? { ok: true, detalle: r.detalle } : { ok: false, error: r.error ?? "No se pudo simular." };
  } catch (e) {
    return fallo(e);
  }
}
