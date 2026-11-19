"use client";

/**
 * Pantalla del profesor de manejo (entrega 2, E1 y E2), pensada para el
 * celular en el patio: una columna, botones grandes, un paso a la vez y la
 * acción principal fija abajo. Es la misma en /profesor (acciones reales) y en
 * Candidatos › Selección, dentro del marco de celular (acciones de prueba).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarOff, ChevronLeft, ChevronRight, Glasses, Loader2, Phone, RefreshCw } from "lucide-react";
import { estadoInfo } from "@/lib/contratacion/constants";
import { ESTADO_CITA_LABEL, citaVigente, fechaEnTexto, horaEnTexto } from "@/lib/seleccion/agenda";
import type { CitaDelDia } from "@/lib/seleccion/agenda-servidor";
import type { AspiranteProfesor, HistorialProfesor, PendientesProfesor, ResultadoProfesor } from "@/lib/seleccion/profesor-servidor";
import { useAvisosProcesos } from "@/hooks/use-avisos-procesos";
import { BuscadorOpciones } from "@/components/ui/buscador-opciones";
import { DisponibilidadProfesor } from "./disponibilidad-profesor";
import { HistorialProfesorLista } from "./historial-profesor";
import { ETIQUETA_MENSAJE, EVENTO_PRUEBA, avisarPrueba, textoEnvio, type AccionesProfesor } from "./profesor-tipos";

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const enDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

interface Elegido {
  procesoId: string;
  nombre: string;
  cedula: string;
  celular: string | null;
  estado: string;
  lentes: boolean;
}

const PRINCIPAL = "flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-4 text-base font-semibold text-white active:bg-[#4338CA] disabled:opacity-50";
const SECUNDARIO = "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-base font-medium text-gray-700 active:bg-gray-50 disabled:opacity-50";
const CAMPO = "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 text-base outline-none focus:border-[#4F46E5]";

function Opciones<T extends string>({ valor, onChange, opciones, columnas = 3 }: { valor: T | null; onChange: (v: T) => void; opciones: readonly (readonly [T, string, string?])[]; columnas?: 1 | 2 | 3 }) {
  return (
    <div className={`grid gap-2 ${columnas === 1 ? "grid-cols-1" : columnas === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {opciones.map(([v, t, tono]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => onChange(v)}
          className={`min-h-12 rounded-xl border px-2 py-2 text-base font-medium ${
            valor === v ? (tono === "rojo" ? "border-red-500 bg-red-50 text-red-700" : tono === "verde" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-[#4F46E5] bg-[#EEF2FF] text-[#4338CA]") : "border-[#E2E8F0] bg-white text-gray-700"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const SI_NO = [
  ["si", "Bien", "verde"],
  ["no", "Mal", "rojo"],
  ["sin_tomar", "No se tomó"],
] as const;

export function ProfesorVista({ acciones, puedeEditar, modoPrueba = false }: { acciones: AccionesProfesor; puedeEditar: boolean; modoPrueba?: boolean }) {
  const [fecha, setFecha] = useState(hoyBogota);
  const [pend, setPend] = useState<PendientesProfesor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Elegido | null>(null);
  const [verDias, setVerDias] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(
    () =>
      acciones
        .pendientes(fecha)
        .then((p) => {
          setPend(p);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [acciones, fecha]
  );
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const actualizar = () => {
    setCargando(true);
    void cargar().finally(() => setCargando(false));
  };
  useAvisosProcesos(cargar);
  // En el modo de prueba, el chat avisa cuando cita o cambia algo.
  useEffect(() => {
    if (!modoPrueba) return;
    window.addEventListener(EVENTO_PRUEBA, cargar);
    return () => window.removeEventListener(EVENTO_PRUEBA, cargar);
  }, [modoPrueba, cargar]);

  const hecho = useCallback(
    (r?: ResultadoProfesor) => {
      if (r?.texto && r.envio === "prueba") avisarPrueba({ texto: r.texto, etiqueta: ETIQUETA_MENSAJE[r.claveMensaje ?? ""] ?? "Mensaje al aspirante" });
      else if (modoPrueba) avisarPrueba();
      cargar();
    },
    [cargar, modoPrueba]
  );

  async function cita(c: CitaDelDia, accion: "llego" | "no_asistio" | "deshacer") {
    if (ocupado) return;
    setOcupado(`${c.id}-${accion}`);
    setAviso(null);
    const r = await acciones.cita(c.id, accion).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setOcupado(null);
    if (!r.ok) return setAviso(r.error ?? "No se pudo guardar.");
    if (accion === "no_asistio" && "texto" in r && r.texto && r.envio === "prueba") avisarPrueba({ texto: r.texto, etiqueta: ETIQUETA_MENSAJE.inasistencia });
    else if (modoPrueba) avisarPrueba();
    cargar();
  }

  const deCita = (c: CitaDelDia): Elegido => ({ procesoId: c.proceso_id, nombre: c.nombre, cedula: c.cedula, celular: c.celular, estado: c.procesoEstado, lentes: c.lentes });
  const deAspirante = (a: AspiranteProfesor): Elegido => ({ procesoId: a.procesoId, nombre: a.nombre, cedula: a.cedula, celular: a.celular, estado: a.estado, lentes: false });

  // El estado del aspirante elegido, al día con la última lectura.
  const estadoActual = useMemo(() => {
    if (!elegido || !pend) return elegido?.estado ?? null;
    const c = pend.citas.find((x) => x.proceso_id === elegido.procesoId);
    const a = [...pend.porCalificar, ...pend.escuela, ...pend.rutas].find((x) => x.procesoId === elegido.procesoId);
    return a?.estado ?? c?.procesoEstado ?? null;
  }, [elegido, pend]);

  if (verDias) {
    return (
      <div className="space-y-4 p-4">
        <button type="button" onClick={() => setVerDias(false)} className="flex min-h-12 items-center gap-2 text-base font-medium text-[#4F46E5]">
          <ArrowLeft className="h-5 w-5" /> Volver
        </button>
        <DisponibilidadProfesor
          acciones={acciones.disponibilidad}
          puedeEditar={puedeEditar}
          fechaInicial={fecha}
          aviso={modoPrueba ? "Ojo: estos días son los de verdad (no hay una agenda de prueba aparte). Lo que marques cambia la fecha que propone «Citar»; aquí solo se mueven las citas de candidatos de prueba." : undefined}
          onCambio={cargar}
        />
      </div>
    );
  }

  if (elegido) {
    return (
      <FichaAspirante
        key={elegido.procesoId}
        acciones={acciones}
        puedeEditar={puedeEditar}
        elegido={elegido}
        estado={estadoActual}
        rutasMinimas={pend?.rutasMinimas ?? 2}
        onVolver={() => setElegido(null)}
        onHecho={hecho}
      />
    );
  }

  const esHoy = fecha === hoyBogota();
  const idsDeCitas = new Set((pend?.citas ?? []).map((c) => c.proceso_id));
  const porCalificar = (pend?.porCalificar ?? []).filter((a) => !idsDeCitas.has(a.procesoId));
  const nada = pend && pend.citas.length === 0 && porCalificar.length === 0 && pend.escuela.length === 0 && pend.rutas.length === 0;

  return (
    <div className="space-y-5 p-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">{esHoy ? "Hoy" : "Día"}</p>
            <h1 className="truncate text-xl font-bold first-letter:uppercase text-gray-900">{fechaEnTexto(fecha)}</h1>
          </div>
          <button type="button" onClick={actualizar} aria-label="Actualizar" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-gray-600">
            {cargando ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setFecha(enDias(fecha, -1))} aria-label="Día anterior" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Día" className="h-12 min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-white px-3 text-base" />
          <button type="button" onClick={() => setFecha(enDias(fecha, 1))} aria-label="Día siguiente" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        {!esHoy && (
          <button type="button" onClick={() => setFecha(hoyBogota())} className="text-base font-medium text-[#4F46E5]">
            Volver a hoy
          </button>
        )}
        {pend && (
          <p className={`rounded-xl px-3 py-2 text-base ${pend.horaPrueba ? "bg-[#EEF2FF] text-[#4338CA]" : "bg-amber-50 text-amber-800"}`}>
            {pend.horaPrueba
              ? `Prueba de manejo a las ${horaEnTexto(pend.horaPrueba)}${pend.excepcion?.disponible ? " (hora cambiada)" : ""}`
              : pend.excepcion
                ? "Marcado como día en que no puedes."
                : "Este día no hay prueba de manejo (domingo o festivo)."}
          </p>
        )}
      </header>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-base text-red-700">{error}</p>}
      {aviso && <p className="rounded-xl bg-red-50 px-3 py-2 text-base text-red-700">{aviso}</p>}
      {!pend && !error && (
        <p className="flex items-center gap-2 py-6 text-base text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
        </p>
      )}
      {nada && <p className="rounded-xl border border-dashed border-[#CBD5E1] px-4 py-8 text-center text-base text-gray-500">No tienes aspirantes para este día.</p>}

      {pend && pend.citas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-gray-900">Prueba de manejo · {pend.citas.length}</h2>
          {pend.citas.map((c) => {
            const vigente = citaVigente(c);
            const porRegistrar = c.estado === "asistio" && c.procesoEstado === "prueba_manejo";
            return (
              <article key={c.id} className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-3">
                <button type="button" onClick={() => setElegido(deCita(c))} className="block w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-lg font-semibold leading-tight text-gray-900">{c.nombre}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-medium ${
                        c.estado === "asistio" ? "bg-emerald-50 text-emerald-700" : c.estado === "no_asistio" ? "bg-red-50 text-red-700" : c.estado === "confirmada" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {ESTADO_CITA_LABEL[c.estado]}
                    </span>
                  </div>
                  <p className="text-base text-gray-600">
                    {horaEnTexto(c.hora)} · CC {c.cedula}
                  </p>
                  {c.lentes && (
                    <p className="mt-1 flex items-center gap-1.5 text-base font-medium text-amber-700">
                      <Glasses className="h-5 w-5" /> Debe traer lentes
                    </p>
                  )}
                  {c.estado === "asistio" && !porRegistrar && <p className="mt-1 text-base text-gray-500">Prueba registrada · {estadoInfo(c.procesoEstado)?.label ?? c.procesoEstado}</p>}
                </button>
                {puedeEditar && vigente && (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => cita(c, "llego")} disabled={!!ocupado} className={PRINCIPAL}>
                      {ocupado === `${c.id}-llego` && <Loader2 className="h-5 w-5 animate-spin" />} Llegó
                    </button>
                    <button type="button" onClick={() => cita(c, "no_asistio")} disabled={!!ocupado} className={SECUNDARIO}>
                      {ocupado === `${c.id}-no_asistio` && <Loader2 className="h-5 w-5 animate-spin" />} No asistió
                    </button>
                  </div>
                )}
                {puedeEditar && porRegistrar && (
                  <button type="button" onClick={() => setElegido(deCita(c))} className={PRINCIPAL}>
                    Registrar la prueba
                  </button>
                )}
                {puedeEditar && c.estado === "no_asistio" && (
                  <button type="button" onClick={() => cita(c, "deshacer")} disabled={!!ocupado} className={SECUNDARIO}>
                    {ocupado === `${c.id}-deshacer` && <Loader2 className="h-5 w-5 animate-spin" />} Sí vino (deshacer)
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      {(
        [
          ["Falta el resultado de la prueba", porCalificar, () => "Llegó a la prueba"],
          ["En escuela", pend?.escuela ?? [], (a: AspiranteProfesor) =>
            `${a.clases === 0 ? "Sin clases todavía" : a.clases === 1 ? "1 clase" : `${a.clases} clases`}${a.clasesPendientes != null ? ` · le faltan ${a.clasesPendientes}` : ""}${a.faltas > 0 ? ` · ${a.faltas === 1 ? "1 falta" : `${a.faltas} faltas`}` : ""}`],
          ["Reconocimiento de ruta", pend?.rutas ?? [], (a: AspiranteProfesor) => `${Math.min(a.rutasAprendidas.length, pend?.rutasMinimas ?? 2)} de ${pend?.rutasMinimas ?? 2} rutas`],
        ] as const
      ).map(([titulo, lista, detalle]) =>
        lista.length === 0 ? null : (
          <section key={titulo} className="space-y-2">
            <h2 className="text-base font-semibold text-gray-900">
              {titulo} · {lista.length}
            </h2>
            {lista.map((a) => (
              <button key={a.procesoId} type="button" onClick={() => setElegido(deAspirante(a))} className="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-3 text-left active:bg-gray-50">
                <span className="min-w-0">
                  <span className="block truncate text-lg font-semibold leading-tight text-gray-900">{a.nombre}</span>
                  <span className="block text-base text-gray-600">
                    {detalle(a)}
                    {a.concepto ? ` · ${a.concepto === "acepta" ? "aceptado" : "no aceptado"}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
              </button>
            ))}
          </section>
        )
      )}

      <button type="button" onClick={() => setVerDias(true)} className={SECUNDARIO}>
        <CalendarOff className="h-5 w-5" /> Días que no puedo
      </button>
    </div>
  );
}

type Panel = "principal" | "observacion" | "concepto";

function FichaAspirante({
  acciones,
  puedeEditar,
  elegido,
  estado,
  rutasMinimas,
  onVolver,
  onHecho,
}: {
  acciones: AccionesProfesor;
  puedeEditar: boolean;
  elegido: Elegido;
  /** Estado del proceso al día; null si ya salió de la lista del profesor. */
  estado: string | null;
  rutasMinimas: number;
  onVolver: () => void;
  onHecho: (r?: ResultadoProfesor) => void;
}) {
  const [historial, setHistorial] = useState<HistorialProfesor | null>(null);
  const [version, setVersion] = useState(0);
  const [panel, setPanel] = useState<Panel>("principal");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [rutas, setRutas] = useState<string[]>([]);

  // Prueba de manejo
  const [rutaEscrita, setRutaEscrita] = useState<"si" | "no" | "sin_tomar" | null>(null);
  const [partesMotor, setPartesMotor] = useState<"si" | "no" | "sin_tomar" | null>(null);
  const [resPrueba, setResPrueba] = useState<"aprobo" | "escuela" | "no_continua" | null>(null);
  const [clases, setClases] = useState("");
  // Clase y ruta
  const [resClase, setResClase] = useState<"sigue" | "listo" | "no_continua" | null>(null);
  // ¿Llegó a la clase? y cuántas clases más necesita (lo decide el profesor, clase a clase).
  const [vino, setVino] = useState<"si" | "no" | null>(null);
  const [faltan, setFaltan] = useState("");
  const [ruta, setRuta] = useState("");
  const [resRuta, setResRuta] = useState<"aprendida" | "repetir" | "no_continua" | null>(null);
  const [concepto, setConcepto] = useState<"acepta" | "rechaza" | null>(null);
  const [nota, setNota] = useState("");

  useEffect(() => {
    let vivo = true;
    acciones
      .historial(elegido.procesoId)
      .then((h) => vivo && setHistorial(h))
      .catch(() => vivo && setHistorial(null));
    return () => {
      vivo = false;
    };
  }, [acciones, elegido.procesoId, version]);

  const etapa: "prueba" | "escuela" | "ruta" | "fuera" =
    estado === "en_escuela" ? "escuela" : estado === "en_examenes_fase2" || estado === "reconocimiento_ruta" ? "ruta" : estado && ["citado", "prueba_manejo", "antecedentes", "pendiente"].includes(estado) ? "prueba" : "fuera";

  useEffect(() => {
    if (etapa !== "ruta") return;
    let vivo = true;
    acciones
      .rutas()
      .then((r) => vivo && setRutas(r))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [acciones, etapa]);

  const opcionesRuta = useMemo(() => rutas.map((r) => ({ valor: r, etiqueta: r, claves: [r] })), [rutas]);

  async function guardar(fn: () => Promise<ResultadoProfesor>, mensaje: (r: ResultadoProfesor) => string) {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    setListo(null);
    const r = await fn().catch((e: Error) => ({ ok: false as const, error: e.message }));
    setOcupado(false);
    if (!r.ok) return setError(r.error ?? "No se pudo guardar. Revisa la señal e inténtalo otra vez.");
    setListo(`${mensaje(r)}${r.envio ? ` ${textoEnvio(r.envio)}` : ""}`);
    setNota("");
    setResClase(null);
    setVino(null);
    setFaltan("");
    setResRuta(null);
    setRuta("");
    setPanel("principal");
    setVersion((v) => v + 1);
    onHecho(r);
  }

  const faltaNota = (cierra: boolean) => cierra && !nota.trim();

  const principal =
    etapa === "prueba" ? (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Prueba de manejo</h2>
        <div>
          <p className="mb-1 text-base font-medium text-gray-700">Prueba de ruta escrita</p>
          <Opciones valor={rutaEscrita} onChange={setRutaEscrita} opciones={SI_NO} />
        </div>
        <div>
          <p className="mb-1 text-base font-medium text-gray-700">Partes del motor</p>
          <Opciones valor={partesMotor} onChange={setPartesMotor} opciones={SI_NO} />
        </div>
        <div>
          <p className="mb-1 text-base font-medium text-gray-700">Resultado</p>
          <Opciones
            columnas={1}
            valor={resPrueba}
            onChange={setResPrueba}
            opciones={[
              ["aprobo", "Pasa a exámenes", "verde"],
              ["escuela", "Va a escuela"],
              ["no_continua", "No continúa", "rojo"],
            ]}
          />
        </div>
        {resPrueba === "escuela" && (
          <label className="block text-base font-medium text-gray-700">
            ¿Cuántas clases le calculas? (opcional)
            <input value={clases} onChange={(e) => setClases(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className={`${CAMPO} mt-1`} />
          </label>
        )}
        <label className="block text-base font-medium text-gray-700">
          Observación{resPrueba === "no_continua" ? " (obligatoria)" : ""}
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={1000} className={`${CAMPO} mt-1`} placeholder="Cómo le fue, qué debe mejorar…" />
        </label>
      </div>
    ) : etapa === "escuela" ? (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Clase {(historial?.clases ?? 0) + 1} de escuela</h2>
        {historial && (historial.clasesPendientes != null || historial.faltas > 0) && (
          <p className="rounded-xl bg-[#EEF2FF] px-3 py-2 text-base text-[#4338CA]">
            {historial.clasesPendientes != null ? `Calculaste que le faltan ${historial.clasesPendientes === 1 ? "1 clase" : `${historial.clasesPendientes} clases`}.` : ""}
            {historial.faltas > 0 ? ` Ha faltado ${historial.faltas === 1 ? "1 vez" : `${historial.faltas} veces`}.` : ""}
          </p>
        )}
        <div>
          <p className="mb-1 text-base font-medium text-gray-700">¿Llegó a la clase?</p>
          <Opciones
            columnas={2}
            valor={vino}
            onChange={(v) => {
              setVino(v);
              setResClase(null);
            }}
            opciones={[
              ["si", "Sí llegó", "verde"],
              ["no", "No llegó", "rojo"],
            ]}
          />
        </div>
        {vino === "si" && (
          <div>
            <p className="mb-1 text-base font-medium text-gray-700">¿Cómo queda?</p>
            <Opciones
              columnas={1}
              valor={resClase}
              onChange={setResClase}
              opciones={[
                ["sigue", "Necesita más clases"],
                ["listo", "Listo: pasa a exámenes", "verde"],
                ["no_continua", "No continúa", "rojo"],
              ]}
            />
          </div>
        )}
        {vino === "no" && (
          <div>
            <p className="mb-1 text-base font-medium text-gray-700">¿Qué hacemos?</p>
            <Opciones
              columnas={1}
              valor={resClase}
              onChange={setResClase}
              opciones={[
                ["sigue", "Sigue en escuela (queda la falta)"],
                ["no_continua", "No continúa", "rojo"],
              ]}
            />
          </div>
        )}
        {vino === "si" && resClase === "sigue" && (
          <label className="block text-base font-medium text-gray-700">
            ¿Cuántas clases más necesita? (opcional)
            <input value={faltan} onChange={(e) => setFaltan(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className={`${CAMPO} mt-1`} placeholder="Por ejemplo, 2" />
          </label>
        )}
        {vino && (
          <label className="block text-base font-medium text-gray-700">
            Observación{resClase === "no_continua" ? " (obligatoria)" : ""}
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              maxLength={1000}
              className={`${CAMPO} mt-1`}
              placeholder={vino === "no" ? "¿Avisó? ¿Por qué no vino?" : "Qué se trabajó en la clase…"}
            />
          </label>
        )}
      </div>
    ) : etapa === "ruta" ? (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Reconocimiento de ruta · {Math.min(historial?.rutasAprendidas.length ?? 0, rutasMinimas)} de {rutasMinimas}
        </h2>
        {historial && historial.rutasAprendidas.length > 0 && <p className="text-base text-gray-600">Ya aprendió: {historial.rutasAprendidas.join(", ")}</p>}
        <div>
          <p className="mb-1 text-base font-medium text-gray-700">Ruta</p>
          {opcionesRuta.length > 0 ? (
            <BuscadorOpciones grande opciones={opcionesRuta} value={ruta} onChange={setRuta} placeholder="Busca la ruta" vacio={(b) => `No hay una ruta «${b}»`} />
          ) : (
            <input value={ruta} onChange={(e) => setRuta(e.target.value)} maxLength={80} className={CAMPO} placeholder="Nombre de la ruta" />
          )}
        </div>
        <Opciones
          columnas={1}
          valor={resRuta}
          onChange={setResRuta}
          opciones={[
            ["aprendida", "La aprendió", "verde"],
            ["repetir", "Debe repetirla"],
            ["no_continua", "No continúa", "rojo"],
          ]}
        />
        <label className="block text-base font-medium text-gray-700">
          Observación{resRuta === "no_continua" ? " (obligatoria)" : ""}
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={1000} className={`${CAMPO} mt-1`} />
        </label>
      </div>
    ) : (
      <p className="rounded-xl bg-gray-50 px-3 py-3 text-base text-gray-600">
        {estado === null ? "Este aspirante ya no está en tu lista" : `Está en «${estadoInfo(estado)?.label ?? estado}»`}: no hay nada por registrar ahora. Puedes dejar una observación o tu concepto.
      </p>
    );

  const accionPrincipal =
    etapa === "prueba"
      ? {
          texto: "Guardar la prueba",
          deshabilitado: !resPrueba || faltaNota(resPrueba === "no_continua"),
          fn: () =>
            guardar(
              () => acciones.prueba(elegido.procesoId, { resultado: resPrueba!, rutaEscrita, partesMotor, clasesSugeridas: clases ? Number(clases) : null, observacion: nota }),
              () => (resPrueba === "aprobo" ? "Guardado: pasa a exámenes." : resPrueba === "escuela" ? "Guardado: pasa a escuela." : "Guardado: el proceso quedó cerrado.")
            ),
        }
      : etapa === "escuela"
        ? {
            texto: vino === "no" ? "Guardar la falta" : "Guardar la clase",
            deshabilitado: !vino || !resClase || faltaNota(resClase === "no_continua"),
            fn: () =>
              guardar(
                () => acciones.clase(elegido.procesoId, { resultado: resClase!, observacion: nota, asistio: vino === "si", clasesFaltantes: vino === "si" && faltan ? Number(faltan) : null }),
                () =>
                  resClase === "listo"
                    ? "Guardado: pasa a exámenes."
                    : resClase === "no_continua"
                      ? "Guardado: el proceso quedó cerrado."
                      : vino === "no"
                        ? "Falta guardada: sigue en escuela."
                        : `Clase guardada: sigue en escuela${faltan ? ` (le faltan ${faltan})` : ""}.`
              ),
          }
        : etapa === "ruta"
          ? {
              texto: "Guardar la salida",
              deshabilitado: !ruta.trim() || !resRuta || faltaNota(resRuta === "no_continua"),
              fn: () =>
                guardar(
                  () => acciones.ruta(elegido.procesoId, { ruta, resultado: resRuta!, observacion: nota }),
                  (r) => (r.rutasCompletas ? `Salida guardada: completó las ${rutasMinimas} rutas.` : resRuta === "no_continua" ? "Guardado: el proceso quedó cerrado." : "Salida guardada.")
                ),
            }
          : null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-4 p-4">
        <button type="button" onClick={onVolver} className="flex min-h-12 items-center gap-2 text-base font-medium text-[#4F46E5]">
          <ArrowLeft className="h-5 w-5" /> Volver
        </button>
        <header>
          <h1 className="text-xl font-bold leading-tight text-gray-900">{elegido.nombre}</h1>
          <p className="text-base text-gray-600">
            CC {elegido.cedula}
            {estado ? ` · ${estadoInfo(estado)?.label ?? estado}` : ""}
          </p>
          {elegido.lentes && (
            <p className="mt-1 flex items-center gap-1.5 text-base font-medium text-amber-700">
              <Glasses className="h-5 w-5" /> Debe traer lentes (restricción de la licencia)
            </p>
          )}
          {elegido.celular && (
            <a href={`tel:${elegido.celular}`} className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 text-base font-medium text-gray-700">
              <Phone className="h-5 w-5" /> Llamar
            </a>
          )}
        </header>

        {listo && <p className="rounded-xl bg-emerald-50 px-3 py-3 text-base font-medium text-emerald-800">{listo}</p>}
        {error && <p className="rounded-xl bg-red-50 px-3 py-3 text-base text-red-700">{error}</p>}

        {puedeEditar && (
          <>
            {panel === "principal" && principal}
            {panel === "observacion" && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Observación</h2>
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={5} maxLength={2000} autoFocus className={CAMPO} placeholder="Lo que quieras dejar anotado de este aspirante…" />
              </div>
            )}
            {panel === "concepto" && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-gray-900">Tu concepto</h2>
                <Opciones
                  columnas={2}
                  valor={concepto}
                  onChange={setConcepto}
                  opciones={[
                    ["acepta", "Lo acepto", "verde"],
                    ["rechaza", "No lo acepto", "rojo"],
                  ]}
                />
                {concepto === "rechaza" && <p className="text-base text-red-700">Al guardar, el proceso se cierra. Gestión Humana lo puede reabrir.</p>}
                <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} maxLength={1000} className={CAMPO} placeholder={concepto === "rechaza" ? "Por qué no lo aceptas (obligatorio)" : "Nota (opcional)"} />
              </div>
            )}
            {panel === "principal" ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNota("");
                    setPanel("observacion");
                  }}
                  className={SECUNDARIO}
                >
                  Observación
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNota("");
                    setPanel("concepto");
                  }}
                  className={SECUNDARIO}
                >
                  Mi concepto
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNota("");
                  setPanel("principal");
                }}
                className="min-h-12 text-base font-medium text-gray-500"
              >
                Cancelar
              </button>
            )}
          </>
        )}

        <section className="space-y-2 border-t border-[#F1F5F9] pt-4">
          <h2 className="text-base font-semibold text-gray-900">Lo registrado</h2>
          {historial ? <HistorialProfesorLista historial={historial} grande /> : <p className="text-base text-gray-400">Cargando…</p>}
        </section>
      </div>

      {puedeEditar && (panel !== "principal" || accionPrincipal) && (
        <div className="sticky bottom-0 border-t border-[#E2E8F0] bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          {panel === "observacion" ? (
            <button type="button" disabled={ocupado || !nota.trim()} onClick={() => guardar(() => acciones.observacion(elegido.procesoId, nota), () => "Observación guardada.")} className={PRINCIPAL}>
              {ocupado && <Loader2 className="h-5 w-5 animate-spin" />} Guardar la observación
            </button>
          ) : panel === "concepto" ? (
            <button
              type="button"
              disabled={ocupado || !concepto || faltaNota(concepto === "rechaza")}
              onClick={() => guardar(() => acciones.concepto(elegido.procesoId, { concepto: concepto!, nota }), () => (concepto === "acepta" ? "Concepto guardado: lo aceptas." : "Concepto guardado: el proceso quedó cerrado."))}
              className={PRINCIPAL}
            >
              {ocupado && <Loader2 className="h-5 w-5 animate-spin" />} Guardar mi concepto
            </button>
          ) : (
            accionPrincipal && (
              <button type="button" disabled={ocupado || accionPrincipal.deshabilitado} onClick={accionPrincipal.fn} className={PRINCIPAL}>
                {ocupado && <Loader2 className="h-5 w-5 animate-spin" />} {accionPrincipal.texto}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
