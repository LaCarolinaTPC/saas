/**
 * Gestivo deja escritos, a una hora configurable, los registros de quien no
 * tiene despacho — para que nadie tenga que pulsar «Registrar novedad» uno por
 * uno.
 *
 * Esta es la parte que toca la base. Las reglas de **cuándo y a quién** son
 * puras y viven en `auto-pendientes.ts`, con sus pruebas; aquí solo se leen los
 * ajustes, se insertan las filas y se cuenta lo que pasó.
 *
 * Entran con tipo `pendiente` y `origen = 'automatico'`, y **no cuentan para
 * nada** hasta que una persona los clasifique: ni reincidencia, ni la racha de
 * días que dispara descargos y terminación. El porqué está en el comentario de
 * `auto-pendientes.ts` y en la migración
 * `20261021030119_registros_de_ausentismo_creados_por_gestivo_…`.
 *
 * Se llama desde la lectura de la pantalla de Marcaciones, igual que el
 * refresco del despacho: en el plan Hobby de Vercel un cron corre una sola vez
 * al día y aquí hace falta a la hora configurada. Y **nunca
 * lanza**: si algo falla, la pantalla se tiene que seguir viendo.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingValue } from "@/lib/settings";
import {
  CLAVE_ACTIVO,
  CLAVE_HORA,
  CONCEPTO_PENDIENTE,
  HORA_POR_OMISION,
  ORIGEN_AUTOMATICO,
  decidir,
  explicarPendientes,
  horaEfectiva,
  minutosAhoraBogota,
  pendientesAAnular,
  pendientesAAnularPorDespacho,
  type Candidato,
  type MotivoNoCorre,
} from "./auto-pendientes";
import { salioARodar } from "./despacho";
import { type FilaConductor } from "./plantilla";
import type { EstadoTarea } from "@/lib/tareas/estado";

export interface ResultadoPendientes {
  /** La hora configurada, para poder mostrarla y editarla. */
  hora: string;
  activo: boolean;
  /** Cuántos registros dejó Gestivo en esta pasada. 0 es lo normal. */
  creados: number;
  /** Las cédulas creadas: la pantalla las necesita para recalcular sin releer. */
  cedulas: string[];
  /** Por qué no corrió, si no corrió. Se muestra como explicación. */
  motivo: MotivoNoCorre | null;
  detalle: string | null;
  /** Si falló, el porqué. No interrumpe la pantalla. */
  error: string | null;
  /**
   * La última vez que corrió la tarea programada (`tareas_programadas`), para
   * decir en la pantalla cuándo y quién. null si nunca o sin la migración.
   */
  ultimaEjecucion?: {
    cuando: string;
    origen: "automatico" | "manual" | null;
    usuario: string | null;
    creados: number;
    /** Si fue hoy: si no, la de hoy todavía no ha corrido. */
    hoy: boolean;
  } | null;
}

/** Cómo queda firmado un registro que escribió Gestivo y no una persona. */
export const FIRMA_AUTOMATICA = "gestivo (automático)";

/**
 * Asegura los pendientes del día. Idempotente: el índice único parcial
 * `ausentismo_registros_auto_dia_cedula_uq` impide que dos pestañas abiertas a
 * la vez creen el mismo registro dos veces, así que no hace falta candado.
 */
