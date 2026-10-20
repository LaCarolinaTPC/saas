/**
 * Lecturas de la pantalla de Marcaciones. Aquí se juntan las fuentes
 * (esperados, despacho de GEMA, novedades de ausentismo y, como información,
 * las marcaciones del biométrico) y se le pasan ya resueltas a `resumenDelDia`,
 * que es la parte pura y probada.
 *
 * La presencia la decide el despacho (`despacho.ts`); la huella hoy no decide.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getRegistrosDia } from "@/lib/ausentismo/data";
import type { Concepto } from "@/lib/ausentismo/constants";
import { diasEntreIso, resumenDelDia, type MarcacionDia, type ResumenDia } from "./dia";
import { DIAS_HISTORICO, esperadosDelDia, type EsperadosDelDia } from "./esperados";
import { refrescarDespachoDelDia, type RefrescoDespacho } from "@/lib/gema/despacho-al-dia";

/** Lotes para los `in (...)` sobre cédulas; el mismo tamaño que usa ausentismo. */
const LOTE_CEDULAS = 400;

export interface EstadoAgente {
  ultimoEnvioAt: string | null;
  ultimoId: number | null;
  ultimaMarcacionAt: string | null;
  /** Minutos desde el último envío, según el reloj del servidor. */
  atrasoMin: number | null;
  /** Error del último envío, si terminó mal. */
  ultimoError: string | null;
  /**
   * Marcaciones del día que se está mirando.
   *
   * Antes se mostraba el total acumulado (215.698), que no dice nada de si el
   * equipo está reportando HOY: con la historia cargada, ese número se queda
   * quieto aunque el agente lleve días caído.
   */
  delDia: number;
}

/** Todas las marcaciones de un día, ya atribuidas. */
export async function getMarcacionesDia(fecha: string): Promise<MarcacionDia[]> {
  const db = createAdminClient();
  const salida: MarcacionDia[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await db
      .from("biometrico_marcaciones")
      .select("cedula, pin, momento")
      .eq("fecha", fecha)
      .order("momento", { ascending: true })
      .range(desde, desde + paso - 1);
    if (error) throw new Error(`marcaciones del dia: ${error.message}`);
    const lote = data ?? [];
    for (const m of lote) {
      salida.push({
        cedula: m.cedula ? String(m.cedula) : null,
        pin: String(m.pin),
        momento: String(m.momento),
      });
    }
    if (lote.length < paso) break;
  }
  return salida;
}

/**
 * Última marcación conocida de cada cédula.
 *
 * Hoy la pantalla no la usa: la presencia la decide el despacho y la columna
 * pasó a ser «último día que rodó». Se conserva porque es la lectura que
 * hará falta el día que la huella vuelva a contar, y porque la función de
 * base `biometrico_ultima_marcacion` existe para esto.
 */
export async function getUltimaMarcacion(
  cedulas: string[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!cedulas.length) return mapa;
  const db = createAdminClient();
  for (let i = 0; i < cedulas.length; i += LOTE_CEDULAS) {
    const trozo = cedulas.slice(i, i + LOTE_CEDULAS);
    const { data, error } = await db.rpc("biometrico_ultima_marcacion", {
      p_cedulas: trozo,
    });
    if (error) throw new Error(`ultima marcacion: ${error.message}`);
    for (const fila of (data ?? []) as { cedula: string; momento: string }[]) {
      if (fila.cedula && fila.momento) mapa.set(String(fila.cedula), String(fila.momento));
    }
  }
  return mapa;
}

