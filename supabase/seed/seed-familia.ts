import { createClient } from "@supabase/supabase-js";
import {
  parseExcel,
  getDataPath,
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

export async function run() {
  console.log("\n=== Seeding familia ===");

  const filePath = getDataPath(
    "drive-download-20260330T234227Z-1-001/Hijos y Conyugues adm_cond registrado Caja de compensacion.xlsx"
  );
  const rows = parseExcel(filePath, "Hijos_Conyugue", 1);
  console.log(`  Parsed ${rows.length} rows`);

  let processed = 0;
  let errors = 0;
  const batch: Record<string, unknown>[] = [];

  for (const row of rows) {
    const cedula = normalizeCedula(row["cedula empleado"]);
    if (!cedula || cedula === "0") {
      errors++;
      continue;
    }

    batch.push({
      cedula_empleado: cedula,
      nombre_familiar: toStr(
        row["Nombres_personasa cargo"] ?? row["Nombres_personas a cargo"]
      ),
      parentesco: toStr(row["Parentesco"]),
      edad: row["edad"] != null ? Number(row["edad"]) : null,
    });
  }

  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200);
    const { error } = await supabase.from("familia").insert(chunk);

    if (error) {
      console.error(`  Error inserting chunk ${i}:`, error.message);
      errors += chunk.length;
    } else {
      processed += chunk.length;
    }
  }

  console.log(`  Done: ${processed} inserted, ${errors} errors`);

  await supabase.from("data_uploads").insert({
    file_name:
      "Hijos y Conyugues adm_cond registrado Caja de compensacion.xlsx",
    file_type: "familia",
    rows_processed: processed,
    rows_errors: errors,
    status: "completed",
  });

  return { processed, errors };
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