export async function asegurarPendientes(entrada: {
  fecha: string;
  hoy: string;
  candidatos: Candidato[];
  /** Cédulas que ya tienen registro ese día, de cualquier tipo. */
  yaRegistrados: Iterable<string>;
  /**
   * Botón «Registrar ahora»: corre sin esperar la hora y aunque esté apagado
   * el registro automático. Sigue sin correr en domingo, festivo ni día pasado.
   */
  manual?: boolean;
}): Promise<ResultadoPendientes> {
  const [guardadaHora, guardadoActivo] = await Promise.all([
    getSettingValue(CLAVE_HORA),
    getSettingValue(CLAVE_ACTIVO),
  ]);
  const hora = horaEfectiva(guardadaHora);
  // Por omisión ENCENDIDO: es lo que se pidió. Solo "no" lo apaga.
  const activo = (guardadoActivo ?? "si").trim().toLowerCase() !== "no";

  const base: ResultadoPendientes = {
    hora,
    activo,
    creados: 0,
    cedulas: [],
    motivo: null,
    detalle: null,
    error: null,
  };

  const decision = decidir({
    fecha: entrada.fecha,
    hoy: entrada.hoy,
    ahoraMinutos: entrada.manual ? 24 * 60 : minutosAhoraBogota(),
    activo: activo || !!entrada.manual,
    hora,
    candidatos: entrada.candidatos,
    yaRegistrados: entrada.yaRegistrados,
  });

  if (!decision.corre) {
    return { ...base, motivo: decision.motivo, detalle: decision.detalle };
  }
  if (decision.crear.length === 0) return base;

  try {
    const db = createAdminClient();

    // El teléfono se completa del maestro, como hace `crearRegistro`: el que
    // llama a un ausente lo necesita a mano.
    const telefonos = await leerTelefonos(db, decision.crear.map((c) => c.cedula));

    const filas = decision.crear.map((c) => ({
      fecha: entrada.fecha,
      cedula: c.cedula,
      codigo: c.codigo,
      nombre: c.nombre,
      telefono: c.telefono ?? telefonos[c.cedula] ?? null,
      tipo: CONCEPTO_PENDIENTE,
      soporte: "no_aplica",
      origen: ORIGEN_AUTOMATICO,
      // Sin `created_by`: no lo creó una persona. El correo lo dice en texto
      // para que la pantalla y la auditoría muestren algo legible.
      created_by_email: FIRMA_AUTOMATICA,
      justificacion: null,
    }));

    // INSERT pelado, no upsert: el índice que protege de los duplicados es
    // PARCIAL (`WHERE origen = 'automatico'`, para que una persona sí pueda
    // registrar algo el mismo día), y Postgres solo puede inferir un índice
    // parcial si el `ON CONFLICT` repite su condición — algo que PostgREST no
    // sabe mandar. Pedirle `onConflict: "fecha,cedula"` fallaría SIEMPRE con
    // 42P10 «no unique or exclusion constraint matching».
    //
    // Así que de los duplicados se encarga la base y aquí solo se interpreta:
    // la carrera real —dos pestañas abiertas al mismo segundo— deja la 23505,
    // que no es un fallo que haya que mostrar. Se aborta el lote entero y la
    // siguiente lectura de la pantalla crea lo que falte.
    const { data, error } = await db
      .from("ausentismo_registros")
      .insert(filas)
      .select("id, cedula");
    if (error) {
      if (error.code === "23505") return base;
      throw new Error(error.message);
    }

    const creadas = (data ?? []) as { id: string; cedula: string }[];
    await anotarBitacora(db, creadas, filas);
    return {
      ...base,
      creados: creadas.length,
      cedulas: creadas.map((f) => String(f.cedula)),
    };
  } catch (e) {
    // Que no se pueda escribir no puede dejar la pantalla en blanco: lo que se
    // pierde es la comodidad, y el botón de registrar a mano sigue estando.
    const error = e instanceof Error ? e.message : String(e);
    console.error("[biometrico] pendientes automáticos:", error);
    return { ...base, error };
  }
}

/**
 * Lo que la pantalla de Marcaciones dice de los pendientes, SIN escribir nada.
 *
 * Desde que los escribe la tarea programada (`src/lib/tareas`, el latido de
 * las páginas abiertas), leer la pantalla ya no crea registros: así corre una
 * sola vez por día y hora, y no cada vez que alguien abre Marcaciones. Aquí
 * solo se combina la configuración con la última ejecución de la tarea.
 */
