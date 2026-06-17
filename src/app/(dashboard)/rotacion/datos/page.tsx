import { createClient } from "@/lib/supabase/server";
import DatosClient from "./DatosClient";

export default async function DatosPage() {
  const supabase = await createClient();

  // Historial de cargas Excel
  const { data: history } = await supabase
    .from("data_uploads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  // Estado de sincronización con GEMA (fuente principal de datos)
  const { data: gemaState } = await supabase
    .from("gema_sync_state")
    .select("*");

  // Última carga Excel por tipo (solo los que se siguen subiendo a mano)
  const lastUploads: Record<
    string,
    { date: string; rows: number; by: string | null } | null
  > = {};

  const fileTypes = ["ausentismo", "familia", "incentivos"];

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
      gemaState={gemaState || []}
    />
  );
}
