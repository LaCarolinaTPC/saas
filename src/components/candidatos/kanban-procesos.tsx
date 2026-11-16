"use client";

/**
 * Tablero de procesos de contratación: una columna por estado, en el orden
 * real del proceso. Arrastrar una tarjeta cambia el estado del proceso (con
 * historial); soltar en «Cierre» pide la causa. Se actualiza solo con el aviso
 * en tiempo real del canal privado «procesos» (solo trae el id, nunca datos).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { Bot, X } from "lucide-react";
import { toast } from "sonner";
import { usePermisos } from "@/components/permisos/permisos-provider";
import { createClient } from "@/lib/supabase/client";
import { CAUSAS_NO_CONTRATO, PROCESO_ESTADOS, type ProcesoContratacion } from "@/lib/contratacion/constants";
import { updateProcesoEstado } from "@/lib/contratacion/actions";
import { ProcesoFormDialog, type VacanteOption } from "@/components/contratacion/procesos-client";
import { SemaforoPuntos } from "@/components/seleccion/semaforo";
import { timeAgoBogota } from "@/lib/utils";

type Columnas = Record<string, ProcesoContratacion[]>;

function agrupar(procesos: ProcesoContratacion[]): Columnas {
  const cols: Columnas = Object.fromEntries(PROCESO_ESTADOS.map((e) => [e.value, [] as ProcesoContratacion[]]));
  for (const p of procesos) (cols[p.estado] ?? (cols[p.estado] = [])).push(p);
  return cols;
}

/** Relee la página cuando la base avisa que un proceso cambió (canal privado «procesos»). */
function useAvisosProcesos(pausado: () => boolean) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let rafaga: number | undefined;
    let respaldo: number | undefined;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let cancelado = false;
    let conectadoAntes = false;
    const releer = () => {
      if (!pausado()) router.refresh();
    };
    // Varios avisos seguidos (p. ej. el asistente guarda datos y semáforo) se agrupan.
    const alAviso = () => {
      if (rafaga) return;
      rafaga = window.setTimeout(() => {
        rafaga = undefined;
        releer();
      }, 1500);
    };
    const iniciarRespaldo = () => {
      if (respaldo) return;
      respaldo = window.setInterval(() => document.visibilityState === "visible" && releer(), 60_000);
    };
    const detenerRespaldo = () => {
      if (respaldo) window.clearInterval(respaldo);
      respaldo = undefined;
    };
    iniciarRespaldo();
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelado) return;
      canal = supabase
        .channel("procesos", { config: { private: true } })
        .on("broadcast", { event: "cambio" }, alAviso)
        .subscribe((estado) => {
          if (estado === "SUBSCRIBED") {
            detenerRespaldo();
            if (conectadoAntes) releer();
            conectadoAntes = true;
          } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
            iniciarRespaldo();
          }
        });
    })();
    return () => {
      cancelado = true;
      if (rafaga) window.clearTimeout(rafaga);
      detenerRespaldo();
      if (canal) supabase.removeChannel(canal);
    };
  }, [router, pausado]);
}

