/**
 * Resumen de un día: quién debía venir, quién trabajó y quién no. Parte PURA
 * (nada de base ni red), para poder probar las reglas sueltas.
 *
 * **La presencia sale del despacho de GEMA, no de la huella** (decidido el
 * 2026-10-19). Si la cédula del conductor aparece en `historico_despacho` con
 * un viaje que salió a rodar, se asume que no está ausente, y ese primer viaje
 * es la prueba que se muestra. La regla y por qué no basta la fila está en
 * `despacho.ts`.
 *
 * Las marcaciones del biométrico siguen llegando y se muestran, pero **no
 * deciden nada por ahora**: solo la mitad de los conductores despachados pasa
 * la huella (76-80 de 141-147 al día), así que como medida de asistencia
 * todavía no sirve. Volver a tenerla en cuenta es agregarla a los buckets de
 * `resumenDelDia`; nada más depende de eso.
 *
 * Lo que NO hace, a propósito: convertir «no lo despacharon» en una ausencia.
 * El módulo de Ausentismo cuenta rachas en días CALENDARIO (4 para descargos, 5
 * para terminación), así que registrar faltas solas inventaría ausencias cada
 * descanso —y Gestivo no tiene calendario de turnos— y dispararía alertas
 * falsas. Aquí solo se arma la lista para que RRHH decida.
 */
import type { PrimerViaje } from "./despacho";

/** Alguien que debía marcar ese día, y de dónde salió esa conclusión. */
export interface Esperado {
  cedula: string;
  nombre: string;
  codigo: string | null;
  /** Bus programado por el que se le esperaba. */
  bus: string | null;
  /**
   * `despacho`  GEMA registró que sacó ese bus ese día (lo más firme).
   * `historico` conductor dominante del bus en los últimos días.
   * `vehiculo`  conductor fijo del bus en el maestro.
   * `maestro`   sale de la plantilla: conductor activo y sin reubicar.
   */
  origen: "despacho" | "historico" | "vehiculo" | "maestro";
  /** Solo en `historico`: parte de los días que ese bus lo sacó esta persona. */
  confianza?: number;
}

/** Una marcación ya atribuida (o sin atribuir, si el pin no tiene cédula). */
export interface MarcacionDia {
  cedula: string | null;
  pin: string;
  /** ISO del momento, como lo devuelve la base. */
  momento: string;
  /** Quién la trajo PRIMERO (`biometrico_marcaciones.origen`). Sin dato = Access. */
  origen?: "equipo" | "access";
  /** Ya está también en el Access.mdb (`id_zk` no nulo). */
  enAccess?: boolean;
  /**
   * PC cuyo agente la trajo PRIMERO (`biometrico_envios.agente` del envío
   * que la insertó, sin el sufijo « (equipo)»). Null si no se sabe.
   */
  pc?: string | null;
}

/**
 * Nombre del PC a partir del `agente` de un envío. La vía equipo se
 * identifica como «LCPC07 (equipo)» y la Access como «LCPC07»: la vía ya la
 * dice `origen`, así que aquí se deja solo el PC.
 */
export function nombrePc(agente: string | null | undefined): string | null {
  const t = (agente ?? "").replace(/\s*\(equipo\)\s*$/i, "").trim();
  return t || null;
}

/** «Directa · LCPC02», para exportes y ayudas. */
export function textoLlegada(llegada: Llegada, pc: string | null | undefined, etiquetas: Record<Llegada, string>): string {
  return pc ? etiquetas[llegada] + " · " + pc : etiquetas[llegada];
}

/**
 * Por dónde llegó una huella a Gestivo:
 *   · `lector` — directo del equipo y todavía nadie la descargó en ZKAccess;
 *   · `ambas`  — del equipo, y después el Access.mdb la confirmó (lo ideal);
 *   · `access` — solo por el Access.mdb (el lector no estaba conectado, o fue
 *     antes de encender la lectura directa).
 */
export type Llegada = "lector" | "ambas" | "access";

export function llegadaDe(m: MarcacionDia): Llegada {
  if (m.origen === "equipo") return m.enAccess ? "ambas" : "lector";
  return "access";
}

export interface MarcoDia {
  /** Esperados por cédula. */
  esperados: Map<string, Esperado>;
  /** Cédula -> primer viaje que salió. Estar aquí es «no está ausente». */
  trabajaron: Map<string, PrimerViaje>;
  /** Con viajes asignados de los que ninguno ha salido: su turno no empezó. */
  porSalir: Set<string>;
  /** Cédulas con una novedad de ausentismo ese día (ya justificadas). */
  novedades: Set<string>;
  /** Del biométrico. Hoy no decide nada: va aparte, como información. */
  marcaciones: MarcacionDia[];
}

