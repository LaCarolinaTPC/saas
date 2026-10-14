/**
 * Carga el histórico de combustible desde los archivos diarios del proveedor
 * (carpeta «Mantenimiento_Combustible - Combustible» de SharePoint) a
 * `combustible_tanqueos`, solo los tanqueos desde 2026-01-01 (decisión del
 * 2026-10-14). Usa el mismo lector y las mismas reglas que la pantalla
 * Mantenimiento → Combustible (src/lib/mantenimiento/combustible-archivo.ts).
 *
 * Uso (desde la raíz del proyecto):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/cargar-combustible-historico.mts ["<carpeta>"] --ensayo
 *   npx tsx --tsconfig tsconfig.json scripts/cargar-combustible-historico.mts ["<carpeta>"] --escribir
 *   npx tsx --tsconfig tsconfig.json scripts/cargar-combustible-historico.mts --reversar
 *
 * --ensayo    solo lee: deja en %TEMP%\combustible-historico\ el resumen, un CSV
 *             por archivo y las filas rechazadas. Funciona antes de aplicar la
 *             migración (entonces todo sale como nuevo).
 * --escribir  se niega si ya hay cargas del histórico; una carga por archivo
 *             (origen = 'historico'), upsert por llave.
 * --reversar  borra los tanqueos cuya última carga fue del histórico y marca
 *             esas cargas como reversadas.
 *
 * Los archivos se procesan por la fecha de su nombre y las «Copia de…» al
 * final: un tanqueo que aparece en dos archivos queda en el primero. Lee
 * .env.local y si no existe .env. Los archivos de OneDrive deben estar
 * descargados (o se descargan al leerlos).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { fechaDelNombre } from "../src/lib/mantenimiento/combustible-archivo";
import { cargarArchivos, getMaestroVehiculos, prepararArchivos, type ArchivoSubido } from "../src/lib/mantenimiento/combustible-data";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CARPETA = path.join(os.homedir(), "TRANSPORTES LA CAROLINA", "Mantenimiento_Combustible - Combustible");
const DESDE = "2026-01-01";
const SALIDA = path.join(os.tmpdir(), "combustible-historico");

/** .env y encima .env.local, sin pisar un valor con uno vacío. */
function leerEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const ruta of [".env", ".env.local"].map((f) => path.join(RAIZ, f)).filter((f) => existsSync(f))) {
    for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      const valor = m?.[2].replace(/^["']|["']$/g, "");
      if (m && valor) env[m[1]] = valor;
    }
  }
  return env;
}

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

