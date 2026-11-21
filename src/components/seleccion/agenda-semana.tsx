"use client";

/**
 * Semana de la agenda (lunes a sábado): una columna por día con los citados a
 * la prueba de manejo. Una cita se reprograma arrastrándola a otro día; antes
 * de moverla se pide confirmación con el mensaje que le llegará al aspirante
 * por WhatsApp (MoverCitaDialog). No se puede soltar en días pasados ni en los
 * que no hay prueba (domingo, festivo o el profesor no puede).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { ChevronLeft, ChevronRight, Glasses, Loader2, RefreshCw } from "lucide-react";
import { ESTADO_CITA_LABEL, citaVigente, horaEnTexto } from "@/lib/seleccion/agenda";
import type { CitaDelDia } from "@/lib/seleccion/agenda-servidor";
import { agendaDeSemana, type AgendaDeSemana, type DiaDeAgenda } from "@/app/(dashboard)/candidatos/agenda-actions";
import { useAvisosProcesos } from "@/hooks/use-avisos-procesos";
import { MoverCitaDialog } from "./mover-cita-dialog";
import { textoEnvio } from "./profesor-tipos";

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const enDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Lunes de la semana de esa fecha (el domingo cuenta como el final de la semana anterior). */
export const lunesDe = (fecha: string) => enDias(fecha, -((new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7));

const DIA = new Intl.DateTimeFormat("es-CO", { weekday: "short", timeZone: "UTC" });
const DIA_MES = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
const fechaUTC = (f: string) => new Date(`${f}T00:00:00Z`);

const TONO: Record<string, string> = {
  programada: "bg-amber-50 text-amber-800",
  confirmada: "bg-sky-50 text-sky-700",
  pide_otra_fecha: "bg-violet-50 text-violet-700",
  asistio: "bg-emerald-50 text-emerald-700",
  no_asistio: "bg-red-50 text-red-700",
};

const BOTON = "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

/** Se puede arrastrar si sigue en pie (o no llegó) y el proceso no está cerrado ni contratado. */
const sePuedeMover = (c: CitaDelDia) => (citaVigente(c) || c.estado === "no_asistio") && c.procesoEstado !== "cierre" && c.procesoEstado !== "contratado";

/** Por qué no se puede soltar en ese día (null: sí se puede). */
function motivoCerrado(d: DiaDeAgenda, hoy: string): string | null {
  if (d.fecha < hoy) return "Ya pasó";
  if (d.horaPrueba) return null;
  if (d.excepcion && !d.excepcion.disponible) return "El profesor no puede";
  return "Sin prueba (festivo)";
}

export function AgendaSemana({ puedeEditar, fechaInicial, onVerDia }: { puedeEditar: boolean; fechaInicial: string; onVerDia: (fecha: string) => void }) {
  const [lunes, setLunes] = useState(() => lunesDe(fechaInicial));
  const [semana, setSemana] = useState<AgendaDeSemana | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mover, setMover] = useState<{ cita: CitaDelDia; destino: { fecha: string; hora: string } } | null>(null);

  const pedido = useRef(0);
  const cargar = useCallback(() => {
    const n = ++pedido.current;
    return agendaDeSemana(lunes)
      .then((s) => {
        if (n !== pedido.current) return;
        setSemana(s);
        setError(null);
      })
      .catch((e: Error) => n === pedido.current && setError(e.message));
  }, [lunes]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Con la confirmación abierta no se relee (la tarjeta no debe cambiar debajo).
  const ocupado = useRef(false);
  useEffect(() => {
    ocupado.current = mover !== null;
  }, [mover]);
  useAvisosProcesos(
    useCallback(() => {
      if (!ocupado.current) void cargar();
    }, [cargar])
  );

  const actualizar = () => {
    setCargando(true);
    void cargar().finally(() => setCargando(false));
  };

  const hoy = hoyBogota();
  const dias = semana?.dias ?? [];

  function onDragEnd(r: DropResult) {
    const { source, destination, draggableId } = r;
    if (!destination || source.droppableId === destination.droppableId) return;
    const cita = dias.find((d) => d.fecha === source.droppableId)?.citas.find((c) => c.id === draggableId);
    const dia = dias.find((d) => d.fecha === destination.droppableId);
    if (!cita || !dia?.horaPrueba) return;
    setMensaje(null);
    setMover({ cita, destino: { fecha: dia.fecha, hora: dia.horaPrueba } });
  }

  const sabado = enDias(lunes, 5);
  const titulo = `${DIA_MES.format(fechaUTC(lunes))} – ${DIA_MES.format(fechaUTC(sabado))}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setLunes(enDias(lunes, -7))} aria-label="Semana anterior" className={`${BOTON} w-11 px-0`}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-36 text-center text-base font-semibold text-gray-900">{titulo}</span>
        <button type="button" onClick={() => setLunes(enDias(lunes, 7))} aria-label="Semana siguiente" className={`${BOTON} w-11 px-0`}>
          <ChevronRight className="h-4 w-4" />
        </button>
        {lunes !== lunesDe(hoy) && (
          <button type="button" onClick={() => setLunes(lunesDe(hoy))} className={BOTON}>
            Esta semana
          </button>
        )}
        <button type="button" onClick={actualizar} aria-label="Actualizar" className={`${BOTON} w-11 px-0`}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {puedeEditar && <p className="text-sm text-gray-500">Para reprogramar, arrastra la cita al día nuevo. Antes de moverla se te pide confirmar y ves el mensaje que le llegará.</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensaje && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-gray-700">{mensaje}</p>}
      {!semana && !error && (
        <p className="flex items-center gap-2 py-8 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando la semana…
        </p>
      )}

      {semana && (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="grid min-w-[840px] grid-cols-6 gap-3">
              {dias.map((d) => {
                const cerrado = motivoCerrado(d, hoy);
                const esHoy = d.fecha === hoy;
                return (
                  <section key={d.fecha} className={`flex min-h-64 flex-col rounded-xl border ${esHoy ? "border-[#4F46E5]/50" : "border-[#E2E8F0]"} bg-[#F8FAFC]`}>
                    <header className="border-b border-[#E2E8F0] px-3 py-2">
                      <button type="button" onClick={() => onVerDia(d.fecha)} className="text-left" title="Ver el día">
                        <span className={`block text-sm font-semibold first-letter:uppercase ${esHoy ? "text-[#4F46E5]" : "text-gray-900"}`}>
                          {DIA.format(fechaUTC(d.fecha)).replace(".", "")} {DIA_MES.format(fechaUTC(d.fecha))}
                          {esHoy ? " · hoy" : ""}
                        </span>
                        <span className={`block text-xs ${d.horaPrueba ? "text-gray-500" : "font-medium text-amber-700"}`}>
                          {d.horaPrueba ? `Prueba ${horaEnTexto(d.horaPrueba)} · ${d.citas.length}` : d.excepcion && !d.excepcion.disponible ? "El profesor no puede" : "Sin prueba"}
                        </span>
                      </button>
                    </header>
                    <Droppable droppableId={d.fecha} isDropDisabled={!puedeEditar || cerrado !== null}>
                      {(prov, snap) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.droppableProps}
                          className={`flex flex-1 flex-col gap-2 p-2 transition-colors ${snap.isDraggingOver ? "bg-[#EEF2FF]" : ""}`}
                        >
                          {d.citas.map((c, i) => (
                            <Draggable key={c.id} draggableId={c.id} index={i} isDragDisabled={!puedeEditar || !sePuedeMover(c)}>
                              {(p, s) => (
                                // Un <div> y no un <button>: @hello-pangea/dnd no arrastra desde elementos interactivos.
                                <div
                                  ref={p.innerRef}
                                  {...p.draggableProps}
                                  {...p.dragHandleProps}
                                  className={`rounded-lg border border-[#E2E8F0] bg-white p-2.5 text-left shadow-sm ${puedeEditar && sePuedeMover(c) ? "cursor-grab active:cursor-grabbing" : ""} ${s.isDragging ? "shadow-lg ring-2 ring-[#4F46E5]/30" : ""}`}
                                >
                                  <p className="line-clamp-2 break-words text-sm font-medium leading-snug text-gray-900" title={c.nombre}>
                                    {c.nombre}
                                  </p>
                                  <p className="mt-0.5 text-xs text-gray-500">{horaEnTexto(c.hora)}</p>
                                  <p className="text-xs text-gray-500">CC {c.cedula}</p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONO[c.estado] ?? "bg-gray-100 text-gray-600"}`}>{ESTADO_CITA_LABEL[c.estado]}</span>
                                    {c.lentes && <Glasses className="h-3.5 w-3.5 text-amber-700" aria-label="Debe traer lentes" />}
                                    {c.reprogramaciones > 0 && (
                                      <span className={`text-[11px] ${c.proponeCierre ? "font-medium text-red-700" : "text-gray-500"}`}>
                                        {c.reprogramaciones}/{semana.reprogramacionesMax} reprog.
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {prov.placeholder}
                          {d.citas.length === 0 && !snap.isDraggingOver && (
                            <p className="flex flex-1 items-center justify-center text-center text-xs text-gray-400">{cerrado ?? "Sin citados"}</p>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </section>
                );
              })}
            </div>
          </div>
        </DragDropContext>
      )}

      {mover && semana && (
        <MoverCitaDialog
          cita={mover.cita}
          destino={mover.destino}
          reprogramacionesMax={semana.reprogramacionesMax}
          onClose={() => setMover(null)}
          onHecho={(r) => {
            const nombre = mover.cita.nombre;
            setMover(null);
            setMensaje(
              `${nombre}: cita movida. ${r.envio === "borrador" ? "El aviso quedó como borrador en la bandeja (pasaron más de 24 horas desde su último mensaje)." : textoEnvio(r.envio)}${r.proponeCierre ? " Superó el máximo de reprogramaciones: se propone cerrar por «Desistimiento»." : ""}`
            );
            void cargar();
          }}
        />
      )}
    </div>
  );
}
