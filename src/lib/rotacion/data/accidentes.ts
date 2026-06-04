import { createAdminClient } from "@/lib/supabase/admin";

export async function getAccidentes(estado?: string) {
  const admin = createAdminClient();
  let query = admin
    .from("accidentes")
    .select(
      "id, consecutivo, conductor_nombre, conductor_cedula, fecha_accidente, direccion_accidente, estado, hubo_arreglo, solicito_aseguradora, created_at"
    )
    .order("created_at", { ascending: false });

  if (estado && estado !== "todos") query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

export async function getAccidenteStats() {
  const admin = createAdminClient();
  const estados = ["pendiente_revision", "falta_informacion", "completada", "aprobado"];
  const counts: Record<string, number> = {};
  await Promise.all(
    estados.map(async (e) => {
      const { count } = await admin
        .from("accidentes")
        .select("*", { count: "exact", head: true })
        .eq("estado", e);
      counts[e] = count ?? 0;
    })
  );
  return counts;
}

async function sign(admin: ReturnType<typeof createAdminClient>, path: string | null) {
  if (!path) return null;
  const { data } = await admin.storage.from("accidentes").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function getAccidente(id: string) {
  const admin = createAdminClient();

  const { data: accidente, error } = await admin
    .from("accidentes")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !accidente) return null;

  const [{ data: vehiculos }, { data: eventos }] = await Promise.all([
    admin.from("accidente_vehiculos").select("*").eq("accidente_id", id),
    admin
      .from("accidente_eventos")
      .select("*, profiles:user_id(full_name)")
      .eq("accidente_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const [firmaConductor, firmaTercero, arregloFirma, notaVoz] = await Promise.all([
    sign(admin, accidente.firma_conductor_url),
    sign(admin, accidente.firma_tercero_url),
    sign(admin, accidente.arreglo_firma_url),
    sign(admin, accidente.nota_voz_url),
  ]);

  return {
    accidente,
    vehiculos: vehiculos ?? [],
    eventos: eventos ?? [],
    signed: {
      firmaConductor,
      firmaTercero,
      arregloFirma,
      notaVoz,
    },
  };
}
