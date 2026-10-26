/**
 * Datos vivos de la pantalla informativa (E/S, solo servidor).
 *
 * Calcula SOLO las familias que piden los widgets de la presentación, cada una
 * con una caché en memoria de unos minutos: varios televisores consultando
 * cada minuto no deben multiplicar las lecturas. Una familia que falla vuelve
 * como `null` y su widget dice «Sin datos»; el resto de la pantalla sigue.
 *
 * Reutiliza los mismos cálculos de las pantallas de Gestivo para que el TV
 * nunca diga otra cifra: `accidentabilidad/analisis.ts`,
 * `ausentismo/indicadores.ts` y `biometrico/data.ts`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/operativo/constants";
import { calcularKpis, contarFactoresPolitica, getAccidentesAnalisis, mesDe, serieMensual } from "@/lib/accidentabilidad/analisis";
import { getIncidenciasVelocidad, getParametrosVelocidad, getRangoDatosVelocidad } from "@/lib/operativo/velocidad";
import { politicaVigente, totalEsquema, type EsquemasPolitica } from "@/lib/padrino/reglas";
import { calcularIndicadores } from "@/lib/ausentismo/indicadores";
import { getConductoresActivos, getFilasIndicadores } from "@/lib/ausentismo/matriz";
import { getConceptos } from "@/lib/ausentismo/data";
import { getConteosMarcaciones } from "@/lib/biometrico/data";
import { familiasDeDatos, type FamiliaDatos, type TipoWidget } from "./modelo";
import {
  aniversariosDelMes,
  baseVelocidad,
  bienvenidasDelMes,
  elegirFactor,
  resumirVelocidad,
  semanasVelocidad,
  type DatosVacantes,
  type DatosVelocidad,
  completarMeses,
  cumpleanosDelMes,
  diasSinAccidentes,
  etiquetaMes,
  mesActualYAnterior,
  ultimosMeses,
  type DatosAccidentabilidad,
  type DatosAniversariosMes,
  type DatosAusentismo,
  type DatosPersonasMes,
  type DatosWidgets,
  type ConteosMarcaciones,
  type OrdenNombre,
} from "./datos-reglas";

const MIN = 60_000;
const TTL: Record<FamiliaDatos, number> = {
  accidentabilidad: 5 * MIN,
  ausentismo: 10 * MIN,
  marcaciones: 5 * MIN,
  cumpleanos: 60 * MIN,
  aniversarios: 60 * MIN,
  // Un mes de GPS son ~12.000 incidencias (~5 MB): dos semanas, cada 30 minutos.
  velocidad: 30 * MIN,
  vacantes: 30 * MIN,
  bienvenidas: 60 * MIN,
};

type Entrada = { vence: number; valor: Promise<unknown> };
const g = globalThis as unknown as { __pantallaDatos?: Map<string, Entrada> };
const cache = (g.__pantallaDatos ??= new Map());

/**
 * Memoiza por clave y TTL. Guarda la PROMESA, así dos televisores que piden a
 * la vez comparten la misma lectura. Si falla, se olvida para reintentar.
 */
function conCache<T>(clave: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const ahora = Date.now();
  const e = cache.get(clave);
  if (e && e.vence > ahora) return e.valor as Promise<T>;
  const valor = fn();
  cache.set(clave, { vence: ahora + ttlMs, valor });
  valor.catch(() => cache.delete(clave));
  return valor;
}

async function seguro<T>(familia: string, p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    console.error(`[pantalla] no se pudo calcular ${familia}:`, e);
    return null;
  }
}

// ── Accidentabilidad ────────────────────────────────────────────────────────

