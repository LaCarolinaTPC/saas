"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import UploadCard from "@/components/rotacion/upload/UploadCard";
import UploadHistory from "@/components/rotacion/upload/UploadHistory";
import { CARGAS_MANUALES } from "@/lib/rotacion/upload/types";

// Datasets sincronizados automáticamente desde GEMA.
const GEMA_LABELS: Record<string, string> = {
  conductores: "Conductores",
  empleados: "Empleados (RRHH)",
  propietarios: "Propietarios",
  cierres: "Cierres / liquidaciones",
  viajes_perdidos: "Viajes perdidos",
  ingreso_tercero: "Ingreso de terceros",
  viajes_recaudados: "Viajes recaudados",
};

interface GemaState {
  dataset: string;
  last_synced_date: string | null;
  last_run_at: string | null;
  rows_synced: number | null;
  status: string | null;
  error: string | null;
}

interface Props {
  lastUploads: Record<
    string,
    { date: string; rows: number; by: string | null } | null
  >;
  history: Array<{
    id: string;
    file_name: string;
    file_type: string;
    rows_processed: number;
    rows_errors: number;
    status: string;
    uploaded_by: string | null;
    created_at: string;
  }>;
  gemaState: GemaState[];
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function DatosClient({ lastUploads, history, gemaState }: Props) {
  const router = useRouter();

  function handleComplete() {
    router.refresh();
  }

  const stateByDataset = new Map(gemaState.map((s) => [s.dataset, s]));

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Carga de Datos
        </h1>
        <p className="text-sm text-text-tertiary mt-1">
          La información de conductores, cierres y viajes se sincroniza
          automáticamente desde GEMA. Por Excel solo se cargan núcleo familiar e
          incentivos.
        </p>
      </div>

      {/* Estado de sincronización GEMA */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Sincronización GEMA
          </h2>
          <span className="text-xs text-text-tertiary">Automática (diaria)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {Object.entries(GEMA_LABELS).map(([key, label]) => {
            const s = stateByDataset.get(key);
            const ok = s?.status === "ok";
            return (
              <div
                key={key}
                className="flex items-center justify-between border-b border-border/50 pb-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      s?.error
                        ? "bg-red-500"
                        : ok
                        ? "bg-green-500"
                        : "bg-gray-300"
                    }`}
                  />
                  <span className="text-sm text-text-primary">{label}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-text-secondary">
                    {s?.rows_synced != null ? `${s.rows_synced} filas` : "—"}
                  </div>
                  <div className="text-[11px] text-text-tertiary">
                    {fmt(s?.last_run_at ?? null)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {gemaState.some((s) => s.error) && (
          <p className="mt-3 text-xs text-red-600">
            Hay datasets con error en la última sincronización. Revisa los logs
            del cron.
          </p>
        )}
      </section>

      {/* Cargas Excel restantes */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-3">
          Cargas manuales (Excel)
        </h2>
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-surface p-3 text-xs text-text-secondary">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
          <p>
            La <strong>matriz de incapacidades</strong> ya no se carga por Excel:
            se registra en{" "}
            <Link
              href="/ausentismo/matriz"
              className="font-medium text-gold-dark hover:underline"
            >
              Ausentismo › Matriz EPS
            </Link>
            , donde queda con diagnóstico, catálogos validados y rastro de quién
            la capturó. Las cargas anteriores siguen visibles en el historial.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CARGAS_MANUALES.map((ft) => (
            <UploadCard
              key={ft}
              fileType={ft}
              lastUpload={lastUploads[ft]}
              onComplete={handleComplete}
            />
          ))}
        </div>
      </div>

      <UploadHistory entries={history} />
    </div>
  );
}
