"use client";

/**
 * Candidatos › Agenda, encima de la agenda de la prueba de manejo (entrega 3):
 * los avisos del laboratorio por confirmar y las citas de exámenes de los
 * próximos días.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, FlaskConical, Stethoscope } from "lucide-react";
import {
  avisosLaboratorio, citasExamenesProximas, confirmarAvisoLaboratorio, descartarAvisoLaboratorio,
} from "@/app/(dashboard)/candidatos/entrega3-actions";
import type { AvisoLaboratorio, CitaExamen } from "@/lib/seleccion/laboratorio-lectura";
import type { ProcesoEnExamenes } from "@/lib/seleccion/laboratorio";

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const sumarDias = (f: string, n: number) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const fechaHora = (iso: string) => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));
const campo = "rounded-md border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#4F46E5]";

function Aviso({ a, procesos, puedeEditar, onListo }: { a: AvisoLaboratorio; procesos: ProcesoEnExamenes[]; puedeEditar: boolean; onListo: () => void }) {
  const sugerido = procesos.find((p) => p.id === a.procesoId);
  const [procesoId, setProcesoId] = useState(a.procesoId ?? "");
  const [fase, setFase] = useState<1 | 2>(a.fase ?? (sugerido?.estado === "en_examenes_fase2" ? 2 : 1));
  const [resultado, setResultado] = useState<"apto" | "no_apto" | "">(a.resultado ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const correr = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    enTransicion(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) onListo();
      else setError(r.error ?? "No se pudo completar.");
    });

  return (
    <li className="rounded-lg border border-[#E2E8F0] bg-white p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-gray-900">
          {a.nombreLeido ?? "Sin nombre"}
          {a.cedulaLeida ? <span className="font-normal text-gray-500"> · C.C. {a.cedulaLeida}</span> : null}
        </p>
        <span className="text-xs text-gray-400">{fechaHora(a.createdAt)}</span>
      </div>
      {a.texto && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{a.texto}</p>}
      {a.urlArchivo && (
        <a href={a.urlArchivo} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#4F46E5] hover:underline">
          Ver el archivo <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <p className="mt-1 text-xs text-gray-500">
        Lectura: {a.resultado === "apto" ? "apto" : a.resultado === "no_apto" ? "no apto" : "sin resultado claro"}
        {a.fase ? ` · fase ${a.fase}` : ""}
        {a.procesoNombre ? ` · corresponde a ${a.procesoNombre}` : " · no se pudo asociar a un aspirante"}
      </p>
      {puedeEditar && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className={`${campo} min-w-48`} value={procesoId} onChange={(e) => setProcesoId(e.target.value)}>
            <option value="">Elija el aspirante</option>
            {procesos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {p.cedula}
              </option>
            ))}
          </select>
          <select className={campo} value={fase} onChange={(e) => setFase(Number(e.target.value) as 1 | 2)}>
            <option value={1}>Fase 1</option>
            <option value={2}>Fase 2</option>
          </select>
          <select className={campo} value={resultado} onChange={(e) => setResultado(e.target.value as "apto" | "no_apto" | "")}>
            <option value="">Resultado</option>
            <option value="apto">Apto</option>
            <option value="no_apto">No apto</option>
          </select>
          <button
            type="button"
            disabled={ocupado || !procesoId || !resultado}
            onClick={() => correr(() => confirmarAvisoLaboratorio(a.id, procesoId, fase, resultado as "apto" | "no_apto"))}
            className="rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            Confirmar
          </button>
          <button type="button" disabled={ocupado} onClick={() => correr(() => descartarAvisoLaboratorio(a.id))} className="px-2 text-xs text-gray-500 underline">
            Descartar
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

export function AgendaExamenes({ puedeEditar }: { puedeEditar: boolean }) {
  const [avisos, setAvisos] = useState<{ avisos: AvisoLaboratorio[]; procesos: ProcesoEnExamenes[] } | null>(null);
  const [citas, setCitas] = useState<CitaExamen[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    const hoy = hoyBogota();
    avisosLaboratorio()
      .then((a) => vivo && setAvisos(a))
      .catch(() => undefined);
    citasExamenesProximas(hoy, sumarDias(hoy, 7))
      .then((c) => vivo && setCitas(c))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [version]);

  const pendientes = avisos?.avisos ?? [];
  if (!pendientes.length && !citas.length) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-4 sm:px-6">
      {pendientes.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <FlaskConical className="h-4 w-4" /> Avisos del laboratorio ({pendientes.length})
          </h2>
          <p className="mb-2 text-xs text-gray-500">Lo leyó el asistente en los mensajes del laboratorio. Nada cambia en el proceso hasta que alguien lo confirme.</p>
          <ul className="space-y-2">
            {pendientes.map((a) => (
              <Aviso key={a.id} a={a} procesos={avisos!.procesos} puedeEditar={puedeEditar} onListo={() => setVersion((v) => v + 1)} />
            ))}
          </ul>
        </section>
      )}
      {citas.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Stethoscope className="h-4 w-4" /> Exámenes de los próximos días
          </h2>
          <ul className="divide-y divide-[#F1F5F9] rounded-lg border border-[#E2E8F0] bg-white">
            {citas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-gray-900">{c.nombre}</span>
                  <span className="text-gray-500"> · {c.tipo === "examen_f1" ? "fase 1" : "fase 2 (en ayunas)"}</span>
                </span>
                <span className="flex items-center gap-3 text-gray-600">
                  {fechaCorta(c.fecha)} · {c.hora}
                  {c.candidateId && (
                    <Link href={`/candidatos/${c.candidateId}`} className="text-xs text-[#4F46E5] hover:underline">
                      Ficha
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
