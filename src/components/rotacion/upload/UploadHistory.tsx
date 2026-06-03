"use client";

import { CheckCircle, AlertCircle, Clock } from "lucide-react";

interface UploadEntry {
  id: string;
  file_name: string;
  file_type: string;
  rows_processed: number;
  rows_errors: number;
  status: string;
  uploaded_by: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; style: string }> = {
  completed: {
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    style: "text-emerald-600 bg-emerald-50",
  },
  completed_with_errors: {
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    style: "text-amber-600 bg-amber-50",
  },
  processing: {
    icon: <Clock className="w-3.5 h-3.5" />,
    style: "text-blue-600 bg-blue-50",
  },
  failed: {
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    style: "text-red-600 bg-red-50",
  },
};

export default function UploadHistory({ entries }: { entries: UploadEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="bg-surface-raised rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">
          Historial de cargas
        </h3>
      </div>
      <div className="max-h-[400px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg sticky top-0 z-10">
            <tr>
              {["Archivo", "Tipo", "Registros", "Estado", "Usuario", "Fecha"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const sc = STATUS_CONFIG[e.status] || STATUS_CONFIG.completed;
              return (
                <tr
                  key={e.id}
                  className="border-b border-border-subtle hover:bg-amber-50/30 transition-colors"
                >
                  <td className="px-4 py-3 text-text-primary font-medium max-w-[200px] truncate">
                    {e.file_name}
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {e.file_type}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-text-secondary">
                    {e.rows_processed.toLocaleString("es-CO")}
                    {e.rows_errors > 0 && (
                      <span className="text-negative ml-1">
                        ({e.rows_errors} err)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${sc.style}`}
                    >
                      {sc.icon}
                      {e.status === "completed" ? "OK" : e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-tertiary text-xs truncate max-w-[120px]">
                    {e.uploaded_by || "—"}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary text-xs whitespace-nowrap">
                    {new Date(e.created_at).toLocaleDateString("es-CO", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
