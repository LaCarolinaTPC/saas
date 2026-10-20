/**
 * Auditoría de la regla de presencia contra los DATOS REALES.
 *
 * Corre los MISMOS módulos que la pantalla (`despacho.ts`, `plantilla.ts`,
 * `dia.ts`) sobre `historico_despacho` y `conductores` de verdad, y comprueba
 * invariantes fecha por fecha. Las pruebas unitarias fijan las reglas con casos
 * escritos a mano; esto comprueba que los datos reales las cumplen.
 *
 * Sale con código 1 si alguna invariante falla, así que sirve en CI o a mano
 * después de tocar la regla.
 *
 *   npm run biometrico:auditar                 # los últimos 14 días
 *   npm run biometrico:auditar -- 2026-10-13   # una fecha
 *   npm run biometrico:auditar -- 2026-10-01 2026-10-19
 *
 * Solo lee. No escribe nada en ninguna parte.
 */
import { leerEnv } from "./biometrico-comun.mjs";
import {
  presenciaDelDia,
  salioARodar,
  type FilaDespacho,
} from "../src/lib/biometrico/despacho";
import {
  entraEnPlantilla,
  esPersona,
  estaActivo,
  estaReubicado,
} from "../src/lib/biometrico/plantilla";
import { resumenDelDia, type Esperado } from "../src/lib/biometrico/dia";

// ── Entorno ────────────────────────────────────────────────────────────────
const env = leerEnv();
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !LLAVE) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env o .env.local."
  );
  process.exit(1);
}

