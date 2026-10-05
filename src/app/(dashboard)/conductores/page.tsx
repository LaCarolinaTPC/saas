import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { getRetiros } from "@/lib/conductores/retiro-data";
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
  fecha_retiro: string | null;
  celular: string | null;
  correo: string | null;
};

const COLS =
  "id, cedula, nombre, codigo, tipo_conductor, estado, fecha_ingreso, fecha_retiro, celular, correo";

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
      // Desempate único: con >1000 filas y nombres repetidos, la
      // paginación sin orden total puede repetir/perder conductores.
      .order("cedula", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as ConductorRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }

  const [perms, retiros] = await Promise.all([getCurrentPermissions(), getRetiros()]);

  return (
    <ConductoresClient
      conductores={all}
      retiros={retiros.porCedula}
      retirosDisponible={retiros.disponible}
      puedeEditar={perms.isAdmin || perms.puedeEditar}
    />
  );
}
