/**
 * Experiencia laboral del aspirante (procesos_contratacion.experiencia_laboral)
 * y su verificación. Solo servidor; quien llama revisa los permisos. Reglas
 * puras en ./experiencia.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import type { ExperienciaLeida } from "./lectura/esquema";
import {
  fusionarLeidas,
  nuevoId,
  resumenExperiencia,
  validarExperiencia,
  verificarPorEmpresa,
  type ComoSeVerifico,
  type ExperienciaLaboral,
  type ResumenExperiencia,
  type VerificacionExperiencia,
} from "./experiencia";

type Resultado = { ok: true } | { ok: false; error: string };
const SIN_MIGRACION = "Falta aplicar la migración de la experiencia laboral (20261121064208).";

async function leer(procesoId: string): Promise<{ items: ExperienciaLaboral[]; experienciaMeses: number | null } | null> {
  const { data, error } = await createAdminClient().from("procesos_contratacion").select("experiencia_laboral, experiencia_meses").eq("id", procesoId).maybeSingle();
  if (error || !data) return null;
  return {
    items: Array.isArray(data.experiencia_laboral) ? (data.experiencia_laboral as ExperienciaLaboral[]) : [],
    experienciaMeses: data.experiencia_meses == null ? null : Number(data.experiencia_meses),
  };
}

async function guardar(procesoId: string, items: ExperienciaLaboral[]): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("procesos_contratacion")
    .update({ experiencia_laboral: items, updated_at: new Date().toISOString() })
    .eq("id", procesoId);
  return !error;
}

export interface ExperienciaVista {
  disponible: boolean;
  items: ExperienciaLaboral[];
  resumen: ResumenExperiencia;
  /** El dato «Experiencia» del proceso (lo dijo por WhatsApp o salió de la hoja de vida). */
  experienciaMeses: number | null;
}

export interface ReferenciaResumen {
  id: string;
  tipo: "laboral" | "personal";
  nombre: string;
  telefono: string | null;
  empresa: string | null;
  habloCon: string | null;
  resultado: string | null;
  validadaAt: string | null;
}

/** Referencias del proceso (las de la carpeta), con su llamada si ya se hizo. */
export async function referenciasDeProceso(procesoId: string): Promise<ReferenciaResumen[]> {
  const { data, error } = await createAdminClient()
    .from("seleccion_referencias")
    .select("id, tipo, nombre, telefono, empresa, hablo_con, resultado, validada_at")
    .eq("proceso_id", procesoId)
    .order("created_at");
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    tipo: r.tipo as "laboral" | "personal",
    nombre: r.nombre as string,
    telefono: (r.telefono as string | null) ?? null,
    empresa: (r.empresa as string | null) ?? null,
    habloCon: (r.hablo_con as string | null) ?? null,
    resultado: (r.resultado as string | null) ?? null,
    validadaAt: (r.validada_at as string | null) ?? null,
  }));
}

export async function experienciaDeProceso(procesoId: string): Promise<ExperienciaVista> {
  const hoy = fechaBogota(new Date().toISOString());
  const d = await leer(procesoId);
  if (!d) return { disponible: false, items: [], resumen: resumenExperiencia([], hoy), experienciaMeses: null };
  return { disponible: true, items: d.items, resumen: resumenExperiencia(d.items, hoy), experienciaMeses: d.experienciaMeses };
}

/** Los empleos aceptados de una hoja de vida («Documentos leídos»). Devuelve cuántos agregó. */
export async function agregarExperienciaLeida(procesoId: string, leidas: ExperienciaLeida[], actor: ActorProceso): Promise<number> {
  const d = await leer(procesoId);
  if (!d || !leidas.length) return 0;
  const nuevos = fusionarLeidas(d.items, leidas);
  const agregados = nuevos.length - d.items.length;
  if (agregados && (await guardar(procesoId, nuevos))) {
    await registrarEvento(procesoId, { tipo: "dato", detalle: { experiencia_laboral: `${agregados} empleos de la hoja de vida, sin verificar` } }, actor);
    return agregados;
  }
  return 0;
}

/**
 * Verifica los empleos de una empresa (carta laboral aceptada o referencia
 * validada). Devuelve cuántos verificó; sin empresa o sin coincidencia, 0.
 */
export async function verificarExperienciaDeEmpresa(
  procesoId: string,
  empresa: string | null | undefined,
  como: ComoSeVerifico,
  nota: string | null,
  actor: ActorProceso
): Promise<number> {
  if (!empresa?.trim()) return 0;
  const d = await leer(procesoId);
  if (!d?.items.length) return 0;
  const r = verificarPorEmpresa(d.items, empresa, { como, nota, por: actor.userEmail, at: new Date().toISOString() });
  if (!r.cambiados || !(await guardar(procesoId, r.items))) return 0;
  await registrarEvento(procesoId, { tipo: "dato", detalle: { experiencia_verificada: empresa, como } }, actor);
  return r.cambiados;
}

