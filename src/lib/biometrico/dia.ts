/**
 * Resumen de un día: quién debía venir, quién marcó y quién no. Parte PURA
 * (nada de base ni red), para poder probar las reglas sueltas.
 *
 * Lo que NO hace, a propósito: convertir «no marcó» en una ausencia. El módulo
 * de Ausentismo cuenta rachas en días CALENDARIO (4 para descargos, 5 para
 * terminación), así que registrar faltas solas inventaría ausencias cada
 * descanso y dispararía alertas falsas. Aquí solo se arma la lista para que
 * RRHH decida.
 */

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
   * `maestro`   no había programación: todo conductor activo a esa fecha.
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
}

export interface MarcoDia {
  /** Esperados por cédula. */
  esperados: Map<string, Esperado>;
  marcaciones: MarcacionDia[];
  /** Cédulas con una novedad de ausentismo ese día (ya justificadas). */
  novedades: Set<string>;
  /** Cédulas que GEMA registró despachadas ese día. */
  despachados: Set<string>;
}

export interface FilaSinMarcacion extends Esperado {
  /** GEMA lo despachó: trabajó, pero no pasó por el biométrico. */
  despachado: boolean;
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
}

export interface ResumenDia {
  /** Debía venir, no marcó y no tiene novedad registrada. */
  sinMarcacion: FilaSinMarcacion[];
  /** GEMA lo despachó pero no marcó: control del biométrico, no ausentismo. */
  trabajoSinMarcar: FilaSinMarcacion[];
  /** Marcó, agrupado por persona. */
  marcaron: FilaMarco[];
  /** Esperados que no marcaron pero ya tienen su novedad del día. */
  conNovedad: Esperado[];
  /** Marcaciones que no se pueden atribuir a un esperado. */
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
 * Arma el resumen del día. No decide nada sobre ausentismo: solo cruza las tres
 * listas (esperados, marcaciones, novedades) y separa lo que no cuadra.
 */
export function resumenDelDia(marco: MarcoDia): ResumenDia {
  const { esperados, marcaciones, novedades, despachados } = marco;

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
    };
  };

  const marcaron: FilaMarco[] = [];
  const noEsperados: FilaMarco[] = [];
  for (const [cedula, lista] of porCedula) {
    const f = fila(cedula, lista);
    if (f.esperado) marcaron.push(f);
    else noEsperados.push(f);
  }

  const sinMarcacion: FilaSinMarcacion[] = [];
  const trabajoSinMarcar: FilaSinMarcacion[] = [];
  const conNovedad: Esperado[] = [];
  for (const [cedula, esp] of esperados) {
    if (porCedula.has(cedula)) continue;
    // Una novedad registrada (permiso, incapacidad, vacaciones…) ya explica la
    // ausencia: no se vuelve a preguntar por ella.
    if (novedades.has(cedula)) {
      conNovedad.push(esp);
      continue;
    }
    const f: FilaSinMarcacion = { ...esp, despachado: despachados.has(cedula) };
    // Despachado y sin huella no es una ausencia: trabajó sin marcar. Es un
    // problema del uso del biométrico y se lista aparte para no confundirlo.
    if (f.despachado) trabajoSinMarcar.push(f);
    else sinMarcacion.push(f);
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
    sinMarcacion: sinMarcacion.sort(porNombre),
    trabajoSinMarcar: trabajoSinMarcar.sort(porNombre),
    marcaron: marcaron.sort(porNombre),
    conNovedad: conNovedad.sort(porNombre),
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
