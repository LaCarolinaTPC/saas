"use client";

/**
 * Candidatos › Exámenes fase 2 (27-nov-2026). Cuatro grupos: para registrar
 * (la cita ya pasó o es hoy), próximas citas, aplazados (esperan el concepto
 * definitivo) y sin cita. En cada aspirante: el laboratorio, la cita, si le
 * llegó el recordatorio y si confirmó; y los botones del resultado.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock, Loader2, Phone, Stethoscope, TriangleAlert } from "lucide-react";
import { fechaEnTexto, horaEnTexto } from "@/lib/seleccion/agenda";
import { CAUSAS_DESISTIMIENTO, CAUSAS_NO_APTO_EXAMEN } from "@/lib/seleccion/estadisticas-examenes";
import type { ResultadoExamen } from "@/lib/seleccion/examenes";
import type { AspiranteFase2, GrupoFase2 } from "@/lib/seleccion/fase2-servidor";
import { datosFase2, registrarFase2 } from "./actions";

const GRUPOS: { id: GrupoFase2; nombre: string; ayuda: string }[] = [
  { id: "registrar", nombre: "Para registrar", ayuda: "La cita fue hoy o antes: registre lo que dijo el laboratorio." },
  { id: "proximas", nombre: "Próximas citas", ayuda: "Citados a la fase 2 en los próximos días." },
  { id: "aplazados", nombre: "Aplazados", ayuda: "El laboratorio pidió repetir o completar algo: registre el concepto definitivo." },
  { id: "sin_cita", nombre: "Sin cita", ayuda: "Están en la fase 2 pero no tienen cita en pie: cítelos desde la ficha." },
];

const ESTADO_CITA: Record<string, { texto: string; tono: string }> = {
  confirmada: { texto: "Confirmó", tono: "bg-emerald-50 text-emerald-700" },
  programada: { texto: "Sin confirmar", tono: "bg-slate-100 text-slate-600" },
  pide_otra_fecha: { texto: "Pidió otra fecha", tono: "bg-amber-50 text-amber-800" },
};

export function Fase2Client({ puedeEditar }: { puedeEditar: boolean }) {
  const [datos, setDatos] = useState<{ aspirantes: AspiranteFase2[]; hoy: string } | null>(null);
  const [conPrueba, setConPrueba] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<GrupoFase2>("registrar");

  const cargar = useCallback(() => {
    datosFase2(conPrueba)
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [conPrueba]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const lista = (datos?.aspirantes ?? []).filter((a) => a.grupo === grupo);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 pb-24 sm:p-6">
      <Link href="/candidatos" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Candidatos
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF]">
          <Stethoscope className="h-5 w-5 text-[#4F46E5]" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900">Exámenes fase 2</h1>
          <p className="text-sm text-gray-500">Resultados médicos de la segunda fase: los registra una persona con lo que diga el laboratorio.</p>
        </div>
        <label className="flex items-center gap-1.5 self-center text-xs text-gray-500">
          <input type="checkbox" checked={conPrueba} onChange={(e) => setConPrueba(e.target.checked)} /> Incluir aspirantes de prueba
        </label>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {GRUPOS.map((g) => {
          const n = (datos?.aspirantes ?? []).filter((a) => a.grupo === g.id).length;
          const activa = grupo === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setGrupo(g.id)}
              className={`rounded-xl border p-3 text-left ${activa ? "border-[#4F46E5] bg-[#EEF2FF]" : "border-[#E2E8F0] bg-white hover:bg-gray-50"}`}
            >
              <span className={`block text-xs font-medium ${activa ? "text-[#4338CA]" : "text-gray-500"}`}>{g.nombre}</span>
              <span className={`mt-0.5 block text-2xl font-bold ${activa ? "text-[#312E81]" : n ? "text-gray-900" : "text-gray-300"}`}>{datos ? n : "…"}</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-gray-500">{GRUPOS.find((g) => g.id === grupo)!.ayuda}</p>

      {!datos ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E2E8F0] p-6 text-center text-sm text-gray-500">No hay aspirantes aquí.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {lista.map((a) => (
            <li key={a.procesoId} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <Aspirante a={a} hoy={datos.hoy} puedeEditar={puedeEditar} onCambio={cargar} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Aspirante({ a, hoy, puedeEditar, onCambio }: { a: AspiranteFase2; hoy: string; puedeEditar: boolean; onCambio: () => void }) {
  const [observacion, setObservacion] = useState("");
  const [causa, setCausa] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const estado = a.cita ? (ESTADO_CITA[a.cita.estado] ?? { texto: a.cita.estado, tono: "bg-slate-100 text-slate-600" }) : null;
  const registrar = (resultado: ResultadoExamen, exito: string) =>
    enTransicion(async () => {
      setAviso(null);
      const r = await registrarFase2(a.procesoId, resultado, observacion, causa).catch((e: Error) => ({ ok: false, error: e.message, texto: undefined }));
      setAviso(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error ?? "No se pudo registrar." });
      if (r.ok) {
        setObservacion("");
        setCausa("");
        onCambio();
      }
    });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/candidatos?q=${encodeURIComponent(a.cedula || a.procesoId)}`} className="font-semibold text-gray-900 hover:underline">
            {a.nombre}
          </Link>
          {a.prueba && <span className="ml-1.5 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">prueba</span>}
          <p className="text-xs text-gray-500">
            C.C. {a.cedula}
            {a.laboratorio ? ` · ${a.laboratorio}` : ""}
            {a.fase1 ? ` · fase 1 apta el ${fechaEnTexto(a.fase1)}` : ""}
          </p>
        </div>
        {a.celular && (
          <a href={`tel:${a.celular}`} className="inline-flex items-center gap-1 text-xs text-[#4F46E5]">
            <Phone className="h-3.5 w-3.5" /> {a.celular}
          </a>
        )}
      </div>

      {a.cita && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${a.cita.fecha < hoy ? "bg-red-50 text-red-700" : a.cita.fecha === hoy ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
            <CalendarClock className="h-3.5 w-3.5" /> {a.cita.fecha === hoy ? "Hoy" : fechaEnTexto(a.cita.fecha)} a las {horaEnTexto(a.cita.hora)}
          </span>
          {estado && <span className={`rounded-full px-2 py-0.5 ${estado.tono}`}>{estado.texto}</span>}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${a.cita.recordatorio ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {a.cita.recordatorio ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            {a.cita.recordatorio ? "Recordatorio enviado" : "Sin recordatorio"}
          </span>
        </div>
      )}
      {a.aplazado && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Aplazado: {a.aplazado.observacion ?? "sin motivo"}
        </p>
      )}

      {puedeEditar && a.grupo !== "sin_cita" && (
        <div className="space-y-2 rounded-lg border border-[#F1F5F9] p-2.5">
          <input
            className="h-9 w-full rounded-lg border border-[#E2E8F0] px-2.5 text-sm outline-none focus:border-[#4F46E5]"
            placeholder="Lo que dice el laboratorio (obligatorio si es no apto o aplazado)"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
          <input
            className="h-9 w-full rounded-lg border border-[#E2E8F0] px-2.5 text-sm outline-none focus:border-[#4F46E5]"
            list={`causas-f2-${a.procesoId}`}
            placeholder="Causa, si no fue apto o desistió"
            value={causa}
            onChange={(e) => setCausa(e.target.value)}
          />
          <datalist id={`causas-f2-${a.procesoId}`}>
            {[...CAUSAS_NO_APTO_EXAMEN.filter((c) => c !== "Otra"), ...CAUSAS_DESISTIMIENTO].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado} onClick={() => registrar("apto", "Fase 2 apta: pasa a reconocimiento de ruta.")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              Apto
            </button>
            <button type="button" disabled={ocupado || !observacion.trim()} onClick={() => registrar("no_apto", "Registrado como no apto: queda para decidir si sigue.")} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              No apto
            </button>
            <button type="button" disabled={ocupado || !observacion.trim()} onClick={() => registrar("aplazado", "Registrado como aplazado.")} className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50">
              Aplazado
            </button>
            <button type="button" disabled={ocupado || !causa.trim()} onClick={() => registrar("desistio", "Desistió: el proceso quedó cerrado por desistimiento.")} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
              Desistió
            </button>
            {ocupado && <Loader2 className="h-4 w-4 animate-spin self-center text-gray-400" />}
          </div>
        </div>
      )}
      {aviso && <p className={`rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{aviso.texto}</p>}
    </div>
  );
}
