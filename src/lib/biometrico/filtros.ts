/**
 * Segmentación y búsqueda de la pantalla de Marcaciones. Parte PURA (nada de
 * base, de red ni de React), para poder probar las reglas sueltas.
 *
 * Una sola función, `aplicar`, devuelve **otro `ResumenDia`** con los mismos
 * buckets ya recortados. Es a propósito: así la pantalla y las descargas
 * consumen exactamente lo mismo y es imposible que un CSV traiga filas que no
 * están a la vista —que es justo lo que se pidió, «descargas de la
 * segmentación en pantalla»—.
 *
 * Lo que NO hace: cambiar de bucket a nadie. Filtrar es quitar filas, nunca
 * reclasificar; las reglas de quién trabajó y quién no siguen siendo las de
 * `dia.ts` y las fichas filtradas se recalculan contando, no decidiendo.
 */
import { coincideTexto } from "@/lib/tabla/filtros";
import type {
  Esperado,
  FilaMarco,
  FilaNovedad,
  FilaPendiente,
  FilaTrabajo,
  Llegada,
  ResumenDia,
} from "./dia";

export const SECCIONES = [
  "sinDespacho",
  "porSalir",
  "trabajaron",
  "conNovedad",
  "marcaron",
] as const;

export type Seccion = (typeof SECCIONES)[number];

export const SECCION_LABEL: Record<Seccion, string> = {
  sinDespacho: "Sin despacho",
  porSalir: "Turno sin empezar",
  trabajaron: "Trabajaron",
  conNovedad: "Con novedad",
  marcaron: "Marcaron",
};

export type FiltroHuella = "todos" | "con" | "sin";
export type FiltroOrigen = "todos" | Esperado["origen"];
export type FiltroLlegada = "todos" | Llegada;

export interface FiltroMarcaciones {
  /** Texto libre: nombre, cédula, código del conductor, bus o pin. */
  texto: string;
  /** Pasó o no pasó la huella ese día. Informativo, pero es la pregunta más pedida. */
  huella: FiltroHuella;
  /** De dónde se dedujo que se le esperaba. */
  origen: FiltroOrigen;
  /** Por dónde llegó la huella a Gestivo. */
  llegada: FiltroLlegada;
  /** Bus exacto (el esperado, o el que rodó). "" = todos. */
  bus: string;
  /** Qué secciones se muestran. */
  secciones: Seccion[];
}

export const FILTRO_VACIO: FiltroMarcaciones = {
  texto: "",
  huella: "todos",
  origen: "todos",
  llegada: "todos",
  bus: "",
  secciones: [...SECCIONES],
};

export const ORIGEN_LABEL: Record<Esperado["origen"], string> = {
  despacho: "Despacho",
  historico: "Habitual",
  vehiculo: "Maestro bus",
  maestro: "Plantilla",
};

export const LLEGADA_LABEL: Record<Llegada, string> = {
  lector: "Lector",
  ambas: "Lector y Access",
  access: "Access",
};

const HUELLA_LABEL: Record<FiltroHuella, string> = {
  todos: "todas",
  con: "con huella",
  sin: "sin huella",
};

/** ¿Hay algo puesto? Decide si se pinta el botón de limpiar y si el informe lleva contexto. */
export function hayFiltro(f: FiltroMarcaciones): boolean {
  return (
    f.texto.trim() !== "" ||
    f.huella !== "todos" ||
    f.origen !== "todos" ||
    f.llegada !== "todos" ||
    f.bus !== "" ||
    f.secciones.length !== SECCIONES.length
  );
}

/** Los filtros en palabras, para el encabezado del PDF y el nombre del archivo. */
export function describirFiltro(f: FiltroMarcaciones): string[] {
  const out: string[] = [];
  if (f.texto.trim()) out.push(`Búsqueda: «${f.texto.trim()}»`);
  if (f.huella !== "todos") out.push(`Huella: ${HUELLA_LABEL[f.huella]}`);
  if (f.origen !== "todos") out.push(`Se esperaba por: ${ORIGEN_LABEL[f.origen]}`);
  if (f.llegada !== "todos") out.push(`Llegó por: ${LLEGADA_LABEL[f.llegada]}`);
  if (f.bus) out.push(`Bus: ${f.bus}`);
  if (f.secciones.length !== SECCIONES.length) {
    out.push(
      `Secciones: ${SECCIONES.filter((s) => f.secciones.includes(s))
        .map((s) => SECCION_LABEL[s])
        .join(", ") || "ninguna"}`
    );
  }
  return out;
}

/** Huella del día por cédula. La pantalla ya la arma así para pintar la hora. */
export function huellaPorCedula(resumen: ResumenDia): Map<string, FilaMarco> {
  return new Map(resumen.marcaron.map((m) => [m.cedula, m]));
}

