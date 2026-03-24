"use client";

import Link from "next/link";
import { Draggable } from "@hello-pangea/dnd";

export interface KanbanCardProps {
  id: string;
  name: string;
  role: string;
  initials: string;
  badgeText: string;
  badgeColor: string;
  date: string;
  index: number;
  draggableId?: string;
}

export function KanbanCard({
  id,
  name,
  role,
  initials,
  badgeText,
  badgeColor,
  date,
  index,
  draggableId,
}: KanbanCardProps) {
  return (
    <Draggable draggableId={draggableId ?? id} index={index}>
      {(provided, snapshot) => (
        <Link href={`/candidatos/${id}`}>
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`rounded-[10px] border border-[#F1F5F9] bg-white p-4 transition-shadow ${
              snapshot.isDragging ? "shadow-lg" : "shadow-sm"
            } hover:shadow-md cursor-pointer`}
          >
            <div className="flex items-start justify-between">
              <span className="text-sm font-medium text-gray-900">{name}</span>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-medium text-white">
                {initials}
              </div>
            </div>
            <p className="mt-1 text-[13px] text-gray-500">{role}</p>
            <div className="mt-3 flex items-center justify-between">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: badgeColor }}
              >
                {badgeText}
              </span>
              <span className="text-[12px] text-gray-400">{date}</span>
            </div>
          </div>
        </Link>
      )}
    </Draggable>
  );
}
