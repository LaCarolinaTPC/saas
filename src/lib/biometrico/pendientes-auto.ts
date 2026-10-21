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
 * refresco del despacho: no hay cron en el plan Hobby de Vercel. Y **nunca
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
  type Candidato,
  type MotivoNoCorre,
} from "./auto-pendientes";

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
    ahoraMinutos: minutosAhoraBogota(),
    activo,
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
