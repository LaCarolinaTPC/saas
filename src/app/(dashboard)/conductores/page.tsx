import { createAdminClient } from "@/lib/supabase/admin";
import { ConductoresClient } from "./conductores-client";

export const dynamic = "force-dynamic";

type ConductorRow = {
  id: string;
  cedula: string;
  nombre: string;
  codigo: string | null;
  tipo_conductor: string | null;
  estado: string | null;
  fecha_ingreso: string | null;
  celular: string | null;
  correo: string | null;
};

const COLS =
  "id, cedula, nombre, codigo, tipo_conductor, estado, fecha_ingreso, celular, correo";

export default async function ConductoresRRHHPage() {
  // La tabla conductores tiene RLS activo; leemos con el cliente admin
  // (la página ya está protegida por la sesión en el proxy), igual que la
  // búsqueda de Rotación.
  const supabase = createAdminClient();

  // Supabase limita a 1000 filas por consulta → paginamos para traer todos.
  const all: ConductorRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("conductores")
      .select(COLS)
      .order("nombre", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as ConductorRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }

  return <ConductoresClient conductores={all} />;
}
