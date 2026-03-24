"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/candidatos/kanban-board";
import { CandidateTable } from "@/components/candidatos/candidate-table";

type View = "kanban" | "tabla";

interface CandidatosClientProps {
  pipeline: any[];
}

export function CandidatosClient({ pipeline }: CandidatosClientProps) {
  const [view, setView] = useState<View>("kanban");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        {/* TopBar */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            Pipeline de Candidatos
          </h1>
          <div className="flex items-center gap-1 rounded-lg border border-[#F1F5F9] bg-white p-1">
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("kanban")}
              className={
                view === "kanban"
                  ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                  : "text-gray-500"
              }
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </Button>
            <Button
              variant={view === "tabla" ? "default" : "ghost"}
              size="sm"
              onClick={() => setView("tabla")}
              className={
                view === "tabla"
                  ? "bg-[#4F46E5] text-white hover:bg-[#4338CA]"
                  : "text-gray-500"
              }
            >
              <List className="h-4 w-4" />
              Tabla
            </Button>
          </div>
        </div>

        {/* Content */}
        {view === "kanban" ? (
          <KanbanBoard pipeline={pipeline} />
        ) : (
          <CandidateTable pipeline={pipeline} />
        )}
      </div>
    </div>
  );
}
