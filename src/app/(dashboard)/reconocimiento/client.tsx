"use client";

/**
 * Reconocimiento de ruta (24-nov-2026): el encargado ve a los aspirantes por
 * estado (por verificar, por citar, en curso, terminados), registra las rutas
 * que hicieron y las que faltan, los cita y da la fase por terminada.
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, CalendarPlus, CheckCircle2, ChevronDown, ChevronUp, Loader2, Phone, Plus, Route, Trash2, XCircle } from "lucide-react";
import { fechaEnTexto, horaEnTexto } from "@/lib/seleccion/agenda";
import { PROCESO_ESTADOS } from "@/lib/contratacion/constants";
import type { AspiranteReconocimiento, EstadoReconocimiento, PantallaReconocimiento } from "@/lib/seleccion/reconocimiento-servidor";
import {
  citarReconocimientoAccion,
  citarTodosReconocimientoAccion,
  datosReconocimiento,
  finalizarReconocimientoAccion,
  llegadaReconocimientoAccion,
  noContinuaReconocimientoAccion,
  reabrirReconocimientoAccion,
  rutasReconocimientoAccion,
} from "./actions";

// 27-nov-2026: «Por citar» primero: son los que pueden hacerlo (desde la fase 1 de exámenes) y nadie ha citado.
const PESTANAS: { id: EstadoReconocimiento; nombre: string; ayuda: string }[] = [
  {
    id: "pendiente",
    nombre: "Por citar",
    ayuda: "Pueden hacer el reconocimiento desde que pasan a exámenes (fase 1), sin esperar el resultado, y nadie los ha citado: cítelos (se les avisa por WhatsApp).",
  },
  { id: "por_verificar", nombre: "Por verificar", ayuda: "Dijeron en el chat que conocen las rutas: verifíquelo y, si es así, déles por terminado." },
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

export function ReconocimientoClient({ puedeEditar, enCandidatos = false }: { puedeEditar: boolean; enCandidatos?: boolean }) {
  const [datos, setDatos] = useState<PantallaReconocimiento | null>(null);
  const [pestana, setPestana] = useState<EstadoReconocimiento>("pendiente");
  // La primera vez abre en la primera pestaña con aspirantes (por citar, por verificar, en curso).
  const [elegida, setElegida] = useState(false);
  const [conPrueba, setConPrueba] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    datosReconocimiento(conPrueba)
      .then((d) => {
        setDatos(d);
        setError(null);
        if (!elegida) {
          setElegida(true);
          const primera = (["pendiente", "por_verificar", "en_curso"] as const).find((e) => d.aspirantes.some((a) => (a.estado ?? "pendiente") === e));
          if (primera) setPestana(primera);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [conPrueba, elegida]);
  useEffect(cargar, [cargar]);

  const porEstado = useMemo(() => {
    const m: Record<EstadoReconocimiento, AspiranteReconocimiento[]> = { por_verificar: [], pendiente: [], en_curso: [], finalizado: [] };
    for (const a of datos?.aspirantes ?? []) m[a.estado ?? "pendiente"].push(a);
    return m;
  }, [datos]);

  // Búsqueda por nombre o cédula (27-nov-2026: la pantalla ya no es solo para el celular).
  const [busqueda, setBusqueda] = useState("");
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const lista = porEstado[pestana].filter((a) => {
    const q = norm(busqueda.trim());
    return !q || norm(a.nombre).includes(q) || a.cedula.includes(q.replace(/\D/g, "") || "\u0000");
  });
  const ayuda = PESTANAS.find((p) => p.id === pestana)!.ayuda;
  // En pantalla ancha, el detalle va al lado: el elegido o, si no hay, el primero de la lista.
  const elegidoAncho = lista.find((a) => a.procesoId === abierto) ?? lista[0] ?? null;

  return (
    <div className={`mx-auto w-full space-y-4 p-4 pb-24 sm:p-6 ${enCandidatos ? "max-w-7xl" : "max-w-3xl lg:max-w-7xl"}`}>
      {enCandidatos && (
        <Link href="/candidatos" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a Candidatos
        </Link>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF2FF]">
          <Route className="h-5 w-5 text-[#4F46E5]" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-gray-900">Reconocimiento de ruta</h1>
          <p className="text-sm text-gray-500">
            Aspirantes desde la fase 1 de exámenes hasta terminar el reconocimiento. {datos ? `Para terminar: ${datos.minimas} rutas${datos.obligatorias.length ? `, entre ellas ${datos.obligatorias.join(", ")}` : ""}.` : ""}
          </p>
        </div>
        <label className="flex items-center gap-1.5 self-center text-xs text-gray-500">
          <input type="checkbox" checked={conPrueba} onChange={(e) => setConPrueba(e.target.checked)} /> Incluir aspirantes de prueba
        </label>
      </div>

      {datos && !datos.disponible && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Falta aplicar la migración 20261124203802: el estado del reconocimiento se deduce y no se puede dar por terminado.</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Un recuadro por estado: el número y, al tocarlo, su lista. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {PESTANAS.map((p) => {
          const activa = pestana === p.id;
          const n = porEstado[p.id].length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${activa ? "border-[#4F46E5] bg-[#EEF2FF]" : "border-[#E2E8F0] bg-white hover:bg-gray-50"}`}
            >
              <span className={`block text-xs font-medium ${activa ? "text-[#4338CA]" : "text-gray-500"}`}>{p.nombre}</span>
              <span className={`mt-0.5 block text-2xl font-bold ${activa ? "text-[#312E81]" : n ? "text-gray-900" : "text-gray-300"}`}>{datos ? n : "…"}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">{ayuda}</p>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o cédula"
          className="h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm outline-none focus:border-[#4F46E5] sm:w-64"
        />
      </div>

      {datos && pestana === "pendiente" && puedeEditar && lista.length > 0 && (
        <CitarTodos key={`${datos.sugerida.fecha}-${lista.length}`} lista={lista} sugerida={datos.sugerida} onCambio={cargar} />
      )}

      {!datos ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#E2E8F0] p-6 text-center text-sm text-gray-500">{busqueda ? "Nadie coincide con la búsqueda." : "No hay aspirantes aquí."}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="space-y-2">
            {lista.map((a) => (
              <li key={a.procesoId} className="rounded-xl border border-[#E2E8F0] bg-white">
                <FilaAspirante
                  a={a}
                  elegido={elegidoAncho?.procesoId === a.procesoId}
                  abierta={abierto === a.procesoId}
                  onAbrir={() => setAbierto(abierto === a.procesoId ? null : a.procesoId)}
                />
                {/* En el celular, el detalle se abre debajo; en pantalla ancha va al lado. */}
                {abierto === a.procesoId && (
                  <div className="border-t border-[#F1F5F9] p-3 lg:hidden">
                    <DetalleAspirante a={a} rutas={datos.rutas} sugerida={datos.sugerida} puedeEditar={puedeEditar} onCambio={cargar} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {elegidoAncho && (
            <aside className="hidden lg:block">
              <div className="sticky top-4 rounded-xl border border-[#E2E8F0] bg-white p-4">
                <DetalleAspirante key={elegidoAncho.procesoId} a={elegidoAncho} rutas={datos.rutas} sugerida={datos.sugerida} puedeEditar={puedeEditar} onCambio={cargar} conEncabezado />
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

/** La barra de avance de las rutas. */
function Avance({ a }: { a: AspiranteReconocimiento }) {
  const pct = a.necesarias ? Math.min(100, Math.round((a.aprendidas.length / a.necesarias) * 100)) : 0;
  return (
    <div className="mt-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${a.completas ? "bg-emerald-500" : "bg-[#4F46E5]"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 text-xs text-gray-600">
        {a.aprendidas.length} de {a.necesarias} rutas{a.aprendidas.length ? ` · ${a.aprendidas.join(", ")}` : ""}
        {a.faltanObligatorias.length ? ` · falta ${a.faltanObligatorias.join(", ")}` : ""}
      </p>
    </div>
  );
}

/** Un aspirante en la lista: lo justo para decidir a quién atender. */
function FilaAspirante({ a, elegido, abierta, onAbrir }: { a: AspiranteReconocimiento; elegido: boolean; abierta: boolean; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`flex w-full items-start justify-between gap-2 rounded-xl p-3 text-left ${elegido ? "lg:bg-[#EEF2FF] lg:ring-1 lg:ring-[#4F46E5]/40" : "lg:hover:bg-gray-50"}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-gray-900">
          {a.nombre} {a.prueba && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">prueba</span>}
        </p>
        <p className="text-xs text-gray-500">
          C.C. {a.cedula} · {ETAPA[a.estadoProceso] ?? a.estadoProceso}
        </p>
        <Avance a={a} />
        {a.examen && (
          <p className={`mt-0.5 text-xs font-medium ${a.examen.resultado === "no_apto" ? "text-red-700" : "text-amber-700"}`}>
            {a.examen.resultado === "no_apto" ? `Fase ${a.examen.fase} no apta: en revisión de GH` : `Fase ${a.examen.fase} aplazada`}
          </p>
        )}
        {a.rutasDeclaradas != null && (
          <p className="text-xs text-indigo-700">Dijo que conoce {a.rutasDeclaradas >= 99 ? "todas las rutas" : `${a.rutasDeclaradas} ${a.rutasDeclaradas === 1 ? "ruta" : "rutas"}`}</p>
        )}
        {a.cita && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-600">
            <CalendarClock className="h-3.5 w-3.5" /> {fechaEnTexto(a.cita.fecha)} a las {horaEnTexto(a.cita.hora)} · {ESTADO_CITA[a.cita.estado] ?? a.cita.estado}
          </p>
        )}
      </div>
      <span className="lg:hidden">{abierta ? <ChevronUp className="h-5 w-5 shrink-0 text-gray-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />}</span>
    </button>
  );
}

/** Todo lo de un aspirante: datos, salidas y lo que se puede hacer. */
function DetalleAspirante({
  a,
  rutas,
  sugerida,
  puedeEditar,
  onCambio,
  conEncabezado = false,
}: {
  a: AspiranteReconocimiento;
  rutas: string[];
  sugerida: Sugerida;
  puedeEditar: boolean;
  onCambio: () => void;
  conEncabezado?: boolean;
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
    <div className="space-y-4">
      {conEncabezado && (
        <div className="border-b border-[#F1F5F9] pb-3">
          <p className="text-lg font-semibold text-gray-900">
            {a.nombre} {a.prueba && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">prueba</span>}
          </p>
          <p className="text-sm text-gray-500">
            C.C. {a.cedula} · {ETAPA[a.estadoProceso] ?? a.estadoProceso}
          </p>
          <Avance a={a} />
        </div>
      )}
      {a.celular && (
        <a href={`tel:${a.celular}`} className="inline-flex items-center gap-1.5 text-sm text-[#4F46E5]">
          <Phone className="h-4 w-4" /> {a.celular}
        </a>
      )}

      {a.salidas.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium text-gray-700">Salidas registradas</p>
          <div className="overflow-x-auto rounded-lg border border-[#F1F5F9]">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-xs text-gray-500">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Día</th>
                  <th className="px-2 py-1.5 text-left font-medium">Ruta</th>
                  <th className="px-2 py-1.5 text-left font-medium">Resultado</th>
                  <th className="px-2 py-1.5 text-left font-medium">Observación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-gray-700">
                {a.salidas.map((x, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-2 py-1.5">{fechaEnTexto(x.fecha)}</td>
                    <td className="px-2 py-1.5">{x.ruta}</td>
                    <td className={`px-2 py-1.5 ${x.resultado === "aprendida" ? "text-emerald-700" : x.resultado === "repetir" ? "text-amber-700" : "text-red-700"}`}>
                      {x.resultado === "aprendida" ? "La aprendió" : x.resultado === "repetir" ? "Debe repetirla" : "No continúa"}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-gray-500">{x.observacion ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-[#F1F5F9] p-3">
              <Cita a={a} sugerida={sugerida} ocupado={ocupado} correr={correr} />
            </div>
            <div className="rounded-lg border border-[#F1F5F9] p-3">
              <RegistrarRutas a={a} rutas={rutas} ocupado={ocupado} correr={correr} />
            </div>
            <div className="xl:col-span-2">
              <Terminar a={a} ocupado={ocupado} correr={correr} />
            </div>
            <div className="xl:col-span-2">
              <NoContinua a={a} ocupado={ocupado} correr={correr} />
            </div>
          </div>
        )
      )}

      {ocupado && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      {aviso && <p className={`rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{aviso.texto}</p>}
    </div>
  );
}

type Correr = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => void;

type Sugerida = PantallaReconocimiento["sugerida"];

const sumarDiasCliente = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** «Sugerida: mañana, … a las …» con el enlace para volver a ella. */
function LineaSugerida({ sugerida, fecha, hora, usar }: { sugerida: Sugerida; fecha: string; hora: string; usar: () => void }) {
  const esLa = fecha === sugerida.fecha && hora === sugerida.hora;
  const manana = sugerida.fecha === sumarDiasCliente(hoyBogota(), 1);
  return (
    <p className="text-xs text-gray-500">
      Sugerida:{" "}
      <span className="font-medium text-gray-700">
        {manana ? "mañana, " : ""}
        {fechaEnTexto(sugerida.fecha)} a las {horaEnTexto(sugerida.hora)}
      </span>
      {!esLa && (
        <button type="button" className="ml-2 text-[#4F46E5] underline" onClick={usar}>
          Usarla
        </button>
      )}
    </p>
  );
}

/**
 * «Citar a todos» (27-nov-2026): el mismo día y hora para todos los que están
 * por citar (los de la búsqueda, si hay una), para salir con todos juntos.
 * Los que tienen la fase 1 en revisión de GH quedan fuera. Pide confirmar antes.
 */
function CitarTodos({ lista, sugerida, onCambio }: { lista: AspiranteReconocimiento[]; sugerida: Sugerida; onCambio: () => void }) {
  const citables = lista.filter((a) => !a.cita && a.examen?.resultado !== "no_apto");
  const fuera = lista.length - citables.length;
  const [fecha, setFecha] = useState(sugerida.fecha);
  const [hora, setHora] = useState(sugerida.hora);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, enTransicion] = useTransition();
  if (!citables.length && !aviso) return null;
  const citar = () =>
    enTransicion(async () => {
      setAviso(null);
      const r = await citarTodosReconocimientoAccion(
        citables.map((a) => a.procesoId),
        fecha,
        hora
      ).catch((e: Error) => ({ ok: false, error: e.message, citados: 0, fallidos: [] as { procesoId: string; error: string }[] }));
      const nombres = (r.fallidos ?? []).map((f) => `${lista.find((a) => a.procesoId === f.procesoId)?.nombre ?? f.procesoId}: ${f.error}`);
      setAviso(
        r.citados
          ? { ok: !nombres.length, texto: `Citados ${r.citados} para el ${fechaEnTexto(fecha)} a las ${horaEnTexto(hora)}; a cada uno se le avisó por WhatsApp.${nombres.length ? ` No se pudo con: ${nombres.join(" · ")}` : ""}` }
          : { ok: false, texto: r.error ?? "No se pudo citar a nadie." }
      );
      setConfirmar(false);
      onCambio();
    });
  const usar = () => {
    setFecha(sugerida.fecha);
    setHora(sugerida.hora);
  };
  return (
    <div className="rounded-xl border border-[#C7D2FE] bg-[#F5F7FF] p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[#312E81]">
            <CalendarPlus className="h-4 w-4" /> Citar a todos el mismo día
          </p>
          <p className="text-xs text-gray-600">
            {citables.length} {citables.length === 1 ? "aspirante" : "aspirantes"} por citar
            {fuera ? ` (${fuera} con la fase 1 en revisión quedan fuera)` : ""}. A cada uno le llega el aviso por WhatsApp.
          </p>
          <LineaSugerida sugerida={sugerida} fecha={fecha} hora={hora} usar={usar} />
        </div>
        <input
          type="date"
          value={fecha}
          min={hoyBogota()}
          onChange={(e) => {
            setFecha(e.target.value);
            setConfirmar(false);
          }}
          className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm"
          aria-label="Día para todos"
        />
        <input
          type="time"
          value={hora}
          onChange={(e) => {
            setHora(e.target.value);
            setConfirmar(false);
          }}
          className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm"
          aria-label="Hora para todos"
        />
        {!confirmar ? (
          <button
            type="button"
            disabled={ocupado || !fecha || !hora || !citables.length}
            onClick={() => setConfirmar(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Citar a {citables.length === 1 ? "1" : `los ${citables.length}`}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" disabled={ocupado} onClick={citar} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white disabled:opacity-50">
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Sí, citar y avisar
            </button>
            <button type="button" disabled={ocupado} onClick={() => setConfirmar(false)} className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700">
              Cancelar
            </button>
          </div>
        )}
      </div>
      {confirmar && (
        <p className="mt-2 text-xs text-[#312E81]">
          Se citará a {citables.map((a) => a.nombre).join(", ")} el {fechaEnTexto(fecha)} a las {horaEnTexto(hora)}
        </p>
      )}
      {aviso && <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${aviso.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{aviso.texto}</p>}
    </div>
  );
}

function Cita({ a, sugerida, ocupado, correr }: { a: AspiranteReconocimiento; sugerida: Sugerida; ocupado: boolean; correr: Correr }) {
  // Sin cita, el formulario arranca con la fecha sugerida (el siguiente día hábil en que el profesor puede).
  const [fecha, setFecha] = useState(a.cita?.fecha ?? sugerida.fecha);
  const [hora, setHora] = useState(a.cita?.hora ?? sugerida.hora);
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
      <LineaSugerida
        sugerida={sugerida}
        fecha={fecha}
        hora={hora}
        usar={() => {
          setFecha(sugerida.fecha);
          setHora(sugerida.hora);
        }}
      />
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
