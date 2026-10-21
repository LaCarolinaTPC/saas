/**
 * Cuándo y a quién le crea Gestivo un registro «pendiente por clasificar».
 *
 * El problema que resuelve: en la pantalla de Marcaciones, quien aparece en
 * «sin despacho» había que registrarlo a mano uno por uno. Esto lo automatiza
 * — pero sin inventar faltas, que es la parte delicada.
 *
 * ## Por qué «pendiente» y no «no justificada»
 *
 * Gestivo **no tiene calendario de turnos**, así que «sin despacho» incluye a
 * quien simplemente descansaba. Medido sobre los datos reales: de lunes a
 * viernes son 4–13 personas, pero **domingos y festivos son 83–94**, casi todos
 * descansos.
 *
 * Y el módulo de Ausentismo escala por días CALENDARIO: cuatro «No justificada»
 * seguidas notifican citación a descargos y cinco la terminación del contrato
 * (`DIAS_DESCARGOS`, `DIAS_TERMINACION`). Crear automáticamente «no
 * justificada» habría puesto a decenas de conductores en un proceso
 * disciplinario por haber descansado un fin de semana largo.
 *
 * Así que lo que se automatiza es la **digitación**, no el juicio: el registro
 * entra como `pendiente`, marcado «automático por Gestivo», y no cuenta para
 * nada hasta que una persona lo clasifica. Es la misma línea que ya tenía el
 * módulo —la pantalla arma la lista, la decisión es de una persona—, solo que
 * ahora la lista llega escrita.
 *
 * ## Solo días hábiles y solo hoy
 *
 * Días hábiles por lo de los 83–94. Y solo el día en curso: crear registros
 * hacia atrás, de días que nadie estaba mirando, sería una sorpresa
 * desagradable en un módulo con consecuencias laborales. Para un día pasado
 * siempre queda el registro a mano.
 *
 * PURO: ni base ni red, se prueba solo (`npm run test:biometrico`).
 */
import { esDiaHabil } from "@/lib/tesoreria/calendario-pago";
// Relativo a propósito: estas pruebas corren con `tsx --test` sin los `paths`.
import { entraEnPlantilla, type FilaConductor } from "./plantilla";

/** El tipo con el que entran. No escala a disciplinario. */
export const CONCEPTO_PENDIENTE = "pendiente";

/** Valor de `ausentismo_registros.origen` para lo que crea Gestivo. */
export const ORIGEN_AUTOMATICO = "automatico";

/** Y para lo que escribió una persona. Es el valor por omisión de la columna. */
export const ORIGEN_MANUAL = "manual";

/** Hora por omisión, si nadie la ha cambiado en Configuración. */
export const HORA_POR_OMISION = "09:00";

/** La clave en `app_settings` donde vive la hora. */
export const CLAVE_HORA = "ausentismo.pendientes_auto_hora";

/** Y la que permite apagarlo del todo sin borrar la hora. */
export const CLAVE_ACTIVO = "ausentismo.pendientes_auto_activo";

export interface Candidato {
  cedula: string;
  codigo: string | null;
  nombre: string;
  telefono?: string | null;
}

/** Fila mínima de un pendiente automático para decidir si se anula. */
export interface PendienteAuto {
  id: string;
  cedula: string;
}

/**
 * De los pendientes automáticos del día, cuáles anular: los que tienen ficha en
 * el maestro y hoy YA NO entran en plantilla (retirado, reubicado o solo
 * informativo). Sin ficha no se decide nada (mejor dejarla para revisión
 * manual que anular a ciegas). PURO: usa la misma regla que la plantilla.
 */
export function pendientesAAnular(
  pendientes: PendienteAuto[],
  maestro: Map<string, FilaConductor>,
  fecha: string
): PendienteAuto[] {
  return pendientes.filter((p) => {
    const c = maestro.get(String(p.cedula));
    return c ? !entraEnPlantilla(c, fecha) : false;
  });
}

export type MotivoNoCorre =
  | "apagado"
  | "no_es_dia_habil"
  | "no_es_hoy"
  | "aun_no_es_la_hora";

export type Decision =
  | { corre: true; crear: Candidato[] }
  | { corre: false; motivo: MotivoNoCorre; detalle: string };

/**
 * «HH:MM» a minutos desde medianoche. Devuelve null si no es una hora.
 *
 * Se valida de verdad porque el valor viene de un campo que edita una persona,
 * y una hora inválida no puede hacer que esto corra a las 00:00 ni que falle
 * la pantalla entera.
 */
