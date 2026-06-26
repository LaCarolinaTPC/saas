"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Scale, ShieldAlert, Sparkles, Gavel, Users, Pencil } from "lucide-react";
import { guardarEvaluacion } from "@/lib/actions";
import {
  GRAVEDAD,
  GRAVEDAD_ORDEN,
  RESPONSABILIDAD,
  FACTORES,
  FACTORES_MANUALES,
  EXIMENTES,
  NIVELES,
  computePuntaje,
  sugerirNivel,
  requiereComite,
  nivelRiesgo,
  medidasDeNivel,
  nombreNivel,
  type Gravedad,
  type Responsabilidad,
  type FactorKey,
  type EximenteKey,
  type Nivel,
} from "@/lib/accidentabilidad/policy";

type Contexto = {
  mesesAntiguedad: number | null;
  antiguedad3aSinEventos: boolean;
  reincidencia3m: number;
  reincidencia6m: number;
  reincidencia12m: number;
  reincidente3m: boolean;
};

type EvaluacionRow = {
  gravedad: Gravedad | null;
  responsabilidad: Responsabilidad;
  factores: FactorKey[];
  eximentes: EximenteKey[];
  puntaje: number;
  nivel_sugerido: Nivel | null;
  nivel_final: Nivel | null;
  medidas: string[];
  requiere_comite: boolean;
  observaciones: string | null;
  evaluado_at: string | null;
  profiles?: { full_name?: string } | null;
};

const NIVEL_COLOR: Record<Nivel, { bg: string; text: string; ring: string }> = {
  ninguno: { bg: "bg-[#F1F5F9]", text: "text-gray-600", ring: "ring-[#E2E8F0]" },
  I: { bg: "bg-[#DBEAFE]", text: "text-[#1D4ED8]", ring: "ring-[#BFDBFE]" },
  II: { bg: "bg-[#FEF9C3]", text: "text-[#A16207]", ring: "ring-[#FDE68A]" },
  III: { bg: "bg-[#FFEDD5]", text: "text-[#C2410C]", ring: "ring-[#FED7AA]" },
  IV: { bg: "bg-[#FEE2E2]", text: "text-[#B91C1C]", ring: "ring-[#FECACA]" },
};

