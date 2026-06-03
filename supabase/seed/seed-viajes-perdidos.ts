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

async function seedVP(
  filePath: string
): Promise<{ processed: number; errors: number }> {
  const rows = parseExcel(filePath, undefined, 5);
  console.log(`  Parsed ${rows.length} rows from ${path.basename(filePath)}`);

  let processed = 0;
  let errors = 0;
  const batch: Record<string, unknown>[] = [];

  for (const row of rows) {
    const cedula = normalizeCedula(row["Ced. Conductor"]);
    if (!cedula || cedula === "0") {
      errors++;
      continue;
    }

    const fecha = excelDateToISO(row["Fecha"]);
    if (!fecha) {
      errors++;
      continue;
    }

    const day = parseInt(fecha.split("-")[2], 10);
    const periodo = fecha.slice(0, 7); // YYYY-MM

    batch.push({
      cedula_conductor: cedula,
      tipologia: toStr(row["Tipologia"]),
      novedad: toStr(row["Novedad"]),
      detalle_novedad: toStr(row["Detalle Novedad"]),
      fecha,
      despacho: toStr(row["Despacho"]),
      tipo_propietario: toStr(row["Tipo Propietario"]),
      vehiculo: toStr(row["Vehiculo"]),
      placa: toStr(row["Placa"]),
      conductor_nombre: toStr(row["Conductor"]),
      turno: toStr(row["Turno"]),
      viaje: toStr(row["Viaje"]),
      ruta: toStr(row["Ruta"]),
      planillero: toStr(row["Planillero"]),
      periodo,
      quincena: day <= 15 ? 1 : 2,
      source_file: path.basename(filePath),
    });
  }

  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200);
    const { error } = await supabase.from("viajes_perdidos").insert(chunk);

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
  console.log("\n=== Seeding viajes perdidos ===");

  const folder = "drive-download-20260330T234210Z-1-001";
  const files = ["Feb_2026.xlsx", "Mar_2026.xlsx"];

  for (const file of files) {
    console.log(`Processing ${file}:`);
    const result = await seedVP(getDataPath(`${folder}/${file}`));
    console.log(`  Done: ${result.processed} inserted, ${result.errors} errors`);

    await supabase.from("data_uploads").insert({
      file_name: file,
      file_type: "viajes_perdidos",
      rows_processed: result.processed,
      rows_errors: result.errors,
      periodo: file.replace("_2026.xlsx", " 2026"),
      status: "completed",
    });
  }
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