/**
 * Carta laboral aceptada: verifica el empleo de esa empresa y, si no estaba
 * en la lista (no mandó hoja de vida), lo agrega ya verificado.
 */
export async function registrarCartaLaboral(
  procesoId: string,
  carta: { empresa: string | null; cargo: string | null; desde: string | null; hasta: string | null },
  actor: ActorProceso
): Promise<"verificada" | "agregada" | null> {
  if (!carta.empresa?.trim()) return null;
  const nota = "Carta laboral recibida y revisada";
  if (await verificarExperienciaDeEmpresa(procesoId, carta.empresa, "carta_laboral", nota, actor)) return "verificada";
  const d = await leer(procesoId);
  if (!d) return null;
  const mes = (v: string | null) => (v && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : null);
  const conduccion = /conduct|chofer|chófer|operador|motorista/i.test(carta.cargo ?? "");
  const [nuevo] = fusionarLeidas([], [{ empresa: carta.empresa, cargo: carta.cargo, desde: mes(carta.desde), hasta: mes(carta.hasta), vehiculo: null, conduccion }]);
  const at = new Date().toISOString();
  const items = [...d.items, { ...nuevo, verificacion: "verificada" as const, como: "carta_laboral" as const, nota, verificada_por: actor.userEmail, verificada_at: at }];
  if (!(await guardar(procesoId, items))) return null;
  await registrarEvento(procesoId, { tipo: "dato", detalle: { experiencia_verificada: carta.empresa, como: "carta_laboral", agregada: true } }, actor);
  return "agregada";
}

/** Cambia a mano la verificación de un empleo. */
export async function marcarVerificacion(
  procesoId: string,
  itemId: string,
  d: { verificacion: VerificacionExperiencia; como?: ComoSeVerifico | null; nota?: string | null },
  actor: ActorProceso
): Promise<Resultado> {
  if (!["sin_verificar", "verificada", "no_confirmada"].includes(d.verificacion)) return { ok: false, error: "Estado no válido." };
  const actual = await leer(procesoId);
  if (!actual) return { ok: false, error: SIN_MIGRACION };
  const item = actual.items.find((e) => e.id === itemId);
  if (!item) return { ok: false, error: "No se encontró ese empleo." };
  const nota = String(d.nota ?? "").trim().slice(0, 300) || null;
  if (d.verificacion === "no_confirmada" && !nota) return { ok: false, error: "Escriba qué pasó (por ejemplo, la empresa no lo reconoce)." };
  const sinVerificar = d.verificacion === "sin_verificar";
  const items = actual.items.map((e) =>
    e.id !== itemId
      ? e
      : {
          ...e,
          verificacion: d.verificacion,
          como: d.verificacion === "verificada" ? (d.como ?? "otro") : null,
          nota: sinVerificar ? null : nota,
          verificada_por: sinVerificar ? null : actor.userEmail,
          verificada_at: sinVerificar ? null : new Date().toISOString(),
        }
  );
  if (!(await guardar(procesoId, items))) return { ok: false, error: SIN_MIGRACION };
  await registrarEvento(procesoId, { tipo: "dato", detalle: { experiencia_verificacion: d.verificacion, empresa: item.empresa } }, actor);
  return { ok: true };
}

/** Agrega o corrige un empleo escrito a mano (o lo borra, con `borrar`). */
export async function guardarEmpleo(
  procesoId: string,
  d: Partial<ExperienciaLaboral> & { id?: string },
  actor: ActorProceso,
  borrar = false
): Promise<Resultado> {
  const actual = await leer(procesoId);
  if (!actual) return { ok: false, error: SIN_MIGRACION };
  let items: ExperienciaLaboral[];
  if (borrar) {
    items = actual.items.filter((e) => e.id !== d.id);
  } else {
    const v = validarExperiencia(d);
    if (!v.ok) return v;
    const t = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n) || null;
    const campos = {
      empresa: t(d.empresa, 120),
      cargo: t(d.cargo, 120),
      desde: t(d.desde, 7),
      hasta: t(d.hasta, 7),
      vehiculo: t(d.vehiculo, 60),
      conduccion: d.conduccion === true,
    };
    const existe = d.id ? actual.items.find((e) => e.id === d.id) : undefined;
    items = existe
      ? actual.items.map((e) => (e.id === d.id ? { ...e, ...campos } : e))
      : [
          ...actual.items,
          { id: nuevoId(), ...campos, origen: "manual", verificacion: "sin_verificar", como: null, nota: null, verificada_por: null, verificada_at: null },
        ];
  }
  if (!(await guardar(procesoId, items))) return { ok: false, error: SIN_MIGRACION };
  await registrarEvento(procesoId, { tipo: "dato", detalle: { experiencia_laboral: borrar ? "empleo borrado" : d.id ? "empleo corregido" : "empleo agregado a mano" } }, actor);
  return { ok: true };
}
