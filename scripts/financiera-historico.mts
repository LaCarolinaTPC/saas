/**
 * Fase 7 — Migración del histórico contable del aplicativo de Lovable.
 *
 * Trae las filas de `fleet_records`, saca de ellas los seis rubros que no
 * existen en GEMA y los deja listos para el cargador de la fase 4. De paso
 * hace el cotejo del punto 12 del plan: compara las doce medidas que Gestivo
 * obtiene de GEMA con las que tenía el aplicativo y, donde ya hay rubros
 * contables cargados, la utilidad y la rentabilidad.
 *
 *   # 1. Traer y revisar (no escribe nada en la base)
 *   npm run financiera:historico -- --api --cotejar
 *   npm run financiera:historico -- --excel "C:/ruta/fleet_records.xlsx" --cotejar
 *
 *   # 2. Generar el archivo para cargarlo desde la pantalla Datos de flota
 *   npm run financiera:historico -- --api --csv exports/contable-historico.csv
 *
 *   # 3. O cargarlo directo (deja rastro en financiera_cargas)
 *   npm run financiera:historico -- --api --cargar
 *
 *   # 4. Traer la flota historica de los meses anteriores al corte
 *   npm run financiera:historico -- --api --flota
 *
 * Origen de los datos (elija uno):
 *   --api                 usa FLOTA_API_URL y FLOTA_API_KEY del entorno
 *   --api-url <url> --api-key <llave>
 *   --excel <archivo>     .xlsx exportado del aplicativo
 *   --json <archivo>      volcado crudo de fleet_records
 *
 * Otras opciones:
 *   --periodo-desde AAAA-MM   --periodo-hasta AAAA-MM
 *   --csv <archivo>       escribe el archivo contable de 8 columnas
 *   --cotejar             compara contra vw_financiera_consolidado
 *   --cargar              carga los rubros contables en Gestivo
 *   --flota               corrige la flota (AFILIADO/EMPRESA) de los meses
 *                         anteriores al corte, con la del aplicativo
 *   --detalle <n>         cuántas diferencias listar (por defecto 25)
 */

import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
// Los tipos se importan aparte: no se pueden desestructurar de un import
// dinámico, y estos se borran al compilar, así que no cargan el módulo antes
// de que dotenv haya puesto las variables de entorno.
import type { FilaGestivo } from "../src/lib/financiera/historico";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { cotejar, csvContable, leerHistorico, tieneContable, veredictoParalela } =
  await import("../src/lib/financiera/historico");
const { cargarArchivo } = await import("../src/lib/financiera/cargar-contable");

// ── Argumentos ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const tiene = (f: string) => argv.includes(f);
const valor = (f: string): string | undefined => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const desde = valor("--periodo-desde");
const hasta = valor("--periodo-hasta");
for (const [n, v] of [["--periodo-desde", desde], ["--periodo-hasta", hasta]] as const) {
  if (v && !PERIODO_RE.test(v)) {
    console.error(`${n} debe tener la forma AAAA-MM.`);
    process.exit(1);
  }
}
const detalle = Number(valor("--detalle") ?? 25);

const f = (n: number) => Math.round(n).toLocaleString("es-CO");
const cop = (n: number) => `$ ${f(n)}`;

// ── 1. Traer las filas crudas ────────────────────────────────────────────────

type Cruda = Record<string, unknown>;

