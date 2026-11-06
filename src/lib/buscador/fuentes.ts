/**
 * Fuentes de registros del buscador global (solo servidor). Para que un tipo de
 * registro nuevo se pueda buscar, basta agregar una entrada a `FUENTES`: los
 * registros se consultan en vivo, así que altas y bajas se reflejan solas.
 *
 * El permiso NO se declara aparte: sale de `ficha`, con la misma regla de las
 * pantallas. Si el usuario no puede abrir esa ruta, la fuente ni se consulta.
 *
 * - `columnas`: solo de TEXTO. Una numérica o un enum hacen fallar la consulta.
 * - Nunca agregue columnas sensibles (diagnóstico, descripciones): un resultado
 *   revela que la coincidencia existe.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { PermisosEfectivos } from "@/lib/permisos/motor";
import { rutaVisible } from "./pantallas";
import { debeAnclarse, patronDe } from "./texto";

type Fila = Record<string, string | number | null>;
type Db = ReturnType<typeof createAdminClient>;

export const RESULTADOS_POR_FUENTE = 5;
const LIMITE_FUENTE_MS = 5000;

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const unir = (...partes: unknown[]) => partes.map(texto).filter(Boolean).join(" · ");

interface FichaFuente {
  /** Página real, relativa a `(dashboard)`: una prueba comprueba que exista. */
  pagina: string;
  /** Una ruta de esa ficha, con la que se evalúa el permiso. */
  ruta: string;
  href: (f: Fila) => string;
}

export interface FuenteBuscador {
  clave: string;
  grupo: string;
  tabla: string;
  columnas: string[];
  /** Columnas numéricas: se comparan exacto, solo si la palabra son dígitos. */
  columnasNumero?: string[];
  select: string;
  orden: { columna: string; ascendente: boolean };
  /** La primera ficha que el usuario pueda abrir. */
  fichas: FichaFuente[];
  filtrar?: (q: Consulta) => Consulta;
  titulo: (f: Fila) => string;
  detalle: (f: Fila) => string;
}

// El tipo real depende de cada tabla; aquí solo se encadenan filtros.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any;

export const FUENTES: readonly FuenteBuscador[] = [
  {
    clave: "conductores",
    grupo: "Conductores",
    tabla: "conductores",
    columnas: ["nombre", "cedula", "codigo"],
    select: "cedula, nombre, codigo, tipo_conductor",
    orden: { columna: "nombre", ascendente: true },
    filtrar: (q) => q.neq("cedula", "99999999"), // Registro comodín de GEMA.
    fichas: [
      { pagina: "conductores/[cedula]", ruta: "/conductores/x", href: (f) => `/conductores/${encodeURIComponent(texto(f.cedula))}` },
      { pagina: "rotacion/conductores/[cedula]", ruta: "/rotacion/conductores/x", href: (f) => `/rotacion/conductores/${encodeURIComponent(texto(f.cedula))}` },
    ],
    titulo: (f) => texto(f.nombre),
    detalle: (f) => unir(f.cedula && `Cédula ${f.cedula}`, f.codigo && `Código ${f.codigo}`, f.tipo_conductor),
  },
  {
    clave: "empleados",
    grupo: "Empleados",
    tabla: "employees",
    columnas: ["full_name", "document_number", "gema_codigo"],
    select: "id, full_name, document_number, position",
    orden: { columna: "full_name", ascendente: true },
    fichas: [{ pagina: "empleados/[id]", ruta: "/empleados/x", href: (f) => `/empleados/${texto(f.id)}` }],
    titulo: (f) => texto(f.full_name),
    detalle: (f) => unir(f.document_number && `Cédula ${f.document_number}`, f.position),
  },
  {
    clave: "candidatos",
    grupo: "Candidatos",
    tabla: "candidates",
    columnas: ["full_name", "document_number", "phone"],
    select: "id, full_name, document_number, phone",
    orden: { columna: "full_name", ascendente: true },
    fichas: [{ pagina: "candidatos/[id]", ruta: "/candidatos/x", href: (f) => `/candidatos/${texto(f.id)}` }],
    titulo: (f) => texto(f.full_name),
    detalle: (f) => unir(f.document_number && `Cédula ${f.document_number}`, f.phone),
  },
  {
    clave: "vacantes",
    grupo: "Vacantes",
    tabla: "vacancies",
    columnas: ["title", "location"],
    select: "id, title, status, location",
    orden: { columna: "created_at", ascendente: false },
    fichas: [{ pagina: "vacantes/[id]", ruta: "/vacantes/x", href: (f) => `/vacantes/${texto(f.id)}` }],
    titulo: (f) => texto(f.title),
    detalle: (f) => unir(f.location, f.status),
  },
  {
    clave: "vehiculos",
    grupo: "Vehículos",
    tabla: "vehiculos",
    columnas: ["codigo", "placa"],
    select: "codigo, placa, marca, modelo, ruta",
    orden: { columna: "codigo", ascendente: true },
    fichas: [{ pagina: "operativo/vehiculos/[codigo]", ruta: "/operativo/vehiculos/x", href: (f) => `/operativo/vehiculos/${encodeURIComponent(texto(f.codigo))}` }],
    titulo: (f) => unir(`Bus ${texto(f.codigo)}`, f.placa),
    detalle: (f) => unir(f.marca, f.modelo, f.ruta && `Ruta ${f.ruta}`),
  },
  {
    clave: "accidentes",
    grupo: "Accidentes",
    tabla: "accidentes",
    columnas: ["conductor_nombre", "conductor_cedula", "vehiculo_codigo", "vehiculo_placa", "ipat_numero"],
    columnasNumero: ["consecutivo"],
    select: "id, consecutivo, conductor_nombre, vehiculo_codigo, vehiculo_placa, fecha_accidente",
    orden: { columna: "fecha_accidente", ascendente: false },
    fichas: [{ pagina: "accidentabilidad/consultar/[id]", ruta: "/accidentabilidad/consultar/x", href: (f) => `/accidentabilidad/consultar/${texto(f.id)}` }],
    titulo: (f) => unir(f.consecutivo ? `Accidente ${f.consecutivo}` : "Accidente", f.conductor_nombre),
    detalle: (f) => unir(texto(f.fecha_accidente).slice(0, 10), f.vehiculo_codigo && `Bus ${f.vehiculo_codigo}`, f.vehiculo_placa),
  },
  // Sensibles: solo identifican a la persona. Nada de diagnóstico, estado ni motivo.
  {
    clave: "incapacidades",
    grupo: "Incapacidades",
    tabla: "vw_incapacidad_expedientes",
    columnas: ["cedula", "nombre"],
    select: "id, cedula, nombre",
    orden: { columna: "recibido_at", ascendente: false },
    fichas: [{ pagina: "incapacidades/[id]", ruta: "/incapacidades/x", href: (f) => `/incapacidades/${texto(f.id)}` }],
    titulo: (f) => texto(f.nombre),
    detalle: (f) => unir(f.cedula && `Cédula ${f.cedula}`),
  },
  {
    clave: "disciplinarios",
    grupo: "Procesos disciplinarios",
    tabla: "procesos_disciplinarios",
    columnas: ["nombre", "cedula", "codigo"],
    columnasNumero: ["consecutivo"],
    select: "cedula, nombre",
    orden: { columna: "fecha_hecho", ascendente: false },
    filtrar: (q) => q.is("anulado_en", null),
    // No hay ficha: la pantalla filtra por cédula.
    fichas: [{ pagina: "disciplinarios", ruta: "/disciplinarios", href: (f) => `/disciplinarios?q=${encodeURIComponent(texto(f.cedula))}` }],
    titulo: (f) => texto(f.nombre),
    detalle: (f) => unir(f.cedula && `Cédula ${f.cedula}`),
  },
];