async function leerAccidentabilidad(hoy: string): Promise<DatosAccidentabilidad> {
  const { desde, hasta, meses } = ultimosMeses(hoy, 12);
  const { actual, anterior } = mesActualYAnterior(hoy);
  const admin = createAdminClient();
  // Misma regla que el Análisis: Gestivo + histórico, todas las filas.
  const [filas, ultimo] = await Promise.all([
    getAccidentesAnalisis({ origen: "ambos", desde, hasta }),
    admin
      .from("accidentes")
      .select("fecha_accidente")
      .lte("fecha_accidente", `${hoy}T23:59:59`)
      .order("fecha_accidente", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const delMes = filas.filter((f) => mesDe(f.fecha) === actual);
  const delAnterior = filas.filter((f) => mesDe(f.fecha) === anterior);
  const tresMeses = new Set(meses.slice(-3));
  const delTrimestre = filas.filter((f) => tresMeses.has(mesDe(f.fecha)));
  const kpis = calcularKpis(delMes, delAnterior);
  const graves = delMes.filter((f) => f.clase === "lesionado" || f.clase === "muerto").length;
  const ultimaFecha = (ultimo.data?.fecha_accidente as string | null | undefined) ?? null;
  return {
    mesActual: {
      clave: actual,
      etiqueta: etiquetaMes(actual),
      total: kpis.total,
      graves,
      fatales: kpis.fatales,
      variacion: kpis.variacion,
    },
    mesAnterior: { clave: anterior, etiqueta: etiquetaMes(anterior), total: delAnterior.length },
    serie: completarMeses(serieMensual(filas), meses),
    diasSinAccidentes: diasSinAccidentes(ultimaFecha, hoy),
    ultimoAccidente: ultimaFecha ? ultimaFecha.slice(0, 10) : null,
    factor: elegirFactor(
      { conteo: contarFactoresPolitica(delMes), total: delMes.length },
      { conteo: contarFactoresPolitica(delTrimestre), total: delTrimestre.length }
    ),
  };
}

// ── Velocidad ───────────────────────────────────────────────────────────────

async function leerVelocidad(hoy: string): Promise<DatosVelocidad> {
  const [p, activos, rango] = await Promise.all([getParametrosVelocidad(), getConductoresActivos(), getRangoDatosVelocidad()]);
  // Sin datos de esta semana todavía (el GPS llega con un día de atraso), se
  // muestra la última semana con datos en vez de un «0» engañoso.
  const { base, enCurso } = baseVelocidad(hoy, rango.hasta);
  const s = semanasVelocidad(base);
  const incidencias = await getIncidenciasVelocidad(s.anterior.desde, s.actual.hasta, p);
  return {
    actual: resumirVelocidad(incidencias, s.actual),
    anterior: resumirVelocidad(incidencias, s.anterior),
    activos,
    umbralKmh: p.umbralKmh,
    datosHasta: rango.hasta,
    semanaEnCurso: enCurso,
  };
}

// ── Vacantes y Plan Padrino ─────────────────────────────────────────────────

async function leerVacantes(hoy: string): Promise<DatosVacantes> {
  const admin = createAdminClient();
  const [vac, pol, refs] = await Promise.all([
    admin.from("vacancies").select("title").eq("status", "activa").order("published_at", { ascending: false, nullsFirst: false }).limit(50),
    admin.from("padrino_politicas").select("esquemas, vigente_desde, vigente_hasta").lte("vigente_desde", hoy),
    admin
      .from("padrino_referidos")
      .select("id", { count: "exact", head: true })
      .is("anulado_at", null)
      .gte("created_at", `${hoy.slice(0, 7)}-01T00:00:00-05:00`),
  ]);
  if (vac.error) throw new Error(vac.error.message);
  // Plan Padrino es opcional: sin su migración, el widget muestra solo vacantes.
  const vigente = pol.error ? null : politicaVigente((pol.data ?? []) as { esquemas: EsquemasPolitica; vigente_desde: string; vigente_hasta: string | null }[], hoy);
  const maximo = vigente ? Math.max(totalEsquema(vigente.esquemas.A), totalEsquema(vigente.esquemas.B)) : 0;
  const titulos = (vac.data ?? []).map((v) => String(v.title ?? "").trim()).filter(Boolean);
  return {
    total: titulos.length,
    titulos: titulos.slice(0, 8),
    padrinoMaximo: maximo > 0 ? maximo : null,
    referidosMes: refs.error ? 0 : (refs.count ?? 0),
  };
}

// ── Ausentismo ──────────────────────────────────────────────────────────────

async function leerAusentismo(hoy: string): Promise<DatosAusentismo> {
  const anio = +hoy.slice(0, 4);
  const desde = `${anio}-01-01`;
  const [filas, activos] = await Promise.all([getFilasIndicadores({ desde, hasta: hoy }), getConductoresActivos()]);
  const ind = calcularIndicadores(filas, { desde, hasta: hoy, activos });
  return {
    anio,
    totales: {
      eventos: ind.totales.eventos,
      dias: ind.totales.dias,
      trabajadores: ind.totales.trabajadores,
      promedio: ind.totales.promedio,
      activos: ind.totales.activos,
      pctAfectados: ind.totales.pctAfectados,
    },
    mensual: ind.mensual.map((m) => ({
      mes: m.mes,
      etiqueta: etiquetaMes(m.mes),
      eventos: m.eventos,
      dias: m.dias,
      tasa: m.tasa,
      parcial: m.parcial,
    })),
  };
}

// ── Marcaciones ─────────────────────────────────────────────────────────────

async function leerMarcaciones(hoy: string): Promise<ConteosMarcaciones> {
  const conceptos = await getConceptos();
  const c = await getConteosMarcaciones(hoy, conceptos, hoy);
  return { fecha: hoy, ...c };
}

// ── Personas (cumpleaños y aniversarios) ────────────────────────────────────

type Persona = {
  nombre: string;
  fecha_nacimiento: string | null;
  fecha_ingreso: string | null;
  orden: OrdenNombre;
};

async function leerPersonas(): Promise<Persona[]> {
  const admin = createAdminClient();
  const out: Persona[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin
      .from("conductores")
      .select("nombre, fecha_nacimiento, fecha_ingreso")
      .eq("estado", "ACTIVO")
      .eq("solo_informativo", false)
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      out.push({
        nombre: String(c.nombre ?? ""),
        fecha_nacimiento: (c.fecha_nacimiento as string | null) ?? null,
        fecha_ingreso: (c.fecha_ingreso as string | null) ?? null,
        orden: "apellidos_primero",
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  // Empleados administrativos: no tienen fecha de nacimiento, solo ingreso.
  const { data: emp, error: errEmp } = await admin
    .from("employees")
    .select("full_name, hire_date")
    .in("status", ["activo", "periodo_prueba", "permiso"])
    .limit(5000);
  if (!errEmp) {
    for (const e of emp ?? []) {
      out.push({
        nombre: String(e.full_name ?? ""),
        fecha_nacimiento: null,
        fecha_ingreso: (e.hire_date as string | null) ?? null,
        orden: "nombre_primero",
      });
    }
  }
  return out;
}

const personas = (hoy: string) => conCache(`personas:${hoy.slice(0, 7)}`, 60 * MIN, leerPersonas);

async function leerCumpleanos(hoy: string): Promise<DatosPersonasMes> {
  return { mes: hoy.slice(0, 7), personas: cumpleanosDelMes(await personas(hoy), hoy) };
}

async function leerAniversarios(hoy: string): Promise<DatosAniversariosMes> {
  return { mes: hoy.slice(0, 7), personas: aniversariosDelMes(await personas(hoy), hoy) };
}

async function leerBienvenidas(hoy: string): Promise<DatosPersonasMes> {
  return { mes: hoy.slice(0, 7), personas: bienvenidasDelMes(await personas(hoy), hoy) };
}

// ── Entrada ─────────────────────────────────────────────────────────────────

/** Datos para los widgets presentes. `hoy` en fecha de Bogotá. */
export async function datosParaWidgets(tipos: Iterable<TipoWidget>, hoy = hoyBogota()): Promise<DatosWidgets> {
  const familias = familiasDeDatos(tipos);
  const salida: DatosWidgets = { hoy };
  const tareas: Promise<void>[] = [];
  const pedir = <K extends FamiliaDatos>(
    familia: K,
    fn: (hoy: string) => Promise<NonNullable<DatosWidgets[K]>>
  ) => {
    if (!familias.has(familia)) return;
    tareas.push(
      seguro(familia, conCache(`${familia}:${hoy}`, TTL[familia], () => fn(hoy))).then((v) => {
        (salida as unknown as Record<string, unknown>)[familia] = v;
      })
    );
  };
  pedir("accidentabilidad", leerAccidentabilidad);
  pedir("ausentismo", leerAusentismo);
  pedir("marcaciones", leerMarcaciones);
  pedir("cumpleanos", leerCumpleanos);
  pedir("aniversarios", leerAniversarios);
  pedir("velocidad", leerVelocidad);
  pedir("vacantes", leerVacantes);
  pedir("bienvenidas", leerBienvenidas);
  await Promise.all(tareas);
  return salida;
}
