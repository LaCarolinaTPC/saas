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
    badgeText: string;
    badgeColor: string;
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
        badgeText: col.title,
        badgeColor: col.badgeBg,
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

    // Update badge info to match destination column
    moved.badgeText = destCol.title;
    moved.badgeColor = destCol.badgeBg;

    destCol.cards.splice(destination.index, 0, moved);

    setColumns(newColumns);

    // Persist the stage change if the column changed
    if (source.droppableId !== destination.droppableId) {
      try {
        await updateCandidateStage(draggableId, destination.droppableId);
      } catch (error) {
        // Revert on error
        setColumns(buildColumns(pipeline));
      }
    }
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <div
            key={column.id}
            className="w-[280px] min-w-[280px] shrink-0 rounded-lg bg-[#F1F5F9] p-[10px]"
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-gray-700">
                {column.title}
              </h3>
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
                style={{
                  backgroundColor: column.badgeBg,
                  color: column.badgeText,
                }}
              >
                {column.cards.length}
              </span>
            </div>
            <Droppable droppableId={column.id}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex flex-col gap-2.5 min-h-[120px]"
                >
                  {column.cards.length === 0 ? (
                    <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 py-8">
                      <p className="text-xs text-gray-400">
                        No hay candidatos en esta etapa
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
                        badgeText={card.badgeText}
                        badgeColor={card.badgeColor}
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
