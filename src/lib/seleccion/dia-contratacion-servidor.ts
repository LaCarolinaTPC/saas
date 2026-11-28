/**
 * Día de contratación (entrega 4, I1): lee y registra la psicotécnica, la
 * entrevista y la inducción. Solo servidor; quien
 * llama revisa los permisos. Reglas puras en ./dia-contratacion.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { psicotecnicaVigente, validarPsicoExterna, type PsicoExterna, type PsicoVigente, type ResultadoPsicoExterna } from "./dia-contratacion";
import { revisarListoContratar } from "./listo-contratar-revisar";

export interface PsicotecnicaProceso {
  externa: (PsicoExterna & { puntaje: number | null; por: string | null }) | null;
  vigente: PsicoVigente;
}

/** El resultado de la psicotécnica que registró Gestión Humana (plataforma externa). */
export async function psicotecnicaDeProceso(procesoId: string): Promise<PsicotecnicaProceso> {
  const proc = await createAdminClient()
    .from("procesos_contratacion")
    .select("psicotecnica_resultado, psicotecnica_fecha, psicotecnica_puntaje, psicotecnica_entidad, psicotecnica_por")
    .eq("id", procesoId)
    .maybeSingle();
  // Sin la migración de la entrega 4 no hay columnas de psicotécnica externa.
  const e = proc.error ? null : (proc.data as Record<string, unknown> | null);
  const externa =
    e?.psicotecnica_resultado
      ? {
          resultado: e.psicotecnica_resultado as ResultadoPsicoExterna,
          fecha: (e.psicotecnica_fecha as string | null) ?? null,
          entidad: (e.psicotecnica_entidad as string | null) ?? null,
          puntaje: e.psicotecnica_puntaje == null ? null : Number(e.psicotecnica_puntaje),
          por: (e.psicotecnica_por as string | null) ?? null,
        }
      : null;
  return { externa, vigente: psicotecnicaVigente(externa) };
}

export interface DiaContratacion {
  disponible: boolean;
  psicotecnica: PsicotecnicaProceso;
  entrevista: { at: string | null; por: string | null; nota: string | null };
  induccion: { at: string | null; por: string | null };
}

export async function diaContratacionDeProceso(procesoId: string): Promise<DiaContratacion> {
  const db = createAdminClient();
  const [{ data, error }, psicotecnica] = await Promise.all([
    db.from("procesos_contratacion").select("entrevista_at, entrevista_por, entrevista_nota, induccion_at, induccion_por").eq("id", procesoId).maybeSingle(),
    psicotecnicaDeProceso(procesoId),
  ]);
  const base = error ? null : (data as Record<string, string | null> | null);
  return {
    disponible: !error,
    psicotecnica,
    entrevista: { at: base?.entrevista_at ?? null, por: base?.entrevista_por ?? null, nota: base?.entrevista_nota ?? null },
    induccion: { at: base?.induccion_at ?? null, por: base?.induccion_por ?? null },
  };
}

type Resultado = { ok: true } | { ok: false; error: string };
const SIN_MIGRACION = "Falta aplicar la migración de la entrega 4 de selección.";

/** Fecha y hora (AAAA-MM-DDTHH:MM, hora de Bogotá) → ISO. Vacío = ahora. */
function instante(v: string | null | undefined): string | null {
  const t = String(v ?? "").trim();
  if (!t) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T12:00:00-05:00`).toISOString();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return new Date(`${t}:00-05:00`).toISOString();
  return null;
}

/** Registra (o borra, con `null`) la entrevista. */
export async function registrarEntrevista(procesoId: string, d: { cuando?: string | null; nota?: string | null } | null, actor: ActorProceso): Promise<Resultado> {
  const at = d ? instante(d.cuando) : null;
  if (d && !at) return { ok: false, error: "La fecha de la entrevista no es válida." };
  const nota = d ? String(d.nota ?? "").trim().slice(0, 2000) || null : null;
  const { error } = await createAdminClient()
    .from("procesos_contratacion")
    .update({ entrevista_at: at, entrevista_por: d ? actor.userEmail : null, entrevista_nota: nota })
    .eq("id", procesoId);
  if (error) return { ok: false, error: SIN_MIGRACION };
  await registrarEvento(procesoId, { tipo: "dato", detalle: { entrevista: d ? { at, nota } : null } }, actor);
  return { ok: true };
}

/** Registra (o borra, con `null`) la inducción. */
export async function registrarInduccion(procesoId: string, cuando: string | null | undefined, actor: ActorProceso, borrar = false): Promise<Resultado> {
  const at = borrar ? null : instante(cuando);
  if (!borrar && !at) return { ok: false, error: "La fecha de la inducción no es válida." };
  const { error } = await createAdminClient()
    .from("procesos_contratacion")
    .update({ induccion_at: at, induccion_por: borrar ? null : actor.userEmail })
    .eq("id", procesoId);
  if (error) return { ok: false, error: SIN_MIGRACION };
  await registrarEvento(procesoId, { tipo: "dato", detalle: { induccion: at } }, actor);
  return { ok: true };
}

/** Resultado de la psicotécnica hecha en una IPS (o lo borra, con `null`). */
export async function registrarPsicotecnicaExterna(
  procesoId: string,
  d: { resultado?: unknown; fecha?: unknown; puntaje?: unknown; entidad?: unknown } | null,
  actor: ActorProceso
): Promise<Resultado> {
  let cambios: Record<string, unknown> = {
    psicotecnica_resultado: null,
    psicotecnica_fecha: null,
    psicotecnica_puntaje: null,
    psicotecnica_entidad: null,
    psicotecnica_por: null,
  };
  if (d) {
    const v = validarPsicoExterna(d, fechaBogota(new Date().toISOString()));
    if (!v.ok) return v;
    cambios = {
      psicotecnica_resultado: v.valor.resultado,
      psicotecnica_fecha: v.valor.fecha,
      psicotecnica_puntaje: v.valor.puntaje,
      psicotecnica_entidad: v.valor.entidad,
      psicotecnica_por: actor.userEmail,
    };
  }
  const { error } = await createAdminClient().from("procesos_contratacion").update(cambios).eq("id", procesoId);
  if (error) return { ok: false, error: SIN_MIGRACION };
  await registrarEvento(procesoId, { tipo: "dato", detalle: { psicotecnica_externa: d ? cambios.psicotecnica_resultado : null } }, actor);
  await revisarListoContratar(procesoId, actor);
  return { ok: true };
}