const csv = (filas: (string | number | null)[][]) =>
  filas.map((f) => f.map((c) => (c == null ? "" : /[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(";")).join("\r\n");

async function main() {
  const args = process.argv.slice(2);
  const modo = args.includes("--escribir") ? "escribir" : args.includes("--reversar") ? "reversar" : args.includes("--ensayo") ? "ensayo" : null;
  if (!modo) throw new Error("Indique --ensayo, --escribir o --reversar.");
  const carpeta = args.find((a) => !a.startsWith("--")) ?? CARPETA;

  const env = leerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  mkdirSync(SALIDA, { recursive: true });
  console.log(`Modo: ${modo} · salida: ${SALIDA}`);

  if (modo === "reversar") {
    const { data: cargas, error } = await db.from("combustible_cargas").select("id").eq("origen", "historico").is("reversada_at", null);
    if (error) throw new Error(error.message);
    const ids = (cargas ?? []).map((c) => c.id as string);
    let borrados = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { count, error: e } = await db.from("combustible_tanqueos").delete({ count: "exact" }).in("carga_id", ids.slice(i, i + 100));
      if (e) throw new Error(e.message);
      borrados += count ?? 0;
    }
    const { error: e2 } = await db.from("combustible_cargas").update({ reversada_at: new Date().toISOString() }).in("id", ids);
    if (e2) throw new Error(e2.message);
    console.log(`Reversadas ${ids.length} cargas del histórico; ${borrados} tanqueos borrados.`);
    return;
  }

  // Tabla sin crear: el ensayo sigue, sin comparar con lo cargado.
  // Sin head: una consulta HEAD a una tabla inexistente no trae el error.
  const { error: sinTabla } = await db.from("combustible_tanqueos").select("id").limit(1);
  if (sinTabla && modo === "escribir") throw new Error(`La tabla combustible_tanqueos no responde (¿falta aplicar la migración?): ${sinTabla.message}`);
  if (sinTabla) console.log("Aviso: la migración no está aplicada; el ensayo cuenta todo como nuevo.");

  if (modo === "escribir") {
    const { count, error } = await db.from("combustible_cargas").select("id", { head: true, count: "exact" }).eq("origen", "historico").is("reversada_at", null);
    if (error) throw new Error(error.message);
    if (count) throw new Error(`Ya hay ${count} cargas del histórico. Reverse primero con --reversar si quiere repetirlo.`);
  }

  const nombres = readdirSync(carpeta).filter((n) => /\.xlsx$/i.test(n) && !n.startsWith("~$"));
  const orden = (n: string) => `${fechaDelNombre(n) ?? "9999-99-99"}|${/copia/i.test(n) ? 1 : 0}|${n}`;
  nombres.sort((a, b) => orden(a).localeCompare(orden(b)));
  console.log(`Leyendo ${nombres.length} archivos de ${carpeta}…`);
  const archivos: ArchivoSubido[] = nombres.map((n) => ({ nombre: n, datos: readFileSync(path.join(carpeta, n)) }));

  const hoy = hoyBogota();
  const maestro = await getMaestroVehiculos(db);
  const preparados = await prepararArchivos(archivos, hoy, { db, maestro, desde: DESDE, sinBase: !!sinTabla });
  // Un archivo de antes de 2026 se ignora; uno con filas rechazadas se muestra aunque no deje tanqueos.
  const conDatos = preparados.filter((p) => p.resumen.resumen.tanqueos > 0 || p.resumen.errorArchivo || (p.resumen.rechazadasTotal > 0 && (p.resumen.fechaNombre ?? "") >= DESDE));

  // Resumen
  const suma = (f: (p: (typeof preparados)[number]) => number) => conDatos.reduce((s, p) => s + f(p), 0);
  const alertas: Record<string, number> = {};
  const motivos: Record<string, number> = {};
  const porMes: Record<string, { tanqueos: number; galones: number; valor: number }> = {};
  const dias = new Set<string>();
  // Buses detrás de las alertas del maestro, para corregirlo o avisar al proveedor.
  const porBus: Record<string, Record<string, number>> = {};
  for (const p of conDatos) {
    for (const [a, n] of Object.entries(p.resumen.resumen.alertas)) alertas[a] = (alertas[a] ?? 0) + (n ?? 0);
    for (const r of p.resumen.rechazadas) {
      const k = r.motivo.replace(/«[^»]*»/g, "«…»").replace(/\d{4}-\d{2}-\d{2}/g, "AAAA-MM-DD");
      motivos[k] = (motivos[k] ?? 0) + 1;
    }
  }
  for (const p of conDatos) {
    for (const t of p.escribir) {
      const mes = t.fecha.slice(0, 7);
      porMes[mes] ??= { tanqueos: 0, galones: 0, valor: 0 };
      porMes[mes].tanqueos++;
      porMes[mes].galones += t.galones;
      porMes[mes].valor += t.valor;
      dias.add(t.fecha);
      for (const a of t.alertas) {
        if (a !== "vehiculo_no_existe" && a !== "placa_distinta" && a !== "factura_compartida") continue;
        const k = `${t.vehiculoCodigo} con placa ${t.placa ?? "—"}`;
        porBus[a] ??= {};
        porBus[a][k] = (porBus[a][k] ?? 0) + 1;
      }
    }
  }
  const faltan: string[] = [];
  for (let d = new Date(`${DESDE}T12:00:00Z`); d.toISOString().slice(0, 10) <= hoy; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!dias.has(d.toISOString().slice(0, 10))) faltan.push(d.toISOString().slice(0, 10));
  }
  const lineas = [
    `Histórico de combustible desde ${DESDE} · ${new Date().toISOString()}`,
    `Archivos leídos: ${archivos.length} · con tanqueos desde ${DESDE}: ${conDatos.filter((p) => !p.resumen.errorArchivo).length} · rechazados enteros: ${conDatos.filter((p) => p.resumen.errorArchivo).length}`,
    `Tanqueos a escribir: ${suma((p) => p.escribir.length)} (nuevos ${suma((p) => p.resumen.nuevas)}, corregidos ${suma((p) => p.resumen.corregidas)}) · ya cargados sin cambio: ${suma((p) => p.resumen.sinCambio)}`,
    `Repetidos en otro archivo: ${suma((p) => p.resumen.enOtroArchivo)} (con otros galones o valor: ${suma((p) => p.resumen.enOtroArchivoDistinto)})`,
    `Filas rechazadas: ${suma((p) => p.resumen.rechazadasTotal)}`,
    ...Object.entries(motivos).sort((a, b) => b[1] - a[1]).map(([m, n]) => `   ${n} × ${m}`),
    "Alertas:",
    ...Object.entries(alertas).sort((a, b) => b[1] - a[1]).map(([a, n]) => `   ${n} × ${a}`),
    "Por mes (tanqueos · galones · valor):",
    ...Object.entries(porMes).sort().map(([m, v]) => `   ${m}  ${v.tanqueos}  ${v.galones.toFixed(1)}  ${Math.round(v.valor).toLocaleString("es-CO")}`),
    `Días sin tanqueos (${faltan.length}): ${faltan.join(", ")}`,
    ...Object.entries(porBus).flatMap(([a, buses]) => [
      `Buses con ${a}:`,
      ...Object.entries(buses).sort((x, y) => y[1] - x[1]).map(([b, n]) => `   ${n} × ${b}`),
    ]),
    "Avisos por archivo:",
    ...conDatos.flatMap((p) => [...(p.resumen.errorArchivo ? [p.resumen.errorArchivo] : []), ...p.resumen.avisos].map((a) => `   ${p.resumen.archivo}: ${a}`)),
  ];
  writeFileSync(path.join(SALIDA, "resumen.txt"), lineas.join("\r\n"), "utf8");
  writeFileSync(path.join(SALIDA, "archivos.csv"), "﻿" + csv([
    ["archivo", "fecha_nombre", "desde", "hasta", "tanqueos", "nuevos", "corregidos", "sin_cambio", "en_otro_archivo", "en_otro_archivo_distinto", "rechazadas", "galones", "valor", "error"],
    ...conDatos.map(({ resumen: r }) => [r.archivo, r.fechaNombre, r.resumen.desde, r.resumen.hasta, r.resumen.tanqueos, r.nuevas, r.corregidas, r.sinCambio, r.enOtroArchivo, r.enOtroArchivoDistinto, r.rechazadasTotal, r.resumen.galones, r.resumen.valor, r.errorArchivo]),
  ]), "utf8");
  writeFileSync(path.join(SALIDA, "rechazadas.csv"), "﻿" + csv([
    ["archivo", "hoja", "fila", "factura", "motivo"],
    ...conDatos.flatMap(({ resumen: r }) => r.rechazadas.map((x) => [r.archivo, x.hoja, x.linea, x.factura, x.motivo])),
  ]), "utf8");
  console.log(lineas.slice(0, 40).join("\n"));

  if (modo === "escribir") {
    const cargas = await cargarArchivos(archivos, hoy, null, "historico", { db, maestro, desde: DESDE });
    const escritos = cargas.reduce((s, c) => s + c.nuevas + c.corregidas, 0);
    console.log(`Escritas ${cargas.filter((c) => c.cargaId).length} cargas; ${escritos} tanqueos.`);
    const { count } = await db.from("combustible_tanqueos").select("id", { head: true, count: "exact" });
    console.log(`combustible_tanqueos tiene ahora ${count} filas.`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
