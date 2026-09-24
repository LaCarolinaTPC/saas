/**
 * Ocho vehículo-mes con costo contable en Lovable y sin operación en GEMA.
 * Sin --aplicar verifica la fuente. Para --aplicar, primero ejecute en el SQL
 * Editor la migración 20260924145446; el script reabre, carga y cierra.
 *
 * npx tsx --tsconfig tsconfig.json scripts/financiera-cargar-solo-contable.mts
 * npx tsx --tsconfig tsconfig.json scripts/financiera-cargar-solo-contable.mts --aplicar
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { leerHistorico, csvContable } = await import("../src/lib/financiera/historico");
const { cargarArchivo } = await import("../src/lib/financiera/cargar-contable");
const db = createAdminClient();
const aplicar = process.argv.includes("--aplicar");
const esperado = new Map([
  ["2025-12|562", 3_238_966],
  ["2026-01|534", 1_715_592],
  ["2026-01|562", 1_298_644],
  ["2026-03|558", 6_210_004],
  ["2026-07|506", 15_686_509],
  ["2026-07|530", 3_963_036],
  ["2026-08|506", 13_921_090],
  ["2026-08|530", 618_800],
]);
const periodos = [...new Set([...esperado.keys()].map((k) => k.slice(0, 7)))];
const codigos = [...new Set([...esperado.keys()].map((k) => k.slice(8)))];

// Fallar antes de reabrir: el 1058 no debe entrar.
const [maestro, op, existentes, estados] = await Promise.all([
  db.from("vehiculos").select("codigo").in("codigo", codigos),
  db.from("financiera_operativo_mes").select("periodo,codigo_vehiculo").in("periodo", periodos).in("codigo_vehiculo", codigos),
  db.from("financiera_contable_mes").select("periodo,codigo_vehiculo").in("periodo", periodos).in("codigo_vehiculo", codigos),
  db.from("financiera_periodos").select("periodo,estado").in("periodo", periodos),
]);
for (const [nombre, r] of [["maestro", maestro], ["operativo", op], ["contable", existentes], ["períodos", estados]] as const) {
  if (r.error) throw new Error(`${nombre}: ${r.error.message}`);
}
const claves = (rows: { periodo: string; codigo_vehiculo: string }[]) => new Set(rows.map((r) => `${r.periodo}|${r.codigo_vehiculo}`));
const maes = new Set((maestro.data ?? []).map((v) => String(v.codigo)));
if (codigos.some((c) => !maes.has(c))) throw new Error("Falta un código en el maestro de vehículos.");
if ([...claves(op.data ?? [])].some((k) => esperado.has(k))) throw new Error("Una de las ocho filas ya tiene operación en GEMA.");
if ([...claves(existentes.data ?? [])].some((k) => esperado.has(k))) throw new Error("Una de las ocho filas ya tiene costo contable. Revise antes de repetir.");
const estado = new Map((estados.data ?? []).map((p) => [p.periodo, p.estado]));
if (periodos.some((p) => !estado.has(p))) throw new Error("Falta un período en Financiera.");

const crudas: Record<string, unknown>[] = [];
for (let offset = 0; ; offset += 1000) {
  const r = await fetch(`${process.env.FLOTA_API_URL}?limit=1000&offset=${offset}`, {
    headers: { "x-api-key": process.env.FLOTA_API_KEY! },
  });
  if (!r.ok) throw new Error(`API Lovable: HTTP ${r.status}`);
  const lote = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? [];
  crudas.push(...lote);
  if (lote.length < 1000) break;
}
const lectura = leerHistorico(crudas);
if (lectura.rechazadas.length) throw new Error(`Lovable devolvió ${lectura.rechazadas.length} filas ilegibles.`);
const filas = lectura.filas.filter((f) => esperado.has(`${f.periodo}|${f.vehiculo}`));
if (filas.length !== esperado.size) throw new Error(`Se esperaban 8 filas de Lovable, llegaron ${filas.length}.`);
let total = 0;
for (const f of filas) {
  if (f.viajes !== 0 || f.ingresos !== 0) throw new Error(`${f.periodo}|${f.vehiculo} tiene producción en Lovable.`);
  const costo = f.despacho + f.intereses + f.otrosGastos + f.repuestos - f.descFondoConductor + f.manoDeObra;
  if (Math.round(costo) !== esperado.get(`${f.periodo}|${f.vehiculo}`)) throw new Error(`Cambió el costo de ${f.periodo}|${f.vehiculo}: ${costo}.`);
  total += costo;
  console.log(`${f.periodo}|${f.vehiculo}: ${costo.toLocaleString("es-CO")} · ${estado.get(f.periodo)}`);
}
if (Math.round(total) !== 46_652_641) throw new Error(`Total inesperado: ${total}.`);
console.log(`Total: ${total.toLocaleString("es-CO")} en 8 filas; aplicar=${aplicar}`);
if (!aplicar) process.exit(0);

const vista = await db.from("vw_financiera_consolidado").select("sin_operacion").limit(1);
if (vista.error) throw new Error(`Primero aplique la migración en el SQL Editor: ${vista.error.message}`);

const motivo = "Costo contable de buses sin movimiento en GEMA; cruce Lovable-Gestivo 2026-09-24";
const email = "migracion-historico-lovable";
const cerrados = periodos.filter((p) => estado.get(p) === "cerrado");
try {
  for (const p of cerrados) {
    const { error } = await db.rpc("financiera_reabrir_periodo", { p_periodo: p, p_email: email, p_motivo: motivo });
    if (error) throw new Error(`No se pudo reabrir ${p}: ${error.message}`);
  }
  const r = await cargarArchivo("solo-contable-lovable-8-filas.csv", Buffer.from(csvContable(filas), "utf8"), email);
  if (r.filas !== 8 || r.rechazadas !== 0) throw new Error(`Carga incompleta: ${JSON.stringify(r)}`);
  console.log(`Carga ${r.cargaId}: ${r.filas} filas en ${r.periodos.length} períodos.`);
  const comprobacion = await db.from("vw_financiera_consolidado")
    .select("periodo,codigo_vehiculo,origen_contable,viajes,ingresos,gastos_contables")
    .eq("sin_operacion", true).in("periodo", periodos);
  if (comprobacion.error) throw new Error(`No se pudo verificar la vista: ${comprobacion.error.message}`);
  const observadas = new Map((comprobacion.data ?? []).map((v) => [`${v.periodo}|${v.codigo_vehiculo}`, v]));
  if (observadas.size !== 8) throw new Error(`Se esperaban 8 filas solo contables, se ven ${observadas.size}.`);
  for (const [clave, pesos] of esperado) {
    const v = observadas.get(clave);
    if (!v || v.origen_contable !== "solo_contable" || Number(v.viajes) !== 0 || Number(v.ingresos) !== 0 || Math.round(Number(v.gastos_contables)) !== pesos) {
      throw new Error(`No cuadra la fila consolidada ${clave}: ${JSON.stringify(v)}`);
    }
  }
  console.log("Vista: 8 filas solo_contable, cero viajes e ingresos, costos al peso.");
} finally {
  const { error } = await db.rpc("financiera_cerrar_periodos_por_gema");
  if (error) console.error(`No se pudieron cerrar los períodos: ${error.message}`);
}
const cierre = await db.from("financiera_periodos").select("periodo,estado").in("periodo", periodos);
if (cierre.error) throw new Error(`No se pudo verificar el cierre: ${cierre.error.message}`);
if ((cierre.data ?? []).some((p) => p.estado !== "cerrado")) throw new Error("Quedaron períodos sin cerrar; revise Financiera > Parámetros.");
console.log("Cinco períodos cerrados.");
