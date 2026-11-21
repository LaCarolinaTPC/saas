/**
 * Día de contratación (entrega 4, I1): lee y registra la psicotécnica, la
 * entrevista y la inducción, y cita a la psicotécnica. Solo servidor; quien
 * llama revisa los permisos. Reglas puras en ./dia-contratacion.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { citaVigente, hhmm, type Cita } from "./agenda";
import { citasDeProceso, crearCitaSimple } from "./agenda-servidor";
import { psicotecnicaVigente, validarPsicoExterna, type PsicoExterna, type PsicoGestivo, type PsicoVigente, type ResultadoPsicoExterna } from "./dia-contratacion";

export interface PsicoGestivoDetalle extends PsicoGestivo {
  intentoId: string;
  puntaje: number | null;
  por: string | null;
}

export interface PsicotecnicaProceso {
  gestivo: PsicoGestivoDetalle | null;
  /** Hay una prueba de Gestivo terminada esperando el concepto de la psicóloga. */
  gestivoPorRevisar: string | null;
  externa: (PsicoExterna & { puntaje: number | null; por: string | null }) | null;
  vigente: PsicoVigente;
}

const soloDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** La psicotécnica del proceso: la de Gestivo (por proceso o por cédula) y la de una IPS. */
export async function psicotecnicaDeProceso(procesoId: string, cedula?: string | null): Promise<PsicotecnicaProceso> {
  const db = createAdminClient();
  const ced = soloDigitos(cedula);
  const filtro = `proceso_id.eq.${procesoId}${/^\d{5,11}$/.test(ced) ? `,cedula.eq.${ced}` : ""}`;
  const [conConcepto, porRevisar, proc] = await Promise.all([
    db
      .from("psico_intentos")
      .select("id, concepto, concepto_en, concepto_por_email, puntaje_global")
      .or(filtro)
      .eq("estado", "terminado")
      .not("concepto", "is", null)
      .order("concepto_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("psico_intentos").select("id").or(filtro).eq("estado", "terminado").is("concepto", null).limit(1).maybeSingle(),
    db
      .from("procesos_contratacion")
      .select("psicotecnica_resultado, psicotecnica_fecha, psicotecnica_puntaje, psicotecnica_entidad, psicotecnica_por")
      .eq("id", procesoId)
      .maybeSingle(),
  ]);
  const g = conConcepto.error ? null : conConcepto.data;
  const gestivo: PsicoGestivoDetalle | null =
    g && (g.concepto === "apto" || g.concepto === "no_apto")
      ? {
          intentoId: g.id as string,
          concepto: g.concepto,
          en: (g.concepto_en as string | null) ?? null,
          puntaje: g.puntaje_global == null ? null : Number(g.puntaje_global),
          por: (g.concepto_por_email as string | null) ?? null,
        }
      : null;
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
  return {
    gestivo,
    gestivoPorRevisar: porRevisar.error ? null : ((porRevisar.data?.id as string | undefined) ?? null),
    externa,
    vigente: psicotecnicaVigente(gestivo, externa),
  };
}

export interface DiaContratacion {
  disponible: boolean;
  psicotecnica: PsicotecnicaProceso;
  /** Cita de psicotécnica en pie, o la última. */
  cita: Cita | null;
  entrevista: { at: string | null; por: string | null; nota: string | null };
  induccion: { at: string | null; por: string | null };
}

export async function diaContratacionDeProceso(procesoId: string): Promise<DiaContratacion> {
  const db = createAdminClient();
  const [{ data, error }, citas] = await Promise.all([
    db.from("procesos_contratacion").select("cedula, entrevista_at, entrevista_por, entrevista_nota, induccion_at, induccion_por").eq("id", procesoId).maybeSingle(),
    citasDeProceso(procesoId),
  ]);
  const base = error ? null : (data as Record<string, string | null> | null);
  const cedula = base?.cedula ?? (await db.from("procesos_contratacion").select("cedula").eq("id", procesoId).maybeSingle()).data?.cedula;
  const psicotecnica = await psicotecnicaDeProceso(procesoId, cedula as string | null);
  const dePsico = citas.filter((c) => c.tipo === "psicotecnica");
  return {
    disponible: !error,
    psicotecnica,
    cita: dePsico.find((c) => citaVigente(c)) ?? dePsico.find((c) => c.estado !== "reprogramada" && c.estado !== "cancelada") ?? null,
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
  return { ok: true };
}

/**
 * Cita a la psicotécnica. El día de la cita sale el recordatorio
 * `recordatorio_psicotecnica` (cron de la agenda) con este lugar.
 */
export async function citarPsicotecnica(
  procesoId: string,
  d: { fecha: string; hora: string; lugar?: string | null },
  actor: ActorProceso
): Promise<Resultado> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha ?? "")) return { ok: false, error: "La fecha no es válida." };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm(d.hora ?? ""))) return { ok: false, error: "La hora no es válida." };
  if (d.fecha < fechaBogota(new Date().toISOString())) return { ok: false, error: "La fecha ya pasó." };
  const db = createAdminClient();
  // Una sola cita de psicotécnica en pie: la anterior queda reprogramada.
  const vigentes = (await citasDeProceso(procesoId)).filter((c) => c.tipo === "psicotecnica" && citaVigente(c));
  if (vigentes.length) await db.from("seleccion_citas").update({ estado: "reprogramada", reprogramada_por: "empresa" }).in("id", vigentes.map((c) => c.id));
  const id = await crearCitaSimple(procesoId, "psicotecnica", { fecha: d.fecha, hora: hhmm(d.hora) }, actor);
  if (!id) return { ok: false, error: "No se pudo crear la cita (¿falta la migración de la entrega 2?)." };
  const lugar = String(d.lugar ?? "").trim().slice(0, 200);
  if (lugar) {
    const { error } = await db.from("seleccion_citas").update({ lugar }).eq("id", id);
    if (error) return { ok: false, error: SIN_MIGRACION };
  }
  return { ok: true };
}

/** Marca la cita de psicotécnica como cumplida o no. */
export async function marcarAsistenciaPsicotecnica(citaId: string, asistio: boolean, actor: ActorProceso): Promise<Resultado> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("seleccion_citas")
    .update(asistio ? { estado: "asistio", llego_at: new Date().toISOString() } : { estado: "no_asistio", inasistencia_at: new Date().toISOString() })
    .eq("id", citaId)
    .eq("tipo", "psicotecnica")
    .select("proceso_id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "No se encontró la cita." };
  await registrarEvento(data.proceso_id as string, { tipo: "cita", detalle: { accion: asistio ? "llego" : "no_asistio", tipo: "psicotecnica" } }, actor);
  return { ok: true };
}
