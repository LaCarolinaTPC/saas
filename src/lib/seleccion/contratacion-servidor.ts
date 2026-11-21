/**
 * Condiciones para contratar (entrega 3, H2): lee lo que hace falta y lo pasa
 * por `condicionesContratar` (./contratacion, puro). Lo usa
 * `cambiarEstadoProceso` al pasar a «Contratado» y la ficha para mostrar qué
 * falta. Solo servidor; quien llama revisa los permisos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { rutasAprendidas } from "./agenda";
import { leerAjustesAgenda } from "./agenda-servidor";
import { estadosCarpeta, itemsCarpeta } from "./carpeta-servidor";
import { condicionesContratar, type Condicion } from "./contratacion";
import { examenesDeProceso } from "./examenes-servidor";
import { psicotecnicaDeProceso } from "./dia-contratacion-servidor";
import { leerAjustes, valorAjuste } from "./servidor";

export interface CondicionesProceso {
  /** Ajuste `contratar_exige_condiciones`: en «no» no se exige nada. */
  exigir: boolean;
  ok: boolean;
  condiciones: Condicion[];
  faltan: string[];
  aprobadaPor: string | null;
  aprobadaAt: string | null;
}

/** Qué cumple y qué le falta al proceso para contratarlo. */
export async function condicionesDeProceso(procesoId: string): Promise<CondicionesProceso> {
  const db = createAdminClient();
  const [ajustes, agenda, examenes, items, carpeta, salidas, proc] = await Promise.all([
    leerAjustes().catch(() => []),
    leerAjustesAgenda(),
    examenesDeProceso(procesoId),
    itemsCarpeta(),
    estadosCarpeta(procesoId),
    db.from("seleccion_reconocimientos_ruta").select("ruta, resultado").eq("proceso_id", procesoId),
    db.from("procesos_contratacion").select("cedula, reingreso, aprobacion_contratacion_at, aprobacion_contratacion_por").eq("id", procesoId).maybeSingle(),
  ]);
  // Sin la migración de la entrega 3 no hay columnas de aprobación ni tablas: no se exige nada.
  const sinMigracion = examenes == null || proc.error != null;
  const exigir = !sinMigracion && valorAjuste<unknown>(ajustes, "contratar_exige_condiciones", true) !== false;
  const exigePsicotecnica = valorAjuste<unknown>(ajustes, "contratar_exige_psicotecnica", false) === true;
  const p = proc.data as { cedula: string; reingreso: boolean | null; aprobacion_contratacion_at: string | null; aprobacion_contratacion_por: string | null } | null;
  // La de Gestivo con concepto de la psicóloga o la de una IPS: vale la más reciente (entrega 4).
  const psico = exigePsicotecnica && p ? (await psicotecnicaDeProceso(procesoId, p.cedula)).vigente : null;
  const r = condicionesContratar({
    examenes: examenes ?? [],
    rutasAprendidas: rutasAprendidas((salidas.data ?? []) as { ruta: string; resultado: string }[]).length,
    rutasMinimas: agenda.rutasMinimas,
    reingreso: p?.reingreso === true,
    itemsCarpeta: items,
    carpeta,
    aprobada: !!p?.aprobacion_contratacion_at,
    exigePsicotecnica,
    psicotecnica: psico?.resultado ?? null,
    psicotecnicaDetalle: psico?.detalle,
  });
  return { exigir, ...r, aprobadaPor: p?.aprobacion_contratacion_por ?? null, aprobadaAt: p?.aprobacion_contratacion_at ?? null };
}

/** Visto bueno de la directora para contratar (o quitarlo). */
export async function aprobarContratacion(procesoId: string, aprobar: boolean, actor: ActorProceso): Promise<{ ok: boolean; error?: string }> {
  const { error } = await createAdminClient()
    .from("procesos_contratacion")
    .update(aprobar ? { aprobacion_contratacion_at: new Date().toISOString(), aprobacion_contratacion_por: actor.userEmail } : { aprobacion_contratacion_at: null, aprobacion_contratacion_por: null })
    .eq("id", procesoId);
  if (error) return { ok: false, error: `No se pudo guardar (${error.message}). ¿Falta aplicar la migración de la entrega 3?` };
  await registrarEvento(procesoId, { tipo: "dato", detalle: { aprobacion_contratacion: aprobar } }, actor);
  return { ok: true };
}
