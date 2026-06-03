import { createClient } from "@/lib/supabase/server";
import DatosClient from "./DatosClient";

export default async function DatosPage() {
  const supabase = await createClient();

  // Fetch upload history
  const { data: history } = await supabase
    .from("data_uploads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  // Compute last upload per file type
  const lastUploads: Record<
    string,
    { date: string; rows: number; by: string | null } | null
  > = {};

  const fileTypes = [
    "conductores_activos",
    "conductores_retirados",
    "cierres_diarios",
    "viajes_perdidos",
    "ausentismo",
    "familia",
  ];

  for (const ft of fileTypes) {
    const entry = (history || []).find(
      (h: Record<string, unknown>) => h.file_type === ft
    );
    lastUploads[ft] = entry
      ? {
          date: entry.created_at as string,
          rows: entry.rows_processed as number,
          by: entry.uploaded_by as string | null,
        }
      : null;
  }

  return (
    <DatosClient
      lastUploads={lastUploads}
      history={history || []}
    />
  );
}
