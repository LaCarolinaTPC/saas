"use client";

import { useRouter } from "next/navigation";
import UploadCard from "@/components/rotacion/upload/UploadCard";
import UploadHistory from "@/components/rotacion/upload/UploadHistory";
import type { FileType } from "@/lib/rotacion/upload/types";

const FILE_TYPES: FileType[] = [
  "conductores_activos",
  "conductores_retirados",
  "cierres_diarios",
  "viajes_perdidos",
  "ausentismo",
  "familia",
  "reingresos",
  "incentivos",
];

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
}

export default function DatosClient({ lastUploads, history }: Props) {
  const router = useRouter();

  function handleComplete() {
    router.refresh();
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Carga de Datos
        </h1>
        <p className="text-sm text-text-tertiary mt-1">
          Sube los archivos Excel para actualizar la informacion del sistema
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FILE_TYPES.map((ft) => (
          <UploadCard
            key={ft}
            fileType={ft}
            lastUpload={lastUploads[ft]}
            onComplete={handleComplete}
          />
        ))}
      </div>

      <UploadHistory entries={history} />
    </div>
  );
}
