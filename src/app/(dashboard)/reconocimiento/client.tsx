"use client";

/**
 * Reconocimiento de ruta (24-nov-2026): el encargado ve a los aspirantes por
 * estado (por verificar, por citar, en curso, terminados), registra las rutas
 * que hicieron y las que faltan, los cita y da la fase por terminada.
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Loader2, Phone, Plus, Route, Trash2, XCircle } from "lucide-react";
import { fechaEnTexto, horaEnTexto } from "@/lib/seleccion/agenda";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";
import type { AspiranteReconocimiento, EstadoReconocimiento, PantallaReconocimiento } from "@/lib/seleccion/reconocimiento-servidor";
import {
  citarReconocimientoAccion,
  datosReconocimiento,
  finalizarReconocimientoAccion,
  llegadaReconocimientoAccion,
  noContinuaReconocimientoAccion,
  reabrirReconocimientoAccion,
  rutasReconocimientoAccion,
} from "./actions";

const PESTANAS: { id: EstadoReconocimiento; nombre: string; ayuda: string }[] = [
  { id: "por_verificar", nombre: "Por verificar", ayuda: "Dijeron en el chat que conocen las rutas: verifíquelo y, si es así, déles por terminado." },
  { id: "pendiente", nombre: "Por citar", ayuda: "Necesitan hacer el reconocimiento: cítelos (se les avisa por WhatsApp)." },
  { id: "en_curso", nombre: "En curso", ayuda: "Tienen salidas registradas o una cita. Registre las rutas de cada salida." },
  { id: "finalizado", nombre: "Terminados", ayuda: "Ya terminaron el reconocimiento: cuenta para contratar." },
];

const ETAPA: Record<string, string> = Object.fromEntries(PROCESO_ESTADOS.map((e) => [e.value, e.label]));
const ESTADO_CITA: Record<string, string> = { programada: "programada", confirmada: "confirmada", pide_otra_fecha: "pide otra fecha", asistio: "llegó", no_asistio: "no asistió" };
const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const campo = "h-11 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-base outline-none focus:border-[#4F46E5]";
const botonPri = "flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-semibold text-white disabled:opacity-50";
const botonSec = "flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-gray-700 disabled:opacity-50";

type Aviso = { ok: boolean; texto: string } | null;

export function ReconocimientoClient({ puedeEditar }: { puedeEditar: boolean }) {
  const [datos, setDatos] = useState<PantallaReconocimiento | null>(null);
  const [pestana, setPestana] = useState<EstadoReconocimiento>("por_verificar");
  const [conPrueba, setConPrueba] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    datosReconocimiento(conPrueba)
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [conPrueba]);
  useEffect(cargar, [cargar]);

  const porEstado = useMemo(() => {
    const m: Record<EstadoReconocimiento, AspiranteReconocimiento[]> = { por_verificar: [], pendiente: [], en_curso: [], finalizado: [] };
    for (const a of datos?.aspirantes ?? []) m[a.estado ?? "pendiente"].push(a);
    return m;
  }, [datos]);

  const lista = porEstado[pestana];
  const ayuda = PESTANAS.find((p) => p.id === pestana)!.ayuda;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF]">
          <Route className="h-5 w-5 text-[#4F46E5]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Reconocimiento de ruta</h1>
          <p className="text-sm text-gray-500">
            Aspirantes en exámenes o en reconocimiento. {datos ? `Para terminar: ${datos.minimas} rutas${datos.obligatorias.length ? `, entre ellas ${datos.obligatorias.join(", ")}` : ""}.` : ""}
          </p>
        </div>
      </div>

      {datos && !datos.disponible && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Falta aplicar la migración 20261124203802: el estado del reconocimiento se deduce y no se puede dar por terminado.</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white p-1">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${pestana === p.id ? "bg-[#4F46E5] font-medium text-white" : "text-gray-600 hover:bg-gray-50"}`}
          >
            {p.nombre} {datos ? `(${porEstado[p.id].length})` : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">{ayuda}</p>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={conPrueba} onChange={(e) => setConPrueba(e.target.checked)} /> Incluir aspirantes de prueba
        </label>
      </div>

      {!datos ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E2E8F0] p-6 text-center text-sm text-gray-500">No hay aspirantes aquí.</p>
      ) : (
        <ul className="space-y-3">
          {lista.map((a) => (
            <Tarjeta
              key={a.procesoId}
              a={a}
              rutas={datos.rutas}
              abierta={abierto === a.procesoId}
              onAbrir={() => setAbierto(abierto === a.procesoId ? null : a.procesoId)}
              puedeEditar={puedeEditar}
              onCambio={cargar}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Tarjeta({
  a,
  rutas,
  abierta,
  onAbrir,
  puedeEditar,
  onCambio,
}: {
  a: AspiranteReconocimiento;
  rutas: string[];
  abierta: boolean;
  onAbrir: () => void;
  puedeEditar: boolean;
  onCambio: () => void;
}) {
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, enTransicion] = useTransition();
  const correr = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) =>
    enTransicion(async () => {
      setAviso(null);
      const r = await accion().catch((e: Error) => ({ ok: false, error: e.message }));
      setAviso(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error ?? "No se pudo completar." });
      if (r.ok) onCambio();
    });

  return (
    <li className="rounded-xl border border-[#E2E8F0] bg-white">
      <button type="button" onClick={onAbrir} className="flex w-full items-start justify-between gap-2 p-3 text-left">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">
            {a.nombre} {a.prueba && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">prueba</span>}
          </p>
          <p className="text-xs text-gray-500">
            C.C. {a.cedula} · {ETAPA[a.estadoProceso] ?? a.estadoProceso}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {a.aprendidas.length} de {a.necesarias} rutas{a.aprendidas.length ? ` (${a.aprendidas.join(", ")})` : ""}
            {a.faltanObligatorias.length ? ` · falta ${a.faltanObligatorias.join(", ")}` : ""}
          </p>
          {a.examen && (
            <p className={`text-xs font-medium ${a.examen.resultado === "no_apto" ? "text-red-700" : "text-amber-700"}`}>
              {a.examen.resultado === "no_apto" ? `Fase ${a.examen.fase} no apta: en revisión de Gestión Humana (sigue en el reconocimiento mientras se decide)` : `Fase ${a.examen.fase} aplazada`}
            </p>
          )}
          {a.rutasDeclaradas != null && (
            <p className="text-xs text-indigo-700">En el chat dijo que conoce {a.rutasDeclaradas >= 99 ? "todas las rutas" : `${a.rutasDeclaradas} ${a.rutasDeclaradas === 1 ? "ruta" : "rutas"}`}</p>
          )}
          {a.cita && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-600">
              <CalendarClock className="h-3.5 w-3.5" /> Citado el {fechaEnTexto(a.cita.fecha)} a las {horaEnTexto(a.cita.hora)} · {ESTADO_CITA[a.cita.estado] ?? a.cita.estado}
            </p>
          )}
        </div>
        {abierta ? <ChevronUp className="h-5 w-5 shrink-0 text-gray-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />}
      </button>

      {abierta && (
        <div className="space-y-4 border-t border-[#F1F5F9] p-3">
          {a.celular && (
            <a href={`tel:${a.celular}`} className="inline-flex items-center gap-1.5 text-sm text-[#4F46E5]">
              <Phone className="h-4 w-4" /> {a.celular}
            </a>
          )}

          {a.salidas.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700">Salidas registradas</p>
              <ul className="space-y-0.5 text-sm text-gray-600">
                {a.salidas.map((s, i) => (
                  <li key={i}>
                    {fechaEnTexto(s.fecha)} · {s.ruta} · {s.resultado === "aprendida" ? "la aprendió" : s.resultado === "repetir" ? "debe repetirla" : "no continúa"}
                    {s.observacion ? ` · ${s.observacion}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.estado === "finalizado" ? (
            <div className="space-y-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Reconocimiento terminado
              </p>
              <p className="text-xs">
                {a.finalizadoPor ? `Por ${a.finalizadoPor}` : ""}
                {a.finalizadoAt ? ` el ${new Date(a.finalizadoAt).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" })}` : ""}
                {a.nota ? ` · ${a.nota}` : ""}
              </p>
              {puedeEditar && (
                <button type="button" disabled={ocupado} className="text-xs underline" onClick={() => correr(() => reabrirReconocimientoAccion(a.procesoId), "Volvió a «en curso».")}>
                  Reabrir (lo marqué por error)
                </button>
              )}
            </div>
          ) : (
            puedeEditar && (
              <>
                <Cita a={a} ocupado={ocupado} correr={correr} />
                <RegistrarRutas a={a} rutas={rutas} ocupado={ocupado} correr={correr} />
                <Terminar a={a} ocupado={ocupado} correr={correr} />
                <NoContinua a={a} ocupado={ocupado} correr={correr} />
              </>
            )
          )}

          {ocupado && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {aviso && <p className={`rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{aviso.texto}</p>}
        </div>
      )}
    </li>
  );
}

type Correr = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => void;

function Cita({ a, ocupado, correr }: { a: AspiranteReconocimiento; ocupado: boolean; correr: Correr }) {
  const [fecha, setFecha] = useState(a.cita?.fecha ?? "");
  const [hora, setHora] = useState(a.cita?.hora ?? "09:00");
  const yaEs = a.cita && a.cita.fecha <= hoyBogota();
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{a.cita ? "La cita" : "Citar al reconocimiento"}</p>
      {a.cita && yaEs && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={ocupado} className={botonSec} onClick={() => correr(() => llegadaReconocimientoAccion(a.cita!.id, true), "Registrado: llegó.")}>
            Llegó
          </button>
          <button type="button" disabled={ocupado} className={botonSec} onClick={() => correr(() => llegadaReconocimientoAccion(a.cita!.id, false), "Registrado: no asistió.")}>
            No asistió
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={fecha} min={hoyBogota()} onChange={(e) => setFecha(e.target.value)} className={campo} aria-label="Día" />
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={campo} aria-label="Hora" />
      </div>
      <button
        type="button"
        disabled={ocupado || !fecha || !hora}
        className={`${botonPri} w-full`}
        onClick={() => correr(() => citarReconocimientoAccion(a.procesoId, fecha, hora), a.cita ? "Cita movida: se le avisó por WhatsApp." : "Citado: se le avisó por WhatsApp.")}
      >
        <CalendarClock className="h-4 w-4" /> {a.cita ? "Mover la cita y avisar" : "Citar y avisar"}
      </button>
    </div>
  );
}

function RegistrarRutas({ a, rutas, ocupado, correr }: { a: AspiranteReconocimiento; rutas: string[]; ocupado: boolean; correr: Correr }) {
  const sugeridas = rutas.filter((r) => !a.aprendidas.some((x) => x.toLowerCase() === r.toLowerCase()));
  const [filas, setFilas] = useState<{ ruta: string; resultado: "aprendida" | "repetir" }[]>([{ ruta: "", resultado: "aprendida" }]);
  const [obs, setObs] = useState("");
  const listas = filas.filter((f) => f.ruta.trim());
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Registrar rutas de una salida</p>
      {filas.map((f, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-[#F1F5F9] p-2">
          <div className="flex gap-2">
            <input
              list={`rutas-${a.procesoId}`}
              value={f.ruta}
              onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, ruta: e.target.value } : x)))}
              placeholder="Ruta"
              className={campo}
            />
            {filas.length > 1 && (
              <button type="button" aria-label="Quitar esta ruta" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-red-600" onClick={() => setFilas(filas.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["aprendida", "repetir"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setFilas(filas.map((x, j) => (j === i ? { ...x, resultado: r } : x)))}
                className={`min-h-10 rounded-lg border px-3 text-sm font-medium ${f.resultado === r ? (r === "aprendida" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-amber-500 bg-amber-50 text-amber-700") : "border-[#E2E8F0] text-gray-700"}`}
              >
                {r === "aprendida" ? "La aprendió" : "Debe repetirla"}
              </button>
            ))}
          </div>
        </div>
      ))}
      <datalist id={`rutas-${a.procesoId}`}>
        {sugeridas.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {filas.length < 10 && (
        <button type="button" className="inline-flex items-center gap-1 text-sm text-[#4F46E5]" onClick={() => setFilas([...filas, { ruta: "", resultado: "aprendida" }])}>
          <Plus className="h-4 w-4" /> Agregar otra ruta
        </button>
      )}
      <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={300} placeholder="Observación (opcional)" className={campo} />
      <button
        type="button"
        disabled={ocupado || !listas.length}
        className={`${botonPri} w-full`}
        onClick={() =>
          correr(async () => {
            const r = await rutasReconocimientoAccion(a.procesoId, listas, obs);
            if (r.ok) {
              setFilas([{ ruta: "", resultado: "aprendida" }]);
              setObs("");
            }
            return r;
          }, "Rutas guardadas.")
        }
      >
        Guardar {listas.length > 1 ? `las ${listas.length} rutas` : "la ruta"}
      </button>
    </div>
  );
}

function Terminar({ a, ocupado, correr }: { a: AspiranteReconocimiento; ocupado: boolean; correr: Correr }) {
  const [nota, setNota] = useState(a.estado === "por_verificar" ? "Verificado: conoce las rutas" : a.completas ? "Aprendió las rutas" : "");
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-sm font-medium text-gray-700">Dar por terminado el reconocimiento</p>
      {!a.completas && a.estado !== "por_verificar" && <p className="text-xs text-amber-700">Todavía no tiene las rutas registradas: escriba por qué lo da por terminado.</p>}
      <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota (cómo se verificó)" className={campo} />
      <button type="button" disabled={ocupado || (!a.completas && nota.trim().length < 5)} className={`${botonPri} w-full bg-emerald-600`} onClick={() => correr(() => finalizarReconocimientoAccion(a.procesoId, nota), "Reconocimiento terminado.")}>
        <CheckCircle2 className="h-4 w-4" /> Terminado
      </button>
    </div>
  );
}

function NoContinua({ a, ocupado, correr }: { a: AspiranteReconocimiento; ocupado: boolean; correr: Correr }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!abierto) {
    return (
      <button type="button" className="inline-flex items-center gap-1 text-sm text-red-700" onClick={() => setAbierto(true)}>
        <XCircle className="h-4 w-4" /> No continúa…
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-medium text-red-800">No continúa: se cierra el proceso</p>
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Por qué no continúa (obligatorio)" className={campo} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={botonSec} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button type="button" disabled={ocupado || motivo.trim().length < 5} className={`${botonPri} bg-red-600`} onClick={() => correr(() => noContinuaReconocimientoAccion(a.procesoId, motivo, ""), "Proceso cerrado: no continúa.")}>
          Cerrar el proceso
        </button>
      </div>
    </div>
  );
}