/** Los buses del día, para el desplegable: los esperados y los que rodaron. */
export function busesDelDia(resumen: ResumenDia): string[] {
  const set = new Set<string>();
  const anota = (b: string | null | undefined) => {
    if (b) set.add(b);
  };
  for (const f of resumen.sinDespacho) anota(f.bus);
  for (const f of resumen.porSalir) anota(f.bus);
  for (const f of resumen.conNovedad) {
    anota(f.bus);
    anota(f.primerViaje?.bus);
  }
  for (const f of resumen.trabajaron) {
    anota(f.bus);
    anota(f.primerViaje.bus);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

/**
 * ¿Pasa una fila de las que vienen de `Esperado`? `busRodado` es el bus del
 * primer viaje cuando lo hay: quien se esperaba en el 112 y salió en el 118
 * tiene que aparecer buscando cualquiera de los dos.
 */
function pasaEsperado(
  fila: Esperado & { marco: boolean },
  marca: FilaMarco | undefined,
  f: FiltroMarcaciones,
  busRodado?: string | null
): boolean {
  if (f.huella === "con" && !fila.marco) return false;
  if (f.huella === "sin" && fila.marco) return false;
  if (f.origen !== "todos" && fila.origen !== f.origen) return false;
  if (f.bus && fila.bus !== f.bus && (busRodado ?? null) !== f.bus) return false;
  // Sin huella no hay «llegó por»: pedir una vía concreta deja fuera a quien
  // no marcó, que es lo que significa la pregunta.
  if (f.llegada !== "todos" && marca?.llegada !== f.llegada) return false;
  return coincideTexto(
    f.texto,
    fila.nombre,
    fila.cedula,
    fila.codigo,
    fila.bus,
    busRodado,
    ...(marca?.pines ?? [])
  );
}

function pasaMarco(fila: FilaMarco, f: FiltroMarcaciones): boolean {
  // Todas las de esta lista marcaron: «sin huella» no deja ninguna.
  if (f.huella === "sin") return false;
  if (f.llegada !== "todos" && fila.llegada !== f.llegada) return false;
  return coincideTexto(f.texto, fila.nombre, fila.cedula, fila.codigo, ...fila.pines);
}

/**
 * Aplica la segmentación y devuelve otro `ResumenDia` con los mismos buckets.
 *
 * `marcaron` es informativa y no carga bus ni origen, así que esos dos filtros
 * no se le pueden preguntar directamente: cuando están puestos, se recorta a
 * las cédulas que **sí** quedaron visibles en los buckets de esperados. Así
 * «bus 112» no devuelve las huellas de toda la empresa, y sin esos filtros la
 * lista sigue completa —incluidos los que marcaron sin estar esperados—.
 *
 * `sinMaestro` se deja intacto: hoy no se pinta y no entra en las descargas.
 */
export function aplicar(resumen: ResumenDia, f: FiltroMarcaciones): ResumenDia {
  const marcas = huellaPorCedula(resumen);
  const ve = (s: Seccion) => f.secciones.includes(s);

  const sinDespacho: FilaPendiente[] = ve("sinDespacho")
    ? resumen.sinDespacho.filter((x) => pasaEsperado(x, marcas.get(x.cedula), f))
    : [];
  const porSalir: FilaPendiente[] = ve("porSalir")
    ? resumen.porSalir.filter((x) => pasaEsperado(x, marcas.get(x.cedula), f))
    : [];
  const trabajaron: FilaTrabajo[] = ve("trabajaron")
    ? resumen.trabajaron.filter((x) => pasaEsperado(x, marcas.get(x.cedula), f, x.primerViaje.bus))
    : [];
  const conNovedad: FilaNovedad[] = ve("conNovedad")
    ? resumen.conNovedad.filter((x) =>
        pasaEsperado(x, marcas.get(x.cedula), f, x.primerViaje?.bus ?? null)
      )
    : [];

  let marcaron: FilaMarco[] = ve("marcaron") ? resumen.marcaron.filter((x) => pasaMarco(x, f)) : [];
  if (marcaron.length > 0 && (f.origen !== "todos" || f.bus !== "")) {
    const visibles = new Set<string>();
    for (const x of [...sinDespacho, ...porSalir, ...trabajaron, ...conNovedad]) {
      visibles.add(x.cedula);
    }
    marcaron = marcaron.filter((x) => visibles.has(x.cedula));
  }

  return {
    sinDespacho,
    porSalir,
    trabajaron,
    conNovedad,
    marcaron,
    sinMaestro: resumen.sinMaestro,
  };
}

/** Conductores distintos que quedan a la vista: lo que dice «N de M». */
export function cuantosConductores(r: ResumenDia): number {
  const s = new Set<string>();
  for (const x of r.sinDespacho) s.add(x.cedula);
  for (const x of r.porSalir) s.add(x.cedula);
  for (const x of r.trabajaron) s.add(x.cedula);
  for (const x of r.conNovedad) s.add(x.cedula);
  for (const x of r.marcaron) s.add(x.cedula);
  return s.size;
}
