import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { FILE_TYPE_CONFIG, type FileType } from "@/lib/rotacion/upload/types";

export const maxDuration = 60;

/**
 * Cada conductor cargado en Rotación también es empleado en RRHH.
 * Crea el empleado (employees) por cédula si aún no existe. No duplica
 * (los conductores ya existentes se omiten) ni sobrescribe empleados.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncEmployeesFromConductores(supabase: any, records: any[]) {
  const cedulas = [...new Set(records.map((r) => r?.cedula).filter(Boolean))] as string[];
  if (cedulas.length === 0) return;

  const { data: existing } = await supabase
    .from("employees")
    .select("document_number")
    .in("document_number", cedulas);
  const have = new Set((existing ?? []).map((e: { document_number: string }) => e.document_number));

  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (records as any[])
    .filter((r) => {
      if (!r?.cedula || have.has(r.cedula) || seen.has(r.cedula)) return false;
      seen.add(r.cedula);
      return true;
    })
    .map((r) => ({
      full_name: r.nombre || "Sin nombre",
      document_number: r.cedula,
      position: r.tipo_conductor || "Conductor",
      hire_date: r.fecha_ingreso || today,
      end_date: r.fecha_retiro || null,
      status: r.estado === "RETIRADO" ? "retirado" : "activo",
      email: r.correo || null,
      phone: r.celular || r.telefono || null,
      eps: r.eps || null,
      arl: r.arl || null,
      caja_compensacion: r.compensacion || null,
    }));

  if (rows.length > 0) await supabase.from("employees").insert(rows);
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await request.json();
    const { action, fileType, fileName, records, periodos } = body as {
      action: "prepare" | "chunk" | "finish";
      fileType: FileType;
      fileName: string;
      records?: Record<string, unknown>[];
      periodos?: string[];
    };

    const config = FILE_TYPE_CONFIG[fileType];
    if (!config) {
      return NextResponse.json({ error: "Tipo de archivo no valido" }, { status: 400 });
    }

    // PREPARE: delete existing data if strategy requires it
    if (action === "prepare") {
      if (config.strategy === "delete_insert") {
        const { error } = await supabase.from(config.table).delete().not("id", "is", null);
        if (error) {
          return NextResponse.json({ error: `Error limpiando tabla: ${error.message}` }, { status: 500 });
        }
      }
      if (config.strategy === "periodo_replace" && periodos?.length) {
        for (const periodo of periodos) {
          await supabase.from(config.table).delete().eq("periodo", periodo);
        }
      }
      // For conductores: delete only records with matching estado before re-inserting
      // This prevents retirados from overwriting activos and vice versa
      if (fileType === "conductores_activos") {
        await supabase.from("conductores").delete().eq("estado", "ACTIVO");
      }
      if (fileType === "conductores_retirados") {
        await supabase.from("conductores").delete().eq("estado", "RETIRADO");
      }
      return NextResponse.json({ ok: true });
    }

    // CHUNK: insert/upsert a batch of records
    if (action === "chunk" && records?.length && config.strategy !== "reingresos_update") {
      let error;
      // Conductores: use insert (duplicates already removed in prepare step)
      // Cierres: use upsert to handle duplicates across multiple files
      if (fileType === "conductores_activos" || fileType === "conductores_retirados") {
        // Use upsert with ignoreDuplicates to skip cedulas that already exist
        // (e.g., an activo cedula that also appears in retirados file)
        ({ error } = await supabase
          .from(config.table)
          .upsert(records, { onConflict: "cedula", ignoreDuplicates: true }));
      } else if (config.strategy === "upsert" && config.onConflict) {
        ({ error } = await supabase
          .from(config.table)
          .upsert(records, { onConflict: config.onConflict }));
      } else {
        ({ error } = await supabase.from(config.table).insert(records));
      }

      if (error) {
        return NextResponse.json({ ok: false, error: error.message, failed: records.length });
      }

      // Cada conductor cargado también se registra como empleado en RRHH.
      if (fileType === "conductores_activos" || fileType === "conductores_retirados") {
        try {
          await syncEmployeesFromConductores(supabase, records);
        } catch {
          // No bloquear la carga de conductores si falla el sync de empleados.
        }
      }

      return NextResponse.json({ ok: true, inserted: records.length });
    }

    // CHUNK: reingresos — individual UPDATE per cedula
    if (action === "chunk" && config.strategy === "reingresos_update" && records?.length) {
      let failed = 0;
      const chunkErrors: string[] = [];
      for (const row of records) {
        const { error: updErr } = await supabase
          .from("conductores")
          .update({ fecha_reingreso: row.fecha_reingreso })
          .eq("cedula", row.cedula as string);
        if (updErr) {
          chunkErrors.push(`Cedula ${row.cedula}: ${updErr.message}`);
          failed++;
        }
      }
      if (failed > 0) {
        return NextResponse.json({ ok: false, error: chunkErrors[0], failed });
      }
      return NextResponse.json({ ok: true, inserted: records.length });
    }

    // FINISH: log the upload
    if (action === "finish") {
      const { rowsProcessed, rowsErrors, errors: uploadErrors } = body as {
        rowsProcessed: number;
        rowsErrors: number;
        errors: string[];
      };

      await supabase.from("data_uploads").insert({
        file_name: fileName,
        file_type: fileType,
        rows_processed: rowsProcessed,
        rows_errors: rowsErrors,
        periodo: periodos?.join(", ") || null,
        status: rowsErrors === 0 ? "completed" : "completed_with_errors",
        uploaded_by: user.email,
        error_log: uploadErrors?.length > 0 ? uploadErrors.slice(0, 20) : null,
      });

      return NextResponse.json({
        results: [{
          success: rowsErrors === 0,
          fileName,
          rowsProcessed,
          rowsErrors,
          errors: (uploadErrors || []).slice(0, 5),
        }],
      });
    }

    return NextResponse.json({ error: "Accion no valida" }, { status: 400 });
  } catch (e) {
    console.error("Upload-records API error:", e);
    return NextResponse.json(
      { error: `Error interno del servidor: ${(e as Error).message}` },
      { status: 500 }
    );
  }
}
