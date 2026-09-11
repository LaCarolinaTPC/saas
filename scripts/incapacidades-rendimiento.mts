/**
 * Fase 7 del plan de incapacidades: prueba de rendimiento y de paginación.
 *
 *   npm run incapacidades:rendimiento
 *
 * Dos partes, a propósito separadas:
 *
 * 1. EN MEMORIA, con 5.000 expedientes SINTÉTICOS: mide las agregaciones que
 *    corren en cada carga de pantalla (resumen de bandeja, pestañas de cobro,
 *    grupos por entidad, saldos, tablero). Nada de esto toca la base.
 *    Los sintéticos NO se insertan en ninguna parte: la base es producción.
 *
 * 2. CONTRA LA BASE REAL (.env), solo lecturas: tiempo de la vista completa,
 *    de la vista de recaudos y de una ficha; y comprueba que ninguna lectura
 *    del módulo devuelva exactamente 1.000 filas sin haber paginado, que es la
 *    forma silenciosa en que PostgREST recorta.
 *
 * Criterio del plan: bandeja < 2 s con 5.000 expedientes; ninguna lista a 1.000.
 */
import { config } from "dotenv";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";
import type { ExpedienteVista } from "../src/lib/incapacidades/expedientes";
import { resumirBandeja } from "../src/lib/incapacidades/expedientes";
import { agruparPorEntidad, contarPestanas, pestanaDe } from "../src/lib/incapacidades/radicacion-reglas";
import { calcularSaldo } from "../src/lib/incapacidades/recaudo-reglas";
import { agregarTablero } from "../src/lib/incapacidades/tablero-reglas";
import { faltantesParaLiquidar } from "../src/lib/incapacidades/liquidacion-reglas";

config();

const N = Number(process.env.INCAP_SINTETICOS ?? 5000);
const LIMITE_BANDEJA_MS = 2000;

// ── 1. Sintéticos en memoria ─────────────────────────────────────────────────

const ENTIDADES = [
  { id: "e1", nombre: "EPS SURA", clase: "EPS", umbral: 4 },
  { id: "e2", nombre: "SALUD TOTAL", clase: "EPS", umbral: 4 },
  { id: "e3", nombre: "NUEVA EPS", clase: "EPS", umbral: 4 },
  { id: "e4", nombre: "SANITAS", clase: "EPS", umbral: 4 },
  { id: "e5", nombre: "ARL BOLIVAR", clase: "ARL", umbral: 1 },
];
const ESTADOS = ["recibido", "en_completar", "liquidado", "radicado", "con_recaudo", "conciliado", "cerrado", "excepcion"] as const;