export async function estadoPendientes(entrada: {
  fecha: string;
  hoy: string;
  tarea: EstadoTarea | null;
}): Promise<ResultadoPendientes> {
  const [guardadaHora, guardadoActivo] = await Promise.all([
    getSettingValue(CLAVE_HORA),
    getSettingValue(CLAVE_ACTIVO),
  ]);
  const hora = horaEfectiva(guardadaHora);
  const activo = (guardadoActivo ?? "si").trim().toLowerCase() !== "no";
  const t = entrada.tarea;
  const corridaHoy =
    !!t?.ultimaEjecucion &&
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(t.ultimaEjecucion)) ===
      entrada.hoy;
  const creados = Number(t?.ultimoResultado?.creados ?? 0) || 0;
  const ultimaEjecucion = t?.ultimaEjecucion
    ? { cuando: t.ultimaEjecucion, origen: t.ultimoOrigen, usuario: t.ultimoUsuario, creados, hoy: corridaHoy }
    : null;

  const decision = decidir({
    fecha: entrada.fecha,
    hoy: entrada.hoy,
    ahoraMinutos: minutosAhoraBogota(),
    activo,
    hora,
    candidatos: [],
    yaRegistrados: [],
  });
  return {
    hora,
    activo,
    creados: entrada.fecha === entrada.hoy && corridaHoy ? creados : 0,
    cedulas: [],
    motivo: decision.corre ? null : decision.motivo,
    detalle: decision.corre ? null : decision.detalle,
    // El error de la última pasada solo importa si fue hoy: la siguiente lo reintenta.
    error: entrada.fecha === entrada.hoy && corridaHoy ? (t?.ultimoError ?? null) : null,
    ultimaEjecucion,
  };
}

/**
 * Bitácora: en este módulo toda creación deja rastro («creado», con la fila y
 * quién la hizo), y lo que escribe Gestivo no es la excepción — al contrario,
 * es lo único que nadie decidió, así que conviene más que nunca que quede.
 *
 * Firma con `user_id = null` y el correo en texto: no hubo persona.
 * Nunca lanza: el registro ya está escrito y es lo que importa.
 */
async function anotarBitacora(
  db: ReturnType<typeof createAdminClient>,
  creadas: { id: string; cedula: string }[],
  filas: Record<string, unknown>[]
): Promise<void> {
  if (creadas.length === 0) return;
  try {
    const porCedula = new Map(filas.map((f) => [String(f.cedula), f]));
    await db.from("ausentismo_log").insert(
      creadas.map((r) => ({
        registro_id: r.id,
        accion: "creado",
        datos_anteriores: null,
        datos_nuevos: porCedula.get(String(r.cedula)) ?? null,
        user_id: null,
        user_email: FIRMA_AUTOMATICA,
      }))
    );
  } catch (e) {
    console.error("[biometrico] bitácora de pendientes automáticos:", e);
  }
}

export interface ResultadoLimpieza {
  /** Cuántos pendientes automáticos huérfanos se anularon en esta pasada. */
  eliminados: number;
  /** Las cédulas anuladas, para recalcular sin releer. */
  cedulas: string[];
  /** De esas, las que se anularon porque la persona sí rodó ese día. */
  porqueRodaron: string[];
  /** Si falló, el porqué. No interrumpe la pantalla. */
  error: string | null;
}