export default function EvaluacionPanel({
  accidenteId,
  evaluacion,
  contexto,
  canEvaluate,
}: {
  accidenteId: string;
  evaluacion: EvaluacionRow | null;
  contexto: Contexto;
  canEvaluate: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!evaluacion);

  const [gravedad, setGravedad] = useState<Gravedad | null>(evaluacion?.gravedad ?? null);
  const [responsabilidad, setResponsabilidad] = useState<Responsabilidad>(
    evaluacion?.responsabilidad ?? "en_estudio"
  );
  const [factores, setFactores] = useState<Set<FactorKey>>(
    new Set((evaluacion?.factores ?? []).filter((f) => !FACTORES[f]?.auto))
  );
  const [eximentes, setEximentes] = useState<Set<EximenteKey>>(
    new Set(evaluacion?.eximentes ?? [])
  );
  const [nivelFinal, setNivelFinal] = useState<Nivel>(evaluacion?.nivel_final ?? "ninguno");
  const [medidas, setMedidas] = useState<Set<string>>(new Set(evaluacion?.medidas ?? []));
  const [observaciones, setObservaciones] = useState(evaluacion?.observaciones ?? "");
  const [nivelTocado, setNivelTocado] = useState(Boolean(evaluacion));

  // Factores automáticos derivados del contexto
  const autoFactores = useMemo(() => {
    const arr: FactorKey[] = [];
    if (contexto.reincidente3m) arr.push("reincidencia");
    if (contexto.antiguedad3aSinEventos) arr.push("antiguedad_3a_sin_eventos");
    return arr;
  }, [contexto]);

  const input = useMemo(
    () => ({
      gravedad,
      responsabilidad,
      factores: [...factores, ...autoFactores] as FactorKey[],
      eximentes: [...eximentes],
      reincidente3m: contexto.reincidente3m,
    }),
    [gravedad, responsabilidad, factores, autoFactores, eximentes, contexto.reincidente3m]
  );

  const { puntaje, detalle } = useMemo(() => computePuntaje(input), [input]);
  const sugerencia = useMemo(() => sugerirNivel(input), [input]);
  const comite = requiereComite(gravedad);
  const riesgo = nivelRiesgo(puntaje);

  // Si el evaluador no ha tocado el nivel, seguir la sugerencia automática
  const nivelEfectivo: Nivel = nivelTocado ? nivelFinal : sugerencia.nivel;
  const medidasEfectivas = nivelTocado
    ? medidas
    : new Set(medidasDeNivel(sugerencia.nivel));

  function aplicarNivel(n: Nivel) {
    setNivelTocado(true);
    setNivelFinal(n);
    setMedidas(new Set(medidasDeNivel(n)));
  }

  function toggleFactor(k: FactorKey) {
    setFactores((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function toggleEximente(k: EximenteKey) {
    setEximentes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function toggleMedida(m: string) {
    setNivelTocado(true);
    setMedidas((prev) => {
      const next = new Set(nivelTocado ? prev : medidasEfectivas);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  async function save() {
    if (!gravedad) {
      setError("Selecciona la gravedad del accidente.");
      return;
    }
    setError(null);
    setSaving(true);
    const res = await guardarEvaluacion(accidenteId, {
      gravedad,
      responsabilidad,
      factores: [...factores],
      eximentes: [...eximentes],
      nivel_final: nivelEfectivo,
      medidas: [...medidasEfectivas],
      observaciones,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Error al guardar.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  // ── Vista de solo lectura (dictamen ya emitido) ───────────────────────────
  if (!editing && evaluacion) {
    const nf = (evaluacion.nivel_final ?? "ninguno") as Nivel;
    const col = NIVEL_COLOR[nf];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${col.bg} ${col.text} ${col.ring}`}>
              <Gavel className="h-4 w-4" /> {nombreNivel(nf)}
            </span>
            {evaluacion.gravedad && (
              <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-sm text-gray-700">
                {GRAVEDAD[evaluacion.gravedad].label}
              </span>
            )}
            <span className="rounded-full bg-[#F1F5F9] px-3 py-1 text-sm text-gray-700">
              {evaluacion.puntaje} pts
            </span>
            {evaluacion.requiere_comite && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-3 py-1 text-sm text-[#4F46E5]">
                <Users className="h-3.5 w-3.5" /> Requiere comité
              </span>
            )}
          </div>
          {canEvaluate && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
            >
              <Pencil className="h-4 w-4" /> Editar dictamen
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <RoView label="Responsabilidad" value={RESPONSABILIDAD[evaluacion.responsabilidad].label} />
          <RoView label="Reincidencia (3/6/12m)" value={`${contexto.reincidencia3m} / ${contexto.reincidencia6m} / ${contexto.reincidencia12m}`} />
        </div>

        {evaluacion.medidas.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Medidas correctivas</p>
            <ul className="space-y-1">
              {evaluacion.medidas.map((m) => (
                <li key={m} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4F46E5]" /> {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {evaluacion.observaciones && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Observaciones</p>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{evaluacion.observaciones}</p>
          </div>
        )}

        <p className="text-xs text-gray-400">
          Evaluado{evaluacion.profiles?.full_name ? ` por ${evaluacion.profiles.full_name}` : ""}
          {evaluacion.evaluado_at ? ` · ${new Date(evaluacion.evaluado_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}` : ""}
        </p>
      </div>
    );
  }

  if (!canEvaluate) {
    return (
      <p className="text-sm text-gray-400">
        Este reporte aún no tiene dictamen. Solo administración / RRHH pueden evaluarlo.
      </p>
    );
  }

  // ── Formulario de evaluación ──────────────────────────────────────────────
  const col = NIVEL_COLOR[nivelEfectivo];
  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-[#EF4444]">{error}</p>}

      {/* Contexto auto-derivado */}
      <div className="rounded-lg bg-[#F8FAFC] p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <Sparkles className="h-3.5 w-3.5" /> Detectado automáticamente
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-white px-3 py-1 text-gray-700 ring-1 ring-[#E2E8F0]">
            Antigüedad: {contexto.mesesAntiguedad != null ? `${contexto.mesesAntiguedad} meses` : "—"}
          </span>
          <span className={`rounded-full px-3 py-1 ring-1 ${contexto.reincidente3m ? "bg-[#FEE2E2] text-[#B91C1C] ring-[#FECACA]" : "bg-white text-gray-700 ring-[#E2E8F0]"}`}>
            Reincidencia 3/6/12m: {contexto.reincidencia3m} / {contexto.reincidencia6m} / {contexto.reincidencia12m}
          </span>
          {contexto.antiguedad3aSinEventos && (
            <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-[#059669] ring-1 ring-[#BBF7D0]">
              Atenuante: +3 años sin eventos (−10)
            </span>
          )}
          {contexto.reincidente3m && (
            <span className="rounded-full bg-[#FEE2E2] px-3 py-1 text-[#B91C1C] ring-1 ring-[#FECACA]">
              Agravante: reincidencia (+15)
            </span>
          )}
        </div>
      </div>

      {/* Gravedad */}
      <Section title="Gravedad del accidente">
        <div className="grid gap-2 sm:grid-cols-2">
          {GRAVEDAD_ORDEN.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGravedad(g)}
              className={`rounded-lg border p-3 text-left transition ${gravedad === g ? "border-[#4F46E5] bg-[#EEF2FF] ring-1 ring-[#4F46E5]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{GRAVEDAD[g].label}</span>
                <span className="text-xs font-semibold text-gray-500">+{GRAVEDAD[g].puntaje}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{GRAVEDAD[g].descripcion}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Responsabilidad */}
      <Section title="Responsabilidad / causalidad">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RESPONSABILIDAD) as Responsabilidad[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setResponsabilidad(r)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${responsabilidad === r ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]" : "border-[#E2E8F0] text-gray-600 hover:bg-[#F8FAFC]"}`}
            >
              {RESPONSABILIDAD[r].label}
            </button>
          ))}
        </div>
      </Section>

      {/* Factores de la matriz */}
      <Section title="Factores de la matriz de ponderación">
        <div className="grid gap-2 sm:grid-cols-2">
          {FACTORES_MANUALES.map((f) => (
            <Check
              key={f.key}
              checked={factores.has(f.key)}
              onChange={() => toggleFactor(f.key)}
              label={f.label}
              hint={`${f.puntaje > 0 ? "+" : ""}${f.puntaje}`}
              danger={f.tipo === "agravante"}
            />
          ))}
        </div>
      </Section>

      {/* Eximentes */}
      <Section title="Eximentes / atenuantes">
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(EXIMENTES) as EximenteKey[]).map((k) => (
            <Check
              key={k}
              checked={eximentes.has(k)}
              onChange={() => toggleEximente(k)}
              label={EXIMENTES[k].label}
            />
          ))}
        </div>
      </Section>

      {/* Resultado: puntaje + nivel */}
      <div className="rounded-xl border border-[#E2E8F0] bg-[#FBFCFE] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 flex-col items-center justify-center rounded-xl bg-white ring-1 ring-[#E2E8F0]">
              <span className="text-lg font-bold text-gray-900">{puntaje}</span>
              <span className="text-[10px] uppercase text-gray-400">pts</span>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                <Scale className="h-4 w-4 text-gray-400" /> Riesgo {riesgo}
                {puntaje > 20 && <span className="rounded bg-[#FEE2E2] px-1.5 py-0.5 text-xs text-[#B91C1C]">{">"}20</span>}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {detalle.map((d) => `${d.label} (${d.puntaje > 0 ? "+" : ""}${d.puntaje})`).join(" · ") || "Sin factores"}
              </p>
            </div>
          </div>
          {comite && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-3 py-1 text-sm text-[#4F46E5]">
              <Users className="h-3.5 w-3.5" /> Requiere comité
            </span>
          )}
        </div>

        {/* Sugerencia */}
        <div className="mt-4 rounded-lg bg-white p-3 ring-1 ring-[#E2E8F0]">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <ShieldAlert className="h-3.5 w-3.5" /> Sugerencia de correctivo
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${NIVEL_COLOR[sugerencia.nivel].bg} ${NIVEL_COLOR[sugerencia.nivel].text} ${NIVEL_COLOR[sugerencia.nivel].ring}`}>
              {nombreNivel(sugerencia.nivel)}
            </span>
            {sugerencia.nivel !== nivelEfectivo && (
              <button
                type="button"
                onClick={() => aplicarNivel(sugerencia.nivel)}
                className="text-xs font-medium text-[#4F46E5] underline"
              >
                Aplicar sugerido
              </button>
            )}
          </div>
          {sugerencia.motivos.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-gray-500">
              {sugerencia.motivos.map((m, i) => (
                <li key={i}>• {m}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Nivel final + medidas */}
      <Section title="Nivel de correctivo a aplicar">
        <div className="flex flex-wrap gap-2">
          {(["ninguno", "I", "II", "III", "IV"] as Nivel[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => aplicarNivel(n)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${nivelEfectivo === n ? `${NIVEL_COLOR[n].bg} ${NIVEL_COLOR[n].text} border-transparent ring-1 ${NIVEL_COLOR[n].ring}` : "border-[#E2E8F0] text-gray-600 hover:bg-[#F8FAFC]"}`}
            >
              {n === "ninguno" ? "Sin correctivo" : `Nivel ${n}`}
            </button>
          ))}
        </div>

        {nivelEfectivo !== "ninguno" && (
          <div className="mt-3 rounded-lg border border-[#E2E8F0] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Medidas — {NIVELES[nivelEfectivo as Exclude<Nivel, "ninguno">].nombre}
            </p>
            <div className="space-y-1.5">
              {NIVELES[nivelEfectivo as Exclude<Nivel, "ninguno">].medidas.map((m) => (
                <Check key={m} checked={medidasEfectivas.has(m)} onChange={() => toggleMedida(m)} label={m} />
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Observaciones */}
      <Section title="Observaciones del dictamen">
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={3}
          placeholder="Concepto técnico, contexto, decisión del comité…"
          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
        />
      </Section>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${col.text === "text-gray-600" ? "bg-[#4F46E5]" : "bg-[#4F46E5]"}`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
          Guardar dictamen
        </button>
        {evaluacion && (
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-600 hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-700">{title}</p>
      {children}
    </div>
  );
}

function RoView({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
  danger,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${checked ? "border-[#4F46E5] bg-[#EEF2FF]" : "border-[#E2E8F0] hover:bg-[#F8FAFC]"}`}>
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-gray-300 text-[#4F46E5]" />
        <span className="text-gray-700">{label}</span>
      </span>
      {hint && (
        <span className={`text-xs font-semibold ${danger ? "text-[#B91C1C]" : "text-[#059669]"}`}>{hint}</span>
      )}
    </label>
  );
}
