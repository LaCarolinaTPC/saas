"use client";

import Link from "next/link";
import { Draggable } from "@hello-pangea/dnd";
import { FileText, Clock } from "lucide-react";

export interface KanbanCardProps {
  id: string;
  name: string;
  role: string;
  initials: string;
  email: string;
  date: string;
  index: number;
  draggableId?: string;
}

export function KanbanCard({
  id,
  name,
  role,
  initials,
  email,
  date,
  index,
  draggableId,
}: KanbanCardProps) {
  return (
    <Draggable draggableId={draggableId ?? id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
        >
          <Link href={`/candidatos/${id}`}>
            <div
              className={`group rounded-lg border bg-white p-3 transition-all ${
                snapshot.isDragging
                  ? "rotate-[2deg] border-[#4F46E5]/30 shadow-xl"
                  : "border-gray-200 shadow-sm hover:border-[#4F46E5]/20 hover:shadow-md"
              }`}
            >
              {/* Name + avatar */}
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium leading-snug text-gray-900 group-hover:text-[#4F46E5]">
                  {name}
                </p>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-[10px] font-bold text-white">
                  {initials}
                </div>
              </div>

              {/* Role / vacancy */}
              <p className="mt-1 text-[12px] leading-tight text-gray-500">
                {role}
              </p>

              {/* Footer */}
              <div className="mt-2.5 flex items-center gap-3 text-[11px] text-gray-400">
                {date && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {date}
                  </span>
                )}
                {email && (
                  <span className="truncate max-w-[120px]">{email}</span>
                )}
              </div>
            </div>
          </Link>
        </div>
      )}
    </Draggable>
  );
}
