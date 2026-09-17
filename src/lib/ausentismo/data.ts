import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONCEPTO_EPS,
  CONCEPTO_INCAPACIDAD,
  CONCEPTO_NO_JUSTIFICADA,
  DIAS_DESCARGOS,
  HISTORIAL_LIMITE,
  ORDEN_NIVEL,
  REINCIDENCIA_MINIMO,
  VENTANA_DEFECTO,
  diasEntre,
  mesDe,
  mesesEntre,
  nivelAlertaReincidente,
  nivelesRequeridos,
  rachaMasReciente,
  rangoVentana,
  sumarDias,
  type AusentismoRegistro,
  type CategoriaReincidencia,
  type NivelAlerta,
  type NivelNotificable,
  type Notificacion,
  type Concepto,
  type Racha,
  type VehiculoOpcion,
} from "./constants";
import { clavesPeriodicas, empiezaEn } from "./periodos";

/** Columnas del registro más la placa del maestro (solo lectura). */
const SELECT_REGISTRO = "*, vehiculos(placa)";

/**
 * Catálogo completo de conceptos, activos e inactivos, en el orden del
 * catálogo. Los inactivos hacen falta para etiquetar registros históricos;
 * el selector filtra por `activo` en el cliente.
 */
export async function getConceptos(): Promise<Concepto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ausentismo_conceptos")
    .select("key, nombre, orden, activo, cuenta_reincidencia, exige_soporte, cubre_rango")
    .order("orden")
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Concepto[];
}

/**
 * Vehículos activos del maestro GEMA para el selector del formulario.
 * `estado = 1` es el activo (misma regla que Mantenimiento); trae la cédula
 * del conductor para preseleccionar el vehículo al elegir al ausente.
 */
export async function getVehiculosActivos(): Promise<VehiculoOpcion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("vehiculos")
    .select("codigo, placa, cedula_conductor")
    .eq("estado", 1)
    .order("codigo");
  if (error) throw error;
  return (data ?? []) as VehiculoOpcion[];
}

/**
 * Lista de claves para un filtro `in.(…)` de PostgREST. Las claves del
 * catálogo son `[a-z0-9_]`, así que no hay nada que escapar.
 */
function listaIn(claves: Iterable<string>): string {
  return `(${[...claves].join(",")})`;
}

/**
 * Registros de un día (pantalla principal, como una página del Excel).
 *
 * A la lista entran los que empiezan ese día y, además, los conceptos que
 * cubren un rango (`cubre_rango`: hoy solo vacaciones) cuyo periodo pasa por
 * ese día. Así unas vacaciones diligenciadas una sola vez presentan al ausente
 * todos los días, sin volver a registrarlo. Sin conceptos periódicos en el
 * catálogo, la consulta es la de siempre.
 */
export async function getRegistrosDia(
  fecha: string,
  conceptos: Concepto[] = []
): Promise<AusentismoRegistro[]> {
  const supabase = createAdminClient();
  const periodicas = clavesPeriodicas(conceptos);
  let query = supabase.from("ausentismo_registros").select(SELECT_REGISTRO);
  query =
    periodicas.size > 0
      ? query.or(
          `fecha.eq.${fecha},` +
            `and(tipo.in.${listaIn(periodicas)},fecha_inicio.lte.${fecha},fecha_fin.gte.${fecha})`
        )
      : query.eq("fecha", fecha);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  const filas = (data ?? []) as AusentismoRegistro[];
  // Primero los que arrancan ese día, después los que vienen corriendo: se lee
  // igual que el Excel, donde lo nuevo del día encabezaba la página.
  return filas.sort((a, b) => {
    const ea = empiezaEn(a, fecha, periodicas) ? 0 : 1;
    const eb = empiezaEn(b, fecha, periodicas) ? 0 : 1;
    return ea - eb || a.created_at.localeCompare(b.created_at);
  });
}

/**
 * Historial por rango, con filtros opcionales de tipo y búsqueda. Un concepto
 * que cubre rango entra si su periodo se cruza con el filtro, aunque haya
 * empezado antes: unas vacaciones del 20/09 al 05/10 salen al consultar del 25
 * al 30 de septiembre. Una fila por periodo, no una por día.
 */
