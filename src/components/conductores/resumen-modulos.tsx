import Link from "next/link";
import { Activity, CalendarOff, ClipboardCheck, ShieldAlert } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { RESPONSABILIDAD_LABEL, type Responsabilidad } from "@/lib/accidentabilidad/analisis";
import { CONCEPTO_EPS, CONCEPTO_INCAPACIDAD, CONCEPTO_NO_JUSTIFICADA } from "@/lib/ausentismo/constants";
import { etiquetaSeguimiento } from "@/lib/ausentismo/seguimiento-reglas";
import { ANTECEDENTES_ESTADOS, PROCESO_ESTADOS, SIMIT_ESTADOS } from "@/lib/contratacion/constants";

/**
 * Lo que los demás módulos saben del conductor, en su ficha de Recursos
 * Humanos: accidentes, ausentismo, riesgo y el proceso de contratación. Cada
 * tarjeta sale solo si el usuario tiene ese módulo, y si una consulta falla la
 * tarjeta se omite en vez de romper la ficha.
 */

const DIAS_AUSENTISMO = 90;

type Db = ReturnType<typeof createAdminClient>;

function Tarjeta({ icono: Icono, titulo, href, children }: { icono: React.ComponentType<{ className?: string }>; titulo: string; href: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl border border-[#E2E8F0] bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icono className="h-5 w-5 text-[#4F46E5]" />
          <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
        </div>
        <Link href={href} className="text-xs font-medium text-[#4F46E5] hover:underline">
          Ver en el módulo
        </Link>
      </div>
      <div className="space-y-2 text-sm text-gray-700">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-gray-500">{etiqueta}</span>
      <span className="text-right font-medium text-gray-900">{children}</span>
    </p>
  );
}

const sumarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function accidentes(db: Db, cedula: string, hoy: string) {
  const { data, error } = await db
    .from("accidentes")
    .select("fecha_accidente, clase_accidente, responsabilidad_reportada")
    .eq("conductor_cedula", cedula)
    .order("fecha_accidente", { ascending: false });
  if (error) throw error;
  const filas = (data ?? []) as { fecha_accidente: string; clase_accidente: string | null; responsabilidad_reportada: string | null }[];
  const hace12 = sumarDias(hoy, -365);
  return {
    total: filas.length,
    ultimos12: filas.filter((f) => String(f.fecha_accidente).slice(0, 10) >= hace12).length,
    conLesionados: filas.filter((f) => f.clase_accidente === "lesionado" || f.clase_accidente === "muerto").length,
    ultimo: filas[0] ?? null,
  };
}

async function ausentismo(db: Db, cedula: string, hoy: string) {
  const desde = sumarDias(hoy, -(DIAS_AUSENTISMO - 1));
  const [reg, seg] = await Promise.all([
    db.from("ausentismo_registros").select("fecha, tipo").eq("cedula", cedula).gte("fecha", desde),
    db.from("ausentismo_seguimientos").select("estado, fecha_limite, proxima_revision, fecha, created_at").eq("cedula", cedula).order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(1),
  ]);
  if (reg.error) throw reg.error;
  const filas = (reg.data ?? []) as { fecha: string; tipo: string }[];
  // El seguimiento es un plus: sin la tabla (migración sin aplicar) no se muestra.
  const s = seg.error ? null : ((seg.data ?? [])[0] as { estado: "abierto" | "cumplido" | "incumplido"; fecha_limite: string | null; proxima_revision: string | null } | undefined);
  return {
    total: filas.length,
    noJustificadas: filas.filter((f) => f.tipo === CONCEPTO_NO_JUSTIFICADA).length,
    incapacidades: filas.filter((f) => f.tipo === CONCEPTO_INCAPACIDAD).length,
    eps: filas.filter((f) => f.tipo === CONCEPTO_EPS).length,
    ultima: filas.map((f) => f.fecha).sort().at(-1) ?? null,
    seguimiento: seg.error ? null : etiquetaSeguimiento(s ? { estado: s.estado, fechaLimite: s.fecha_limite, proximaRevision: s.proxima_revision } : null, hoy),
  };
}

async function riesgo(db: Db, cedula: string) {
  const { data: corrida, error } = await db.from("riesgo_corridas").select("id, corte").eq("estado", "ok").order("ejecutada_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!corrida) return null;
  const { data, error: e2 } = await db
    .from("riesgo_conductores")
    .select("nivel_retiro, prob_retiro, nivel_novedad, prob_novedad")
    .eq("corrida_id", corrida.id)
    .eq("cedula", cedula)
    .maybeSingle();
  if (e2) throw e2;
  return { corte: corrida.corte as string, fila: data as { nivel_retiro: string; prob_retiro: number; nivel_novedad: string; prob_novedad: number } | null };
}

async function contratacion(db: Db, cedula: string) {
  const { data, error } = await db
    .from("procesos_contratacion")
    .select("estado, reingreso, simit, antecedentes, licencia_categoria, fecha_contrato")
    .eq("cedula", cedula)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { estado: string; reingreso: boolean; simit: string | null; antecedentes: string | null; licencia_categoria: string | null; fecha_contrato: string | null } | null;
}

/** Corre la consulta y devuelve null si falla (la tarjeta se omite). */
async function seguro<T>(nombre: string, p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    console.error(`[ficha conductor] ${nombre}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

const COLOR_NIVEL: Record<string, string> = { Alto: "text-red-700", Medio: "text-amber-700", Bajo: "text-green-700" };
const pct = (p: number | null | undefined) => (p == null ? "" : ` (${Math.round(p * 100)} %)`);
const etiqueta = (lista: readonly { value: string; label: string }[], v: string | null) => (v ? (lista.find((x) => x.value === v)?.label ?? v) : "Sin verificar");

export async function ResumenModulosConductor({ cedula, hoy }: { cedula: string; hoy: string }) {
  const perms = await getCurrentPermissions();
  const puede = (m: Parameters<typeof canAccess>[1]) => perms.isAdmin || canAccess(perms, m);
  const db = createAdminClient();
  const [acc, aus, rie, con] = await Promise.all([
    puede("accidentabilidad") ? seguro("accidentes", accidentes(db, cedula, hoy)) : null,
    puede("ausentismo") ? seguro("ausentismo", ausentismo(db, cedula, hoy)) : null,
    puede("riesgo") ? seguro("riesgo", riesgo(db, cedula)) : null,
    puede("candidatos") ? seguro("contratación", contratacion(db, cedula)) : null,
  ]);
  if (!acc && !aus && !rie && !con) return null;
  const q = encodeURIComponent(cedula);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {acc && (
        <Tarjeta icono={ShieldAlert} titulo="Accidentes" href={`/accidentabilidad/consultar?q=${q}`}>
          {acc.total === 0 ? (
            <p className="text-gray-500">Sin accidentes registrados.</p>
          ) : (
            <>
              <Dato etiqueta="Últimos 12 meses">{acc.ultimos12}</Dato>
              <Dato etiqueta="Total registrados">{acc.total}</Dato>
              <Dato etiqueta="Con lesionados o víctimas">{acc.conLesionados}</Dato>
              {acc.ultimo && (
                <Dato etiqueta="Último">
                  {String(acc.ultimo.fecha_accidente).slice(0, 10)}
                  {acc.ultimo.responsabilidad_reportada
                    ? ` · ${RESPONSABILIDAD_LABEL[acc.ultimo.responsabilidad_reportada as Responsabilidad] ?? acc.ultimo.responsabilidad_reportada}`
                    : ""}
                </Dato>
              )}
            </>
          )}
        </Tarjeta>
      )}

      {aus && (
        <Tarjeta icono={CalendarOff} titulo={`Ausentismo · últimos ${DIAS_AUSENTISMO} días`} href={`/ausentismo?tab=reincidentes&q=${q}`}>
          {aus.total === 0 ? (
            <p className="text-gray-500">Sin ausencias registradas.</p>
          ) : (
            <>
              <Dato etiqueta="Ausencias">{aus.total}</Dato>
              <Dato etiqueta="No justificadas">
                <span className={aus.noJustificadas ? "text-red-700" : ""}>{aus.noJustificadas}</span>
              </Dato>
              <Dato etiqueta="Incapacidades / citas EPS">
                {aus.incapacidades} / {aus.eps}
              </Dato>
              {aus.ultima && <Dato etiqueta="Última">{aus.ultima}</Dato>}
            </>
          )}
          {aus.seguimiento && aus.seguimiento.clave !== "sin" && (
            <Dato etiqueta="Seguimiento de RRHH">
              {aus.seguimiento.texto}
              {aus.seguimiento.textoAviso ? ` · ${aus.seguimiento.textoAviso}` : ""}
            </Dato>
          )}
        </Tarjeta>
      )}

      {rie && (
        <Tarjeta icono={Activity} titulo="Riesgo" href="/riesgo">
          {!rie.fila ? (
            <p className="text-gray-500">No figura en el último análisis ({rie.corte}).</p>
          ) : (
            <>
              <Dato etiqueta="Riesgo de retiro">
                <span className={COLOR_NIVEL[rie.fila.nivel_retiro] ?? ""}>
                  {rie.fila.nivel_retiro}
                  {pct(rie.fila.prob_retiro)}
                </span>
              </Dato>
              <Dato etiqueta="Riesgo de novedad">
                <span className={COLOR_NIVEL[rie.fila.nivel_novedad] ?? ""}>
                  {rie.fila.nivel_novedad}
                  {pct(rie.fila.prob_novedad)}
                </span>
              </Dato>
              <p className="text-xs text-gray-400">Análisis con corte al {rie.corte}.</p>
            </>
          )}
        </Tarjeta>
      )}

      {con && (
        <Tarjeta icono={ClipboardCheck} titulo="Proceso de contratación" href={`/candidatos?q=${q}`}>
          <Dato etiqueta="Estado">{PROCESO_ESTADOS.find((e) => e.value === con.estado)?.label ?? con.estado}</Dato>
          <Dato etiqueta="Reingreso">{con.reingreso ? "Sí" : "No"}</Dato>
          <Dato etiqueta="SIMIT">{etiqueta(SIMIT_ESTADOS, con.simit)}</Dato>
          <Dato etiqueta="Antecedentes">{etiqueta(ANTECEDENTES_ESTADOS, con.antecedentes)}</Dato>
          <Dato etiqueta="Categoría de licencia">{con.licencia_categoria || "—"}</Dato>
          {con.fecha_contrato && <Dato etiqueta="Fecha de contrato">{con.fecha_contrato}</Dato>}
        </Tarjeta>
      )}
    </div>
  );
}