async function desdeApi(): Promise<Cruda[]> {
  const url = (valor("--api-url") ?? process.env.FLOTA_API_URL ?? "").replace(/\/$/, "");
  const key = valor("--api-key") ?? process.env.FLOTA_API_KEY ?? "";
  if (!url || !key) {
    console.error(
      "Falta la URL o la llave de la API del aplicativo.\n" +
        "  Pásalas con --api-url y --api-key, o ponlas en .env.local como FLOTA_API_URL y FLOTA_API_KEY.\n" +
        "  La URL es la de la Edge Function `fleet-api` del proyecto de Lovable y la llave se genera\n" +
        "  en la pestaña API del propio aplicativo (tabla external_api_keys)."
    );
    process.exit(1);
  }
  const filas: Cruda[] = [];
  const LIMITE = 1000; // tope de la Edge Function
  for (let offset = 0; ; offset += LIMITE) {
    const q = new URLSearchParams({ limit: String(LIMITE), offset: String(offset) });
    if (desde) q.set("periodo_desde", desde);
    if (hasta) q.set("periodo_hasta", hasta);
    const res = await fetch(`${url}?${q}`, { headers: { "x-api-key": key } });
    if (!res.ok) {
      console.error(`La API respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    const json = (await res.json()) as { total: number; count: number; data: Cruda[] };
    filas.push(...json.data);
    process.stdout.write(`\r  descargadas ${filas.length} de ${json.total} filas…`);
    if (json.count < LIMITE || filas.length >= json.total) break;
  }
  process.stdout.write("\n");
  return filas;
}

async function desdeExcel(ruta: string): Promise<Cruda[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(readFileSync(ruta), { type: "buffer", cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  if (!hoja) {
    console.error(`El archivo ${ruta} no tiene hojas.`);
    process.exit(1);
  }
  return XLSX.utils.sheet_to_json<Cruda>(hoja, { defval: null });
}

let crudas: Cruda[];
let origen: string;
if (tiene("--api") || valor("--api-url")) {
  origen = "api";
  console.log("Trayendo el histórico desde la API del aplicativo…");
  crudas = await desdeApi();
} else if (valor("--excel")) {
  origen = "excel";
  crudas = await desdeExcel(valor("--excel")!);
} else if (valor("--json")) {
  origen = "json";
  const j = JSON.parse(readFileSync(valor("--json")!, "utf8"));
  crudas = Array.isArray(j) ? j : (j.data ?? []);
} else {
  console.error("Elija un origen: --api, --excel <archivo> o --json <archivo>. Vea la cabecera del script.");
  process.exit(1);
}

// ── 2. Normalizar ────────────────────────────────────────────────────────────

const lectura = leerHistorico(crudas, origen);
let filas = lectura.filas;
if (desde) filas = filas.filter((x) => x.periodo >= desde);
if (hasta) filas = filas.filter((x) => x.periodo <= hasta);

const periodos = [...new Set(filas.map((x) => x.periodo))].sort();
const conContable = filas.filter(tieneContable);

console.log(`\n── Histórico del aplicativo ──`);
console.log(`filas crudas: ${f(crudas.length)} · normalizadas: ${f(filas.length)} · repetidas acumuladas: ${f(lectura.repetidas)} · rechazadas: ${f(lectura.rechazadas.length)}`);
if (lectura.rechazadas.length) {
  for (const r of lectura.rechazadas.slice(0, 5)) console.log(`   rechazada ${r.origen}: ${r.motivo}`);
  if (lectura.rechazadas.length > 5) console.log(`   … y ${lectura.rechazadas.length - 5} más`);
}
console.log(`períodos: ${periodos.length ? `${periodos[0]} → ${periodos[periodos.length - 1]} (${periodos.length})` : "ninguno"}`);
console.log(`vehículo-mes con algún rubro contable: ${f(conContable.length)} de ${f(filas.length)}`);
const totalContable = conContable.reduce(
  (s, x) => s + x.despacho + x.intereses + x.otrosGastos + (x.repuestos - x.descFondoConductor) + x.manoDeObra,
  0
);
console.log(`gasto contable que aportaría: ${cop(totalContable)}`);

if (filas.length === 0) {
  console.log("\nNo hay nada que migrar.");
  process.exit(0);
}

// ── 3. Cotejo contra Gestivo ─────────────────────────────────────────────────

if (tiene("--cotejar")) {
  const db = createAdminClient();
  const gestivo: FilaGestivo[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await db
      .from("vw_financiera_consolidado")
      .select("periodo, codigo_vehiculo, viajes, timbradas, ingresos, fondo, poliza, prestamo, estudio, salario, combustible, rtica, admon, sitra, despacho, intereses, otros_gastos, repuestos, mano_de_obra, desc_fondo_conductor, origen_contable")
      .in("periodo", periodos)
      .order("periodo")
      .order("codigo_vehiculo")
      .range(d, d + 999);
    if (error) {
      console.error("No se pudo leer el consolidado:", error.message);
      process.exit(1);
    }
    const lote = (data ?? []) as Record<string, unknown>[];
    for (const r of lote) {
      const n = (k: string) => Number(r[k] ?? 0);
      gestivo.push({
        periodo: String(r.periodo),
        codigoVehiculo: String(r.codigo_vehiculo),
        tieneContable: r.origen_contable === "archivo",
        viajes: n("viajes"), timbradas: n("timbradas"), ingresos: n("ingresos"),
        fondo: n("fondo"), poliza: n("poliza"), prestamo: n("prestamo"), estudio: n("estudio"),
        salario: n("salario"), combustible: n("combustible"), rtica: n("rtica"), admon: n("admon"), sitra: n("sitra"),
        despacho: n("despacho"), intereses: n("intereses"), otrosGastos: n("otros_gastos"),
        repuestos: n("repuestos"), manoDeObra: n("mano_de_obra"), descFondoConductor: n("desc_fondo_conductor"),
      });
    }
    if (lote.length < 1000) break;
  }

  const c = cotejar(filas, gestivo);
  console.log(`\n── Cotejo contra Gestivo ──`);
  console.log("período   aplicativo  gestivo  cuadran  difieren  solo-app  solo-gest  util.cotejable  util.cuadra  Δingresos");
  for (const p of c.porPeriodo) {
    console.log(
      `${p.periodo}  ${String(p.vehiculosLovable).padStart(9)}  ${String(p.vehiculosGestivo).padStart(7)}  ` +
        `${String(p.cuadran).padStart(7)}  ${String(p.difieren).padStart(8)}  ${String(p.soloLovable).padStart(8)}  ` +
        `${String(p.soloGestivo).padStart(9)}  ${String(p.cotejablesUtilidad).padStart(14)}  ${String(p.utilidadCuadra).padStart(11)}  ${cop(p.deltaIngresos).padStart(14)}`
    );
  }
  console.log(`\ntotal: ${f(c.total.cuadran)} cuadran · ${f(c.total.difieren)} difieren · ${f(c.total.soloLovable)} solo en el aplicativo · ${f(c.total.soloGestivo)} solo en Gestivo`);

  const cols = Object.entries(c.porColumna).sort((a, b) => b[1] - a[1]);
  if (cols.length) {
    console.log("\ncolumnas con diferencias (si una domina, el problema es sistemático, no de una fila):");
    for (const [col, n] of cols) console.log(`  ${col.padEnd(26)} ${f(n)}`);
  }

  const muestras = c.diferencias.filter((d) => d.tipo === "difiere").slice(0, detalle);
  if (muestras.length) {
    console.log(`\nprimeras ${muestras.length} diferencias:`);
    for (const d of muestras) {
      const partes = d.columnas.map((x) => `${x.columna} ${f(x.lovable)} vs ${f(x.gestivo)} (Δ ${f(x.diferencia)})`);
      console.log(`  ${d.periodo} vehículo ${d.vehiculo}: ${partes.join(" · ")}`);
    }
  }
  const sueltas = c.diferencias.filter((d) => d.tipo !== "difiere").slice(0, detalle);
  if (sueltas.length) {
    console.log(`\nvehículo-mes en una sola herramienta (primeros ${sueltas.length}):`);
    for (const d of sueltas) console.log(`  ${d.periodo} vehículo ${d.vehiculo}: ${d.tipo === "solo_lovable" ? "solo en el aplicativo" : "solo en Gestivo"}`);
  }

  const v = veredictoParalela(c);
  console.log(`\n── Criterio de aceptación de la paralela (punto 12) ──`);
  if (v.acepta) {
    console.log("CUMPLE: tres meses o más, sin diferencias y con la utilidad cotejada en todas las filas.");
  } else {
    console.log("TODAVÍA NO CUMPLE:");
    for (const m of v.motivos) console.log(`  · ${m}`);
  }
}

// ── 4. Salida ────────────────────────────────────────────────────────────────

const csv = csvContable(conContable);

const salida = valor("--csv");
if (salida) {
  mkdirSync(dirname(salida), { recursive: true });
  writeFileSync(salida, csv, "utf8");
  console.log(`\nArchivo contable escrito en ${salida} (${f(conContable.length)} filas).`);
  console.log("Cárguelo desde Financiera › Datos de flota, que muestra la previsualización antes de confirmar.");
}

if (tiene("--cargar")) {
  console.log(`\nCargando ${f(conContable.length)} filas en Gestivo…`);
  try {
    const r = await cargarArchivo("historico-lovable.csv", Buffer.from(csv, "utf8"), "migracion-historico-lovable");
    console.log(`Cargadas ${f(r.filas)} filas en ${r.periodos.length} períodos · ${f(r.rechazadas)} rechazadas · carga ${r.cargaId}`);
    console.log("Queda en la bitácora (Financiera › Auditoría) como una carga del archivo contable.");
  } catch (e) {
    console.error("No se pudo cargar:", e instanceof Error ? e.message : String(e));
    console.error("Si el motivo es un período cerrado con archivo, el administrador debe reabrirlo en Parámetros.");
    process.exit(1);
  }
}

// -- 5. Flota historica ------------------------------------------------------
// El maestro de vehiculos solo sabe la clasificacion de HOY, y entre 2025 y
// 2026 cambiaron de dueno 25 de los 167 buses. Para los meses anteriores al
// corte, la clasificacion buena es la que traia el aplicativo.

if (tiene("--flota")) {
  const db = createAdminClient();
  const { data: corteData, error: eCorte } = await db.rpc("financiera_flota_desde_maestro");
  if (eCorte) {
    console.error(
      "\nNo se pudo leer el corte: falta aplicar la migracion " +
        "20260921165820_financiera_la_flota_sale_del_maestro_de_vehiculos_tipo_propietario_op.sql.\n" +
        `  (${eCorte.message})`
    );
    process.exit(1);
  }
  const corte = String(corteData);
  console.log(`\n-- Flota historica (periodos anteriores a ${corte}) --`);

  const porLlave = new Map<string, string>();
  for (const x of filas) if (x.flota && x.periodo < corte) porLlave.set(`${x.periodo}|${x.vehiculo}`, x.flota);
  console.log(`el aplicativo clasifica ${f(porLlave.size)} vehiculo-mes`);

  type FilaOp = { periodo: string; codigo_vehiculo: string; cedula_propietario: string; tipo_propietario: string | null };
  const actuales: FilaOp[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await db
      .from("financiera_operativo_mes")
      .select("periodo, codigo_vehiculo, cedula_propietario, tipo_propietario")
      .lt("periodo", corte)
      .order("periodo")
      .order("codigo_vehiculo")
      .range(d, d + 999);
    if (error) {
      console.error("No se pudo leer lo consolidado:", error.message);
      process.exit(1);
    }
    const lote = (data ?? []) as FilaOp[];
    actuales.push(...lote);
    if (lote.length < 1000) break;
  }

  const cambios = actuales.filter((a2) => {
    const nueva = porLlave.get(`${a2.periodo}|${a2.codigo_vehiculo}`);
    return nueva && nueva !== a2.tipo_propietario;
  });
  const sinDato = actuales.filter((a2) => !porLlave.has(`${a2.periodo}|${a2.codigo_vehiculo}`));
  console.log(
    `filas consolidadas antes del corte: ${f(actuales.length)} - a cambiar: ${f(cambios.length)} - sin equivalente en el aplicativo: ${f(sinDato.length)}`
  );

  const resumen = new Map<string, number>();
  for (const c of cambios) {
    const k = `${c.tipo_propietario ?? "(vacio)"} -> ${porLlave.get(`${c.periodo}|${c.codigo_vehiculo}`)}`;
    resumen.set(k, (resumen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...resumen].sort((x, y) => y[1] - x[1])) console.log(`   ${k.padEnd(24)} ${f(n)}`);

  if (cambios.length === 0) {
    console.log("Nada que corregir.");
  } else {
    const LOTE = 200;
    let hechos = 0;
    for (let i2 = 0; i2 < cambios.length; i2 += LOTE) {
      const lote = cambios.slice(i2, i2 + LOTE);
      await Promise.all(
        lote.map(async (c) => {
          const { error } = await db
            .from("financiera_operativo_mes")
            .update({
              tipo_propietario: porLlave.get(`${c.periodo}|${c.codigo_vehiculo}`),
              updated_at: new Date().toISOString(),
            })
            .eq("periodo", c.periodo)
            .eq("codigo_vehiculo", c.codigo_vehiculo)
            .eq("cedula_propietario", c.cedula_propietario);
          if (error) throw new Error(`${c.periodo} ${c.codigo_vehiculo}: ${error.message}`);
        })
      );
      hechos += lote.length;
      process.stdout.write(`  corregidas ${f(hechos)} de ${f(cambios.length)}...`);
    }
    process.stdout.write("\n");
    await db.from("financiera_cargas").insert({
      tipo: "consolidar_gema",
      usuario_email: "migracion-flota-lovable",
      filas: cambios.length,
      detalle: {
        accion: "flota historica desde el aplicativo de Lovable",
        corte,
        filas_corregidas: cambios.length,
        sin_equivalente: sinDato.length,
        cambios: Object.fromEntries(resumen),
      },
    });
    console.log("Corregido. Queda en la bitacora como una operacion del modulo.");
  }
}

if (!salida && !tiene("--cargar") && !tiene("--cotejar") && !tiene("--flota")) {
  console.log("\nNo se pidio ninguna accion. Anada --cotejar, --csv <archivo>, --cargar o --flota.");
}
