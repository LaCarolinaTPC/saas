/**
 * Migración del histórico del Microsoft Forms «Control incidencias cámaras y
 * sensores» de Mantenimiento (export a Excel, hoja Sheet1) a `camaras_revisiones`,
 * la tabla que llena Mantenimiento → Cámaras y sensores desde octubre de 2026.
 *
 * Uso (desde la raíz del proyecto):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-camaras-historico.mts "<ruta>.xlsx" --ensayo
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-camaras-historico.mts "<ruta>.xlsx" --escribir
 *   npx tsx --tsconfig tsconfig.json scripts/migrar-camaras-historico.mts --reversar
 *
 * --ensayo    solo lee (Excel, despacho de GEMA, maestros) y deja en
 *             %TEMP%\migracion-camaras\ el resumen y control.xlsx con cada revisión que
 *             se insertaría, sus alertas y las filas descartadas. No escribe en la base.
 * --escribir  se niega si ya hay filas migradas; respalda lo que haya en
 *             camaras_revisiones a JSON y luego inserta por lotes.
 * --reversar  borra todo lo migrado (origen = 'migracion').
 *
 * Reglas (src/lib/mantenimiento/camaras-reglas.ts y camaras-historico.ts):
 * - la fecha se lee con leerFechaForms (texto, «R» de repetida, años imposibles) y
 *   la lectura ambigua de día y mes se decide por las filas vecinas, salvo
 *   evidencia clara de GEMA cerca de ellas (el conductor digitado hizo ese
 *   viaje, o la caja cuadra con el aforo y la otra no; elegirFechaForms): la
 *   hora de envío del Forms no sirve desde 2026;
 * - cada fila da una o dos revisiones (cámara y, en el formato viejo, sensor);
 * - el conductor sale del despacho de GEMA (historico_despacho, desde 2025-01-01)
 *   por vehículo + fecha + número de viaje; el nombre digitado solo decide cuando
 *   GEMA no tiene el viaje, y si no coincide con GEMA queda la alerta;
 * - si no coincide y el aforo cuadra con la caja de un viaje del conductor
 *   digitado (en otro bus o con otro número), la revisión pasa a ese viaje
 *   (corregirPorAforo, alerta vehiculo_corregido);
 * - una revisión que repite fecha + vehículo + viaje + elemento queda como repetida.
 *
 * Lo que escribe en disco va a %TEMP%: trae nombres y cédulas de conductores y no
 * debe copiarse al vault ni al repositorio. Lee .env.local y si no existe .env.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  VIAJE_RE, cajaFrenteAforo, corregirPorAforo, elegirFechaForms, esNombreReal, fechaInequivoca, leerFechaForms, normalizarNombre, opcionesFechaForms, resolverConductor,
  type ViajeGema,
} from "../src/lib/mantenimiento/camaras-reglas";
import { mapearFilaForms } from "../src/lib/mantenimiento/camaras-historico";

// xlsx es CommonJS: se carga con require para que tsx no lo trate como ESM.
const XLSX = createRequire(import.meta.url)("xlsx") as typeof import("xlsx");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARCA = "migracion:FORMULARIO CONTROL INCIDENCIAS CAMARAS Y SENSORES 2.xlsx";
const SALIDA = path.join(os.tmpdir(), "migracion-camaras");
const LOTE = 200;
/** Desde aquí hay despacho en GEMA; antes no hay con qué cruzar. */
const INICIO_GEMA = "2025-01-01";
/** Primer viaje que puede traer el Forms (arrancó en diciembre de 2024). */
const INICIO_FORMS = "2024-12-01";
/** Filas a cada lado que dan el contexto de una fecha ambigua. */
const VENTANA = 20;
/** Una fecha a más de esto de sus vecinas queda con alerta para revisarla. */
const DIAS_LEJANA = 45;

type Db = SupabaseClient;

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

async function todo<T>(db: Db, tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from(tabla).select(columnas).range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return filas;
  }
}

/** Serial de Excel (días desde 1899-12-30) a fecha y hora ISO, sin zona. */
function serialAIso(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000)).toISOString().slice(0, 19);
}

interface FilaExcel {
  fila: number;
  id: number | null;
  inicio: string | null;
  fechaCruda: unknown;
  novedad: string | null;
  conductor: string | null;
  vehiculo: string;
  viaje: string;
  estadoCamara: string | null;
  intervencion: string | null;
  dfs: number | string | null;
  recaudo: number | string | null;
  aforo: number | string | null;
  tipo: string | null;
  tipoSensor: string | null;
}