/** Cómo va el agente del PC de ZKAccess. */
export async function getEstadoAgente(fecha: string): Promise<EstadoAgente> {
  const db = createAdminClient();
  const [envio, marcacion, conteo] = await Promise.all([
    db
      .from("biometrico_envios")
      .select("recibido_at, error")
      .order("recibido_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("biometrico_marcaciones")
      .select("id_zk, momento")
      .order("id_zk", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("biometrico_marcaciones")
      .select("id_zk", { count: "exact", head: true })
      .eq("fecha", fecha),
  ]);
  if (marcacion.error) throw new Error(`estado del agente: ${marcacion.error.message}`);

  const ultimoEnvioAt = (envio.data?.recibido_at as string) ?? null;
  const atrasoMin = ultimoEnvioAt
    ? Math.max(0, Math.round((Date.now() - new Date(ultimoEnvioAt).getTime()) / 60_000))
    : null;

  return {
    ultimoEnvioAt,
    ultimoId: marcacion.data ? Number(marcacion.data.id_zk) : null,
    ultimaMarcacionAt: (marcacion.data?.momento as string) ?? null,
    atrasoMin,
    ultimoError: (envio.data?.error as string) ?? null,
    delDia: conteo.count ?? 0,
  };
}

export interface DatosMarcaciones {
  resumen: ResumenDia;
  /**
   * Último día que rodó, por cédula, para los candidatos a ausencia.
   * `dias` son días calendario hasta la fecha mirada.
   *
   * Reemplazó a «última marcación conocida»: la huella hoy no decide nada y su
   * historia todavía se está cargando, así que esa columna decía «nunca» para
   * gente que sí marca. El último despacho sí es un dato firme.
   */
  ultimoRodado: Record<string, { fecha: string; dias: number }>;
  /** Qué tan al día está el despacho de GEMA, que es de donde sale la presencia. */
  despacho: RefrescoDespacho;
  agente: EstadoAgente;
  esperados: Pick<
    EsperadosDelDia,
    "busesSinConductor" | "despachoSincronizadoHasta" | "conProgramacion"
  > & {
    total: number;
    /** Ventana del «último día que rodó», para poder decirlo en pantalla. */
    diasVentana: number;
  };
}

/**
 * Todo lo que pinta la pantalla de un día.
 *
 * Las novedades salen de `getRegistrosDia`, el mismo lector del Registro del
 * día: así los conceptos que cubren rango (vacaciones) tapan sus días sin
 * tener una fila por día, igual que en Ausentismo.
 */
export async function getDatosMarcaciones(
  fecha: string,
  conceptos: Concepto[],
  hoy: string
): Promise<DatosMarcaciones> {
  // ANTES de leer los esperados: el cron de GEMA corre a las 03:00, cuando el
  // día operativo no ha empezado (el primer viaje sale 03:55 y el último
  // 16:40), así que sin esto la pantalla de hoy estaría vacía toda la jornada.
  // Cuesta ~2,6 s, pero solo en la primera carga cada 15 minutos, y nunca
  // lanza. Ver gema/despacho-al-dia.ts.
  const despacho = await refrescarDespachoDelDia(fecha, hoy);

  const [marco, marcaciones, registros, agente] = await Promise.all([
    esperadosDelDia(fecha),
    getMarcacionesDia(fecha),
    getRegistrosDia(fecha, conceptos),
    getEstadoAgente(fecha),
  ]);

  const novedades = new Set(registros.map((r) => String(r.cedula)));
  const resumen = resumenDelDia({
    esperados: marco.esperados,
    trabajaron: marco.trabajaron,
    porSalir: marco.porSalir,
    novedades,
    marcaciones,
  });

  // Solo para quien no tiene viaje hoy: es la columna «lleva N días sin rodar».
  const ultimoRodado: DatosMarcaciones["ultimoRodado"] = {};
  for (const f of [...resumen.sinDespacho, ...resumen.porSalir]) {
    const dia = marco.ultimoDiaRodado.get(f.cedula);
    if (dia) ultimoRodado[f.cedula] = { fecha: dia, dias: diasEntreIso(dia, fecha) };
  }

  return {
    resumen,
    ultimoRodado,
    despacho,
    agente,
    esperados: {
      busesSinConductor: marco.busesSinConductor,
      despachoSincronizadoHasta: marco.despachoSincronizadoHasta,
      conProgramacion: marco.conProgramacion,
      total: marco.esperados.size,
      diasVentana: DIAS_HISTORICO,
    },
  };
}