/**
 * Retira los pendientes automáticos SIN CLASIFICAR del día que ya no deberían
 * existir. Dos motivos, y los dos son el mismo problema: **Gestivo escribe con
 * lo que sabe en ese instante y nunca vuelve a mirar**, pero los datos de GEMA
 * llegan con desfase.
 *
 *  1. **Fuera de plantilla** — retirado, reubicado o solo informativo en el
 *     maestro. Un retiro puede llegar horas después, así que Gestivo alcanza a
 *     crear el pendiente cuando la ficha todavía decía `ACTIVO`. Al corregirse
 *     el maestro, `getRegistrosDia` deja de MOSTRARLO pero la fila queda
 *     huérfana en la base; esto la retira de verdad, y de paso cubre
 *     `reubicado` y `solo_informativo`, que el filtro de visualización no mira.
 *  2. **Sí rodó ese día** — el despacho apareció DESPUÉS de la hora de corte.
 *     Caso real del 2026-10-23 (CC 72230081): salió a las 08:44 y el pendiente
 *     se escribió a las 09:37, porque el estado `DESPACHADO` aún no había
 *     llegado de GEMA. Quedaba un registro de ausencia sobre alguien que
 *     estuvo trabajando, y nada lo quitaba.
 *
 * Solo toca `origen = 'automatico'` y `tipo = 'pendiente'`: lo que Gestivo
 * escribió y nadie ha clasificado. Nunca borra lo que decidió una persona —un
 * automático no cuenta para nada hasta que alguien lo clasifica
 * (`auto-pendientes.ts`), así que retirarlo no pierde ningún juicio—. Y si
 * alguien YA clasificó a quien rodó, eso se queda: es la contradicción que
 * Marcaciones pinta en ámbar y que hay que resolver a mano.
 *
 * `rodaron` lo pasa Marcaciones, que ya calculó quién salió a rodar y no
 * cuesta nada. Sin ese dato —el Registro del día, que no lo tiene— se consulta
 * `historico_despacho` SOLO para las cédulas con pendiente automático: son
 * unas pocas decenas, no el día entero.
 *
 * Lee los automáticos **directo de la base**, no de la lista ya filtrada de la
 * pantalla, porque para entonces los retirados ya salieron. Nunca lanza: su
 * fallo no puede dejar la pantalla en blanco.
 */
export async function limpiarPendientesAutoHuerfanos(entrada: {
  fecha: string;
  /** Cédulas que salieron a rodar ese día. Si no viene, se consulta. */
  rodaron?: ReadonlySet<string>;
}): Promise<ResultadoLimpieza> {
  const base: ResultadoLimpieza = { eliminados: 0, cedulas: [], porqueRodaron: [], error: null };
  try {
    const db = createAdminClient();
    const { data: autos, error: errLeer } = await db
      .from("ausentismo_registros")
      .select("*")
      .eq("fecha", entrada.fecha)
      .eq("tipo", CONCEPTO_PENDIENTE)
      .eq("origen", ORIGEN_AUTOMATICO);
    if (errLeer) throw new Error(errLeer.message);
    const filas = (autos ?? []) as Array<{ id: string; cedula: string }>;
    if (filas.length === 0) return base;

    const cedulas = [...new Set(filas.map((f) => String(f.cedula)))];

    // Maestro de los implicados, para decidir con la MISMA regla de la plantilla.
    const maestro = new Map<string, FilaConductor>();
    const COLS =
      "cedula, estado, reubicado, fecha_ingreso, codigo, created_at, solo_informativo";
    for (let i = 0; i < cedulas.length; i += 400) {
      const { data, error } = await db
        .from("conductores")
        .select(COLS)
        .in("cedula", cedulas.slice(i, i + 400));
      if (error) throw new Error(error.message);
      for (const c of (data ?? []) as FilaConductor[]) maestro.set(String(c.cedula), c);
    }

    const rodaron = entrada.rodaron ?? (await leerQuienesRodaron(db, entrada.fecha, cedulas));

    // Las dos decisiones son PURAS y viven en auto-pendientes.ts, con sus
    // pruebas. Se juntan por `id` para no borrar dos veces al mismo.
    const porDespacho = pendientesAAnularPorDespacho(filas, rodaron);
    const idsRodaron = new Set(porDespacho.map((f) => f.id));
    const aEliminar = [
      ...porDespacho,
      ...pendientesAAnular(filas, maestro, entrada.fecha).filter((f) => !idsRodaron.has(f.id)),
    ];
    if (aEliminar.length === 0) return base;

    // `.select()` devuelve lo que ESTE delete borró: si otra pestaña se
    // adelantó, la bitácora solo anota lo propio y no duplica.
    const { data: borradas, error: errBorrar } = await db
      .from("ausentismo_registros")
      .delete()
      .in(
        "id",
        aEliminar.map((f) => f.id)
      )
      .select("*");
    if (errBorrar) throw new Error(errBorrar.message);
    const eliminadas = (borradas ?? []) as Array<Record<string, unknown>>;
    if (eliminadas.length === 0) return base;

    await anotarBitacoraEliminados(db, eliminadas, idsRodaron);
    return {
      eliminados: eliminadas.length,
      cedulas: eliminadas.map((r) => String(r.cedula)),
      porqueRodaron: eliminadas
        .filter((r) => idsRodaron.has(String(r.id)))
        .map((r) => String(r.cedula)),
      error: null,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[biometrico] limpieza de pendientes automáticos:", error);
    return { ...base, error };
  }
}

/**
 * Quiénes de esas cédulas salieron a rodar ese día, según `historico_despacho`.
 *
 * Con la MISMA regla que la pantalla (`salioARodar`: la lista de estados, o
 * evidencia de timbradas), para que las dos no puedan discrepar. Acotada a las
 * cédulas con pendiente automático: es un puñado, no el despacho del día.
 */
async function leerQuienesRodaron(
  db: ReturnType<typeof createAdminClient>,
  fecha: string,
  cedulas: string[]
): Promise<Set<string>> {
  const salida = new Set<string>();
  for (let i = 0; i < cedulas.length; i += 400) {
    const { data, error } = await db
      .from("historico_despacho")
      .select("conductor_ced, estado, timbradas")
      .eq("fecha_viaje", fecha)
      .in("conductor_ced", cedulas.slice(i, i + 400));
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as {
      conductor_ced: string | null;
      estado: string | null;
      timbradas: number | null;
    }[]) {
      if (f.conductor_ced && salioARodar(f)) salida.add(String(f.conductor_ced).trim());
    }
  }
  return salida;
}

