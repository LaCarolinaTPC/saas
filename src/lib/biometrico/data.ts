/**
 * Lecturas de la pantalla de Marcaciones. Aquí se juntan las fuentes
 * (esperados, despacho de GEMA, novedades de ausentismo y, como información,
 * las marcaciones del biométrico) y se le pasan ya resueltas a `resumenDelDia`,
 * que es la parte pura y probada.
 *
 * La presencia la decide el despacho (`despacho.ts`); la huella hoy no decide.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getConceptos, getRegistrosDia } from "@/lib/ausentismo/data";
import type { AusentismoRegistro, Concepto } from "@/lib/ausentismo/constants";
import { CONCEPTO_PENDIENTE } from "./auto-pendientes";
import { diasEntreIso, resumenDelDia, type MarcacionDia, type ResumenDia } from "./dia";
import { DIAS_HISTORICO, esperadosDelDia, type EsperadosDelDia } from "./esperados";
import { refrescarDespachoDelDia, type RefrescoDespacho } from "@/lib/gema/despacho-al-dia";
import {
  asegurarPendientes,
  estadoPendientes,
  limpiarPendientesAutoHuerfanos,
  type ResultadoPendientes,
} from "./pendientes-auto";
import { leerEstadoTarea } from "@/lib/tareas/estado";

/** Id de la tarea programada que escribe los pendientes (`src/lib/tareas`). */
const TAREA_PENDIENTES = "ausentismo.pendientes";

/** Lotes para los `in (...)` sobre cédulas; el mismo tamaño que usa ausentismo. */
const LOTE_CEDULAS = 400;

