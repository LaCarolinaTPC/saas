/**
 * Lectura del estado de una tarea programada (`tareas_programadas`). Aparte del
 * ejecutor para que las pantallas lo lean sin importar las tareas mismas.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface EstadoTarea {
  id: string;
  ultimaRanura: string;
  ultimaEjecucion: string | null;
  ultimoOrigen: "automatico" | "manual" | null;
  ultimoUsuario: string | null;
  ultimoResultado: Record<string, unknown> | null;
  ultimoError: string | null;
}

/**
 * El estado de la tarea. `null` si no hay fila; lanza si la tabla no existe
 * (migración sin aplicar) para que quien llama decida qué hacer.
 */
export async function leerEstadoTarea(id: string): Promise<EstadoTarea | null> {
  const { data, error } = await createAdminClient()
    .from("tareas_programadas")
    .select("id, ultima_ranura, ultima_ejecucion, ultimo_origen, ultimo_usuario, ultimo_resultado, ultimo_error")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    ultimaRanura: (data.ultima_ranura as string) ?? "",
    ultimaEjecucion: (data.ultima_ejecucion as string | null) ?? null,
    ultimoOrigen: (data.ultimo_origen as EstadoTarea["ultimoOrigen"]) ?? null,
    ultimoUsuario: (data.ultimo_usuario as string | null) ?? null,
    ultimoResultado: (data.ultimo_resultado as Record<string, unknown> | null) ?? null,
    ultimoError: (data.ultimo_error as string | null) ?? null,
  };
}