/**
 * Bitácora de las anulaciones automáticas: `accion = 'eliminado'` con la fila
 * completa en `datos_anteriores`, firmada sin persona. Nunca lanza: la fila ya
 * se borró y es lo que importa.
 *
 * El motivo va dentro de `datos_anteriores` como `_motivo_anulacion`: es el
 * único rastro de por qué desapareció un registro que nadie borró a mano, y
 * sin él la auditoría solo vería una fila que se esfumó.
 */
async function anotarBitacoraEliminados(
  db: ReturnType<typeof createAdminClient>,
  eliminadas: Array<Record<string, unknown>>,
  idsRodaron: ReadonlySet<string>
): Promise<void> {
  if (eliminadas.length === 0) return;
  try {
    await db.from("ausentismo_log").insert(
      eliminadas.map((r) => ({
        registro_id: r.id,
        accion: "eliminado",
        datos_anteriores: {
          ...r,
          _motivo_anulacion: idsRodaron.has(String(r.id))
            ? "salio a rodar ese dia (despacho posterior a la hora de corte)"
            : "ya no entra en plantilla (retirado, reubicado o solo informativo)",
        },
        datos_nuevos: null,
        user_id: null,
        user_email: FIRMA_AUTOMATICA,
      }))
    );
  } catch (e) {
    console.error("[biometrico] bitácora de limpieza automática:", e);
  }
}

/** Celular o teléfono del maestro, por cédula. Nunca lanza. */
async function leerTelefonos(
  db: ReturnType<typeof createAdminClient>,
  cedulas: string[]
): Promise<Record<string, string | null>> {
  const salida: Record<string, string | null> = {};
  if (cedulas.length === 0) return salida;
  try {
    const { data } = await db
      .from("conductores")
      .select("cedula, celular, telefono")
      .in("cedula", cedulas);
    for (const f of (data ?? []) as {
      cedula: string;
      celular: string | null;
      telefono: string | null;
    }[]) {
      salida[String(f.cedula)] = f.celular || f.telefono || null;
    }
  } catch {
    // Sin teléfono se registra igual: es un dato de comodidad.
  }
  return salida;
}

// El texto que muestra la pantalla es PURO y vive en `auto-pendientes.ts`: lo
// lee un componente de cliente, y este módulo no puede entrar al navegador
// porque trae el cliente administrador de Supabase con su llave de servicio.
export { HORA_POR_OMISION, explicarPendientes };
