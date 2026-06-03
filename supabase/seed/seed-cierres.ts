import { createClient } from "@supabase/supabase-js";
import {
  getDataPath,
  toNum,
  toStr,
  excelDateToISO,
} from "../../src/lib/rotacion/utils/excel-parser";
import * as XLSX from "xlsx";
import * as dotenv from "dotenv";
import * as fs from "fs";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseCierreFile(filePath: string): Record<string, unknown>[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Headers at row 6 (0-indexed: 5), data starts at row 7
  const raw = XLSX.utils.sheet_to_json(sheet, { range: 5 }) as Record<
    string,
    unknown
  >[];
  return raw;
}

export async function run() {
  console.log("\n=== Seeding cierres diarios ===");

  const folder = getDataPath("Operativo");
  const files = fs
    .readdirSync(folder)
    .filter((f) => f.startsWith("CIERRE DEFINITIVO") && f.endsWith(".xlsx"))
    .sort();

  console.log(`  Found ${files.length} cierre files`);

  let totalProcessed = 0;
  let totalErrors = 0;

  for (const file of files) {
    const filePath = path.join(folder, file);
    const rows = parseCierreFile(filePath);
    const batch: Record<string, unknown>[] = [];
    const seenKeys = new Set<string>();

    for (const row of rows) {
      const rawCod = toStr(row["COD CONDUCTOR"]);
      if (!rawCod) continue;
      // Normalize: remove leading zeros to match conductores.codigo
      const codConductor = rawCod.replace(/^0+/, "") || rawCod;

      const fecha = excelDateToISO(row["FECHA"]);
      if (!fecha) continue;

      const ruta = toStr(row["RUTA"]);
      const dedupKey = `${codConductor}|${fecha}|${ruta}`;
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      batch.push({
        cod_conductor: codConductor,
        conductor_nombre: toStr(row["CONDUCTOR"]),
        fecha,
        tipo_cierre: toStr(row["TIPO CIERRE"]),
        ruta,
        grupo_liquidacion: toStr(row["GRUPO LIQUIDACION"]),
        vehiculo: toStr(row["VEHICULO"]),
        viajes: toNum(row["VIAJES"]),
        timbradas: toNum(row["TIMBRADAS"]),
        diff_tim: toNum(row["DIFF TIM."]),
        prom_tim: toNum(row["PROM TIM."]),
        pct_indiv: toNum(row["% INDIV"]),
        pct_grupo: toNum(row["% GRUPO"]),
        pct_total: toNum(row["% TOTAL"]),
        tim_grupo: toNum(row["TIM GRUPO"]),
        viajes_grupo: toNum(row["VIAJES GRUPO"]),
        prom_grupo: toNum(row["PROM GRUPO"]),
        source_file: file,
      });
    }

    // Upsert in chunks
    for (let i = 0; i < batch.length; i += 200) {
      const chunk = batch.slice(i, i + 200);
      const { error } = await supabase
        .from("cierres_diarios")
        .upsert(chunk, { onConflict: "cod_conductor,fecha,ruta" });

      if (error) {
        console.error(`  Error in ${file} chunk ${i}:`, error.message);
        totalErrors += chunk.length;
      } else {
        totalProcessed += chunk.length;
      }
    }
  }

  console.log(
    `  Done: ${totalProcessed} inserted, ${totalErrors} errors from ${files.length} files`
  );

  await supabase.from("data_uploads").insert({
    file_name: `Operativo/ (${files.length} files)`,
    file_type: "cierres_diarios",
    rows_processed: totalProcessed,
    rows_errors: totalErrors,
    periodo: "2026-02/2026-03",
    status: "completed",
  });

  return { processed: totalProcessed, errors: totalErrors };
}

if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
