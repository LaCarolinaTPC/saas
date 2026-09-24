/**
 * 1058 es un vehículo nuevo con costo contable, sin producción ni placa
 * asignada. Las placas LJO700 y NNN que muestra Lovable son erróneas.
 * Sin --aplicar solo verifica la fuente y la base.
 *
 * npx tsx --tsconfig tsconfig.json scripts/financiera-cargar-1058-sin-placa.mts [--aplicar]
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { leerHistorico, csvContable } = await import("../src/lib/financiera/historico");
const { cargarArchivo } = await import("../src/lib/financiera/cargar-contable");
const db = createAdminClient();
const codigo = "1058";
const periodos = ["2026-07", "2026-08"];
const esperado = new Map([["2026-07", 5_641_835.14], ["2026-08", 6_008_377.71]]);
const aplicar = process.argv.includes("--aplicar");

const [maestro, operativo, contable, estados] = await Promise.all([
  db.from("vehiculos").select("codigo,placa,source_file").eq("codigo", codigo).maybeSingle(),
  db.from("financiera_operativo_mes").select("periodo").eq("codigo_vehiculo", codigo).in("periodo", periodos),
  db.from("financiera_contable_mes").select("periodo").eq("codigo_vehiculo", codigo).in("periodo", periodos),
  db.from("financiera_periodos").select("periodo,estado").in("periodo", periodos),
]);
for (const [nombre, r] of [["maestro", maestro], ["operativo", operativo], ["contable", contable], ["períodos", estados]] as const) {
  if (r.error) throw new Error(`${nombre}: ${r.error.message}`);
}
if (maestro.data && (maestro.data.placa || maestro.data.source_file !== "FINANCIERA")) {
  throw new Error(`El 1058 ya tiene otro registro en el maestro: ${JSON.stringify(maestro.data)}.`);
}
if ((operativo.data ?? []).length) throw new Error("El 1058 ya tiene operación en GEMA; revise el caso.");
if ((contable.data ?? []).length) throw new Error("El 1058 ya tiene costo contable; revise antes de repetir.");
const estado = new Map((estados.data ?? []).map((p) => [p.periodo, p.estado]));
if (periodos.some((p) => !estado.has(p))) throw new Error("Falta julio o agosto en Financiera.");

const crudas: Record<string, unknown>[] = [];
for (let offset = 0; ; offset += 1000) {
  const r = await fetch(`${process.env.FLOTA_API_URL}?limit=1000&offset=${offset}&periodo_desde=2026-07`, {
    headers: { "x-api-key": process.env.FLOTA_API_KEY! },
  });
  if (!r.ok) throw new Error(`API Lovable: HTTP ${r.status}`);
  const lote = ((await r.json()) as { data?: Record<string, unknown>[] }).data ?? [];
  crudas.push(...lote);
  if (lote.length < 1000) break;
}
const lectura = leerHistorico(crudas);
if (lectura.rechazadas.length) throw new Error(`Lovable devolvió ${lectura.rechazadas.length} filas ilegibles.`);
const filas = lectura.filas.filter((f) => f.vehiculo === codigo && esperado.has(f.periodo));
if (filas.length !== 2) throw new Error(`Se esperaban dos filas del 1058; llegaron ${filas.length}.`);
for (const f of filas) {
  const costo = f.despacho + f.intereses + f.otrosGastos + f.repuestos - f.descFondoConductor + f.manoDeObra;
  if (f.viajes !== 0 || f.ingresos !== 0 || Math.abs(costo - esperado.get(f.periodo)!) > 0.01) {
    throw new Error(`Cambió la fuente del 1058 en ${f.periodo}: ${JSON.stringify({ viajes: f.viajes, ingresos: f.ingresos, costo })}.`);
  }
  console.log(`${f.periodo}|1058: costo ${costo.toLocaleString("es-CO")} · ${estado.get(f.periodo)}`);
}
if (filas.some((f) => f.modelo !== 2026 || f.flota !== "EMPRESA" || f.propietario !== "DE TRANSPORTES S.A.S SISTEMAS PRACTICOS")) {
  throw new Error("Cambió el modelo, la flota o el propietario informado por Lovable; revise antes de registrar el maestro.");
}
console.log(`Total ${[...esperado.values()].reduce((s, n) => s + n, 0).toLocaleString("es-CO")} · aplicar=${aplicar}`);
if (!aplicar) process.exit(0);

if (!maestro.data) {
  const { error } = await db.from("vehiculos").insert({
    codigo, placa: null, modelo: "2026", tipo_propietario_op: "EMPRESA",
    propietario_nombre: "DE TRANSPORTES S.A.S SISTEMAS PRACTICOS",
    source_file: "FINANCIERA",
    observacion: "Vehículo nuevo sin producción ni placa asignada; código 1058 confirmado. Placas de Lovable erróneas (LJO700/NNN).",
  });
  if (error) throw new Error(`No se pudo registrar el 1058 sin placa: ${error.message}`);
}
const email = "migracion-historico-lovable";
const motivo = "Vehículo nuevo 1058 sin producción ni placa; costo contable de julio y agosto 2026 confirmado";
try {
  for (const p of periodos.filter((p) => estado.get(p) === "cerrado")) {
    const { error } = await db.rpc("financiera_reabrir_periodo", { p_periodo: p, p_email: email, p_motivo: motivo });
    if (error) throw new Error(`No se pudo reabrir ${p}: ${error.message}`);
  }
  const r = await cargarArchivo("vehiculo-1058-sin-placa.csv", Buffer.from(csvContable(filas), "utf8"), email);
  if (r.filas !== 2 || r.rechazadas !== 0) throw new Error(`Carga incompleta: ${JSON.stringify(r)}`);
  console.log(`Carga ${r.cargaId}: ${r.filas} filas.`);
  const vista = await db.from("vw_financiera_consolidado")
    .select("periodo,placa,tipo_propietario,origen_contable,viajes,ingresos,gastos_contables,utilidad_neta")
    .eq("codigo_vehiculo", codigo).in("periodo", periodos);
  if (vista.error) throw new Error(`No se pudo verificar la vista: ${vista.error.message}`);
  if ((vista.data ?? []).length !== 2) throw new Error("No se ven dos filas del 1058 en el consolidado.");
  for (const f of vista.data ?? []) {
    if (f.placa !== null || f.tipo_propietario !== "EMPRESA" || f.origen_contable !== "solo_contable" ||
        Number(f.viajes) !== 0 || Number(f.ingresos) !== 0 ||
        Math.abs(Number(f.gastos_contables) - esperado.get(f.periodo)!) > 0.01 ||
        Math.abs(Number(f.utilidad_neta) + esperado.get(f.periodo)!) > 0.01) {
      throw new Error(`No cuadra la vista del 1058 en ${f.periodo}: ${JSON.stringify(f)}`);
    }
  }
  console.log("Vista: dos filas solo_contable sin placa, cero producción y costo íntegro.");
} finally {
  const { error } = await db.rpc("financiera_cerrar_periodos_por_gema");
  if (error) console.error(`No se pudieron cerrar períodos: ${error.message}`);
}
const cierre = await db.from("financiera_periodos").select("periodo,estado").in("periodo", periodos);
if (cierre.error || (cierre.data ?? []).some((p) => p.estado !== "cerrado")) {
  throw new Error(`Julio o agosto no quedaron cerrados: ${cierre.error?.message ?? JSON.stringify(cierre.data)}`);
}
console.log("Julio y agosto cerrados.");