/** Lector paginado que SÍ admite filtros, que es lo que hace falta aquí. */
async function todas<T>(consulta: string): Promise<T[]> {
  const filas: T[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const r = await fetch(`${URL_BASE}/rest/v1/${consulta}`, {
      headers: {
        apikey: LLAVE,
        Authorization: `Bearer ${LLAVE}`,
        Range: `${desde}-${desde + paso - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!r.ok) throw new Error(`${consulta}: ${r.status} ${await r.text()}`);
    const lote = (await r.json()) as T[];
    filas.push(...lote);
    if (lote.length < paso) break;
  }
  return filas;
}

// ── Fechas a auditar ───────────────────────────────────────────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Suma días a una fecha ISO sin pasar por la zona local. */
function sumarDias(fecha: string, dias: number): string {
  const t = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  return new Date(t + dias * 86_400_000).toISOString().slice(0, 10);
}

function fechasPedidas(args: string[]): string[] {
  for (const a of args) {
    if (!ISO.test(a)) {
      console.error(`Fecha no válida: '${a}'. Use AAAA-MM-DD.`);
      process.exit(1);
    }
  }
  if (args.length === 1) return [args[0]];
  if (args.length >= 2) {
    const [desde, hasta] = args[0] <= args[1] ? [args[0], args[1]] : [args[1], args[0]];
    const salida: string[] = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) salida.push(f);
    return salida;
  }
  // Por defecto, los últimos 14 días hasta hoy en Colombia (UTC-5).
  const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
  const salida: string[] = [];
  for (let i = 13; i >= 0; i--) salida.push(sumarDias(hoy, -i));
  return salida;
}

const FECHAS = fechasPedidas(process.argv.slice(2));

// ── Contador de fallas ─────────────────────────────────────────────────────
let fallas = 0;
const yaDicho = new Set<string>();

function revisar(ok: boolean, titulo: string, detalle = "") {
  if (ok) return;
  fallas++;
  // Un mismo problema repetido en 180 conductores no aporta 180 líneas.
  const clave = titulo.replace(/\d{6,}/g, "#");
  if (yaDicho.has(clave)) return;
  yaDicho.add(clave);
  console.log(`  FALLA · ${titulo}${detalle ? ` — ${detalle}` : ""}`);
}

// ── Maestro de conductores ─────────────────────────────────────────────────
interface Cond {
  cedula: string | null;
  nombre: string | null;
  codigo: string | null;
  estado: string | null;
  reubicado: string | null;
  fecha_ingreso: string | null;
  created_at: string | null;
}

const conductores = await todas<Cond>(
  "conductores?select=cedula,nombre,codigo,estado,reubicado,fecha_ingreso,created_at"
);
const porCedula = new Map(conductores.filter((c) => c.cedula).map((c) => [String(c.cedula), c]));
const activos = conductores.filter((c) => estaActivo(c.estado));
const reubicadosActivos = new Set(
  activos.filter((c) => c.cedula && estaReubicado(c.reubicado)).map((c) => String(c.cedula))
);

console.log(`Maestro: ${conductores.length} conductores`);
console.log(`  activos: ${activos.length} · de esos reubicados (fuera): ${reubicadosActivos.size}`);
console.log("");
console.log("fecha        plantilla  trabajaron  porSalir  sinDespacho  novedad   suma");

interface FilaConFecha extends FilaDespacho {
  fecha_viaje: string;
}

let reubicadosQueRodaron = 0;
let diasSinDatos = 0;

for (const fecha of FECHAS) {
  const filas = await todas<FilaConFecha>(
    "historico_despacho?select=conductor_ced,hora_despacho,codigo,turno,viaje,estado," +
      `ruta_programada,timbradas&fecha_viaje=eq.${fecha}`
  );
  const registros = await todas<{ cedula: string }>(
    `ausentismo_registros?select=cedula&fecha=eq.${fecha}`
  );

  const { trabajaron, porSalir } = presenciaDelDia(filas);

  // La misma composición que `esperadosPorCascada`: la plantilla más quien
  // rodó ese día, que entra aunque hoy no esté activo.
  const esperados = new Map<string, Esperado>();
  for (const c of conductores) {
    if (!entraEnPlantilla(c, fecha)) continue;
    esperados.set(String(c.cedula), {
      cedula: String(c.cedula),
      nombre: c.nombre ?? "",
      codigo: c.codigo ?? null,
      bus: null,
      origen: "maestro",
    });
  }
  for (const [cedula, v] of trabajaron) {
    const d = porCedula.get(cedula);
    if (!d) continue;
    esperados.set(cedula, {
      cedula,
      nombre: d.nombre ?? "",
      codigo: d.codigo ?? null,
      bus: v.bus,
      origen: "despacho",
    });
  }

  const resumen = resumenDelDia({
    esperados,
    trabajaron,
    porSalir,
    novedades: new Set(registros.map((r) => String(r.cedula))),
    marcaciones: [],
  });

  const suma =
    resumen.trabajaron.length +
    resumen.porSalir.length +
    resumen.sinDespacho.length +
    resumen.conNovedad.length;

  console.log(
    `${fecha}  ${String(esperados.size).padStart(9)}` +
      `  ${String(resumen.trabajaron.length).padStart(10)}` +
      `  ${String(resumen.porSalir.length).padStart(8)}` +
      `  ${String(resumen.sinDespacho.length).padStart(11)}` +
      `  ${String(resumen.conNovedad.length).padStart(7)}  ${String(suma).padStart(5)}` +
      (filas.length === 0 ? "   (sin despacho sincronizado)" : "")
  );

  if (filas.length === 0) {
    diasSinDatos++;
    continue;
  }

  // 1. Cada esperado cae en exactamente un bucket, y nadie en dos.
  revisar(suma === esperados.size, `${fecha}: la suma de buckets no da la plantilla`, `${suma} vs ${esperados.size}`);
  const vistos = [
    ...resumen.trabajaron.map((f) => f.cedula),
    ...resumen.porSalir.map((f) => f.cedula),
    ...resumen.sinDespacho.map((f) => f.cedula),
    ...resumen.conNovedad.map((e) => e.cedula),
  ];
  revisar(new Set(vistos).size === vistos.length, `${fecha}: alguien aparece en dos buckets`);

  // 2. trabajaron y porSalir son disjuntos.
  const enDos = [...trabajaron.keys()].filter((c) => porSalir.has(c));
  revisar(enDos.length === 0, `${fecha}: ${enDos.length} conductores en trabajaron Y porSalir`);

  // 3. El primer viaje y el conteo, recalculados de forma INDEPENDIENTE desde
  //    las filas crudas. Si `presenciaDelDia` se equivoca, aquí se ve.
  const minPorCed = new Map<string, string>();
  const viajesPorCed = new Map<string, number>();
  for (const f of filas) {
    const c = (f.conductor_ced ?? "").trim();
    if (!c || !salioARodar(f)) continue;
    viajesPorCed.set(c, (viajesPorCed.get(c) ?? 0) + 1);
    const h = (f.hora_despacho ?? "").trim();
    const ya = minPorCed.get(c);
    if (!ya || h < ya) minPorCed.set(c, h);
  }
  revisar(
    minPorCed.size === trabajaron.size,
    `${fecha}: trabajaron no cuadra con el recálculo`,
    `${trabajaron.size} vs ${minPorCed.size}`
  );
  for (const [c, v] of trabajaron) {
    revisar(v.hora === minPorCed.get(c), `${fecha}: primer viaje de ${c}`, `${v.hora} vs ${minPorCed.get(c)}`);
    revisar(v.viajes === viajesPorCed.get(c), `${fecha}: conteo de viajes de ${c}`);
    revisar(v.hora !== "00:00:00", `${fecha}: ${c} rodó con hora de relleno`);
  }

  // 4. Nadie en «sin despacho» rodó de verdad. Es la invariante que evita
  //    proponer una falta a alguien que sí trabajó.
  for (const f of resumen.sinDespacho) {
    revisar(!minPorCed.has(f.cedula), `${fecha}: ${f.cedula} está en sinDespacho pero rodó`);
  }

  // 5. Toda cédula despachada existe en el maestro de conductores.
  for (const c of minPorCed.keys()) {
    revisar(porCedula.has(c), `${fecha}: la cédula despachada ${c} no está en conductores`);
    if (reubicadosActivos.has(c)) reubicadosQueRodaron++;
  }

  // 6. Ningún retirado ni reubicado se cuela en la PLANTILLA.
  //    Se mide solo sobre los candidatos a ausencia, no sobre todos los
  //    esperados: quien rodó entra aunque hoy no esté activo, y eso es a
  //    propósito (ver invariante 8).
  for (const f of [...resumen.sinDespacho, ...resumen.porSalir, ...resumen.conNovedad]) {
    const d = porCedula.get(f.cedula);
    revisar(!!d, `${fecha}: ${f.cedula} como candidato sin estar en el maestro`);
    if (!d) continue;
    revisar(
      estaActivo(d.estado),
      `${fecha}: ${f.cedula} como candidato a ausencia sin estar ACTIVO`,
      String(d.estado)
    );
    revisar(
      !estaReubicado(d.reubicado),
      `${fecha}: ${f.cedula} como candidato a ausencia estando reubicado`
    );
  }

  // 7. Ninguna cédula de relleno en ningún bucket. Estaban ACTIVO en el
  //    maestro, así que entraban a la plantilla y salían como candidatas a
  //    ausencia todos los días.
  for (const c of [...esperados.keys(), ...trabajaron.keys(), ...porSalir]) {
    revisar(esPersona(c), `${fecha}: la cédula de relleno ${c} se colo en un bucket`);
  }

  // 8. TODO EL QUE RODÓ APARECE EN LA PANTALLA.
  //    Es la invariante que faltaba: el resumen recorre los esperados, así que
  //    quien rodó y no esté ahí desaparece de los cuatro buckets. Pasaba con
  //    los retirados y reubicados recientes: 31 personas en 45 días.
  const enPantalla = new Set([
    ...resumen.trabajaron.map((f) => f.cedula),
    ...resumen.porSalir.map((f) => f.cedula),
    ...resumen.sinDespacho.map((f) => f.cedula),
    ...resumen.conNovedad.map((e) => e.cedula),
  ]);
  for (const c of trabajaron.keys()) {
    revisar(enPantalla.has(c), `${fecha}: ${c} rodó y no sale en ningún bucket`);
  }
  // Y además rodar significa caer en «trabajaron», nunca en otro bucket.
  const marcadosComoTrabajo = new Set(resumen.trabajaron.map((f) => f.cedula));
  for (const c of trabajaron.keys()) {
    revisar(marcadosComoTrabajo.has(c), `${fecha}: ${c} rodó pero no está en «trabajaron»`);
  }
}

console.log("");
if (diasSinDatos > 0) {
  console.log(`${diasSinDatos} fecha(s) sin despacho sincronizado: no se auditaron.`);
}
console.log(`Reubicados activos que aparecen rodando: ${reubicadosQueRodaron}`);
if (reubicadosQueRodaron > 0) {
  console.log("  No es un error: salen igual en «Trabajaron», porque quien rodó entra siempre.");
  console.log("  Pero sí significa que algún reubicado maneja, y entonces el filtro de la");
  console.log("  plantilla lo está excluyendo como candidato a ausencia sin razón.");
  console.log("  Vale confirmar con RRHH si ese reubicado sigue manejando.");
}
console.log("");
if (fallas === 0) {
  console.log(`Todas las invariantes pasan en ${FECHAS.length - diasSinDatos} fecha(s).`);
  process.exit(0);
}
console.log(`${fallas} falla(s). Revise la regla antes de confiar en la pantalla.`);
process.exit(1);