/** Generador determinista (LCG): la misma corrida siempre. */
function lcg(semilla: number) {
  let s = semilla >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function sinteticos(n: number): ExpedienteVista[] {
  const r = lcg(20260911);
  const out: ExpedienteVista[] = [];
  for (let i = 0; i < n; i++) {
    const ent = ENTIDADES[Math.floor(r() * ENTIDADES.length)];
    const estado = ESTADOS[Math.floor(r() * ESTADOS.length)];
    const dias = 1 + Math.floor(r() * 30);
    const cobrable = dias >= ent.umbral;
    const liquidado = ["liquidado", "radicado", "con_recaudo", "conciliado", "cerrado"].includes(estado);
    const radicado = ["radicado", "con_recaudo", "conciliado", "cerrado"].includes(estado);
    const salario = 1_300_000 + Math.floor(r() * 2_000_000);
    const diasEntidad = ent.clase === "ARL" ? dias : Math.max(dias - 2, 0);
    const valor = liquidado ? Math.round((salario / 30) * diasEntidad) : null;
    const abonos = estado === "con_recaudo" ? Math.round((valor ?? 0) * r()) : ["conciliado", "cerrado"].includes(estado) ? (valor ?? 0) : 0;
    const inicio = new Date(Date.UTC(2026, 8, 1 + Math.floor(r() * 120)));
    const fin = new Date(inicio.getTime() + (dias - 1) * 86_400_000);
    out.push({
      id: `s-${i}`, ausentismo_id: `a-${i}`, recibido_at: inicio.toISOString(), recibido_desde: "matriz_formulario",
      matriz_cambio_pendiente: r() < 0.03, persona_fuente: r() < 0.02 ? "sin_resolver" : "conductores",
      salario_base: liquidado || estado === "en_completar" ? salario : null, salario_vigencia_desde: null, salario_fuente: liquidado ? "manual" : null,
      tipo_homologado: ent.clase === "ARL" ? "AT" : "EG", entidad_catalogo_id: r() < 0.02 ? null : ent.id, entidad_nombre_recibido: ent.nombre,
      pendiente_homologacion: r() < 0.02, modalidad_ajustada: null, dias_entidad_ajustados: null, valor_reclamado_ajustado: null,
      responsable_email: "rrhh@ejemplo", estado, motivo_excepcion: null, valor_reclamado: valor, proxima_accion: null, proxima_accion_fecha: null,
      observaciones: null, alta_manual_motivo: null, version: 1, updated_at: inicio.toISOString(),
      cedula: String(10_000_000 + i), nombre: `SINTÉTICO ${i}`, cargo: "CONDUCTOR", tipo_conductor: "EMPRESA", consecutivo_incapacidad: null,
      fecha_inicio: inicio.toISOString().slice(0, 10), fecha_fin: fin.toISOString().slice(0, 10), dias_incapacidad: dias,
      origen: ent.clase === "ARL" ? "AT" : "EG", indicador_prorroga: r() < 0.1 ? "PRORROGA" : "INICIAL", pagador_recibido: ent.nombre,
      cie10: "M545", diagnostico: "LUMBAGO", origen_registro: "formulario", matriz_eliminada_at: null,
      entidad_nombre: ent.nombre, entidad_clase: ent.clase, entidad_nit: null, entidad_dias_min_cobro: ent.umbral, cobrable,
      liquidacion_id: liquidado ? `l-${i}` : null, regla_codigo: liquidado ? "gestivo-cobro-dias" : null, dias_entidad: liquidado ? diasEntidad : null,
      dias_empresa: liquidado ? dias - diasEntidad : null, valor_total: liquidado ? Math.round((salario / 30) * dias) : null, valor_entidad: valor,
      valor_empresa: null, calculado_at: null, ajustes: 0, adjuntos: 0,
      radicacion_id: radicado ? `r-${i}` : null, radicacion_estado: radicado ? "radicada" : null, radicacion_codigo: radicado ? `RAD-${i}` : null,
      radicacion_fecha_solicitud: null, radicacion_fecha: null, radicacion_valor: radicado ? valor : null, radicacion_bajo_umbral: radicado && !cobrable,
      cobrada: radicado, devoluciones: r() < 0.05 ? 1 : 0,
      cerrado_at: null, cerrado_por_email: null, motivo_cierre: null, cierre_por_excepcion: null,
      abonos_aplicados: abonos, ultimo_giro: null, ajustes_saldo: 0, saldo_operativo: valor == null ? null : valor - abonos,
    });
  }
  return out;
}

function medir<T>(nombre: string, fn: () => T): { ms: number; r: T } {
  const t0 = performance.now();
  const r = fn();
  const ms = performance.now() - t0;
  console.log(`  ${nombre.padEnd(44)} ${ms.toFixed(1).padStart(8)} ms`);
  return { ms, r };
}

console.log(`\n1) En memoria · ${N.toLocaleString("es-CO")} expedientes sintéticos (no se insertan en ninguna parte)`);
const filas = sinteticos(N);
let totalMs = 0;
totalMs += medir("resumirBandeja", () => resumirBandeja(filas)).ms;
totalMs += medir("contarPestanas + pestanaDe (bandeja de cobro)", () => contarPestanas(filas)).ms;
totalMs += medir("agruparPorEntidad (por radicar)", () => agruparPorEntidad(filas.filter((f) => pestanaDe(f) === "por_radicar"))).ms;
totalMs += medir("calcularSaldo × N (conciliación)", () => filas.map((f) => calcularSaldo({ valorReclamado: f.valor_reclamado, abonos: Number(f.abonos_aplicados), ajustes: Number(f.ajustes_saldo) }, 0))).ms;
totalMs += medir("agregarTablero", () => agregarTablero(filas)).ms;
totalMs += medir("faltantesParaLiquidar × N", () => filas.map((f) => faltantesParaLiquidar(f))).ms;
console.log(`  ${"TOTAL agregaciones de una carga".padEnd(44)} ${totalMs.toFixed(1).padStart(8)} ms  ${totalMs < 200 ? "OK" : "REVISAR"}`);

// ── 2. Contra la base real (solo lecturas) ───────────────────────────────────

async function contraLaBase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("\n2) Contra la base: omitido (faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env)");
    return;
  }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log("\n2) Contra la base real · solo lecturas");

  const PAGINA = 1000;
  async function paginado(tabla: string, orden: string): Promise<{ filas: number; paginas: number; ms: number }> {
    const t0 = performance.now();
    let filas = 0, paginas = 0;
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await db.from(tabla).select("*").order(orden).order("id").range(desde, desde + PAGINA - 1);
      if (error) throw new Error(`${tabla}: ${error.message}`);
      paginas++;
      filas += data?.length ?? 0;
      if (!data || data.length < PAGINA) break;
    }
    return { filas, paginas, ms: performance.now() - t0 };
  }

  const vista = await paginado("vw_incapacidad_expedientes", "recibido_at");
  console.log(`  ${"vw_incapacidad_expedientes (bandeja)".padEnd(44)} ${vista.ms.toFixed(0).padStart(8)} ms  ${vista.filas} filas en ${vista.paginas} página(s)  ${vista.ms < LIMITE_BANDEJA_MS ? "OK" : "REVISAR"}`);
  if (vista.filas === PAGINA && vista.paginas === 1) console.log("  ⚠ exactamente 1.000 filas en una sola página: PostgREST puede estar recortando");

  const rec = await paginado("vw_incapacidad_recaudos", "fecha_giro");
  console.log(`  ${"vw_incapacidad_recaudos".padEnd(44)} ${rec.ms.toFixed(0).padStart(8)} ms  ${rec.filas} filas en ${rec.paginas} página(s)`);

  // Una ficha: la vista por id + sus tablas hijas, como hace leerExpediente.
  const { data: uno } = await db.from("vw_incapacidad_expedientes").select("id").order("recibido_at", { ascending: false }).limit(1).maybeSingle();
  if (uno) {
    const id = (uno as { id: string }).id;
    const t0 = performance.now();
    await Promise.all([
      db.from("vw_incapacidad_expedientes").select("*").eq("id", id).maybeSingle(),
      db.from("incapacidad_liquidaciones").select("*").eq("expediente_id", id),
      db.from("incapacidad_ajustes_liquidacion").select("*").eq("expediente_id", id),
      db.from("incapacidad_adjuntos").select("id").eq("expediente_id", id),
      db.from("ausentismo_log").select("id").eq("registro_id", id).limit(200),
      db.from("incapacidad_radicaciones").select("*").eq("expediente_id", id),
      db.from("incapacidad_recaudo_aplicaciones").select("*").eq("expediente_id", id),
      db.from("incapacidad_ajustes").select("*").eq("expediente_id", id),
    ]);
    console.log(`  ${"ficha de un expediente (8 lecturas)".padEnd(44)} ${(performance.now() - t0).toFixed(0).padStart(8)} ms`);
  }

  // Conteos reales para el informe de la fase.
  const conteo = async (tabla: string) => {
    const { count, error } = await db.from(tabla).select("*", { count: "exact", head: true });
    return error ? `error: ${error.message}` : String(count ?? 0);
  };
  console.log("\n  Conteos:");
  for (const t of ["incapacidad_expedientes", "incapacidad_liquidaciones", "incapacidad_ajustes_liquidacion", "incapacidad_radicaciones", "incapacidad_recaudos", "incapacidad_recaudo_aplicaciones", "incapacidad_ajustes", "incapacidad_adjuntos"]) {
    console.log(`  ${t.padEnd(44)} ${(await conteo(t)).padStart(8)}`);
  }
  const { data: params } = await db.from("incapacidad_parametros").select("clave, valor").order("clave");
  console.log("  Parámetros:", (params ?? []).map((p) => `${(p as { clave: string }).clave}=${JSON.stringify((p as { valor: unknown }).valor)}`).join(" · "));
}

contraLaBase().catch((e) => {
  console.error("\n2) Contra la base: falló:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