export function minutosDeHora(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hora.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** La hora guardada, o la de por omisión si lo guardado no sirve. */
export function horaEfectiva(guardada: string | null | undefined): string {
  return minutosDeHora(guardada) === null ? HORA_POR_OMISION : guardada!.trim();
}

/**
 * Qué hacer para `fecha`, mirando el reloj de Colombia.
 *
 * `yaRegistrados` son las cédulas que ya tienen algún registro ese día, de
 * cualquier tipo y origen: si alguien ya anotó una incapacidad, Gestivo no
 * tiene nada que añadir.
 */
export function decidir(entrada: {
  fecha: string;
  hoy: string;
  ahoraMinutos: number;
  activo: boolean;
  hora: string | null | undefined;
  candidatos: Candidato[];
  yaRegistrados: Iterable<string>;
}): Decision {
  const { fecha, hoy, ahoraMinutos, activo, candidatos } = entrada;

  if (!activo) {
    return { corre: false, motivo: "apagado", detalle: "está apagado en Configuración" };
  }
  if (fecha !== hoy) {
    return {
      corre: false,
      motivo: "no_es_hoy",
      detalle: "solo se crean registros del día en curso, no de días pasados",
    };
  }
  if (!esDiaHabil(fecha)) {
    return {
      corre: false,
      motivo: "no_es_dia_habil",
      detalle: "domingo o festivo: ahí «sin despacho» son casi todos descansos",
    };
  }

  const hora = horaEfectiva(entrada.hora);
  const corte = minutosDeHora(hora)!;
  if (ahoraMinutos < corte) {
    return {
      corre: false,
      motivo: "aun_no_es_la_hora",
      detalle: "se crean a partir de las " + hora,
    };
  }

  const ya = new Set<string>();
  for (const c of entrada.yaRegistrados) if (c) ya.add(c.trim());

  const crear: Candidato[] = [];
  const vistas = new Set<string>();
  for (const c of candidatos) {
    const cedula = (c.cedula ?? "").trim();
    // Sin cédula no se puede registrar a nadie, y repetida tampoco: la misma
    // persona puede venir dos veces si está enrolada con dos pines.
    if (!cedula || ya.has(cedula) || vistas.has(cedula)) continue;
    vistas.add(cedula);
    crear.push({ ...c, cedula });
  }
  return { corre: true, crear };
}

/**
 * Lo que la pantalla dice de la creación automática: qué pasó, o por qué no.
 *
 * Vive aquí —y no junto al código que escribe en la base— porque lo lee un
 * componente de cliente: importarlo del módulo de servidor arrastraría el
 * cliente administrador de Supabase, con su llave de servicio, al paquete del
 * navegador. Aquí no hay ni base ni red.
 */
export function explicarPendientes(r: {
  hora: string;
  activo: boolean;
  creados: number;
  motivo: MotivoNoCorre | null;
  error: string | null;
}): string {
  if (r.error) {
    // El caso que se ve si se despliega el código antes de aplicar la
    // migración: PostgREST responde «Could not find the 'origen' column … in
    // the schema cache». Dicho así no se entiende; dicho así se arregla.
    if (/origen/.test(r.error) && /column|columna|schema cache/i.test(r.error)) {
      return (
        "Falta aplicar la migración «20261021030119_registros_de_ausentismo_creados_por_gestivo…»" +
        " en el SQL Editor: sin la columna «origen» Gestivo no puede registrar nada."
      );
    }
    return "No se pudieron crear los pendientes: " + r.error;
  }
  if (!r.activo) return "Apagado: nadie se registra solo.";
  if (r.motivo === "aun_no_es_la_hora") return "Se registran solos a partir de las " + r.hora + ".";
  if (r.motivo === "no_es_dia_habil") {
    return "Hoy no corre: en domingo y festivo «sin despacho» son casi todos descansos.";
  }
  if (r.motivo === "no_es_hoy") return "Solo se registran solos los del día en curso.";
  if (r.creados > 0) {
    return (
      "Gestivo registró " + r.creados + (r.creados === 1 ? " pendiente" : " pendientes") +
      " a las " + r.hora + ". Falta clasificarlos."
    );
  }
  return "Al día: no había nadie por registrar a las " + r.hora + ".";
}

/** Los minutos desde medianoche en Colombia, para el reloj del servidor. */
export function minutosAhoraBogota(ahora: Date = new Date()): number {
  // `Intl` y no aritmética de husos: es la convención del repositorio, y
  // Colombia no tiene horario de verano pero el servidor sí puede estar en UTC.
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ahora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  return hora * 60 + minuto;
}