/** Las fuentes que este usuario puede consultar, cada una con su ficha. */
export function fuentesPermitidas(ef: PermisosEfectivos): { fuente: FuenteBuscador; ficha: FichaFuente }[] {
  return FUENTES.flatMap((fuente) => {
    const ficha = fuente.fichas.find((f) => rutaVisible(ef, f.ruta));
    return ficha ? [{ fuente, ficha }] : [];
  });
}

/** El filtro de una palabra sobre varias columnas, como lo espera `.or()` (PURO). */
export function filtroDePalabra(fuente: Pick<FuenteBuscador, "columnas" | "columnasNumero">, palabra: string, anclar: boolean): string {
  const patron = anclar ? `^${patronDe(palabra)}$` : patronDe(palabra);
  const partes = fuente.columnas.map((c) => `${c}.imatch."${patron}"`);
  // Hasta 18 dígitos: más que eso desborda un BIGINT y haría fallar la consulta.
  if (/^\d{1,18}$/.test(palabra)) for (const c of fuente.columnasNumero ?? []) partes.push(`${c}.eq.${palabra}`);
  return partes.join(",");
}

export interface ResultadoBusqueda {
  titulo: string;
  detalle: string;
  href: string;
}

/** Consulta una fuente. Lanza si falla: quien llama aísla el error. */
export async function buscarEnFuente(db: Db, fuente: FuenteBuscador, ficha: FichaFuente, palabras: readonly string[]): Promise<ResultadoBusqueda[]> {
  const anclar = debeAnclarse(palabras);
  let q: Consulta = db.from(fuente.tabla).select(fuente.select);
  for (const p of palabras) q = q.or(filtroDePalabra(fuente, p, anclar));
  if (fuente.filtrar) q = fuente.filtrar(q);
  const { data, error } = await q
    .order(fuente.orden.columna, { ascending: fuente.orden.ascendente, nullsFirst: false })
    .limit(RESULTADOS_POR_FUENTE)
    .abortSignal(AbortSignal.timeout(LIMITE_FUENTE_MS));
  if (error) throw new Error(error.message);
  const vistos = new Set<string>();
  return ((data ?? []) as Fila[]).flatMap((f) => {
    const href = ficha.href(f);
    if (vistos.has(href)) return [];
    vistos.add(href);
    return [{ titulo: fuente.titulo(f) || "Sin nombre", detalle: fuente.detalle(f), href }];
  });
}
