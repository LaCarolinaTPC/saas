/**
 * Candidatos › Exámenes fase 2 (27-nov-2026): quienes están en la fase 2 de
 * exámenes, con su cita en el laboratorio (si recibió el recordatorio, si
 * confirmó o pidió otra fecha), para registrar el resultado a mano. Los
 * resultados de la fase 2 son médicos: siempre los registra una persona.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { citaVigente, hhmm, type Cita } from "./agenda";
import { leerLaboratorios } from "./laboratorios-servidor";

export type GrupoFase2 = "registrar" | "proximas" | "aplazados" | "sin_cita";

export interface AspiranteFase2 {
  procesoId: string;
  nombre: string;
  cedula: string;
  celular: string | null;
  prueba: boolean;
  laboratorio: string | null;
  cita: { fecha: string; hora: string; estado: string; recordatorio: boolean; confirmadaAt: string | null } | null;
  /** Resultado aplazado de la fase 2, si lo hay (espera el concepto definitivo). */
  aplazado: { observacion: string | null } | null;
  /** Fecha del apto de la fase 1. */
  fase1: string | null;
  grupo: GrupoFase2;
}

export async function pantallaFase2(opciones: { incluirPrueba?: boolean } = {}): Promise<{ aspirantes: AspiranteFase2[]; hoy: string }> {
  const db = createAdminClient();
  const hoy = fechaBogota(new Date().toISOString());
  const { data: procs } = await db
    .from("procesos_contratacion")
    .select("id, nombre, cedula, celular, origen, laboratorio_id")
    .eq("estado", "en_examenes_fase2")
    .order("updated_at", { ascending: true })
    .limit(300);
  const procesos = ((procs ?? []) as { id: string; nombre: string | null; cedula: string | null; celular: string | null; origen: string | null; laboratorio_id: string | null }[]).filter(
    (p) => opciones.incluirPrueba || p.origen !== "chat_prueba"
  );
  const ids = procesos.map((p) => p.id);
  if (!ids.length) return { aspirantes: [], hoy };
  const [citasR, examenesR, labs] = await Promise.all([
    db.from("seleccion_citas").select("*").in("proceso_id", ids).eq("tipo", "examen_f2"),
    db.from("seleccion_examenes").select("proceso_id, fase, resultado, observacion, fecha").in("proceso_id", ids),
    leerLaboratorios().catch(() => []),
  ]);
  const nombreLab = new Map(labs.map((l) => [l.id, l.nombre]));
  const predeterminado = labs.find((l) => l.activo && l.predeterminado)?.nombre ?? null;
  const citas = (citasR.data ?? []) as Cita[];
  const examenes = (examenesR.data ?? []) as { proceso_id: string; fase: number; resultado: string; observacion: string | null; fecha: string | null }[];
  const aspirantes = procesos.map((p): AspiranteFase2 => {
    const c = citas
      .filter((x) => x.proceso_id === p.id && citaVigente(x))
      .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`))[0];
    const f2 = examenes.find((e) => e.proceso_id === p.id && e.fase === 2);
    const f1 = examenes.find((e) => e.proceso_id === p.id && e.fase === 1);
    const aplazado = f2?.resultado === "aplazado" ? { observacion: f2.observacion } : null;
    const grupo: GrupoFase2 = aplazado ? "aplazados" : !c ? "sin_cita" : c.fecha <= hoy ? "registrar" : "proximas";
    return {
      procesoId: p.id,
      nombre: String(p.nombre ?? "").trim() || `Aspirante CC ${p.cedula ?? ""}`,
      cedula: String(p.cedula ?? ""),
      celular: p.celular,
      prueba: p.origen === "chat_prueba",
      laboratorio: (p.laboratorio_id ? nombreLab.get(p.laboratorio_id) : null) ?? predeterminado,
      cita: c ? { fecha: c.fecha, hora: hhmm(c.hora), estado: c.estado, recordatorio: !!c.recordatorio_at, confirmadaAt: c.confirmada_at ?? null } : null,
      aplazado,
      fase1: f1?.fecha ?? null,
      grupo,
    };
  });
  // Las de hoy y antes primero, por la fecha de la cita.
  aspirantes.sort((a, b) => (a.cita?.fecha ?? "9999").localeCompare(b.cita?.fecha ?? "9999"));
  return { aspirantes, hoy };
}