export interface EstadoAgente {
  ultimoEnvioAt: string | null;
  /** Hasta dónde llegó la vía Access (`acc_monitor_log.id`). */
  ultimoId: number | null;
  /** Última huella guardada, de cualquiera de las dos vías. */
  ultimaMarcacionAt: string | null;
  /**
   * Última huella que llegó EN VIVO desde un lector (`origen = 'equipo'`).
   * Si está muy atrás pero `ultimaMarcacionAt` está al día, la lectura directa
   * del equipo no está funcionando y lo que se ve viene de una descarga manual.
   */
  ultimaEquipoAt: string | null;
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
      .select("cedula, pin, momento, origen, id_zk")
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
        origen: m.origen === "equipo" ? "equipo" : "access",
        enAccess: m.id_zk !== null && m.id_zk !== undefined,
      });
    }
    if (lote.length < paso) break;
  }
  // El biométrico conserva el histórico completo, incluso el de personas
  // retiradas. No se borra: es evidencia del lector. Pero un retirado no puede
  // quedar en la bandeja operativa del día como «no esperado».
  const cedulas = [...new Set(salida.map((m) => m.cedula).filter((c): c is string => !!c))];
  if (!cedulas.length) return salida;

  // Hay tanto conductores como personal administrativo en el equipo. Puede
  // haber más de una ficha por cédula (p. ej. reingreso); solo se excluye si
  // TODAS las fichas encontradas dicen retirado.
  const estados = new Map<string, string[]>();
  const agregarEstado = (cedula: string | null, estado: string | null) => {
    if (!cedula || !estado) return;
    const lista = estados.get(String(cedula));
    if (lista) lista.push(estado.trim().toLowerCase());
    else estados.set(String(cedula), [estado.trim().toLowerCase()]);
  };
  for (let i = 0; i < cedulas.length; i += LOTE_CEDULAS) {
    const lote = cedulas.slice(i, i + LOTE_CEDULAS);
    const [conductores, empleados] = await Promise.all([
      db.from("conductores").select("cedula, estado").in("cedula", lote),
      db.from("employees").select("document_number, status").in("document_number", lote),
    ]);
    if (conductores.error) throw new Error(`situacion de marcaciones: ${conductores.error.message}`);
    if (empleados.error) throw new Error(`situacion de empleados: ${empleados.error.message}`);
    for (const c of conductores.data ?? []) agregarEstado(c.cedula, c.estado);
    for (const e of empleados.data ?? []) agregarEstado(e.document_number, e.status);
  }
  const retiradas = new Set(
    [...estados].filter(([, lista]) => lista.length > 0 && lista.every((e) => e === "retirado")).map(([cedula]) => cedula)
  );
  return retiradas.size ? salida.filter((m) => !m.cedula || !retiradas.has(m.cedula)) : salida;
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
  const [envio, marcacion, conteo, ultima, ultimaEquipo] = await Promise.all([
    db
      .from("biometrico_envios")
      .select("recibido_at, error")
      .order("recibido_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // El id_zk solo existe en la vía Access, y en DESC los NULL van primero:
    // sin el filtro saldría una fila del equipo y el «último id» sería null.
    db
      .from("biometrico_marcaciones")
      .select("id_zk")
      .not("id_zk", "is", null)
      .order("id_zk", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("biometrico_marcaciones")
      .select("id", { count: "exact", head: true })
      .eq("fecha", fecha),
    // La última huella es de cualquiera de las dos vías: por momento, no por id.
    db
      .from("biometrico_marcaciones")
      .select("momento, origen")
      .order("momento", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Y la última que llegó en vivo desde un lector, para la caja de estado.
    db
      .from("biometrico_marcaciones")
      .select("momento")
      .eq("origen", "equipo")
      .order("momento", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (marcacion.error) throw new Error(`estado del agente: ${marcacion.error.message}`);

  const ultimoEnvioAt = (envio.data?.recibido_at as string) ?? null;
  const atrasoMin = ultimoEnvioAt
    ? Math.max(0, Math.round((Date.now() - new Date(ultimoEnvioAt).getTime()) / 60_000))
    : null;

  return {
    ultimoEnvioAt,
    ultimoId: marcacion.data ? Number(marcacion.data.id_zk) : null,
    ultimaMarcacionAt: (ultima.data?.momento as string) ?? null,
    ultimaEquipoAt: (ultimaEquipo.data?.momento as string) ?? null,
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
  /**
   * Qué hizo —o por qué no hizo— la creación automática de pendientes, y la
   * hora configurada. La pantalla la muestra y permite cambiarla.
   */
  pendientes: ResultadoPendientes;
  /**
   * Los registros «pendiente por clasificar» del día, por cédula. Esa gente
   * **sigue en la lista** aunque ya tenga registro: el botón de la fila abre el
   * formulario sobre este registro para clasificarlo, y desaparece de la lista
   * cuando el concepto deja de ser «pendiente».
   */
  porClasificar: Record<string, AusentismoRegistro>;
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
 * Un «pendiente por clasificar» NO resuelve el día: nadie ha decidido qué fue.
 * Se mira el tipo y no el origen, así que si alguien crea uno a mano también
 * sigue a la vista hasta que lo clasifique.
 */
function esPendiente(r: AusentismoRegistro): boolean {
  return r.tipo === CONCEPTO_PENDIENTE;
}

/** Cédulas con una novedad ya decidida, que son las que salen de la lista. */
function resueltasDe(registros: AusentismoRegistro[]): Set<string> {
  const out = new Set<string>();
  for (const r of registros) if (!esPendiente(r)) out.add(String(r.cedula));
  return out;
}

/** Los pendientes del día por cédula; si hubiera dos, manda el más reciente. */
function pendientesPorCedula(
  registros: AusentismoRegistro[]
): Record<string, AusentismoRegistro> {
  const out: Record<string, AusentismoRegistro> = {};
  for (const r of registros) if (esPendiente(r)) out[String(r.cedula)] = r;
  return out;
}

/** Cifras del día para la pantalla informativa del TV. */
export interface ConteosDelDia {
  esperados: number;
  trabajaron: number;
  porSalir: number;
  sinDespacho: number;
  conNovedad: number;
  marcaron: number;
  despachoSincronizadoHasta: string | null;
  /** De los que ya salieron a rodar, cuántos pasaron la huella. */
  trabajaronConHuella: number;
}

/**
 * Lo mismo que cuenta la pantalla de Marcaciones, pero SOLO LECTURA y solo
 * cifras: la usa el televisor de la pantalla informativa, que consulta cada
 * pocos minutos sin que nadie lo mire.
 *
 * A diferencia de `getDatosMarcaciones`, no crea ni limpia pendientes
 * automáticos: eso es una decisión de la pantalla de Ausentismo y no debe
 * dispararla un TV. Sí refresca el despacho del día (con su propia guarda de
 * 15 minutos), porque sin él las cifras de hoy estarían vacías.
 */
export async function getConteosMarcaciones(
  fecha: string,
  conceptos: Concepto[],
  hoy: string
): Promise<ConteosDelDia> {
  await refrescarDespachoDelDia(fecha, hoy);
  const [marco, marcaciones, registros] = await Promise.all([
    esperadosDelDia(fecha),
    getMarcacionesDia(fecha),
    getRegistrosDia(fecha, conceptos),
  ]);
  const resumen = resumenDelDia({
    esperados: marco.esperados,
    trabajaron: marco.trabajaron,
    porSalir: marco.porSalir,
    novedades: resueltasDe(registros),
    marcaciones,
  });
  return {
    esperados: marco.esperados.size,
    trabajaron: resumen.trabajaron.length,
    porSalir: resumen.porSalir.length,
    sinDespacho: resumen.sinDespacho.length,
    conNovedad: resumen.conNovedad.length,
    marcaron: resumen.marcaron.length,
    despachoSincronizadoHasta: marco.despachoSincronizadoHasta,
    trabajaronConHuella: resumen.trabajaron.filter((f) => f.marco).length,
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

  const [marco, marcaciones, registrosLeidos, agente] = await Promise.all([
    esperadosDelDia(fecha),
    getMarcacionesDia(fecha),
    getRegistrosDia(fecha, conceptos),
    getEstadoAgente(fecha),
  ]);

  // Retira los pendientes AUTOMÁTICOS sin clasificar que ya no deberían estar:
  // los de quien salió de la plantilla (retiro con desfase de GEMA) y los de
  // quien SÍ rodó —su despacho llegó después de la hora de corte—. Ver
  // pendientes-auto.ts; nunca lanza.
  //
  // Corre DESPUÉS de leer y no antes, como estaba, porque ahora necesita saber
  // quién rodó, y eso ya viene en `marco` sin costar una consulta. Lo que se
  // paga es releer los registros en las pasadas que sí borran algo, que son
  // rarísimas; antes se pagaba una limpieza en todas.
  const limpieza = await limpiarPendientesAutoHuerfanos({
    fecha,
    rodaron: new Set(marco.trabajaron.keys()),
  });
  const registros =
    limpieza.eliminados > 0 ? await getRegistrosDia(fecha, conceptos) : registrosLeidos;

  // DOS conjuntos, y la diferencia es el punto de todo esto:
  //
  //  · `novedades` son TODAS las cédulas con registro ese día. Es la guarda de
  //    la creación automática: si alguien ya tiene algo anotado, Gestivo no
  //    toca nada.
  //  · `resueltas` son las que ya tienen una novedad DE VERDAD. Un «pendiente
  //    por clasificar» no lo es: nadie ha decidido nada todavía, así que esa
  //    persona **sigue saliendo en la lista** hasta que alguien le cambie el
  //    concepto en Ausentismo. Si saliera de la lista al crearse el registro,
  //    la automatización habría escondido justo lo que hay que resolver.
  const novedades = new Set(registros.map((r) => String(r.cedula)));
  const armar = (resueltas: Set<string>) =>
    resumenDelDia({
      esperados: marco.esperados,
      trabajaron: marco.trabajaron,
      porSalir: marco.porSalir,
      novedades: resueltas,
      marcaciones,
    });
  let resumen = armar(resueltasDe(registros));

  // Los pendientes los escribe la tarea programada (`src/lib/tareas`): el
  // latido de cualquier página abierta la corre UNA vez pasada la hora, y el
  // botón «Registrar ahora» a mano. Leer la pantalla ya no escribe nada.
  //
  // Sin la migración de `tareas_programadas` no hay latido que valga, así que
  // se vuelve a lo de antes: escribirlos al leer. Nunca lanza.
  let pendientes: ResultadoPendientes;
  try {
    pendientes = await estadoPendientes({ fecha, hoy, tarea: await leerEstadoTarea(TAREA_PENDIENTES) });
  } catch {
    pendientes = await asegurarPendientes({
      fecha,
      hoy,
      candidatos: candidatosAPendiente(resumen),
      yaRegistrados: novedades,
    });
  }
  // Los pendientes del día, por cédula: la pantalla los marca y abre el
  // formulario SOBRE el registro que ya existe, para clasificarlo.
  let porClasificar = pendientesPorCedula(registros);
  // Solo en la vuelta de respaldo, que sí escribe en esta lectura: lo que
  // escribió la tarea ya venía en `registros`.
  if (pendientes.cedulas.length > 0) {
    // Se releen los del día para tener las filas completas de lo que se acabó
    // de crear (`tipo_inicial` lo sella un trigger, y hace falta para editar).
    // Es una lectura de más en la única pasada del día que crea algo.
    const frescos = await getRegistrosDia(fecha, conceptos);
    for (const r of frescos) novedades.add(String(r.cedula));
    porClasificar = pendientesPorCedula(frescos);
    // El resumen NO cambia por esto: un pendiente no resuelve nada, así que
    // esa gente tiene que seguir en «sin despacho».
    resumen = armar(resueltasDe(frescos));
  }

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
    pendientes,
    porClasificar,
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

/**
 * SOLO quien no tiene ni viaje ni huella. Quien pasó la huella y no tiene
 * despacho VINO a trabajar —la pantalla lo dice: «no es una ausencia, es que no
 * le dieron bus»— y son hasta la mitad de la lista. Registrarlos
 * automáticamente sería anotar como novedad a gente que sí se presentó.
 */
function candidatosAPendiente(resumen: ResumenDia) {
  return resumen.sinDespacho
    .filter((f) => !f.marco)
    .map((f) => ({ cedula: f.cedula, codigo: f.codigo, nombre: f.nombre }));
}

export interface ResultadoRegistroPendientes {
  creados: number;
  eliminados: number;
  motivo: ResultadoPendientes["motivo"];
  detalle: string | null;
  error: string | null;
}

/**
 * La tarea programada «ausentismo.pendientes»: arma el día como la pantalla de
 * Marcaciones (despacho al día, esperados, huellas, registros), retira los
 * pendientes automáticos que sobran y escribe los que faltan. La corre el
 * latido pasada la hora, o el botón «Registrar ahora» (`manual`), que no
 * espera la hora.
 */
export async function registrarPendientesDelDia(
  hoy: string,
  opciones: { manual?: boolean } = {}
): Promise<ResultadoRegistroPendientes> {
  await refrescarDespachoDelDia(hoy, hoy, { forzar: !!opciones.manual });
  const conceptos = await getConceptos();
  const [marco, marcaciones, leidos] = await Promise.all([
    esperadosDelDia(hoy),
    getMarcacionesDia(hoy),
    getRegistrosDia(hoy, conceptos),
  ]);
  const limpieza = await limpiarPendientesAutoHuerfanos({
    fecha: hoy,
    rodaron: new Set(marco.trabajaron.keys()),
  });
  const registros = limpieza.eliminados > 0 ? await getRegistrosDia(hoy, conceptos) : leidos;
  const resumen = resumenDelDia({
    esperados: marco.esperados,
    trabajaron: marco.trabajaron,
    porSalir: marco.porSalir,
    novedades: resueltasDe(registros),
    marcaciones,
  });
  const r = await asegurarPendientes({
    fecha: hoy,
    hoy,
    candidatos: candidatosAPendiente(resumen),
    yaRegistrados: new Set(registros.map((x) => String(x.cedula))),
    manual: opciones.manual,
  });
  return {
    creados: r.creados,
    eliminados: limpieza.eliminados,
    motivo: r.motivo,
    detalle: r.detalle,
    error: r.error ?? limpieza.error,
  };
}