export async function getHistorial(filtros: {
  desde: string;
  hasta: string;
  tipo?: string | null;
  q?: string | null;
  conceptos?: Concepto[];
}): Promise<AusentismoRegistro[]> {
  const supabase = createAdminClient();
  // PostgREST recorta cada respuesta a 1.000 filas: se pagina con range()
  // hasta agotar el rango o llegar al tope.
  const PAGINA = 1000;
  const periodicas = clavesPeriodicas(filtros.conceptos ?? []);
  const out: AusentismoRegistro[] = [];
  for (let desde = 0; desde < HISTORIAL_LIMITE; desde += PAGINA) {
    let query = supabase
      .from("ausentismo_registros")
      .select(SELECT_REGISTRO);
    query =
      periodicas.size > 0
        ? query.or(
            `and(fecha.gte.${filtros.desde},fecha.lte.${filtros.hasta}),` +
              `and(tipo.in.${listaIn(periodicas)},fecha_inicio.lte.${filtros.hasta},fecha_fin.gte.${filtros.desde})`
          )
        : query.gte("fecha", filtros.desde).lte("fecha", filtros.hasta);
    query = query
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(desde, Math.min(desde + PAGINA, HISTORIAL_LIMITE) - 1);
    if (filtros.tipo) query = query.eq("tipo", filtros.tipo);
    if (filtros.q) {
      const q = filtros.q.trim();
      if (/^\d+$/.test(q)) {
        query = query.or(`cedula.like.${q}%,codigo.eq.${q}`);
      } else {
        query = query.ilike("nombre", `%${q}%`);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    const filas = (data ?? []) as AusentismoRegistro[];
    out.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return out;
}

/** Una ausencia del conductor dentro de la ventana, para el detalle y las exportaciones. */
export interface AusenciaReincidente {
  id: string;
  fecha: string;
  tipo: string;
  soporte: string;
  justificacion: string | null;
  codigo_vehiculo: string | null;
  placa: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  incapacidad_inicio: string | null;
  incapacidad_fin: string | null;
  /** El concepto cuenta para la reincidencia (no es programado). */
  cuenta: boolean;
  noJustificada: boolean;
}

export interface Reincidente {
  cedula: string;
  codigo: string | null;
  nombre: string;
  telefono: string | null;
  /**
   * Situación en el maestro `conductores`. Un retirado no se llama ni se
   * cita a descargos: queda fuera de la alerta diaria y de la pestaña salvo
   * que se pidan expresamente.
   */
  retirado: boolean;
  fechaRetiro: string | null;
  total: number;
  noJustificadas: number;
  soportesPendientes: number;
  /** Categorías de la alerta: citas EPS e incapacidades (episodios y días). */
  eps: number;
  incapacidades: number;
  diasIncapacidad: number;
  /** Días seguidos sin justificar (racha más reciente, hasta el corte). */
  racha: Racha;
  /**
   * Marca de "ya notificado" por nivel, emparejada con la racha actual. Solo
   * tienen sentido cuando la racha llega a los días del nivel.
   */
  notificaciones: Record<NivelNotificable, Notificacion | null>;
  /** Niveles que la racha exige y aún no tienen marca de notificación. */
  pendientes: NivelNotificable[];
  tipos: Record<string, number>;
  ultimaFecha: string;
  alerta: NivelAlerta | null;
  ausencias: AusenciaReincidente[];
}

/** Días calendario que cubre un registro dentro de [desde, hasta]. */
function diasCubiertos(
  r: { fecha: string; fecha_inicio: string | null; fecha_fin: string | null },
  desde: string,
  hasta: string
): string[] {
  const ini = r.fecha_inicio ?? r.fecha;
  // Sin fin, el registro cubre solo su día de inicio: cada día ausente se
  // anota aparte, como en el Excel.
  const fin = r.fecha_fin ?? ini;
  const a = ini < desde ? desde : ini;
  const b = fin > hasta ? hasta : fin;
  const dias = [r.fecha];
  if (a <= b) for (let i = 0, n = diasEntre(a, b); i <= n; i++) dias.push(sumarDias(a, i));
  return dias.filter((d) => d >= desde && d <= hasta);
}

/** Situación en el maestro de conductores, por cédula (en lotes de 400). */
export async function getSituacionConductores(
  cedulas: string[]
): Promise<Map<string, { retirado: boolean; fechaRetiro: string | null }>> {
  const out = new Map<string, { retirado: boolean; fechaRetiro: string | null }>();
  if (cedulas.length === 0) return out;
  const supabase = createAdminClient();
  for (let i = 0; i < cedulas.length; i += 400) {
    const { data, error } = await supabase
      .from("conductores")
      .select("cedula, estado, fecha_retiro")
      .in("cedula", cedulas.slice(i, i + 400));
    // Sin maestro no se puede afirmar que alguien esté retirado: se deja
    // como activo (mejor listarlo de más que perderlo de la alerta).
    if (error) {
      console.error("[ausentismo] no se pudo leer el maestro de conductores:", error.message);
      return out;
    }
    for (const c of data ?? []) {
      out.set(c.cedula as string, {
        retirado: (c.estado as string | null) === "RETIRADO",
        fechaRetiro: (c.fecha_retiro as string | null) ?? null,
      });
    }
  }
  return out;
}

/**
 * Registros de un rango, paginados: PostgREST recorta cada respuesta a 1.000
 * filas, y una ventana de 90 días ya pasa de mil. Con `limit` a secas las
 * ausencias más viejas del rango se perdían en silencio.
 */
async function leerRegistrosRango<T>(desde: string, hasta: string, select: string): Promise<T[]> {
  const supabase = createAdminClient();
  const PAGINA = 1000;
  const out: T[] = [];
  for (let inicio = 0; inicio < HISTORIAL_LIMITE; inicio += PAGINA) {
    const { data, error } = await supabase
      .from("ausentismo_registros")
      .select(select)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("id", { ascending: true })
      .range(inicio, Math.min(inicio + PAGINA, HISTORIAL_LIMITE) - 1);
    if (error) throw error;
    const filas = (data ?? []) as unknown as T[];
    out.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return out;
}

/**
 * Reincidentes calculados del propio registro (reemplaza la hoja
 * "reincidentes" del Excel): conductores con `minimo` o más ausencias en la
 * ventana (el mes en curso o los últimos N días), o con soportes
 * pendientes. Qué cuenta
 * como reincidencia lo dice el catálogo (`cuenta_reincidencia`); vacaciones y
 * descanso vienen marcados como programados.
 *
 * Con `categoria`, el mínimo se aplica solo a ese concepto (citas EPS,
 * incapacidades o no justificadas). En cualquier caso entran siempre, sin
 * importar el mínimo, quien lleve `DIAS_DESCARGOS` o más días seguidos sin
 * justificar (aunque sus días estén anotados en un solo registro con rango) y
 * quien tenga dos o más faltas no justificadas: si su nivel es crítica o
 * superior, no puede quedarse fuera de la lista.
 *
 * Cada reincidente lleva su nivel de alerta (terminación, descargos, crítica,
 * alta), sus conteos por categoría y el detalle de sus ausencias.
 *
 * Los conductores RETIRADOS en el maestro se descartan salvo que se pidan
 * con `incluirRetirados`: a quien ya no trabaja aquí no se le hace
 * seguimiento de ausentismo ni se le cita a descargos.
 */
export async function getReincidentes(
  hasta: string,
  conceptos: Concepto[],
  opts: {
    ventana?: string | number;
    minimo?: number;
    categoria?: CategoriaReincidencia | string;
    incluirRetirados?: boolean;
  } = {}
): Promise<Reincidente[]> {
  const minimo = opts.minimo ?? REINCIDENCIA_MINIMO;
  const categoria = opts.categoria ?? "";
  const { desde } = rangoVentana(hasta, opts.ventana ?? VENTANA_DEFECTO);

  const NO_CUENTAN = new Set(
    conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.key)
  );
  type Fila = Omit<AusenciaReincidente, "placa" | "cuenta" | "noJustificada"> & {
    cedula: string; codigo: string | null; nombre: string; telefono: string | null;
    vehiculos?: { placa: string | null } | null;
  };
  const registros = await leerRegistrosRango<Fila>(
    desde,
    hasta,
    "id, cedula, codigo, nombre, telefono, fecha, tipo, soporte, justificacion, " +
    "codigo_vehiculo, fecha_inicio, fecha_fin, incapacidad_inicio, incapacidad_fin, vehiculos(placa)"
  );
  const porConductor = new Map<string, Reincidente>();
  const diasNoJustificados = new Map<string, Set<string>>();
  for (const r of registros) {
    let acc = porConductor.get(r.cedula);
    if (!acc) {
      porConductor.set(
        r.cedula,
        (acc = {
          cedula: r.cedula,
          codigo: r.codigo,
          nombre: r.nombre,
          telefono: r.telefono,
          retirado: false,
          fechaRetiro: null,
          total: 0,
          noJustificadas: 0,
          soportesPendientes: 0,
          eps: 0,
          incapacidades: 0,
          diasIncapacidad: 0,
          racha: { dias: 0, desde: null, hasta: null },
          notificaciones: { descargos: null, terminacion: null },
          pendientes: [],
          tipos: {},
          ultimaFecha: r.fecha,
          alerta: null,
          ausencias: [],
        })
      );
      diasNoJustificados.set(r.cedula, new Set());
    }
    const cuenta = !NO_CUENTAN.has(r.tipo);
    const noJustificada = r.tipo === CONCEPTO_NO_JUSTIFICADA;
    if (cuenta) {
      acc.total += 1;
      acc.tipos[r.tipo] = (acc.tipos[r.tipo] ?? 0) + 1;
    }
    if (noJustificada) {
      acc.noJustificadas += 1;
      const set = diasNoJustificados.get(r.cedula)!;
      for (const d of diasCubiertos(r, desde, hasta)) set.add(d);
    }
    if (r.tipo === CONCEPTO_EPS) acc.eps += 1;
    if (r.tipo === CONCEPTO_INCAPACIDAD) {
      acc.incapacidades += 1;
      // Días de la incapacidad médica; si no se anotó, los del rango del reporte.
      const ini = r.incapacidad_inicio ?? r.fecha_inicio ?? r.fecha;
      const fin = r.incapacidad_fin ?? r.fecha_fin ?? ini;
      if (fin >= ini) acc.diasIncapacidad += diasEntre(ini, fin) + 1;
    }
    if (r.soporte === "pendiente") acc.soportesPendientes += 1;
    if (r.fecha > acc.ultimaFecha) acc.ultimaFecha = r.fecha;
    if (r.codigo && !acc.codigo) acc.codigo = r.codigo;
    if (r.telefono && !acc.telefono) acc.telefono = r.telefono;
    acc.ausencias.push({
      id: r.id, fecha: r.fecha, tipo: r.tipo, soporte: r.soporte, justificacion: r.justificacion,
      codigo_vehiculo: r.codigo_vehiculo, placa: r.vehiculos?.placa ?? null,
      fecha_inicio: r.fecha_inicio, fecha_fin: r.fecha_fin,
      incapacidad_inicio: r.incapacidad_inicio, incapacidad_fin: r.incapacidad_fin,
      cuenta, noJustificada,
    });
  }

  const conteoCategoria = (c: Reincidente) =>
    categoria === CONCEPTO_EPS ? c.eps
    : categoria === CONCEPTO_INCAPACIDAD ? c.incapacidades
    : categoria === CONCEPTO_NO_JUSTIFICADA ? c.noJustificadas
    : c.total;
  const entra = (c: Reincidente) =>
    c.racha.dias >= DIAS_DESCARGOS ||
    c.noJustificadas >= 2 ||
    (categoria ? conteoCategoria(c) >= minimo : c.total >= minimo || c.soportesPendientes > 0);

  const candidatos = [...porConductor.values()]
    .map((c) => {
      const racha = rachaMasReciente(diasNoJustificados.get(c.cedula) ?? []);
      return { ...c, racha, alerta: nivelAlertaReincidente({ ...c, rachaNoJustificada: racha.dias }) };
    })
    .filter(entra);

  // Situación en el maestro: el retirado queda marcado y, por defecto, fuera.
  const situacion = await getSituacionConductores(candidatos.map((c) => c.cedula));
  const lista = candidatos
    .map((c) => {
      const s = situacion.get(c.cedula);
      return { ...c, retirado: s?.retirado ?? false, fechaRetiro: s?.fechaRetiro ?? null };
    })
    .filter((c) => opts.incluirRetirados || !c.retirado);

  // Marcas de "ya notificado" de quienes llegaron a los días de descargos:
  // se emparejan con la racha actual por solapamiento de fechas.
  const conRacha = lista.filter((c) => c.racha.dias >= DIAS_DESCARGOS);
  if (conRacha.length > 0) {
    const notifs = await getNotificacionesVigentes(conRacha.map((c) => c.cedula), desde);
    for (const c of conRacha) {
      for (const n of notifs) {
        if (n.cedula !== c.cedula || !c.racha.desde || !c.racha.hasta) continue;
        if (n.racha_desde <= c.racha.hasta && n.racha_hasta >= c.racha.desde) c.notificaciones[n.nivel] = n;
      }
      c.pendientes = nivelesRequeridos(c.racha.dias).filter((n) => !c.notificaciones[n]);
    }
  }

  return lista.sort((a, b) =>
    (a.alerta ? ORDEN_NIVEL[a.alerta] : 9) - (b.alerta ? ORDEN_NIVEL[b.alerta] : 9) ||
    // Dentro del nivel, primero lo que falta por notificar.
    b.pendientes.length - a.pendientes.length ||
    b.racha.dias - a.racha.dias ||
    conteoCategoria(b) - conteoCategoria(a) ||
    b.noJustificadas - a.noJustificadas ||
    b.total - a.total ||
    b.soportesPendientes - a.soportesPendientes
  );
}

/** Un mes del reporte histórico, por conductor. */
export interface MesReincidencia {
  mes: string;
  total: number;
  noJustificadas: number;
}

/** Una fila del reporte histórico: el acumulado del rango y su detalle por mes. */
export interface FilaHistorico {
  cedula: string;
  codigo: string | null;
  nombre: string;
  telefono: string | null;
  retirado: boolean;
  fechaRetiro: string | null;
  total: number;
  noJustificadas: number;
  eps: number;
  incapacidades: number;
  diasIncapacidad: number;
  soportesPendientes: number;
  /** Cuántos meses distintos del rango tienen al menos una ausencia que cuenta. */
  mesesConAusencia: number;
  /** Mes con más ausencias del rango (el más reciente en caso de empate). */
  mesPico: string | null;
  primeraFecha: string;
  ultimaFecha: string;
  tipos: Record<string, number>;
  /** Conteos por mes "YYYY-MM"; los meses sin ausencia no están. */
  porMes: Record<string, MesReincidencia>;
}

export interface HistoricoReincidencias {
  desde: string;
  hasta: string;
  minimo: number;
  incluirRetirados: boolean;
  /** Meses del rango, en orden: son las columnas del reporte. */
  meses: string[];
  filas: FilaHistorico[];
  /** Registros leídos y conductores distintos antes de aplicar el mínimo. */
  registros: number;
  conductores: number;
  /** Retirados que quedaron fuera por no pedirlos. */
  retiradosOcultos: number;
  /** El rango llegó al tope de lectura: hay que acotarlo. */
  truncado: boolean;
}

/**
 * Reincidencias históricas: el mismo cálculo de la pestaña pero sobre un
 * rango largo (por defecto el año en curso) y con el detalle abierto mes a
 * mes, para ver quién repite mes tras mes y no solo quién está en alerta hoy.
 *
 * Entran los conductores con `minimo` o más ausencias que cuentan como
 * reincidencia en todo el rango. No lleva racha ni nivel de alerta: esos
 * miran el presente y aquí se mira la historia. Ordena por meses con
 * ausencia (el reincidente crónico primero), luego por total.
 */
export async function getHistoricoReincidencias(opts: {
  desde: string;
  hasta: string;
  conceptos: Concepto[];
  minimo?: number;
  incluirRetirados?: boolean;
}): Promise<HistoricoReincidencias> {
  const { desde, hasta, conceptos } = opts;
  const minimo = opts.minimo ?? 2;
  const incluirRetirados = opts.incluirRetirados ?? false;
  const NO_CUENTAN = new Set(conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.key));

  type Fila = {
    cedula: string; codigo: string | null; nombre: string; telefono: string | null;
    fecha: string; tipo: string; soporte: string;
    fecha_inicio: string | null; fecha_fin: string | null;
    incapacidad_inicio: string | null; incapacidad_fin: string | null;
  };
  const registros = await leerRegistrosRango<Fila>(
    desde,
    hasta,
    "cedula, codigo, nombre, telefono, fecha, tipo, soporte, " +
    "fecha_inicio, fecha_fin, incapacidad_inicio, incapacidad_fin"
  );

  const porConductor = new Map<string, FilaHistorico>();
  for (const r of registros) {
    let acc = porConductor.get(r.cedula);
    if (!acc) {
      porConductor.set(r.cedula, (acc = {
        cedula: r.cedula, codigo: r.codigo, nombre: r.nombre, telefono: r.telefono,
        retirado: false, fechaRetiro: null,
        total: 0, noJustificadas: 0, eps: 0, incapacidades: 0, diasIncapacidad: 0,
        soportesPendientes: 0, mesesConAusencia: 0, mesPico: null,
        primeraFecha: r.fecha, ultimaFecha: r.fecha, tipos: {}, porMes: {},
      }));
    }
    if (r.codigo && !acc.codigo) acc.codigo = r.codigo;
    if (r.telefono && !acc.telefono) acc.telefono = r.telefono;
    if (r.fecha < acc.primeraFecha) acc.primeraFecha = r.fecha;
    if (r.fecha > acc.ultimaFecha) acc.ultimaFecha = r.fecha;
    const noJustificada = r.tipo === CONCEPTO_NO_JUSTIFICADA;
    if (!NO_CUENTAN.has(r.tipo)) {
      acc.total += 1;
      acc.tipos[r.tipo] = (acc.tipos[r.tipo] ?? 0) + 1;
      const mes = mesDe(r.fecha);
      const m = (acc.porMes[mes] ??= { mes, total: 0, noJustificadas: 0 });
      m.total += 1;
      if (noJustificada) m.noJustificadas += 1;
    }
    if (noJustificada) acc.noJustificadas += 1;
    if (r.tipo === CONCEPTO_EPS) acc.eps += 1;
    if (r.tipo === CONCEPTO_INCAPACIDAD) {
      acc.incapacidades += 1;
      const ini = r.incapacidad_inicio ?? r.fecha_inicio ?? r.fecha;
      const fin = r.incapacidad_fin ?? r.fecha_fin ?? ini;
      if (fin >= ini) acc.diasIncapacidad += diasEntre(ini, fin) + 1;
    }
    if (r.soporte === "pendiente") acc.soportesPendientes += 1;
  }

  const candidatos = [...porConductor.values()].filter((c) => c.total >= minimo);
  const situacion = await getSituacionConductores(candidatos.map((c) => c.cedula));
  const conSituacion = candidatos.map((c) => {
    const s = situacion.get(c.cedula);
    const meses = Object.values(c.porMes);
    // Empate de pico: se queda el mes más reciente, que es el que preocupa.
    const pico = meses.reduce<MesReincidencia | null>(
      (mejor, m) => (!mejor || m.total > mejor.total || (m.total === mejor.total && m.mes > mejor.mes) ? m : mejor),
      null
    );
    return {
      ...c,
      retirado: s?.retirado ?? false,
      fechaRetiro: s?.fechaRetiro ?? null,
      mesesConAusencia: meses.length,
      mesPico: pico?.mes ?? null,
    };
  });
  const retiradosOcultos = conSituacion.filter((c) => c.retirado).length;
  const filas = conSituacion
    .filter((c) => incluirRetirados || !c.retirado)
    .sort((a, b) =>
      b.mesesConAusencia - a.mesesConAusencia ||
      b.total - a.total ||
      b.noJustificadas - a.noJustificadas ||
      a.nombre.localeCompare(b.nombre, "es")
    );

  return {
    desde,
    hasta,
    minimo,
    incluirRetirados,
    meses: mesesEntre(desde, hasta),
    filas,
    registros: registros.length,
    conductores: porConductor.size,
    retiradosOcultos: incluirRetirados ? 0 : retiradosOcultos,
    truncado: registros.length >= HISTORIAL_LIMITE,
  };
}

/**
 * Marcas de notificación vigentes (no anuladas) de un grupo de conductores
 * cuya racha termina dentro de la ventana.
 */
export async function getNotificacionesVigentes(cedulas: string[], desde: string): Promise<Notificacion[]> {
  if (cedulas.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ausentismo_notificaciones")
    .select("id, cedula, nivel, racha_desde, racha_hasta, dias, notificado_en, observaciones, created_by_email, created_at")
    .in("cedula", cedulas)
    .is("anulada_en", null)
    .gte("racha_hasta", desde)
    .order("created_at", { ascending: false });
  if (error) {
    // La migración se aplica a mano: si la tabla aún no existe, la alerta
    // sigue funcionando sin marcas en vez de tumbar toda la pestaña.
    console.error(
      "[ausentismo] no se pudieron leer las notificaciones (¿falta aplicar la migración " +
      "20260904173119_ausentismo_notificaciones_de_descargos_y_terminacion?):",
      error.message
    );
    return [];
  }
  return (data ?? []) as Notificacion[];
}
