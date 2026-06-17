"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DragDropContext,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { KanbanCard } from "./kanban-card";
import { timeAgoBogota } from "@/lib/utils";
import { updateCandidateStage } from "@/lib/actions";
import {
  createStage,
  updateStage,
  deleteStage,
  moveStage,
} from "@/app/(dashboard)/configuracion/pipeline/actions";
import { MoreHorizontal, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Stage {
  id: string;
  key: string;
  label: string;
  color: string;
  text_color: string;
  tipo: string;
  orden: number;
}

interface PipelineRecord {
  id: string;
  candidate_id: string;
  vacancy_id: string;
  current_stage: string;
  applied_at: string;
  candidates: {
    id: string;
    full_name: string;
    email: string;
    [key: string]: any;
  };
  vacancies: {
    title: string;
  };
}

interface Column {
  stageId: string;
  id: string;
  title: string;
  badgeBg: string;
  badgeText: string;
  tipo: string;
  cards: {
    id: string;
    candidateId: string;
    name: string;
    role: string;
    initials: string;
    email: string;
    phone: string;
    date: string;
  }[];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function buildColumns(pipeline: PipelineRecord[], stages: Stage[]): Column[] {
  return stages.map((col) => {
    const records = pipeline.filter((r) => r.current_stage === col.key);
    return {
      stageId: col.id,
      id: col.key,
      title: col.label,
      badgeBg: col.color,
      badgeText: col.text_color,
      tipo: col.tipo,
      cards: records.map((r) => ({
        id: r.id,
        candidateId: r.candidates?.id ?? r.candidate_id,
        name: r.candidates?.full_name ?? "Sin nombre",
        role: r.vacancies?.title ?? "Sin vacante",
        initials: getInitials(r.candidates?.full_name ?? "??"),
        email: r.candidates?.email ?? "",
        phone: r.candidates?.phone ?? "",
        date: r.applied_at ? timeAgoBogota(r.applied_at) : "",
      })),
    };
  });
}

interface KanbanBoardProps {
  pipeline: PipelineRecord[];
  stages: Stage[];
  canManage: boolean;
}

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; stage: Stage }
  | null;

export function KanbanBoard({ pipeline, stages, canManage }: KanbanBoardProps) {
  const router = useRouter();
  const [columns, setColumns] = useState<Column[]>(() => buildColumns(pipeline, stages));
  const [editor, setEditor] = useState<EditorState>(null);
  const [busy, setBusy] = useState(false);

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const newColumns = columns.map((col) => ({ ...col, cards: [...col.cards] }));
    const sourceCol = newColumns.find((c) => c.id === source.droppableId)!;
    const destCol = newColumns.find((c) => c.id === destination.droppableId)!;
    const [moved] = sourceCol.cards.splice(source.index, 1);
    destCol.cards.splice(destination.index, 0, moved);
    setColumns(newColumns);

    if (source.droppableId !== destination.droppableId) {
      try {
        await updateCandidateStage(draggableId, destination.droppableId);
      } catch {
        setColumns(buildColumns(pipeline, stages));
      }
    }
  }

  async function runManage(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex h-[calc(100vh-160px)] gap-3 overflow-x-auto overflow-y-hidden px-1 pb-2">
          {columns.map((column, idx) => (
            <div
              key={column.id}
              className="flex w-[272px] min-w-[272px] shrink-0 flex-col rounded-xl bg-[#F1F5F9]"
            >
              <div className="flex items-center justify-between px-3 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold"
                    style={{ backgroundColor: column.badgeBg, color: column.badgeText }}
                  >
                    {column.title}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400">
                    {column.cards.length}
                  </span>
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      }
                    />
                    <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
                      <DropdownMenuItem onClick={() => setEditor({ mode: "edit", stage: stages[idx] })}>
                        <Pencil className="h-4 w-4" /> Editar etapa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={idx === 0 || busy}
                        onClick={() => runManage(() => moveStage(column.stageId, "up"), "Reordenado")}
                      >
                        <ChevronLeft className="h-4 w-4" /> Mover izquierda
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={idx === columns.length - 1 || busy}
                        onClick={() => runManage(() => moveStage(column.stageId, "down"), "Reordenado")}
                      >
                        <ChevronRight className="h-4 w-4" /> Mover derecha
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`¿Eliminar la etapa "${column.title}"?`)) return;
                          runManage(() => deleteStage(column.stageId, column.id), "Etapa eliminada");
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 ${
                      snapshot.isDraggingOver ? "bg-[#E2E8F0]/60" : ""
                    }`}
                    style={{ minHeight: 80 }}
                  >
                    {column.cards.length === 0 && !snapshot.isDraggingOver ? (
                      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300/60 py-8">
                        <p className="text-[11px] text-gray-400">Arrastra candidatos aqui</p>
                      </div>
                    ) : (
                      column.cards.map((card, index) => (
                        <KanbanCard
                          key={card.id}
                          id={card.candidateId}
                          name={card.name}
                          role={card.role}
                          initials={card.initials}
                          email={card.email}
                          date={card.date}
                          index={index}
                          draggableId={card.id}
                        />
                      ))
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}

          {/* Agregar etapa */}
          {canManage && (
            <button
              onClick={() => setEditor({ mode: "create" })}
              className="flex h-12 w-[200px] min-w-[200px] shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-[#CBD5E1] text-sm font-medium text-gray-500 hover:border-[#4F46E5] hover:text-[#4F46E5]"
            >
              <Plus className="h-4 w-4" /> Agregar etapa
            </button>
          )}
        </div>
      </DragDropContext>

      {editor && (
        <StageModal
          state={editor}
          busy={busy}
          onClose={() => setEditor(null)}
          onSubmit={async (data) => {
            if (editor.mode === "create") {
              await runManage(() => createStage(data), "Etapa creada");
            } else {
              await runManage(() => updateStage(editor.stage.id, data), "Etapa actualizada");
            }
            setEditor(null);
          }}
        />
      )}
    </>
  );
}

const TIPO_OPCIONES: { v: string; l: string }[] = [
  { v: "normal", l: "Normal" },
  { v: "ganado", l: "Ganado (contratado)" },
  { v: "perdido", l: "Perdido (rechazado)" },
];

function StageModal({
  state, busy, onClose, onSubmit,
}: {
  state: Exclude<EditorState, null>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (data: { label: string; color: string; text_color: string; tipo: string }) => void;
}) {
  const initial = state.mode === "edit" ? state.stage : null;
  const [label, setLabel] = useState(initial?.label ?? "");
  const [color, setColor] = useState(initial?.color ?? "#E0E7FF");
  const [textColor, setTextColor] = useState(initial?.text_color ?? "#4F46E5");
  const [tipo, setTipo] = useState(initial?.tipo ?? "normal");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {state.mode === "create" ? "Nueva etapa" : "Editar etapa"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej. Examen médico"
              className="h-9 w-full rounded-lg border border-[#E2E8F0] px-3 text-sm outline-none focus:border-[#4F46E5]"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Fondo
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border" />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              Texto
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border" />
            </label>
            <span className="ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: color, color: textColor }}>
              {label || "Vista previa"}
            </span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#E2E8F0] px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
            >
              {TIPO_OPCIONES.map((t) => (
                <option key={t.v} value={t.v}>{t.l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            disabled={busy || !label.trim()}
            onClick={() => onSubmit({ label, color, text_color: textColor, tipo })}
            className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {state.mode === "create" ? "Crear" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