/** La fecha tal como llegó: la de Excel en ISO (es UTC), el texto sin tocar. */
const textoFecha = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? ""));

const texto = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());

function leerExcel(archivo: string): FilaExcel[] {
  const libro = XLSX.read(readFileSync(archivo), { type: "buffer" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: null });
  return filas.slice(1).flatMap((c, i) => {
    if (!c || c.every((v) => v == null)) return [];
    const inicio = typeof c[1] === "number" ? serialAIso(c[1]) : null;
    const fechaCruda = typeof c[5] === "number" ? new Date(`${serialAIso(c[5]).slice(0, 10)}T00:00:00Z`) : c[5];
    return [{
      fila: i + 2,
      id: typeof c[0] === "number" ? c[0] : null,
      inicio,
      fechaCruda,
      novedad: texto(c[6]),
      conductor: texto(c[7]),
      vehiculo: String(c[8] ?? "").trim(),
      viaje: String(c[9] ?? "").trim().toUpperCase(),
      estadoCamara: texto(c[10]),
      intervencion: texto(c[11]),
      dfs: typeof c[12] === "number" ? c[12] : texto(c[12]),
      recaudo: typeof c[13] === "number" ? c[13] : texto(c[13]),
      aforo: typeof c[14] === "number" ? c[14] : texto(c[14]),
      tipo: texto(c[15]),
      tipoSensor: texto(c[16]),
    }];
  });
}

interface Revision {
  fila: number;
  fecha_viaje: string;
  vehiculo_codigo: string;
  viaje: string;
  despacho_numero: number | null;
  conductor_cedula: string | null;
  conductor_nombre: string | null;
  conductor_origen: string;
  elemento: string;
  tipo_novedad: string;
  con_falla: boolean;
  dfs_optocontrol: number | null;
  aforo: number | null;
  revision_repetida: boolean;
  alertas: string[];
  created_at: string | null;
  datos_origen: Record<string, unknown>;
}

