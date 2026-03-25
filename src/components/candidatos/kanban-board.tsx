"use client";

import { useState } from "react";
import {
  DragDropContext,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { KanbanCard } from "./kanban-card";
import { KANBAN_COLUMNS } from "@/lib/constants";
import { updateCandidateStage } from "@/lib/actions";
import { MoreHorizontal } from "lucide-react";

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
  id: string;
  title: string;
  badgeBg: string;
  badgeText: string;
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

function formatRelativeDate(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Hace 1 dia";
  return `Hace ${diffDays} dias`;
}

function buildColumns(pipeline: PipelineRecord[]): Column[] {
  return KANBAN_COLUMNS.map((col) => {
    const records = pipeline.filter((r) => r.current_stage === col.id);
    return {
      id: col.id,
      title: col.title,
      badgeBg: col.badgeBg,
      badgeText: col.badgeText,
      cards: records.map((r) => ({
        id: r.id,
        candidateId: r.candidates?.id ?? r.candidate_id,
        name: r.candidates?.full_name ?? "Sin nombre",
        role: r.vacancies?.title ?? "Sin vacante",
        initials: getInitials(r.candidates?.full_name ?? "??"),
        email: r.candidates?.email ?? "",
        phone: r.candidates?.phone ?? "",
        date: r.applied_at ? formatRelativeDate(r.applied_at) : "",
      })),
    };
  });
}

interface KanbanBoardProps {
  pipeline: PipelineRecord[];
}

export function KanbanBoard({ pipeline }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Column[]>(() => buildColumns(pipeline));

  async function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const newColumns = columns.map((col) => ({
      ...col,
      cards: [...col.cards],
    }));

    const sourceCol = newColumns.find((c) => c.id === source.droppableId)!;
    const destCol = newColumns.find((c) => c.id === destination.droppableId)!;
    const [moved] = sourceCol.cards.splice(source.index, 1);
    destCol.cards.splice(destination.index, 0, moved);

    setColumns(newColumns);

    if (source.droppableId !== destination.droppableId) {
      try {
        await updateCandidateStage(draggableId, destination.droppableId);
      } catch {
        setColumns(buildColumns(pipeline));
      }
    }
  }

  const totalCards = columns.reduce((sum, col) => sum + col.cards.length, 0);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      {/* Full height board */}
      <div className="flex h-[calc(100vh-160px)] gap-3 overflow-x-auto overflow-y-hidden px-1 pb-2">
        {columns.map((column) => (
          <div
            key={column.id}
            className="flex w-[272px] min-w-[272px] shrink-0 flex-col rounded-xl bg-[#F1F5F9]"
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-3 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-semibold text-gray-700">
                  {column.title}
                </h3>
                <span
                  className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
                  style={{
                    backgroundColor: column.badgeBg,
                    color: column.badgeText,
                  }}
                >
                  {column.cards.length}
                </span>
              </div>
              <button className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable card area */}
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
                      <p className="text-[11px] text-gray-400">
                        Arrastra candidatos aqui
                      </p>
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
      </div>
    </DragDropContext>
  );
}
