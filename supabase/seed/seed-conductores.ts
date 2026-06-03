import { createClient } from "@supabase/supabase-js";
import {
  parseExcel,
  getDataPath,
  excelDateToISO,
  toStr,
  normalizeCedula,
} from "../../src/lib/rotacion/utils/excel-parser";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seedConductores(
  filePath: string,
  estado: string
): Promise<{ processed: number; errors: number }> {
  const rows = parseExcel(filePath, "Worksheet", 5);
  console.log(`  Parsed ${rows.length} rows from ${path.basename(filePath)}`);

  let processed = 0;
  let errors = 0;
  const batch: Record<string, unknown>[] = [];

  for (const row of rows) {
    const cedula = normalizeCedula(row["Identificacion"] ?? row["Identificación"]);
    if (!cedula || cedula === "0") {
      errors++;
      continue;
    }

    // Skip if we already have this cedula in the batch (dedup)
    if (batch.some((b) => b.cedula === cedula)) continue;

    batch.push({
      cedula,
      nombre: toStr(row["Nombre"]) || "SIN NOMBRE",
      codigo: toStr(row["Codigo"] ?? row["Código"]),
      correo: toStr(row["Correo"]),
      direccion: toStr(row["Direccion"] ?? row["Dirección"]),
      celular: toStr(row["Celular"]),
      telefono: toStr(row["Telefono"] ?? row["Teléfono"]),
      tipo_conductor: toStr(row["Tipo Conductor"]),
      licencia: toStr(row["Licencia"]),
      venc_licencia: excelDateToISO(row["Venc. Licencia"]),
      venc_contrato: excelDateToISO(row["Venc. Contrato"]),
      fecha_ingreso: excelDateToISO(row["Fecha Ingreso"]),
      fecha_retiro: excelDateToISO(row["Fecha Retiro"]),
      experiencia: toStr(row["Experiencia"]),
      fecha_nacimiento: excelDateToISO(row["Fecha Nacimiento"]),
      observacion: toStr(row["Observacion"] ?? row["Observación"]),
      eps: toStr(row["EPS"]),
      arl: toStr(row["ARL"]),
      pension: toStr(row["Pension"] ?? row["Pensión"]),
      compensacion: toStr(row["Compensacion"] ?? row["Compensación"]),
      tipo_sangre: toStr(row["Tipo Sangre"]),
      nivel_educativo: toStr(row["Nivel Educativo"]),
      num_hijos: row["Num Hijos"] != null ? Number(row["Num Hijos"]) : null,
      estado_civil: toStr(row["Estado Civil"]),
      reubicado: toStr(row["Reubicado"]),
      estado,
    });
  }

  // Upsert in chunks of 100
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100);
    const { error } = await supabase
      .from("conductores")
      .upsert(chunk, { onConflict: "cedula" });

    if (error) {
      console.error(`  Error inserting chunk ${i}:`, error.message);
      errors += chunk.length;
    } else {
      processed += chunk.length;
    }
  }

  return { processed, errors };
}

export async function run() {
  console.log("\n=== Seeding conductores ===");

  const activosPath = getDataPath(
    "drive-download-20260330T234227Z-1-001/vstConductoresactivos.xlsx"
  );
  const retiradosPath = getDataPath(
    "drive-download-20260330T234227Z-1-001/vstConductoresretirados.xlsx"
  );

  console.log("Activos:");
  const r1 = await seedConductores(activosPath, "ACTIVO");
  console.log(`  Done: ${r1.processed} inserted, ${r1.errors} errors`);

  console.log("Retirados:");
  const r2 = await seedConductores(retiradosPath, "RETIRADO");
  console.log(`  Done: ${r2.processed} inserted, ${r2.errors} errors`);

  // Log upload
  await supabase.from("data_uploads").insert([
    {
      file_name: "vstConductoresactivos.xlsx",
      file_type: "conductores_activos",
      rows_processed: r1.processed,
      rows_errors: r1.errors,
      status: "completed",
    },
    {
      file_name: "vstConductoresretirados.xlsx",
      file_type: "conductores_retirados",
      rows_processed: r2.processed,
      rows_errors: r2.errors,
      status: "completed",
    },
  ]);

  return { activos: r1, retirados: r2 };
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