export function KanbanProcesos({ procesos, vacancies }: { procesos: ProcesoContratacion[]; vacancies: VacanteOption[] }) {
  const router = useRouter();
  const edita = usePermisos()("candidatos.editar");
  const [columnas, setColumnas] = useState<Columnas>(() => agrupar(procesos));
  const [abierto, setAbierto] = useState<ProcesoContratacion | null>(null);
  const [cierre, setCierre] = useState<{ proceso: ProcesoContratacion; causa: string } | null>(null);

  // Cada relectura del servidor trae el estado real: reemplaza lo local
  // (estado derivado de las props, sin efecto).
  const [procesosPrevios, setProcesosPrevios] = useState(procesos);
  if (procesos !== procesosPrevios) {
    setProcesosPrevios(procesos);
    setColumnas(agrupar(procesos));
  }

  // Con la ficha o el diálogo de cierre abiertos no se relee (perdería lo que se está escribiendo).
  const ocupadoRef = useRef(false);
  useEffect(() => {
    ocupadoRef.current = abierto !== null || cierre !== null;
  }, [abierto, cierre]);
  const pausado = useCallback(() => ocupadoRef.current, []);
  useAvisosProcesos(pausado);

  function mover(id: string, desde: string, hacia: string, indice: number) {
    setColumnas((prev) => {
      const sig: Columnas = { ...prev, [desde]: [...(prev[desde] ?? [])], [hacia]: [...(prev[hacia] ?? [])] };
      const i = sig[desde].findIndex((p) => p.id === id);
      if (i < 0) return prev;
      const [p] = sig[desde].splice(i, 1);
      sig[hacia].splice(indice, 0, { ...p, estado: hacia });
      return sig;
    });
  }

  async function onDragEnd(r: DropResult) {
    const { source, destination, draggableId } = r;
    if (!destination || !edita || source.droppableId === destination.droppableId) return;
    const proceso = columnas[source.droppableId]?.find((p) => p.id === draggableId);
    if (!proceso) return;
    if (destination.droppableId === "cierre") {
      setCierre({ proceso, causa: proceso.requisito_incumplido ?? "" });
      return;
    }
    mover(draggableId, source.droppableId, destination.droppableId, destination.index);
    try {
      await updateProcesoEstado(draggableId, destination.droppableId);
      router.refresh();
    } catch (e) {
      // Vuelve a su columna si el servidor no aceptó el cambio.
      setColumnas(agrupar(procesos));
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar el estado.");
    }
  }

  async function confirmarCierre() {
    if (!cierre?.causa.trim()) return;
    const { proceso, causa } = cierre;
    setCierre(null);
    mover(proceso.id, proceso.estado, "cierre", 0);
    try {
      await updateProcesoEstado(proceso.id, "cierre", causa.trim());
      router.refresh();
    } catch (e) {
      setColumnas(agrupar(procesos));
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar el proceso.");
    }
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex h-[calc(100vh-160px)] gap-3 overflow-x-auto overflow-y-hidden px-1 pb-2">
          {PROCESO_ESTADOS.map((est) => {
            const tarjetas = columnas[est.value] ?? [];
            return (
              <div key={est.value} className="flex w-[264px] min-w-[264px] shrink-0 flex-col rounded-xl bg-[#F1F5F9]">
                <div className="flex items-center gap-2 px-3 py-3">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ backgroundColor: est.bg, color: est.color }}>
                    {est.label}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400">{tarjetas.length}</span>
                </div>
                <Droppable droppableId={est.value} isDropDisabled={!edita}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 ${snapshot.isDraggingOver ? "bg-[#E2E8F0]/60" : ""}`}
                      style={{ minHeight: 80 }}
                    >
                      {tarjetas.map((p, i) => (
                        <Draggable key={p.id} draggableId={p.id} index={i} isDragDisabled={!edita}>
                          {(prov, snap) => (
                            <button
                              type="button"
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => setAbierto(p)}
                              className={`w-full rounded-lg border border-[#E2E8F0] bg-white p-3 text-left shadow-sm transition-shadow hover:shadow ${snap.isDragging ? "shadow-lg ring-2 ring-[#4F46E5]/30" : ""}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium leading-snug text-gray-900">{p.nombre}</span>
                                {p.origen === "whatsapp_agente" && <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4F46E5]" aria-label="Creado por el asistente" />}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                CC {p.cedula}
                                {p.edad ? ` · ${p.edad} años` : ""}
                              </div>
                              {p.vacancies?.title && <div className="mt-0.5 truncate text-xs font-medium text-[#4F46E5]">{p.vacancies.title}</div>}
                              <div className="mt-2 flex items-center justify-between gap-2">
                                {p.estado === "pendiente" ? <SemaforoPuntos resultado={p.preseleccion} /> : <span />}
                                <span className="text-[11px] text-gray-400">{timeAgoBogota(p.updated_at)}</span>
                              </div>
                              {p.estado === "cierre" && p.causa_no_contrato && (
                                <div className="mt-1.5 truncate text-[11px] text-red-600">{p.causa_no_contrato}</div>
                              )}
                              {p.estado === "pendiente" && p.preseleccion?.global === "no_cumple" && p.requisito_incumplido && (
                                <div className="mt-1.5 truncate text-[11px] text-red-600">Se propone cerrar: {p.requisito_incumplido}</div>
                              )}
                            </button>
                          )}
                        </Draggable>
                      ))}
                      {tarjetas.length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300/60 py-8">
                          <p className="text-[11px] text-gray-400">Sin procesos</p>
                        </div>
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {abierto && <ProcesoFormDialog proceso={abierto} vacancies={vacancies} onClose={() => { setAbierto(null); router.refresh(); }} />}

      {cierre && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCierre(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Cerrar proceso</h3>
              <button onClick={() => setCierre(null)} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">
              ¿Por qué se cierra el proceso de <strong>{cierre.proceso.nombre}</strong>?
            </p>
            <input
              list="causas-cierre-tablero"
              autoFocus
              value={cierre.causa}
              onChange={(e) => setCierre({ ...cierre, causa: e.target.value })}
              placeholder="Selecciona o escribe la causa"
              className="h-9 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#4F46E5]"
            />
            <datalist id="causas-cierre-tablero">
              {CAUSAS_NO_CONTRATO.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setCierre(null)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                disabled={!cierre.causa.trim()}
                onClick={confirmarCierre}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Cerrar proceso
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
