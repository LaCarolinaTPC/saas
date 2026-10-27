"use client";

import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { ArrowDown, ArrowUp, Copy, Film, GripVertical, Plus, Trash2 } from "lucide-react";
import { MAX_DIAPOSITIVAS, duracionEfectiva, type Diapositiva } from "@/lib/pantalla/modelo";
import type { DatosWidgets } from "@/lib/pantalla/datos-reglas";
import { claseFuentes } from "@/lib/pantalla/fuentes";
import { LienzoMiniatura } from "../LienzoDiapositiva";

const ANCHO = 168;

/** Columna de miniaturas: elegir, cambiar el orden (arrastrando o con Subir/Bajar), duplicar y borrar. */
export function PanelDiapositivas({
  diapositivas,
  actual,
  medios,
  datos,
  onElegir,
  onReordenar,
  onAgregar,
  onDuplicar,
  onBorrar,
}: {
  diapositivas: Diapositiva[];
  actual: number;
  medios: Record<string, string>;
  datos: DatosWidgets;
  onElegir: (i: number) => void;
  /** Arrastrar o los botones «Subir» / «Bajar». */
  onReordenar: (de: number, a: number) => void;
  onAgregar: () => void;
  onDuplicar: (i: number) => void;
  onBorrar: (i: number) => void;
}) {
  const alSoltar = (r: DropResult) => {
    if (r.destination && r.destination.index !== r.source.index) onReordenar(r.source.index, r.destination.index);
  };
  const lleno = diapositivas.length >= MAX_DIAPOSITIVAS;

  return (
    <div className={`${claseFuentes} flex h-full flex-col`}>
      <div className="flex-1 overflow-y-auto p-3">
        <DragDropContext onDragEnd={alSoltar}>
          <Droppable droppableId="diapositivas">
            {(prov) => (
              <div ref={prov.innerRef} {...prov.droppableProps} className="space-y-3">
                {diapositivas.map((d, i) => {
                  const dur = duracionEfectiva(d);
                  return (
                    <Draggable key={d.id} draggableId={d.id} index={i}>
                      {(p, estado) => (
                        <div
                          ref={p.innerRef}
                          {...p.draggableProps}
                          {...p.dragHandleProps}
                          className={`group rounded-lg ${estado.isDragging ? "bg-white shadow-xl ring-2 ring-[#4F46E5]" : ""}`}
                          title="Arrastre para cambiar el orden"
                        >
                          <div className="mb-1 flex items-center justify-between gap-1 text-[11px] text-gray-500">
                            <span className="flex min-w-0 items-center gap-0.5">
                              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-400" aria-hidden />
                              <span className="truncate font-medium">
                                {i + 1}. {d.nombre || "Diapositiva"}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1 tabular-nums">
                              {dur.porVideo && <Film className="h-3 w-3" />}
                              {dur.porCarrusel ? `${dur.porCarrusel.segPorElemento} s × elemento` : `${Math.round(dur.seg)} s`}
                            </span>
                          </div>
                          {/* div y no button: la librería no deja arrastrar si el gesto empieza en un botón. */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => onElegir(i)}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onElegir(i))}
                            className={`relative block cursor-pointer overflow-hidden rounded-md border-2 ${
                              i === actual ? "border-[#4F46E5]" : "border-transparent hover:border-gray-300"
                            }`}
                            aria-label={`Diapositiva ${i + 1}`}
                          >
                            <LienzoMiniatura diapositiva={d} medios={medios} datos={datos} ancho={ANCHO} />
                          </div>
                          <div className={`mt-1 justify-end gap-0.5 ${i === actual ? "flex" : "hidden group-hover:flex"}`}>
                            <button
                              onClick={() => onReordenar(i, i - 1)}
                              disabled={i === 0}
                              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                              title="Subir"
                              aria-label={`Subir la diapositiva ${i + 1}`}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onReordenar(i, i + 1)}
                              disabled={i === diapositivas.length - 1}
                              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                              title="Bajar"
                              aria-label={`Bajar la diapositiva ${i + 1}`}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <span className="mx-0.5 w-px bg-gray-200" />
                            <button
                              onClick={() => onDuplicar(i)}
                              disabled={lleno}
                              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                              title="Duplicar"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onBorrar(i)}
                              disabled={diapositivas.length <= 1}
                              className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-40"
                              title="Borrar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {prov.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
      <div className="border-t border-[#E2E8F0] p-3">
        <button
          onClick={onAgregar}
          disabled={lleno}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-600 hover:border-[#4F46E5] hover:text-[#4F46E5] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Diapositiva
        </button>
      </div>
    </div>
  );
}
