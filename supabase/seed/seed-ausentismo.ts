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

export async function run() {
  console.log("\n=== Seeding ausentismo ===");

  const filePath = getDataPath(
    "MATRIZ DE AUSENTISMO 2026 CORTE 26.03.26.xlsx"
  );
  const rows = parseExcel(filePath, "BASE DE AUSENTISMO", 2);
  console.log(`  Parsed ${rows.length} rows`);

  let processed = 0;
  let errors = 0;
  const batch: Record<string, unknown>[] = [];

  // Build a lookup from header keys to handle accents, extra spaces, etc.
  function findCol(row: Record<string, unknown>, ...keywords: string[]): unknown {
    for (const key of Object.keys(row)) {
      const norm = key.toUpperCase().trim();
      for (const kw of keywords) {
        if (norm.includes(kw.toUpperCase())) return row[key];
      }
    }
    return null;
  }

  for (const row of rows) {
    const cedula = normalizeCedula(findCol(row, "DOCUMENTO DE IDENTIDAD", "DOCUMENTO"));
    if (!cedula || cedula === "0") {
      errors++;
      continue;
    }

    const diasRaw = findCol(row, "DE IT PAGADOS", "DIAS DE IT");
    const edadRaw = findCol(row, "EDAD");

    batch.push({
      cedula,
      consecutivo_incapacidad: toStr(findCol(row, "CONSECUTIVO")),
      nombre: toStr(findCol(row, "NOMBRE")),
      genero: toStr(findCol(row, "GENERO")),
      edad: edadRaw != null ? Number(edadRaw) : null,
      antiguedad: toStr(findCol(row, "ANTIG")),
      vinculacion: toStr(findCol(row, "VINCULACI")),
      centro_trabajo: toStr(findCol(row, "CENTRO DE TRABAJO")),
      departamento: toStr(findCol(row, "DEPARTAMENTO")),
      area: toStr(findCol(row, "AREA")),
      cargo: toStr(findCol(row, "CARGO")),
      indicador_prorroga: toStr(findCol(row, "INDICADOR PRORROGA")),
      dias_it_pagados: diasRaw != null ? Number(diasRaw) : null,
      origen: toStr(findCol(row, "ORIGEN")),
      fecha_inicio: excelDateToISO(findCol(row, "FECHA INICIO")),
      fecha_fin: excelDateToISO(findCol(row, "FECHA FIN")),
      mes_inicio: toStr(findCol(row, "MES INICIO")),
      cie10: toStr(findCol(row, "CIE10")),
      diagnostico: toStr(findCol(row, "DX")),
      soat: toStr(findCol(row, "SOAT")),
      grd: toStr(findCol(row, "GRUPO RELACIONADOS")),
      dia_ocurrencia: toStr(findCol(row, "DIA DE OCURRENCIA")),
      eps: toStr(findCol(row, "EPS")),
      ips: toStr(findCol(row, "IPS")),
      profesional_responsable: toStr(findCol(row, "PROFESIONAL")),
      tipo_conductor: toStr(findCol(row, "TIPO DE CONDUCTOR")),
      estado: toStr(findCol(row, "ESTADO")),
      source_file: "MATRIZ DE AUSENTISMO 2026 CORTE 26.03.26.xlsx",
    });
  }

  for (let i = 0; i < batch.length; i += 200) {
    const chunk = batch.slice(i, i + 200);
    const { error } = await supabase.from("ausentismo").insert(chunk);

    if (error) {
      console.error(`  Error inserting chunk ${i}:`, error.message);
      errors += chunk.length;
    } else {
      processed += chunk.length;
    }
  }

  console.log(`  Done: ${processed} inserted, ${errors} errors`);

  await supabase.from("data_uploads").insert({
    file_name: "MATRIZ DE AUSENTISMO 2026 CORTE 26.03.26.xlsx",
    file_type: "ausentismo",
    rows_processed: processed,
    rows_errors: errors,
    fecha_corte: "2026-03-26",
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
