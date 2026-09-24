/**
 * Combustible manual de 1029, 1031 y 1033 en julio de 2026, guardado en
 * financiera_contable_mes.combustible_vehiculos_nuevos. Sin --aplicar verifica.
 *
 * npx tsx --tsconfig tsconfig.json scripts/financiera-cargar-combustible-nuevos-julio.mts [--aplicar]
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { leerHistorico, csvContable } = await import("../src/lib/financiera/historico");
const { cargarArchivo } = await import("../src/lib/financiera/cargar-contable");
const db = createAdminClient();
const periodo = "2026-07";
const esperado = new Map([["1029", 72_000], ["1031", 72_000], ["1033", 69_494.1]]);
const codigos = [...esperado.keys()];
const aplicar = process.argv.includes("--aplicar");

const [maestro, operativo, contable, estado] = await Promise.all([
  db.from("vehiculos").select("codigo").in("codigo", codigos),
  db.from("financiera_operativo_mes").select("codigo_vehiculo").eq("periodo", periodo).in("codigo_vehiculo", codigos),
  db.from("financiera_contable_mes").select("codigo_vehiculo").eq("periodo", periodo).in("codigo_vehiculo", codigos),
  db.from("financiera_periodos").select("estado").eq("periodo", periodo).single(),
]);
for (const [nombre, r] of [["maestro", maestro], ["operativo", operativo], ["contable", contable], ["período", estado]] as const) {
  if (r.error) throw new Error(`${nombre}: ${r.error.message}`);
}
const codigosMaestro = new Set((maestro.data ?? []).map((v) => String(v.codigo)));
if (codigos.some((c) => !codigosMaestro.has(c))) throw new Error("Un código no existe en el maestro.");
if ((operativo.data ?? []).length) throw new Error("Uno de los tres buses ya tiene fila operativa en julio.");
if ((contable.data ?? []).length) throw new Error("Uno de los tres buses ya tiene fila contable en julio; revise antes de repetir.");

const crudas: Record<string, unknown>[] = [];
for (let offset = 0; ; offset += 1000) {
  const r = await fetch(`${process.env.FLOTA_API_URL}?limit=1000&offset=${offset}&periodo_desde=${periodo}`, {
    headers: { "x-api-key": process.env.FLOTA_API_KEY! },
  });
  if (!r.ok) throw new Error(`API Lovable: HTTP ${r.status}`);
  const lote = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? [];
  crudas.push(...lote);
  if (lote.length < 1000) break;
}
const lectura = leerHistorico(crudas);
if (lectura.rechazadas.length) throw new Error(`Lovable devolvió ${lectura.rechazadas.length} filas ilegibles.`);
const filas = lectura.filas.filter((f) => f.periodo === periodo && esperado.has(f.vehiculo));
if (filas.length !== 3) throw new Error(`Se esperaban tres filas de Lovable, llegaron ${filas.length}.`);
for (const f of filas) {
  const rubros = f.despacho + f.intereses + f.otrosGastos + f.repuestos + f.manoDeObra - f.descFondoConductor;
  if (f.viajes !== 0 || f.ingresos !== 0 || rubros !== 0 || Math.abs(f.combustible - esperado.get(f.vehiculo)!) > 0.01) {
    throw new Error(`Cambió la fila fuente del ${f.vehiculo}; revise antes de cargar.`);
  }
  console.log(`${periodo}|${f.vehiculo}: combustible ${f.combustible.toLocaleString("es-CO")}`);
}
const total = filas.reduce((s, f) => s + f.combustible, 0);
if (Math.abs(total - 213_494.1) > 0.01) throw new Error(`Total inesperado: ${total}.`);
console.log(`Total ${total.toLocaleString("es-CO")} · estado ${estado.data?.estado} · aplicar=${aplicar}`);
if (!aplicar) process.exit(0);

const email = "migracion-historico-lovable";
const motivo = "Combustible manual de tres vehículos nuevos en julio 2026; cruce Lovable-Gestivo";
try {
  if (estado.data?.estado === "cerrado") {
    const { error } = await db.rpc("financiera_reabrir_periodo", { p_periodo: periodo, p_email: email, p_motivo: motivo });
    if (error) throw new Error(`No se pudo reabrir julio: ${error.message}`);
  }
  const csv = csvContable(filas.map((f) => ({ ...f, combustibleVehiculosNuevos: f.combustible })));
  const r = await cargarArchivo("combustible-nuevos-julio-2026.csv", Buffer.from(csv, "utf8"), email);
  if (r.filas !== 3 || r.rechazadas !== 0) throw new Error(`Carga incompleta: ${JSON.stringify(r)}`);
  console.log(`Carga ${r.cargaId}: ${r.filas} filas.`);
  const vista = await db.from("vw_financiera_consolidado")
    .select("codigo_vehiculo,origen_contable,viajes,ingresos,combustible_vehiculos_nuevos,gastos_contables")
    .eq("periodo", periodo).in("codigo_vehiculo", codigos);
  if (vista.error) throw new Error(`No se pudo verificar la vista: ${vista.error.message}`);
  const observadas = new Map((vista.data ?? []).map((v) => [String(v.codigo_vehiculo), v]));
  if (observadas.size !== 3) throw new Error(`Se ven ${observadas.size} de tres filas en la vista.`);
  for (const [codigo, importe] of esperado) {
    const v = observadas.get(codigo);
    if (!v || v.origen_contable !== "solo_contable" || Number(v.viajes) !== 0 || Number(v.ingresos) !== 0 ||
        Math.abs(Number(v.combustible_vehiculos_nuevos) - importe) > 0.01 || Math.abs(Number(v.gastos_contables) - importe) > 0.01) {
      throw new Error(`No cuadra ${codigo}: ${JSON.stringify(v)}`);
    }
  }
  console.log("Vista: tres filas solo_contable, combustible en su columna contable.");
} finally {
  const { error } = await db.rpc("financiera_cerrar_periodos_por_gema");
  if (error) console.error(`No se pudo cerrar julio: ${error.message}`);
}
const cierre = await db.from("financiera_periodos").select("estado").eq("periodo", periodo).single();
if (cierre.error || cierre.data?.estado !== "cerrado") throw new Error(`Julio no quedó cerrado: ${cierre.error?.message ?? cierre.data?.estado}`);
console.log("Julio cerrado.");