/** Un esperado que sí trabajó, con la prueba. */
export interface FilaTrabajo extends Esperado {
  primerViaje: PrimerViaje;
  /** Pasó la huella ese día. **Informativo**: no cambia la conclusión. */
  marco: boolean;
}

/**
 * Un esperado con su novedad del día ya registrada: queda fuera de las cuentas.
 *
 * `trabajo` es la contradicción que no hay que esconder: tiene una novedad
 * —permiso, incapacidad, vacaciones— y aun así GEMA le registró un viaje que
 * salió a rodar. Alguna de las dos cosas está mal y alguien tiene que verlo.
 */
export interface FilaNovedad extends Esperado {
  trabajo: boolean;
  primerViaje: PrimerViaje | null;
  /** Pasó la huella ese día. **Informativo**. */
  marco: boolean;
}

/** Un esperado del que no hay viaje que haya salido. */
export interface FilaPendiente extends Esperado {
  /** Tiene viajes asignados hoy que todavía no salen. */
  porSalir: boolean;
  /** Pasó la huella ese día. **Informativo**: no cambia la conclusión. */
  marco: boolean;
}

export interface FilaMarco {
  cedula: string;
  /** Nombre del esperado; null si marcó alguien que no estaba en la lista. */
  nombre: string | null;
  codigo: string | null;
  primera: string;
  ultima: string;
  cantidad: number;
  /** Puede ser más de uno: diez personas están enroladas con dos badges. */
  pines: string[];
  /** Estaba en la lista de esperados. */
  esperado: boolean;
  /** Por dónde llegó la PRIMERA huella del día, que es la hora que se muestra. */
  llegada: Llegada;
  /** Desde qué PC llegó esa primera huella. */
  pc?: string | null;
}

export interface ResumenDia {
  /**
   * Debía venir, no tiene viaje que haya salido y no tiene novedad.
   *
   * Ordenada con **los que pasaron la huella primero**, porque son los que hay
   * que mirar antes: la huella prueba que la persona vino, así que un «sin
   * despacho» con huella **no es una ausencia** —es alguien a quien no le
   * dieron bus— y registrarle una falta sería un error.
   *
   * No se parte en dos listas a propósito: la huella sigue sin decidir el
   * bucket (eso lo hace el despacho), y así las sumas y las invariantes de la
   * auditoría no cambian. La pantalla las separa visualmente con `marco`.
   *
   * Medido sobre doce días de octubre de 2026: de los 2-8 candidatos diarios,
   * **0 a 4 tenían huella**, y en varios días eran la mitad de la lista.
   */
  sinDespacho: FilaPendiente[];
  /** Tiene viajes asignados hoy que aún no salen: no es una ausencia. */
  porSalir: FilaPendiente[];
  /** Salió a rodar, con su primer viaje como prueba. */
  trabajaron: FilaTrabajo[];
  /**
   * Con su novedad del día ya registrada. **Fuera de las otras tres listas**:
   * no hay nada que decidir sobre ellos.
   */
  conNovedad: FilaNovedad[];
  /** Marcó, agrupado por persona. **Informativo**. */
  marcaron: FilaMarco[];
  /** Marcaciones que no se pueden atribuir a un esperado. **Informativo**. */
  sinMaestro: {
    /** El pin del equipo no tiene cédula (SSN en "0", o pin ya borrado). */
    sinCedula: { pin: string; cantidad: number; primera: string; ultima: string }[];
    /** Tiene cédula pero no estaba entre los esperados (relevo, administrativo). */
    noEsperados: FilaMarco[];
  };
}

/** Día operativo de un momento local del equipo: su fecha. */
export function diaOperativo(momentoLocal: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(momentoLocal.trim());
  return m ? m[1] : null;
}

/** Agrupa marcaciones por una llave, ya ordenadas por momento. */
function agrupar(
  marcaciones: MarcacionDia[],
  llave: (m: MarcacionDia) => string | null
): Map<string, MarcacionDia[]> {
  const mapa = new Map<string, MarcacionDia[]>();
  for (const m of marcaciones) {
    const k = llave(m);
    if (k === null) continue;
    const lista = mapa.get(k);
    if (lista) lista.push(m);
    else mapa.set(k, [m]);
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => a.momento.localeCompare(b.momento));
  }
  return mapa;
}

function porNombre<T extends { nombre: string | null; cedula: string }>(a: T, b: T): number {
  return (a.nombre ?? a.cedula).localeCompare(b.nombre ?? b.cedula, "es");
}

