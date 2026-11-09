/**
 * Sincronización del control de exámenes periódicos con el maestro de GEMA
 * (src/lib/sst/examenes-sincronizar.ts), desde la terminal.
 *
 *   npm run sst:examenes-sincronizar -- --ensayo     (no escribe nada: informe)
 *   npm run sst:examenes-sincronizar -- --escribir   (aplica; exige la migración 20261109211226)
 *
 * El ensayo es para la PRIMERA carga: muestra a SST cuántas personas entrarían
 * y saldrían del control, y qué cargos no están en el profesiograma, antes de
 * aplicar la migración (que enciende la sincronización nocturna).
 *
 * El informe lleva cédulas y nombres: queda en <tmp>/sst-examenes-sincronizacion/,
 * NO se copia al repositorio.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sincronizarControlExamenes } from "../src/lib/sst/examenes-sincronizar";
import { etiquetaGrupo } from "../src/lib/sst/examenes";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(os.tmpdir(), "sst-examenes-sincronizacion");

function leerEnv(): Record<string, string> {
  const archivo = [".env.local", ".env"].map((n) => path.join(RAIZ, n)).find(existsSync);
  if (!archivo) throw new Error("No hay .env.local ni .env en la raíz del proyecto.");
  const out: Record<string, string> = {};
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    if (!linea || linea.startsWith("#") || !linea.includes("=")) continue;
    const i = linea.indexOf("=");
    out[linea.slice(0, i).trim()] = linea.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function csv(filas: (string | number | boolean | null | undefined)[][]): string {
  const celda = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}

async function main() {
  const args = process.argv.slice(2);
  const escribir = args.includes("--escribir");
  if (!escribir && !args.includes("--ensayo")) {
    console.log("Use --ensayo (informe, no escribe) o --escribir (aplica).");
    process.exit(1);
  }
  const env = leerEnv();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const r = await sincronizarControlExamenes(db, { origen: "manual", usuarioEmail: "script-sincronizacion", ensayo: true });
  if (r.omitida) {
    console.log(`No se calculó: ${r.omitida}.`);
    process.exit(1);
  }
  const plan = r.plan!;
  mkdirSync(SALIDA, { recursive: true });

  const porGrupo = new Map<string, number>();
  for (const a of plan.altas) porGrupo.set(a.grupo, (porGrupo.get(a.grupo) ?? 0) + 1);
  const sinProf = [...plan.altas, ...plan.reingresos].filter((a) => a.sinProfesiograma);
  const cargosSinProf = new Map<string, number>();
  for (const a of sinProf) cargosSinProf.set(a.cargo ?? "(sin cargo)", (cargosSinProf.get(a.cargo ?? "(sin cargo)") ?? 0) + 1);

  const resumen = [
    `Sincronización del control de exámenes periódicos con GEMA — ${new Date().toISOString()}`,
    "",
    `Ingresos (entran al control): ${plan.altas.length}`,
    ...[...porGrupo].map(([g, n]) => `  · ${etiquetaGrupo(g)}: ${n}`),
    `Retiros (salen del control): ${plan.retiros.length}`,
    `Reingresos (vuelven al control): ${plan.reingresos.length}`,
    `Con datos completados (fecha de ingreso o cargo): ${plan.completar.length}`,
    "",
    `Cargos que no están en el profesiograma (se les asignan 12 meses): ${sinProf.length} personas`,
    ...[...cargosSinProf].sort((a, b) => b[1] - a[1]).map(([c, n]) => `  · ${c}: ${n}`),
  ].join("\n");
  writeFileSync(path.join(SALIDA, "resumen.txt"), resumen + "\n");

  const cab = ["Cédula", "Nombre", "Grupo", "Cargo", "Fecha de ingreso", "Periodicidad (meses)", "Fuera del profesiograma"];
  const fila = (a: (typeof plan.altas)[number]) => [a.cedula, a.nombre, etiquetaGrupo(a.grupo), a.cargo, a.fechaIngreso, a.periodicidadMeses, a.sinProfesiograma ? "Sí" : ""];
  writeFileSync(path.join(SALIDA, "ingresos.csv"), csv([cab, ...plan.altas.map(fila)]));
  writeFileSync(path.join(SALIDA, "reingresos.csv"), csv([cab, ...plan.reingresos.map(fila)]));
  writeFileSync(
    path.join(SALIDA, "retiros.csv"),
    csv([["Cédula", "Nombre", "Grupo", "Cargo", "Fecha de retiro"], ...plan.retiros.map((x) => [x.cedula, x.nombre, etiquetaGrupo(x.grupo), x.cargo, x.fecha])])
  );

  console.log(resumen);
  console.log(`\nInforme (con cédulas, no lo copie al repositorio): ${SALIDA}`);

  if (escribir) {
    const w = await sincronizarControlExamenes(db, { origen: "manual", usuarioEmail: "script-sincronizacion" });
    if (w.omitida) {
      console.log(`\nNo se escribió: ${w.omitida}.`);
      process.exit(1);
    }
    console.log(`\nAplicado: ${w.altas} ingresos, ${w.retiros} retiros, ${w.reingresos} reingresos, ${w.completados} completados.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
