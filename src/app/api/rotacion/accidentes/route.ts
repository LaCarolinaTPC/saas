import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/ensure-profile";
import { getContextoEvaluacion } from "@/lib/rotacion/data/accidentes";
import { columnasFormato, guardarTercerosYVictimas } from "@/lib/accidentabilidad/datos";
import { claseDesdeLesionados, type FormatoPayload } from "@/lib/accidentabilidad/formato";
import {
  clasificarGravedad,
  factoresDesdeReporte,
  computePuntaje,
  sugerirNivel,
  requiereComite,
  medidasDeNivel,
  type Lesionados,
  type Danos,
  type Responsabilidad,
  type FactorKey,
} from "@/lib/accidentabilidad/policy";

const REVISOR_ROLES = ["admin", "rrhh"];

async function uploadSignature(
  admin: ReturnType<typeof createAdminClient>,
  dataUrl: string
): Promise<string> {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  const buffer = Buffer.from(base64, "base64");
  const path = `firmas/${crypto.randomUUID()}.png`;
  const { error } = await admin.storage
    .from("accidentes")
    .upload(path, buffer, { contentType: "image/png", upsert: false });
  if (error) throw new Error(`Error al guardar firma: ${error.message}`);
  return path;
}

export async function POST(request: NextRequest) {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const createdBy = await ensureProfile(user);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const conductor = (body.conductor ?? {}) as Record<string, unknown>;
  const firmaConductor = body.firma_conductor as string | undefined;

  // Validaciones mínimas de servidor
  if (!conductor.cedula || !conductor.nombre) {
    return NextResponse.json({ error: "Faltan datos del conductor." }, { status: 400 });
  }
  if (!body.direccion_accidente) {
    return NextResponse.json({ error: "Falta la dirección del accidente." }, { status: 400 });
  }
  if (!firmaConductor) {
    return NextResponse.json(
      { error: "La firma del conductor es obligatoria." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  try {
    // 1. Firmas
    const firmaConductorPath = await uploadSignature(admin, firmaConductor);
    const firmaTerceroPath = body.firma_tercero
      ? await uploadSignature(admin, body.firma_tercero as string)
      : null;
    const arreglo = (body.arreglo ?? {}) as Record<string, unknown>;
    const arregloFirmaPath = arreglo.firma
      ? await uploadSignature(admin, arreglo.firma as string)
      : null;

    const abogado = (body.abogado ?? {}) as Record<string, unknown>;
    const formato = (body.formato ?? {}) as Partial<FormatoPayload>;
    const { flags, columnas } = await columnasFormato(admin, formato);
    // El peatón del reporte anterior ahora es una víctima con condición
    // «peatón»; se conservan las columnas peaton_* para los informes.
    const peaton = (formato.victimas ?? []).find((v) => v.condicion === "peaton" && v.nombre?.trim());

    // 2. Insertar accidente
    const { data: accidente, error: insErr } = await admin
      .from("accidentes")
      .insert({
        conductor_id: (conductor.id as string) ?? null,
        conductor_cedula: conductor.cedula as string,
        conductor_nombre: conductor.nombre as string,
        conductor_licencia: (conductor.licencia as string) ?? null,
        conductor_codigo: (conductor.codigo as string) ?? null,
        fecha_accidente: (body.fecha_accidente as string) || new Date().toISOString(),
        direccion_accidente: body.direccion_accidente as string,
        ciudad: (body.ciudad as string) ?? null,
        lesionados: (body.lesionados as string) ?? null,
        clase_accidente: claseDesdeLesionados((body.lesionados as Lesionados | undefined) ?? null),
        danos_materiales: (body.danos_materiales as string) ?? null,
        ...columnas,
        responsabilidad_reportada: (body.responsabilidad_reportada as string) ?? null,
        resumen_hechos: (body.resumen_hechos as string) ?? null,
        nota_voz_url: (body.nota_voz_path as string) ?? null,
        nota_voz_transcripcion: (body.nota_voz_transcripcion as string) ?? null,
        tiene_peaton: Boolean(peaton),
        peaton_nombre: peaton?.nombre?.trim() ?? null,
        peaton_cedula: peaton?.cedula?.trim() || null,
        peaton_telefono: peaton?.telefono?.trim() || null,
        peaton_direccion: peaton?.direccion?.trim() || null,
        hubo_arreglo: Boolean(body.hubo_arreglo),
        arreglo_monto: arreglo.monto != null ? Number(arreglo.monto) : null,
        arreglo_receptor_nombre: (arreglo.receptor_nombre as string) ?? null,
        arreglo_receptor_cedula: (arreglo.receptor_cedula as string) ?? null,
        arreglo_firma_url: arregloFirmaPath,
        solicito_aseguradora: Boolean(body.solicito_aseguradora),
        aseguradora_nombre: (body.aseguradora_nombre as string) ?? null,
        abogado_nombre: (abogado.nombre as string) ?? null,
        abogado_apellidos: (abogado.apellidos as string) ?? null,
        abogado_cedula: (abogado.cedula as string) ?? null,
        abogado_celular: (abogado.celular as string) ?? null,
        firma_conductor_url: firmaConductorPath,
        firma_tercero_url: firmaTerceroPath,
        estado: "pendiente_revision",
        created_by: createdBy,
      })
      .select("id, consecutivo")
      .single();

    if (insErr || !accidente) {
      return NextResponse.json(
        { error: `No se pudo guardar el reporte: ${insErr?.message}` },
        { status: 500 }
      );
    }

    // 3. Vehículos del tercero y lesionados
    await guardarTercerosYVictimas(admin, accidente.id, formato);

    // 4. Evento de creación
    await admin.from("accidente_eventos").insert({
      accidente_id: accidente.id,
      tipo: "creado",
      estado_nuevo: "pendiente_revision",
      user_id: createdBy,
    });

    // 4b. Dictamen automático según la Política de Correctivos
    const lesionados = (body.lesionados as Lesionados | undefined) ?? null;
    const danos = (body.danos_materiales as Danos | undefined) ?? null;
    const gravedad = clasificarGravedad(lesionados, danos);
    if (gravedad) {
      const responsabilidad =
        (body.responsabilidad_reportada as Responsabilidad | undefined) ?? "en_estudio";
      const contexto = await getContextoEvaluacion(
        conductor.cedula as string,
        (body.fecha_accidente as string) || new Date().toISOString(),
        accidente.id
      );
      const factores: FactorKey[] = factoresDesdeReporte(flags);
      if (contexto.reincidente3m) factores.push("reincidencia");
      if (contexto.antiguedad3aSinEventos) factores.push("antiguedad_3a_sin_eventos");

      const input = {
        gravedad,
        responsabilidad,
        factores,
        eximentes: [],
        reincidente3m: contexto.reincidente3m,
      };
      const { puntaje, detalle } = computePuntaje(input);
      const sugerencia = sugerirNivel(input);

      await admin.from("accidente_evaluaciones").upsert(
        {
          accidente_id: accidente.id,
          gravedad,
          responsabilidad,
          factores,
          eximentes: [],
          puntaje,
          puntaje_detalle: detalle,
          reincidente: contexto.reincidente3m,
          reincidencia_3m: contexto.reincidencia3m,
          reincidencia_6m: contexto.reincidencia6m,
          reincidencia_12m: contexto.reincidencia12m,
          nivel_sugerido: sugerencia.nivel,
          nivel_final: sugerencia.nivel,
          medidas: medidasDeNivel(sugerencia.nivel),
          requiere_comite: requiereComite(gravedad),
          // dictamen automático: aún sin revisar manualmente
          evaluado_por: null,
          evaluado_at: null,
        },
        { onConflict: "accidente_id" }
      );
    }

    // 5. Notificar a los revisores
    const { data: revisores } = await admin
      .from("profiles")
      .select("id")
      .in("role", REVISOR_ROLES)
      .eq("is_active", true);

    if (revisores && revisores.length > 0) {
      await admin.from("notifications").insert(
        revisores.map((r) => ({
          user_id: r.id,
          title: "Nuevo reporte de accidente",
          message: `Reporte #${accidente.consecutivo} de ${conductor.nombre} pendiente de revisión.`,
          link: `/accidentabilidad/consultar/${accidente.id}`,
        }))
      );
    }

    return NextResponse.json({ id: accidente.id, consecutivo: accidente.consecutivo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error interno." },
      { status: 500 }
    );
  }
}