async function main() {
  const args = process.argv.slice(2);
  const modo = args.includes("--escribir") ? "escribir" : args.includes("--reversar") ? "reversar" : "ensayo";
  const archivo = args.find((a) => !a.startsWith("--")) ?? null;

  const env = leerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env.");
  }
  const db: Db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  mkdirSync(SALIDA, { recursive: true });
  console.log(`Modo: ${modo} · salida: ${SALIDA}`);

  if (modo === "reversar") {
    const { count, error } = await db.from("camaras_revisiones").delete({ count: "exact" }).eq("origen", "migracion");
    if (error) throw new Error(error.message);
    console.log(`Reversado: ${count ?? 0} revisiones migradas borradas.`);
    return;
  }

  if (!archivo || !existsSync(archivo)) throw new Error(`Indica la ruta del Excel (no existe: ${archivo}).`);
  const filas = leerExcel(archivo);
  console.log(`Excel: ${filas.length} filas.`);

  const [tipos, vehiculos, conductores] = await Promise.all([
    todo<{ clave: string; es_falla: boolean }>(db, "camaras_tipos_novedad", "clave, es_falla").catch(() => null),
    todo<{ codigo: string }>(db, "vehiculos", "codigo"),
    todo<{ cedula: string; nombre: string }>(db, "conductores", "cedula, nombre"),
  ]);
  // Sin la migración SQL aplicada el ensayo sigue con el catálogo sembrado en ella.
  const esFalla = new Map((tipos ?? []).map((t) => [t.clave, t.es_falla]));
  if (!tipos) {
    console.log("Aviso: camaras_tipos_novedad no existe todavía; el ensayo usa el catálogo de la migración.");
    for (const c of ["camara_normal", "camara_varado", "sensor_rutina"]) esFalla.set(c, false);
  }
  const falla = (clave: string) => esFalla.get(clave) ?? true;
  const flota = new Set(vehiculos.map((v) => String(v.codigo)));
  const porNombre = new Map<string, { cedula: string; nombre: string }[]>();
  for (const c of conductores) {
    const k = normalizarNombre(c.nombre);
    porNombre.set(k, [...(porNombre.get(k) ?? []), c]);
  }

  // 1. Fechas posibles. El Forms se llenó en orden, pero desde mediados de 2026
  //    la hora de envío no sirve (cargas en bloque con la misma hora falsa) y
  //    Excel invirtió día y mes en las celdas de fecha. Cada fila queda con sus
  //    lecturas posibles y la fecha típica de sus vecinas sin ambigüedad.
  const hoy = new Date().toISOString().slice(0, 10);
  const rango = { desde: INICIO_FORMS, hasta: hoy };
  const partes = filas.map((f) => leerFechaForms(f.fechaCruda));
  const inequivocas = partes.map((p) => (p ? fechaInequivoca(p, rango) : null));
  // Si a ±VENTANA filas no hay ninguna inequívoca (zonas donde todos los días
  // son ≤ 12), se amplía la ventana antes de quedarse sin contexto.
  const contextoDe = (i: number): string | null => {
    for (const ancho of [VENTANA, VENTANA * 5, VENTANA * 25]) {
      const cerca: string[] = [];
      for (let j = Math.max(0, i - ancho); j <= Math.min(filas.length - 1, i + ancho); j++) {
        if (j !== i && inequivocas[j]) cerca.push(inequivocas[j]!);
      }
      if (cerca.length === 0) continue;
      cerca.sort();
      return cerca[Math.floor(cerca.length / 2)];
    }
    return null;
  };
  const descartadas: (string | number | null)[][] = [];
  const legibles: { f: FilaExcel; parte: NonNullable<(typeof partes)[number]>; contexto: string | null; opciones: string[] }[] = [];
  filas.forEach((f, i) => {
    const contexto = contextoDe(i);
    const o = partes[i] ? opcionesFechaForms(partes[i]!, contexto, rango) : null;
    if (!o) { descartadas.push([f.fila, "fecha ilegible", textoFecha(f.fechaCruda), f.vehiculo, f.viaje]); return; }
    if (!/^\d{1,5}$/.test(f.vehiculo)) { descartadas.push([f.fila, "vehículo ilegible", o.opciones[0], f.vehiculo, f.viaje]); return; }
    if (!VIAJE_RE.test(f.viaje)) { descartadas.push([f.fila, "viaje ilegible", o.opciones[0], f.vehiculo, f.viaje]); return; }
    legibles.push({ f, parte: partes[i]!, contexto, opciones: o.opciones });
  });

  // 2. Despacho de GEMA de cada día posible y bus que aparece en el Excel.
  const porDia = new Map<string, Set<string>>();
  for (const l of legibles) {
    for (const fecha of l.opciones) {
      if (fecha < INICIO_GEMA) continue;
      if (!porDia.has(fecha)) porDia.set(fecha, new Set());
      porDia.get(fecha)!.add(l.f.vehiculo);
    }
  }
  const despacho = new Map<string, ViajeGema[]>();
  let n = 0;
  for (const [fecha, buses] of porDia) {
    const { data, error } = await db
      .from("historico_despacho")
      .select("numero, codigo, viaje, conductor, conductor_ced")
      .eq("fecha_viaje", fecha)
      .in("codigo", [...buses])
      .limit(1000);
    if (error) throw new Error(`historico_despacho ${fecha}: ${error.message}`);
    for (const v of data ?? []) {
      if (v.viaje == null) continue;
      const k = `${fecha}|${v.codigo}`;
      despacho.set(k, [...(despacho.get(k) ?? []), {
        numero: Number(v.numero), viaje: v.viaje, conductorCedula: v.conductor_ced, conductorNombre: v.conductor,
      }]);
    }
    if (++n % 100 === 0) console.log(`  despacho: ${n}/${porDia.size} días`);
  }
  const viajeDe = (fecha: string, f: FilaExcel) =>
    /^\d+$/.test(f.viaje) ? (despacho.get(`${fecha}|${f.vehiculo}`) ?? []).find((v) => v.viaje === Number(f.viaje)) : undefined;

  // 2b. Caja de los viajes de las filas con dos lecturas posibles y aforo, para
  //     usarla como evidencia de cuál es la fecha.
  const numerosAmbiguos = legibles.flatMap((l) => (l.opciones.length > 1 && typeof l.f.aforo === "number"
    ? l.opciones.flatMap((fecha) => { const v = viajeDe(fecha, l.f); return v ? [v.numero] : []; })
    : []));
  const cajaAmbiguos = new Map<number, number | null>();
  for (let i = 0; i < numerosAmbiguos.length; i += 300) {
    const { data, error } = await db
      .from("viajes_recaudados").select("numero, timbradas_real").in("numero", numerosAmbiguos.slice(i, i + 300));
    if (error) throw new Error(`viajes_recaudados: ${error.message}`);
    for (const c of data ?? []) cajaAmbiguos.set(Number(c.numero), c.timbradas_real as number | null);
  }

  // 1b. Fecha elegida: la de las vecinas, salvo evidencia clara de GEMA cerca de ellas.
  let fechasPorGema = 0;
  const preparadas: { f: FilaExcel; fecha: string; repetida: boolean; corregida: boolean; lejana: boolean }[] = [];
  for (const l of legibles) {
    const nombre = esNombreReal(l.f.conductor) ? normalizarNombre(l.f.conductor) : null;
    const aforo = typeof l.f.aforo === "number" && l.f.aforo > 0 ? l.f.aforo : null;
    const evidencia = (fecha: string) => {
      const v = viajeDe(fecha, l.f);
      return {
        conductor: !!v && !!nombre && normalizarNombre(v.conductorNombre) === nombre,
        caja: v ? cajaFrenteAforo(cajaAmbiguos.get(v.numero), aforo) : null,
      };
    };
    const fecha = elegirFechaForms(l.parte, l.contexto, rango, evidencia)!;
    if (l.opciones.length > 1 && fecha.fecha !== elegirFechaForms(l.parte, l.contexto, rango)!.fecha) fechasPorGema++;
    const lejana = !!l.contexto && Math.abs(Date.parse(fecha.fecha) - Date.parse(l.contexto)) > DIAS_LEJANA * 86_400_000;
    preparadas.push({ f: l.f, ...fecha, lejana });
  }

  // 3. Revisiones.
  const revisiones: Revision[] = [];
  const vistas = new Set<string>();
  for (const p of preparadas) {
    const { f } = p;
    const viajesBus = despacho.get(`${p.fecha}|${f.vehiculo}`) ?? [];
    const candidatos = esNombreReal(f.conductor) ? porNombre.get(normalizarNombre(f.conductor)) ?? [] : [];
    const maestro = candidatos.length === 1 ? candidatos[0] : null;
    const conductor = resolverConductor(viajesBus, f.viaje, f.conductor, maestro);
    const alertasFila = [...conductor.alertas];
    if (p.fecha < INICIO_GEMA) {
      const i = alertasFila.indexOf("sin_viajes_gema");
      if (i >= 0) alertasFila.splice(i, 1, "antes_de_gema");
    }
    if (p.corregida) alertasFila.push("fecha_corregida");
    if (p.lejana) alertasFila.push("fecha_lejana");
    if (!flota.has(f.vehiculo)) alertasFila.push("vehiculo_no_existe");

    for (const m of mapearFilaForms(f)) {
      const clave = `${p.fecha}|${f.vehiculo}|${f.viaje}|${m.elemento}`;
      const repetida = p.repetida || vistas.has(clave);
      vistas.add(clave);
      revisiones.push({
        fila: f.fila,
        fecha_viaje: p.fecha,
        vehiculo_codigo: f.vehiculo,
        viaje: f.viaje,
        despacho_numero: conductor.despachoNumero,
        conductor_cedula: conductor.cedula,
        conductor_nombre: conductor.nombre,
        conductor_origen: conductor.origen,
        elemento: m.elemento,
        tipo_novedad: m.tipoNovedad,
        con_falla: falla(m.tipoNovedad),
        dfs_optocontrol: m.dfs,
        aforo: m.aforo,
        revision_repetida: repetida,
        alertas: [...alertasFila, ...m.alertas],
        created_at: f.inicio && f.inicio.slice(0, 10) <= hoy ? `${f.inicio}-05:00` : null,
        datos_origen: {
          marca: MARCA, fila: f.fila, id: f.id, hora_inicio: f.inicio, fecha_novedad: textoFecha(f.fechaCruda),
          novedad: f.novedad, conductor: f.conductor, vehiculo: f.vehiculo, viaje: f.viaje,
          estado_camara: f.estadoCamara, intervencion: f.intervencion, dfs: f.dfs, recaudo_caja: f.recaudo,
          aforo: f.aforo, tipo: f.tipo, tipo_sensor: f.tipoSensor,
        },
      });
    }
  }

  // 3b. Bus mal digitado. Si el nombre del Excel no coincide con GEMA, se miran
  //     los viajes de ese conductor ese día: si uno (mismo número de viaje en
  //     otro bus, o el mismo bus con otro número) cobró en caja lo que se contó
  //     en el video y el viaje cargado no, la revisión pasa a ese viaje.
  const porFila = new Map<number, Revision[]>();
  for (const r of revisiones) porFila.set(r.fila, [...(porFila.get(r.fila) ?? []), r]);
  const cajaDe = async (numeros: number[]) => {
    const m = new Map<number, number | null>();
    if (numeros.length === 0) return m;
    const { data, error } = await db.from("viajes_recaudados").select("numero, timbradas_real").in("numero", numeros);
    if (error) throw new Error(`viajes_recaudados: ${error.message}`);
    for (const c of data ?? []) m.set(Number(c.numero), c.timbradas_real as number | null);
    return m;
  };
  let corregidas = 0;
  for (const [, grupo] of porFila) {
    const camara = grupo.find((r) => r.elemento === "camara");
    if (!camara || !camara.alertas.includes("conductor_distinto") || !/^\d+$/.test(camara.viaje)) continue;
    const nombreExcel = camara.datos_origen.conductor as string | null;
    const candidatosMaestro = esNombreReal(nombreExcel) ? porNombre.get(normalizarNombre(nombreExcel)) ?? [] : [];
    if (candidatosMaestro.length !== 1) continue;
    const { data: delConductor, error } = await db
      .from("historico_despacho")
      .select("numero, codigo, viaje, conductor, conductor_ced")
      .eq("fecha_viaje", camara.fecha_viaje)
      .eq("conductor_ced", candidatosMaestro[0].cedula);
    if (error) throw new Error(`historico_despacho: ${error.message}`);
    const viajesConductor = (delConductor ?? []).filter((v) => v.viaje != null);
    if (viajesConductor.length === 0) continue;
    // Un viaje cargado que GEMA no tiene cuenta como sin caja.
    const numeroActual = camara.despacho_numero ?? -1;
    const cajas = await cajaDe([...(camara.despacho_numero != null ? [camara.despacho_numero] : []), ...viajesConductor.map((v) => Number(v.numero))]);
    const elegido = corregirPorAforo(
      camara.aforo ?? camara.dfs_optocontrol,
      { numero: numeroActual, codigo: camara.vehiculo_codigo, viaje: Number(camara.viaje), caja: cajas.get(numeroActual) ?? null },
      viajesConductor.map((v) => ({ numero: Number(v.numero), codigo: String(v.codigo), viaje: v.viaje as number, caja: cajas.get(Number(v.numero)) ?? null })),
    );
    if (!elegido) continue;
    const viaje = viajesConductor.find((v) => Number(v.numero) === elegido.numero)!;
    for (const r of grupo) {
      r.vehiculo_codigo = elegido.codigo;
      r.viaje = String(elegido.viaje);
      r.despacho_numero = elegido.numero;
      r.conductor_cedula = viaje.conductor_ced;
      r.conductor_nombre = viaje.conductor;
      r.conductor_origen = "gema_viaje";
      r.alertas = r.alertas
        .filter((a) => !["conductor_distinto", "viaje_no_existe", "sin_viajes_gema", "vehiculo_no_existe"].includes(a))
        .concat(flota.has(elegido.codigo) ? [] : ["vehiculo_no_existe"], "vehiculo_corregido");
    }
    corregidas++;
  }
  // La marca de repetida se recalcula: un viaje movido de bus puede dejar de serlo o empezar a serlo.
  const vistasFinal = new Set<string>();
  for (const r of revisiones) {
    const clave = `${r.fecha_viaje}|${r.vehiculo_codigo}|${r.viaje}|${r.elemento}`;
    r.revision_repetida = /\d\s*R$/i.test(String(r.datos_origen.fecha_novedad ?? "").trim()) || vistasFinal.has(clave);
    vistasFinal.add(clave);
  }

  // 4. Informe.
  const cuenta = (lista: string[]) => {
    const m = new Map<string, number>();
    for (const x of lista) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const filasCruzadas = new Set(revisiones.map((r) => r.fila)).size;
  const resumen = [
    `Migración del Forms de cámaras y sensores · ${new Date().toISOString()}`,
    `Excel: ${filas.length} filas · usadas ${filasCruzadas} · descartadas ${descartadas.length}`,
    `Revisiones a insertar: ${revisiones.length} (cámara ${revisiones.filter((r) => r.elemento === "camara").length}, sensor ${revisiones.filter((r) => r.elemento === "sensor").length})`,
    `Con falla: ${revisiones.filter((r) => r.con_falla).length} · repetidas: ${revisiones.filter((r) => r.revision_repetida).length}`,
    `Bus corregido por el aforo: ${corregidas} filas del Excel`,
    `Fecha decidida por GEMA (conductor o caja) contra las filas vecinas: ${fechasPorGema} filas`,
    "",
    "Origen del conductor:",
    ...cuenta(revisiones.map((r) => r.conductor_origen)).map(([k, v]) => `  ${k.padEnd(14)} ${v}`),
    "",
    "Alertas:",
    ...cuenta(revisiones.flatMap((r) => r.alertas)).map(([k, v]) => `  ${k.padEnd(20)} ${v}`),
    "",
    "Tipos:",
    ...cuenta(revisiones.map((r) => r.tipo_novedad)).map(([k, v]) => `  ${k.padEnd(26)} ${v}`),
    "",
    "Descartadas:",
    ...cuenta(descartadas.map((d) => String(d[1]))).map(([k, v]) => `  ${k.padEnd(20)} ${v}`),
  ].join("\n");
  writeFileSync(path.join(SALIDA, "resumen.txt"), resumen, "utf8");
  console.log(`\n${resumen}\n`);

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(resumen.split("\n").map((l) => [l])), "Resumen");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(revisiones.map((r) => ({
    fila_excel: r.fila, fecha_viaje: r.fecha_viaje, fecha_digitada: r.datos_origen.fecha_novedad, vehiculo: r.vehiculo_codigo,
    viaje: r.viaje, elemento: r.elemento, tipo: r.tipo_novedad, falla: r.con_falla ? "Sí" : "No",
    dfs: r.dfs_optocontrol, aforo: r.aforo, conductor_excel: r.datos_origen.conductor, conductor_gestivo: r.conductor_nombre,
    cedula: r.conductor_cedula, origen_conductor: r.conductor_origen, despacho: r.despacho_numero,
    repetida: r.revision_repetida ? "Sí" : "No", alertas: r.alertas.join(", "),
  }))), "Revisiones");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(revisiones
    .filter((r) => r.alertas.includes("conductor_distinto"))
    .map((r) => ({
      fila_excel: r.fila, fecha_viaje: r.fecha_viaje, vehiculo: r.vehiculo_codigo, viaje: r.viaje,
      conductor_excel: r.datos_origen.conductor, conductor_gema: r.conductor_nombre, cedula_gema: r.conductor_cedula,
    }))), "Conductor distinto");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
    ["fila_excel", "motivo", "fecha", "vehiculo", "viaje"], ...descartadas,
  ]), "Descartadas");
  XLSX.writeFile(libro, path.join(SALIDA, "control.xlsx"));
  console.log(`Informe: ${path.join(SALIDA, "control.xlsx")}`);

  if (modo === "ensayo") return;

  // 5. Escritura.
  if (!tipos) throw new Error("Falta aplicar la migración SQL 20261007205927 antes de escribir.");
  const { count: previas, error: errPrev } = await db
    .from("camaras_revisiones").select("id", { count: "exact", head: true }).eq("origen", "migracion");
  if (errPrev) throw new Error(errPrev.message);
  if ((previas ?? 0) > 0) throw new Error(`Ya hay ${previas} revisiones migradas: corre --reversar antes de volver a escribir.`);
  const respaldo = await todo<Record<string, unknown>>(db, "camaras_revisiones", "*");
  writeFileSync(path.join(SALIDA, `respaldo-camaras_revisiones-${Date.now()}.json`), JSON.stringify(respaldo), "utf8");

  let insertadas = 0;
  for (let i = 0; i < revisiones.length; i += LOTE) {
    const lote = revisiones.slice(i, i + LOTE).map(({ fila: _fila, created_at, ...r }) => ({
      // Todas las filas del lote con las mismas columnas: PostgREST rellena con
      // null la que falte. Sin hora de envío creíble se usa el mediodía del viaje.
      ...r, origen: "migracion", created_at: created_at ?? `${r.fecha_viaje}T12:00:00-05:00`,
    }));
    const { error } = await db.from("camaras_revisiones").insert(lote);
    if (error) throw new Error(`Lote ${i / LOTE + 1}: ${error.message}. Insertadas hasta ahora: ${insertadas}. Usa --reversar.`);
    insertadas += lote.length;
  }
  console.log(`Escritas ${insertadas} revisiones con origen = 'migracion'.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
