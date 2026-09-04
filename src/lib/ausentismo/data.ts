import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONCEPTO_EPS,
  CONCEPTO_INCAPACIDAD,
  CONCEPTO_NO_JUSTIFICADA,
  DIAS_DESCARGOS,
  HISTORIAL_LIMITE,
  ORDEN_NIVEL,
  REINCIDENCIA_DIAS,
  REINCIDENCIA_MINIMO,
  diasEntre,
  nivelAlertaReincidente,
  nivelesRequeridos,
  rachaMasReciente,
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
    .select("key, nombre, orden, activo, cuenta_reincidencia, exige_soporte")
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

/** Registros de un día (pantalla principal, como una página del Excel). */
export async function getRegistrosDia(fecha: string): Promise<AusentismoRegistro[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ausentismo_registros")
    .select(SELECT_REGISTRO)
    .eq("fecha", fecha)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AusentismoRegistro[];
}

/** Historial por rango, con filtros opcionales de tipo y búsqueda. */
export async function getHistorial(filtros: {
  desde: string;
  hasta: string;
  tipo?: string | null;
  q?: string | null;
}): Promise<AusentismoRegistro[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("ausentismo_registros")
    .select(SELECT_REGISTRO)
    .gte("fecha", filtros.desde)
    .lte("fecha", filtros.hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(HISTORIAL_LIMITE);
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
  return (data ?? []) as AusentismoRegistro[];
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

/**
 * Reincidentes calculados del propio registro (reemplaza la hoja
 * "reincidentes" del Excel): conductores con `minimo` o más ausencias en los
 * `ventana` días anteriores al corte, o con soportes pendientes. Qué cuenta
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
 */
export async function getReincidentes(
  hasta: string,
  conceptos: Concepto[],
  opts: { ventana?: number; minimo?: number; categoria?: CategoriaReincidencia | string } = {}
): Promise<Reincidente[]> {
  const ventana = opts.ventana ?? REINCIDENCIA_DIAS;
  const minimo = opts.minimo ?? REINCIDENCIA_MINIMO;
  const categoria = opts.categoria ?? "";
  const supabase = createAdminClient();
  const desde = sumarDias(hasta, -(ventana - 1));

  const { data, error } = await supabase
    .from("ausentismo_registros")
    .select(
      "id, cedula, codigo, nombre, telefono, fecha, tipo, soporte, justificacion, " +
      "codigo_vehiculo, fecha_inicio, fecha_fin, incapacidad_inicio, incapacidad_fin, vehiculos(placa)"
    )
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .limit(5000);
  if (error) throw error;

  const NO_CUENTAN = new Set(
    conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.key)
  );
  type Fila = Omit<AusenciaReincidente, "placa" | "cuenta" | "noJustificada"> & {
    cedula: string; codigo: string | null; nombre: string; telefono: string | null;
    vehiculos?: { placa: string | null } | null;
  };
  const porConductor = new Map<string, Reincidente>();
  const diasNoJustificados = new Map<string, Set<string>>();
  for (const r of (data ?? []) as unknown as Fila[]) {
    let acc = porConductor.get(r.cedula);
    if (!acc) {
      porConductor.set(
        r.cedula,
        (acc = {
          cedula: r.cedula,
          codigo: r.codigo,
          nombre: r.nombre,
          telefono: r.telefono,
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

  const lista = [...porConductor.values()]
    .map((c) => {
      const racha = rachaMasReciente(diasNoJustificados.get(c.cedula) ?? []);
      return { ...c, racha, alerta: nivelAlertaReincidente({ ...c, rachaNoJustificada: racha.dias }) };
    })
    .filter(entra);

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