/**
 * Arma el resumen del día. No decide nada sobre ausentismo: solo cruza las
 * listas (esperados, despacho, novedades) y separa lo que no cuadra.
 *
 * El orden de los buckets: **la novedad ya registrada manda sobre todo** —si
 * alguien ya tiene su permiso o su incapacidad, no hay nada que decidir y
 * estorba en las cuentas—, después un viaje que salió, después un turno que
 * todavía no empieza, y lo que queda es el candidato a ausencia.
 */
export function resumenDelDia(marco: MarcoDia): ResumenDia {
  const { esperados, marcaciones, novedades, trabajaron: viajes, porSalir: pendientes } = marco;

  const porCedula = agrupar(marcaciones, (m) => m.cedula);
  const porPinSinCedula = agrupar(marcaciones, (m) => (m.cedula ? null : m.pin));

  const fila = (cedula: string, lista: MarcacionDia[]): FilaMarco => {
    const esp = esperados.get(cedula);
    return {
      cedula,
      nombre: esp?.nombre ?? null,
      codigo: esp?.codigo ?? null,
      primera: lista[0].momento,
      ultima: lista[lista.length - 1].momento,
      cantidad: lista.length,
      // Dos pines de la misma persona (enrolada dos veces) se juntan aquí.
      pines: [...new Set(lista.map((m) => m.pin))].sort(),
      esperado: !!esp,
      llegada: llegadaDe(lista[0]),
      pc: lista[0].pc ?? null,
    };
  };

  const marcaron: FilaMarco[] = [];
  const noEsperados: FilaMarco[] = [];
  for (const [cedula, lista] of porCedula) {
    const f = fila(cedula, lista);
    if (f.esperado) marcaron.push(f);
    else noEsperados.push(f);
  }

  const trabajaron: FilaTrabajo[] = [];
  const porSalir: FilaPendiente[] = [];
  const sinDespacho: FilaPendiente[] = [];
  const conNovedad: FilaNovedad[] = [];
  for (const [cedula, esp] of esperados) {
    const marco = porCedula.has(cedula);
    const viaje = viajes.get(cedula) ?? null;

    // 1. Una novedad registrada ese día lo saca de la pantalla, decidido el
    //    2026-10-20. Esta pantalla sirve para encontrar a quién hay que
    //    registrarle algo; a quien ya tiene su permiso, incapacidad o
    //    vacaciones no hay nada que preguntarle, y dejarlo en las cuentas solo
    //    estorba.
    //
    //    Gana incluso sobre un viaje que salió. Pero entonces hay una
    //    contradicción —tiene novedad y rodó— y eso NO puede desaparecer: se
    //    lleva anotado en `trabajo` para que la sección lo muestre.
    if (novedades.has(cedula)) {
      conNovedad.push({ ...esp, trabajo: viaje !== null, primerViaje: viaje, marco });
      continue;
    }
    // 2. Salió a rodar: no está ausente, y el primer viaje es la prueba.
    if (viaje) {
      trabajaron.push({ ...esp, primerViaje: viaje, marco });
      continue;
    }
    // 3. Tiene turno más tarde: todavía no se puede decir nada.
    if (pendientes.has(cedula)) {
      porSalir.push({ ...esp, porSalir: true, marco });
      continue;
    }
    // 4. Lo que queda: ni novedad, ni viaje, ni turno pendiente.
    sinDespacho.push({ ...esp, porSalir: false, marco });
  }

  const sinCedula = [...porPinSinCedula.entries()]
    .map(([pin, lista]) => ({
      pin,
      cantidad: lista.length,
      primera: lista[0].momento,
      ultima: lista[lista.length - 1].momento,
    }))
    .sort((a, b) => b.cantidad - a.cantidad || a.pin.localeCompare(b.pin));

  return {
    // Primero los que vinieron (huella): son los que NO hay que registrar.
    sinDespacho: sinDespacho.sort(
      (a, b) => Number(b.marco) - Number(a.marco) || porNombre(a, b)
    ),
    porSalir: porSalir.sort(porNombre),
    // Los que trabajaron, por hora del primer viaje: se lee como la jornada.
    trabajaron: trabajaron.sort(
      (a, b) => a.primerViaje.hora.localeCompare(b.primerViaje.hora) || porNombre(a, b)
    ),
    conNovedad: conNovedad.sort(porNombre),
    marcaron: marcaron.sort(porNombre),
    sinMaestro: { sinCedula, noEsperados: noEsperados.sort(porNombre) },
  };
}

/** Días calendario entre dos fechas ISO (AAAA-MM-DD), sin zona horaria. */
export function diasEntreIso(desde: string, hasta: string): number {
  const dia = 86_400_000;
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / dia);
}
