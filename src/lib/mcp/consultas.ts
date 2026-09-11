import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXTERNAL_RESOURCES,
  getResource,
  resourceIdColumn,
  type ExternalResource,
} from "@/lib/external/resources";
import {
  CATALOGO,
  CONTEXTO_NEGOCIO,
  DOMINIOS,
  GLOSARIO,
  ORDEN_DOMINIOS,
  REGLAS_GENERALES,
  obtenerDocRecurso,
  type DocColumna,
  type DocRecurso,
} from "@/lib/mcp/catalogo";
import {
  obtenerEsquema,
  obtenerEsquemas,
  type ColumnaViva,
  type EsquemaRelacion,
} from "@/lib/mcp/esquema";

// Motor de consultas del servidor MCP. Todo lo que devuelve va acompañado de la
// documentación necesaria para interpretarlo: qué es una fila, qué significa
// cada columna devuelta, qué filtros se aplicaron de verdad y qué trampas tiene
// el recurso. La frontera de seguridad es la lista blanca EXTERNAL_RESOURCES y
// la validación de cada identificador contra el esquema vivo.

export class ErrorConsulta extends Error {}

export const OPERADORES = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "in",
  "is_null",
  "not_null",
] as const;
export type Operador = (typeof OPERADORES)[number];
export type ValorFiltro = string | number | boolean;
export type Filtro = {
  columna: string;
  operador: Operador;
  valor?: ValorFiltro | ValorFiltro[];
};

export const TRUNCAMIENTOS = ["hora", "dia", "semana", "mes", "trimestre", "anio"] as const;
export const FUNCIONES = ["count", "count_distinct", "sum", "avg", "min", "max"] as const;
export const ORDENES_AGREGACION = ["metrica_desc", "metrica_asc", "grupo_asc"] as const;

export const LIMITE_FILAS = { defecto: 50, maximo: 500 };
export const LIMITE_GRUPOS = { defecto: 100, maximo: 1000 };

/** Tope de la respuesta serializada: protege el contexto del agente. */
const MAX_CARACTERES_RESPUESTA = 90_000;
const RECURSO_MUY_GRANDE = 2_000_000;

const TIPO_NUMERICO = /^(smallint|integer|bigint|numeric|real|double precision|decimal)/;
const TIPO_FECHA = /^(date|timestamp)/;

const MIGRACION_MCP =
  "20260911152916_mcp_servidor_para_agentes_de_ia_con_oauth_introspeccion_y_agregacion.sql";

// ── Utilidades ────────────────────────────────────────────────────────────────

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temporal = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        previo + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previo = temporal;
    }
  }
  return fila[b.length];
}

/** Candidatos parecidos a un nombre mal escrito, del más al menos parecido. */
export function sugerir(valor: string, candidatos: string[], maximo = 5): string[] {
  const v = normalizar(valor);
  return candidatos
    .map((c) => {
      const n = normalizar(c);
      const d = n.includes(v) || v.includes(n) ? 0 : distancia(v, n);
      return { c, d };
    })
    .filter(({ d }) => d <= Math.max(2, Math.floor(v.length / 3)))
    .sort((a, b) => a.d - b.d)
    .slice(0, maximo)
    .map(({ c }) => c);
}

function acotar(valor: number | undefined, defecto: number, minimo: number, maximo: number): number {
  if (valor === undefined || !Number.isFinite(valor)) return defecto;
  return Math.min(Math.max(Math.floor(valor), minimo), maximo);
}

export function ahoraEnColombia() {
  const ahora = new Date();
  const zona = "America/Bogota";
  return {
    fecha: new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(ahora),
    hora: new Intl.DateTimeFormat("es-CO", {
      timeZone: zona,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(ahora),
    dia_semana: new Intl.DateTimeFormat("es-CO", { timeZone: zona, weekday: "long" }).format(ahora),
    zona: "America/Bogota (UTC-5, sin horario de verano)",
  };
}

function recortarValor(valor: unknown, maxTexto: number, maxJson: number): unknown {
  if (typeof valor === "string" && valor.length > maxTexto) {
    return `${valor.slice(0, maxTexto)}… [recortado: ${valor.length} caracteres en total]`;
  }
  if (valor !== null && typeof valor === "object") {
    const serializado = JSON.stringify(valor);
    if (serializado.length > maxJson) {
      return `${serializado.slice(0, maxJson)}… [JSON recortado: ${serializado.length} caracteres; pida este registro con obtener_registro]`;
    }
  }
  return valor;
}

function recortarFilas(
  filas: Record<string, unknown>[],
  maxTexto: number,
  maxJson: number
): { filas: Record<string, unknown>[]; recortadasPorTamano: boolean } {
  const salida: Record<string, unknown>[] = [];
  let acumulado = 0;
  for (const fila of filas) {
    const recortada = Object.fromEntries(
      Object.entries(fila).map(([k, v]) => [k, recortarValor(v, maxTexto, maxJson)])
    );
    const tamano = JSON.stringify(recortada).length;
    if (salida.length > 0 && acumulado + tamano > MAX_CARACTERES_RESPUESTA) {
      return { filas: salida, recortadasPorTamano: true };
    }
    salida.push(recortada);
    acumulado += tamano;
  }
  return { filas: salida, recortadasPorTamano: false };
}

function traducirError(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "57014":
      return "La consulta tardó demasiado y la base la canceló. Acote con filtros (sobre todo por fecha), pida menos columnas o use agregar_datos.";
    case "22P02":
    case "22007":
    case "22008":
      return `Un valor de filtro no tiene el formato del tipo de la columna (${error.message}). Fechas en AAAA-MM-DD, números sin separadores de miles, booleanos true/false.`;
    case "42501":
      return `La base negó el acceso a esta tabla (${error.message}). Es un problema de permisos del servidor, no de la consulta: repórtelo al administrador de Gestivo.`;
    case "42883":
      return `La operación no aplica al tipo de la columna (${error.message}). Por ejemplo, like/ilike solo sirven sobre texto.`;
    default:
      return `Error de la base de datos: ${error.message}`;
  }
}

// ── Contexto del recurso ──────────────────────────────────────────────────────

type Contexto = {
  recurso: ExternalResource;
  doc: DocRecurso | undefined;
  esquema: EsquemaRelacion;
};

async function resolverRecurso(nombre: string): Promise<Contexto> {
  const recurso = getResource(nombre);
  if (!recurso) {
    const parecidos = sugerir(nombre, EXTERNAL_RESOURCES.map((r) => r.name));
    throw new ErrorConsulta(
      `El recurso '${nombre}' no existe o no está expuesto.` +
        (parecidos.length ? ` ¿Quiso decir: ${parecidos.join(", ")}?` : "") +
        " Consulte guia_gestivo para ver los recursos disponibles."
    );
  }
  const esquema = await obtenerEsquema(recurso.name);
  if (!esquema || esquema.columnas.length === 0) {
    throw new ErrorConsulta(
      `El recurso '${nombre}' está habilitado pero no se encontró en la base de datos o no es accesible. Repórtelo al administrador de Gestivo.`
    );
  }
  return { recurso, doc: obtenerDocRecurso(recurso.name), esquema };
}

function nombresColumnas(ctx: Contexto): string[] {
  return ctx.esquema.columnas.map((c) => c.nombre);
}

function columnaViva(ctx: Contexto, nombre: string): ColumnaViva | undefined {
  return ctx.esquema.columnas.find((c) => c.nombre === nombre);
}

function exigirColumna(ctx: Contexto, nombre: string, uso: string): ColumnaViva {
  const columna = columnaViva(ctx, nombre);
  if (columna) return columna;
  const disponibles = nombresColumnas(ctx);
  const parecidas = sugerir(nombre, disponibles);
  throw new ErrorConsulta(
    `La columna '${nombre}' (usada en ${uso}) no existe en ${ctx.recurso.name}.` +
      (parecidas.length ? ` ¿Quiso decir: ${parecidas.join(", ")}?` : "") +
      ` Columnas disponibles: ${disponibles.join(", ")}.`
  );
}

function esSensible(ctx: Contexto, columna: string): boolean {
  return ctx.doc?.columnas[columna]?.sensible === true;
}

function horaLocalEtiquetadaUtc(ctx: Contexto, columna: string): boolean {
  return /etiquetada como UTC/i.test(ctx.doc?.columnas[columna]?.formato ?? "");
}

function identificador(ctx: Contexto): string {
  return ctx.doc?.identificador ?? resourceIdColumn(ctx.recurso);
}

type DocColumnaRespuesta = Omit<DocColumna, "sensible"> & {
  tipo: string;
  sensible?: true;
};

const SIN_DOCUMENTACION =
  "Sin documentación semántica en el catálogo: no deduzca su significado solo por el nombre; si es importante para la respuesta, dígale al usuario que el significado no está documentado.";

function documentarColumna(ctx: Contexto, nombre: string): DocColumnaRespuesta {
  const viva = columnaViva(ctx, nombre);
  const doc = ctx.doc?.columnas[nombre];
  return {
    tipo: viva?.tipo ?? "desconocido",
    descripcion: doc?.descripcion ?? SIN_DOCUMENTACION,
    unidad: doc?.unidad,
    valores: doc?.valores ?? viva?.valoresEnum ?? undefined,
    formato: doc?.formato,
    relacion: doc?.relacion,
    advertencia: doc?.advertencia,
    sensible: doc?.sensible ? true : undefined,
  };
}

function documentarColumnas(ctx: Contexto, nombres: string[]): Record<string, DocColumnaRespuesta> {
  return Object.fromEntries(nombres.map((n) => [n, documentarColumna(ctx, n)]));
}

function encabezado(ctx: Contexto) {
  return {
    recurso: ctx.recurso.name,
    titulo: ctx.doc?.titulo ?? ctx.recurso.name,
    granularidad: ctx.doc?.granularidad ?? "Sin documentar: no se sabe con certeza qué representa una fila.",
  };
}

// ── Filtros ───────────────────────────────────────────────────────────────────

type FiltroAplicado = Filtro & { origen: "agente" | "por_defecto"; motivo?: string };

function prepararFiltros(
  ctx: Contexto,
  filtros: Filtro[] | undefined,
  aplicarPorDefecto: boolean
): { filtros: FiltroAplicado[]; avisos: string[] } {
  const avisos: string[] = [];
  const aplicados: FiltroAplicado[] = [];

  for (const f of filtros ?? []) {
    exigirColumna(ctx, f.columna, "un filtro");
    if (!OPERADORES.includes(f.operador)) {
      throw new ErrorConsulta(
        `Operador '${f.operador}' no permitido. Use: ${OPERADORES.join(", ")}.`
      );
    }
    if (f.operador === "is_null" || f.operador === "not_null") {
      aplicados.push({ columna: f.columna, operador: f.operador, origen: "agente" });
      continue;
    }
    if (f.operador === "in") {
      const lista = Array.isArray(f.valor)
        ? f.valor
        : typeof f.valor === "string"
          ? f.valor.split(",").map((v) => v.trim())
          : [];
      if (lista.length === 0) {
        throw new ErrorConsulta(`El filtro 'in' sobre ${f.columna} necesita una lista de valores no vacía.`);
      }
      aplicados.push({ columna: f.columna, operador: "in", valor: lista, origen: "agente" });
      continue;
    }
    if (f.valor === undefined || f.valor === null || Array.isArray(f.valor)) {
      throw new ErrorConsulta(
        `El filtro '${f.operador}' sobre ${f.columna} necesita un único valor. Para nulos use is_null o not_null; para listas, in.`
      );
    }
    aplicados.push({ columna: f.columna, operador: f.operador, valor: f.valor, origen: "agente" });
  }

  const porDefecto = ctx.doc?.filtroPorDefecto;
  if (porDefecto && columnaViva(ctx, porDefecto.columna)) {
    if (!aplicarPorDefecto) {
      avisos.push(
        `Filtro por defecto DESACTIVADO a petición (${porDefecto.columna}): los resultados incluyen lo que normalmente se excluye. Motivo del filtro: ${porDefecto.motivo}`
      );
    } else if (aplicados.some((f) => f.columna === porDefecto.columna)) {
      avisos.push(
        `No se aplicó el filtro por defecto sobre ${porDefecto.columna} porque la consulta ya filtra esa columna.`
      );
    } else if (porDefecto.valor === null) {
      aplicados.push({
        columna: porDefecto.columna,
        operador: porDefecto.operador === "neq" ? "not_null" : "is_null",
        origen: "por_defecto",
        motivo: porDefecto.motivo,
      });
    } else {
      aplicados.push({
        columna: porDefecto.columna,
        operador: porDefecto.operador === "neq" ? "neq" : "eq",
        valor: porDefecto.valor,
        origen: "por_defecto",
        motivo: porDefecto.motivo,
      });
    }
  }

  return { filtros: aplicados, avisos };
}

// El query builder de supabase-js cambia de tipo con cada método encadenado;
// tiparlo exige genéricos del esquema que este cliente no tiene.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Consulta = any;

function aplicarFiltro(consulta: Consulta, f: FiltroAplicado): Consulta {
  switch (f.operador) {
    case "in":
      return consulta.in(f.columna, f.valor as ValorFiltro[]);
    case "is_null":
      return consulta.is(f.columna, null);
    case "not_null":
      return consulta.not(f.columna, "is", null);
    default:
      return consulta.filter(f.columna, f.operador, f.valor);
  }
}

function describirFiltros(filtros: FiltroAplicado[]) {
  return filtros.map((f) => ({
    columna: f.columna,
    operador: f.operador,
    ...(f.valor !== undefined ? { valor: f.valor } : {}),
    origen: f.origen,
    ...(f.motivo ? { motivo: f.motivo } : {}),
  }));
}

function avisoRecursoGrande(ctx: Contexto, filtros: FiltroAplicado[]): string | null {
  if ((ctx.esquema.filasEstimadas ?? 0) < RECURSO_MUY_GRANDE) return null;
  const fecha = ctx.doc?.columnaFecha;
  if (fecha && filtros.some((f) => f.columna === fecha)) return null;
  return `Este recurso tiene unos ${ctx.esquema.filasEstimadas?.toLocaleString("es-CO")} registros. Filtre por ${fecha ?? "fecha"} para que la consulta sea rápida y el total sea exacto.`;
}

// ── guia_gestivo ──────────────────────────────────────────────────────────────

export async function construirGuia() {
  // Solo se listan los recursos que existen hoy en la base: uno habilitado cuya
  // tabla falta haría que el agente lo elija y reciba un error al consultarlo.
  const habilitados = CATALOGO.filter((d) => getResource(d.nombre));
  const esquemas = await obtenerEsquemas(habilitados.map((d) => d.nombre));
  const noDisponibles = habilitados.filter((d) => !esquemas.has(d.nombre)).map((d) => d.nombre);

  return {
    que_es_gestivo: CONTEXTO_NEGOCIO,
    ahora_en_colombia: ahoraEnColombia(),
    como_trabajar: [
      "1. Elija el recurso por su GRANULARIDAD (qué representa una fila), no solo por el nombre. Varios recursos se parecen y miden cosas distintas.",
      "2. Antes de usar un recurso por primera vez en la conversación, llame describir_recurso: trae las columnas reales, su significado y unidades, los valores posibles, las trampas conocidas y con qué NO confundirlo.",
      "3. Para contar, sumar, promediar o hacer rankings use agregar_datos, que calcula sobre TODAS las filas. Nunca sume ni cuente filas paginadas de consultar_datos.",
      "4. Use consultar_datos para ver registros concretos. En recursos grandes filtre siempre por fecha y pagine con paginacion.siguiente_desplazamiento.",
      "5. Para una persona, resuélvala primero con buscar_conductor (o filtre por cédula como texto exacto) y luego consulte los recursos que indica donde_buscar.",
      "6. Lea los 'avisos', 'advertencias_del_recurso' y la 'advertencia' de cada columna antes de concluir. Si cambian la interpretación, cuénteselos al usuario.",
      "7. Si un término es ambiguo, consulte glosario. Si un dato no está en ningún recurso, dígalo en vez de inferirlo o inventarlo.",
      "8. Al responder, diga de qué recurso y con qué filtros sale cada cifra. Para preguntas sobre hoy o los últimos días, verifique antes estado_de_los_datos.",
      "9. Los datos personales (teléfonos, direcciones, diagnósticos, puntajes de riesgo) solo se piden por nombre y solo si el usuario los necesita.",
    ],
    reglas_generales: REGLAS_GENERALES,
    dominios: ORDEN_DOMINIOS.map((dominio) => ({
      dominio,
      titulo: DOMINIOS[dominio].titulo,
      descripcion: DOMINIOS[dominio].descripcion,
      recursos: habilitados
        .filter((d) => d.dominio === dominio && esquemas.has(d.nombre))
        .map((d) => ({
          recurso: d.nombre,
          titulo: d.titulo,
          resumen: d.resumen,
          granularidad: d.granularidad,
        })),
    })).filter((d) => d.recursos.length > 0),
    ...(noDisponibles.length
      ? {
          recursos_no_disponibles: {
            recursos: noDisponibles,
            motivo:
              "Están habilitados pero sus tablas no existen hoy en la base de datos. No los consulte; si el usuario pregunta por esa información, dígale que no está disponible.",
          },
        }
      : {}),
    terminos_del_glosario: GLOSARIO.map((t) => t.termino),
  };
}

// ── glosario ──────────────────────────────────────────────────────────────────

export function consultarGlosario(termino?: string) {
  if (!termino?.trim()) return { terminos: GLOSARIO };

  const buscado = normalizar(termino);
  const exactos = GLOSARIO.filter(
    (t) =>
      normalizar(t.termino).includes(buscado) ||
      (t.sinonimos ?? []).some((s) => normalizar(s).includes(buscado))
  );
  const enDefinicion = GLOSARIO.filter(
    (t) => !exactos.includes(t) && normalizar(t.definicion).includes(buscado)
  );
  const encontrados = [...exactos, ...enDefinicion].slice(0, 12);

  if (encontrados.length === 0) {
    return {
      terminos: [],
      aviso: `'${termino}' no está en el glosario. Términos parecidos: ${
        sugerir(termino, GLOSARIO.map((t) => t.termino)).join(", ") || "ninguno"
      }. Si es un nombre de columna, use describir_recurso.`,
    };
  }
  return { terminos: encontrados };
}

// ── describir_recurso ─────────────────────────────────────────────────────────

export async function describirRecurso(nombre: string) {
  const ctx = await resolverRecurso(nombre);
  const doc = ctx.doc;
  const vivas = nombresColumnas(ctx);

  return {
    ...encabezado(ctx),
    dominio: doc?.dominio ?? ctx.recurso.domain,
    resumen: doc?.resumen ?? ctx.recurso.description,
    descripcion: doc?.descripcion,
    origen: doc?.origen,
    identificador: identificador(ctx),
    columna_fecha: doc?.columnaFecha ?? null,
    orden_por_defecto: ctx.recurso.defaultOrder ?? doc?.columnaFecha ?? null,
    volumen: doc?.volumen,
    filas_estimadas: ctx.esquema.filasEstimadas,
    columnas_por_defecto: (doc?.columnasPorDefecto ?? []).filter((c) => vivas.includes(c)),
    filtro_por_defecto: doc?.filtroPorDefecto ?? null,
    columnas: ctx.esquema.columnas.map((c) => ({
      nombre: c.nombre,
      nulable: c.nulable,
      ...documentarColumna(ctx, c.nombre),
    })),
    columnas_documentadas_que_no_existen_en_la_base: Object.keys(doc?.columnas ?? {}).filter(
      (c) => !vivas.includes(c)
    ),
    relaciones: doc?.relaciones ?? [],
    advertencias: doc?.advertencias ?? [],
    no_confundir_con: doc?.noConfundirCon ?? [],
    preguntas_tipicas: doc?.preguntasTipicas ?? [],
    ...(ctx.esquema.introspeccion === "parcial"
      ? {
          aviso:
            "No se pudieron leer los tipos de columna de la base (introspección parcial); los nombres sí son reales.",
        }
      : {}),
  };
}

// ── consultar_datos ───────────────────────────────────────────────────────────

export type EntradaConsulta = {
  recurso: string;
  columnas?: string[];
  filtros?: Filtro[];
  orden?: { columna: string; direccion?: "asc" | "desc" };
  limite?: number;
  desplazamiento?: number;
  aplicar_filtro_por_defecto?: boolean;
  incluir_documentacion?: boolean;
};

export async function consultarDatos(entrada: EntradaConsulta) {
  const ctx = await resolverRecurso(entrada.recurso);
  const avisos: string[] = [];
  const disponibles = nombresColumnas(ctx);

  if (!ctx.doc) {
    avisos.push("Este recurso no tiene documentación semántica: interprete las columnas con cautela.");
  }

  let columnas: string[];
  if (entrada.columnas?.length) {
    columnas = [...new Set(entrada.columnas)];
    columnas.forEach((c) => exigirColumna(ctx, c, "columnas"));
    const sensibles = columnas.filter((c) => esSensible(ctx, c));
    if (sensibles.length) {
      avisos.push(
        `La respuesta incluye datos personales o sensibles (${sensibles.join(", ")}). Úselos solo para lo que el usuario pidió.`
      );
    }
  } else {
    const documentadas = ctx.doc?.columnasPorDefecto ?? [];
    const faltantes = documentadas.filter((c) => !disponibles.includes(c));
    if (faltantes.length) {
      avisos.push(`Columnas por defecto que hoy no existen en la base y se omitieron: ${faltantes.join(", ")}.`);
    }
    const porDefecto = documentadas.filter((c) => disponibles.includes(c));
    columnas = porDefecto.length ? porDefecto : disponibles.filter((c) => !esSensible(ctx, c));
  }

  const aplicarPorDefecto = entrada.aplicar_filtro_por_defecto !== false;
  const { filtros, avisos: avisosFiltros } = prepararFiltros(ctx, entrada.filtros, aplicarPorDefecto);
  avisos.push(...avisosFiltros);

  let orden: { columna: string; direccion: "asc" | "desc" } | null = null;
  if (entrada.orden) {
    exigirColumna(ctx, entrada.orden.columna, "el orden");
    orden = { columna: entrada.orden.columna, direccion: entrada.orden.direccion ?? "desc" };
  } else {
    const candidata = ctx.recurso.defaultOrder ?? ctx.doc?.columnaFecha;
    if (candidata && disponibles.includes(candidata)) {
      orden = { columna: candidata, direccion: "desc" };
    }
  }

  const limite = acotar(entrada.limite, LIMITE_FILAS.defecto, 1, LIMITE_FILAS.maximo);
  const desplazamiento = acotar(entrada.desplazamiento, 0, 0, Number.MAX_SAFE_INTEGER);
  const grande = (ctx.esquema.filasEstimadas ?? 0) >= RECURSO_MUY_GRANDE;

  const aviso = avisoRecursoGrande(ctx, filtros);
  if (aviso) avisos.push(aviso);

  const admin = createAdminClient();
  let consulta: Consulta = admin
    .from(ctx.recurso.name)
    .select(columnas.join(","), { count: grande ? "estimated" : "exact" });
  for (const f of filtros) consulta = aplicarFiltro(consulta, f);
  if (orden) {
    consulta = consulta.order(orden.columna, {
      ascending: orden.direccion === "asc",
      nullsFirst: false,
    });
  }
  // Desempate estable: sin él, dos páginas seguidas pueden repetir u omitir filas.
  const id = identificador(ctx);
  if (disponibles.includes(id) && id !== orden?.columna) {
    consulta = consulta.order(id, { ascending: true });
  }
  consulta = consulta.range(desplazamiento, desplazamiento + limite - 1);

  const { data, error, count } = await consulta;
  if (error) throw new ErrorConsulta(traducirError(error));

  const { filas, recortadasPorTamano } = recortarFilas(
    (data ?? []) as Record<string, unknown>[],
    400,
    1500
  );
  if (recortadasPorTamano) {
    avisos.push(
      `Se devolvieron ${filas.length} de ${data.length} filas para no exceder el tamaño de respuesta. Pida menos columnas o continúe con siguiente_desplazamiento.`
    );
  }

  const total = typeof count === "number" ? count : null;
  const hayMas = total !== null ? desplazamiento + filas.length < total : filas.length === limite;

  return {
    ...encabezado(ctx),
    consulta: {
      columnas,
      filtros: describirFiltros(filtros),
      orden,
      limite,
      desplazamiento,
    },
    paginacion: {
      devueltas: filas.length,
      total_que_cumple_filtros: total,
      total_es_estimado: grande,
      hay_mas: hayMas,
      siguiente_desplazamiento: hayMas ? desplazamiento + filas.length : null,
    },
    ...(entrada.incluir_documentacion === false
      ? {}
      : {
          documentacion_columnas: documentarColumnas(ctx, columnas),
          advertencias_del_recurso: ctx.doc?.advertencias ?? [],
          otras_columnas_disponibles: disponibles.filter((c) => !columnas.includes(c)),
        }),
    avisos,
    filas,
  };
}

// ── agregar_datos ─────────────────────────────────────────────────────────────

export type Agrupacion = { columna: string; truncar?: (typeof TRUNCAMIENTOS)[number] };
export type Metrica = { funcion: (typeof FUNCIONES)[number]; columna?: string };

export type EntradaAgregacion = {
  recurso: string;
  agrupar_por?: Agrupacion[];
  metricas?: Metrica[];
  filtros?: Filtro[];
  orden?: (typeof ORDENES_AGREGACION)[number];
  limite?: number;
  aplicar_filtro_por_defecto?: boolean;
};

const NOMBRE_PERIODO: Record<(typeof TRUNCAMIENTOS)[number], string> = {
  hora: "hora (inicio de la hora)",
  dia: "día",
  semana: "semana (lunes de esa semana)",
  mes: "mes (primer día del mes)",
  trimestre: "trimestre (primer día del trimestre)",
  anio: "año (1 de enero)",
};

export async function agregarDatos(entrada: EntradaAgregacion) {
  const ctx = await resolverRecurso(entrada.recurso);
  const avisos: string[] = [];
  const explicacion: Record<string, string> = {};
  const columnasUsadas = new Set<string>();

  const agrupaciones = (entrada.agrupar_por ?? []).map((g) => {
    const columna = exigirColumna(ctx, g.columna, "agrupar_por");
    columnasUsadas.add(g.columna);
    if (!g.truncar) {
      explicacion[g.columna] = `Valor de ${g.columna} que define el grupo.`;
      return { columna: g.columna };
    }
    if (columna.tipo !== "desconocido" && !TIPO_FECHA.test(columna.tipo)) {
      throw new ErrorConsulta(
        `Solo se puede truncar por periodo una columna de fecha; ${g.columna} es ${columna.tipo}.`
      );
    }
    const esTimestamptz = columna.tipo === "timestamp with time zone";
    const zona = esTimestamptz && horaLocalEtiquetadaUtc(ctx, g.columna) ? "UTC" : "America/Bogota";
    explicacion[`${g.columna}_${g.truncar}`] =
      `${g.columna} agrupada por ${NOMBRE_PERIODO[g.truncar]}` +
      (esTimestamptz
        ? zona === "UTC"
          ? ", leída tal cual porque esta columna ya guarda la hora de Colombia etiquetada como UTC."
          : ", convertida a hora de Colombia antes de agrupar."
        : ".");
    return { columna: g.columna, truncar: g.truncar, zona };
  });

  const metricas = entrada.metricas?.length ? entrada.metricas : [{ funcion: "count" as const }];
  for (const m of metricas) {
    if (!FUNCIONES.includes(m.funcion)) {
      throw new ErrorConsulta(`Función '${m.funcion}' no permitida. Use: ${FUNCIONES.join(", ")}.`);
    }
    if (m.funcion === "count" && !m.columna) {
      explicacion.conteo = `Número de filas del grupo. Recuerde: ${ctx.doc?.granularidad ?? "la granularidad del recurso no está documentada"}`;
      continue;
    }
    if (!m.columna) {
      throw new ErrorConsulta(`La métrica '${m.funcion}' necesita 'columna'.`);
    }
    const columna = exigirColumna(ctx, m.columna, "metricas");
    columnasUsadas.add(m.columna);
    if (
      (m.funcion === "sum" || m.funcion === "avg") &&
      columna.tipo !== "desconocido" &&
      !TIPO_NUMERICO.test(columna.tipo)
    ) {
      throw new ErrorConsulta(
        `No se puede aplicar ${m.funcion} a ${m.columna} porque es ${columna.tipo}, no numérica.`
      );
    }
    const unidad = ctx.doc?.columnas[m.columna]?.unidad;
    const textoUnidad = unidad ? ` (${unidad})` : "";
    explicacion[`${m.funcion}_${m.columna}`] = {
      count: `Filas del grupo con ${m.columna} no nulo.`,
      count_distinct: `Cantidad de valores distintos de ${m.columna} en el grupo.`,
      sum: `Suma de ${m.columna}${textoUnidad} en el grupo.`,
      avg: `Promedio de ${m.columna}${textoUnidad} por fila del grupo (ignora nulos).`,
      min: `Valor mínimo de ${m.columna}${textoUnidad} en el grupo.`,
      max: `Valor máximo de ${m.columna}${textoUnidad} en el grupo.`,
    }[m.funcion];
    const advertencia = ctx.doc?.columnas[m.columna]?.advertencia;
    if (advertencia && (m.funcion === "sum" || m.funcion === "avg")) {
      avisos.push(`Sobre ${m.columna}: ${advertencia}`);
    }
  }

  const aplicarPorDefecto = entrada.aplicar_filtro_por_defecto !== false;
  const { filtros, avisos: avisosFiltros } = prepararFiltros(ctx, entrada.filtros, aplicarPorDefecto);
  avisos.push(...avisosFiltros);
  filtros.forEach((f) => columnasUsadas.add(f.columna));

  const aviso = avisoRecursoGrande(ctx, filtros);
  if (aviso) avisos.push(aviso);

  const orden =
    entrada.orden ?? (agrupaciones.some((g) => "truncar" in g) ? "grupo_asc" : "metrica_desc");
  const limite = acotar(entrada.limite, LIMITE_GRUPOS.defecto, 1, LIMITE_GRUPOS.maximo);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mcp_agregar", {
    p_relacion: ctx.recurso.name,
    p_agrupar: agrupaciones,
    p_metricas: metricas,
    p_filtros: filtros.map(({ columna, operador, valor }) => ({ columna, operador, valor })),
    p_orden: orden,
    p_limite: limite,
  });

  if (error) {
    if (error.code === "PGRST202" || /mcp_agregar/.test(error.message)) {
      throw new ErrorConsulta(
        `La agregación no está disponible porque falta aplicar la migración ${MIGRACION_MCP} en la base de datos. Repórtelo al administrador de Gestivo.`
      );
    }
    throw new ErrorConsulta(traducirError(error));
  }

  const resultado = (data ?? { filas: [], total_grupos: 0 }) as {
    filas: Record<string, unknown>[];
    total_grupos: number;
  };
  const filas = resultado.filas ?? [];
  if (resultado.total_grupos > filas.length) {
    avisos.push(
      `Hay ${resultado.total_grupos} grupos y se devuelven ${filas.length} según el orden '${orden}'. Aumente 'limite' (máximo ${LIMITE_GRUPOS.maximo}) o filtre si necesita todos.`
    );
  }

  return {
    ...encabezado(ctx),
    consulta: {
      agrupar_por: agrupaciones,
      metricas,
      filtros: describirFiltros(filtros),
      orden,
      limite,
    },
    resultado: {
      grupos_devueltos: filas.length,
      total_grupos: resultado.total_grupos,
      calculado_sobre: "Todas las filas del recurso que cumplen los filtros (no una muestra).",
    },
    explicacion_de_cada_campo: explicacion,
    documentacion_columnas: documentarColumnas(ctx, [...columnasUsadas]),
    advertencias_del_recurso: ctx.doc?.advertencias ?? [],
    avisos,
    filas,
  };
}

// ── obtener_registro ──────────────────────────────────────────────────────────

export async function obtenerRegistro(recurso: string, id: string, columnasPedidas?: string[]) {
  const ctx = await resolverRecurso(recurso);
  const columnaId = identificador(ctx);
  exigirColumna(ctx, columnaId, "el identificador");
  const disponibles = nombresColumnas(ctx);
  const avisos: string[] = [];

  let columnas: string[];
  if (columnasPedidas?.length) {
    columnas = [...new Set([columnaId, ...columnasPedidas])];
    columnas.forEach((c) => exigirColumna(ctx, c, "columnas"));
  } else {
    columnas = disponibles.filter((c) => !esSensible(ctx, c));
  }
  const sensiblesOmitidas = disponibles.filter((c) => !columnas.includes(c) && esSensible(ctx, c));

  const admin = createAdminClient();
  const { data, error } = await admin
    .from(ctx.recurso.name)
    .select(columnas.join(","))
    .eq(columnaId, id)
    .limit(6);
  if (error) throw new ErrorConsulta(traducirError(error));

  const registros = (data ?? []) as unknown as Record<string, unknown>[];
  if (registros.length === 0) {
    throw new ErrorConsulta(
      `No existe ningún registro en ${ctx.recurso.name} con ${columnaId} = '${id}'. Revise el valor exacto (las cédulas y códigos son texto) o busque con consultar_datos.`
    );
  }
  if (registros.length > 1) {
    avisos.push(
      `${columnaId} no identifica un único registro en ${ctx.recurso.name}: se devuelven hasta 5 coincidencias. Use consultar_datos con más filtros para precisar.`
    );
  }

  const { filas } = recortarFilas(registros.slice(0, 5), 5000, 20000);
  return {
    ...encabezado(ctx),
    identificador: { columna: columnaId, valor: id },
    documentacion_columnas: documentarColumnas(ctx, columnas),
    columnas_sensibles_omitidas: sensiblesOmitidas,
    advertencias_del_recurso: ctx.doc?.advertencias ?? [],
    avisos,
    registros: filas,
  };
}

// ── buscar_conductor ──────────────────────────────────────────────────────────

const RELACION_CONDUCTOR = /^conductores_con_grupo\.(cedula|codigo)$/;

function dondeBuscarConductor() {
  const resultado: { recurso: string; columna: string; contiene: "cedula" | "codigo" }[] = [];
  for (const doc of CATALOGO) {
    if (doc.nombre === "conductores_con_grupo" || !getResource(doc.nombre)) continue;
    for (const [columna, d] of Object.entries(doc.columnas)) {
      const coincidencia = d.relacion?.match(RELACION_CONDUCTOR);
      if (coincidencia) {
        resultado.push({
          recurso: doc.nombre,
          columna,
          contiene: coincidencia[1] as "cedula" | "codigo",
        });
      }
    }
  }
  return resultado;
}

export async function buscarConductor(texto: string, limite = 10) {
  const ctx = await resolverRecurso("conductores_con_grupo");
  const disponibles = nombresColumnas(ctx);
  const columnas = [
    "cedula",
    "codigo",
    "nombre",
    "estado",
    "tipo_conductor",
    "fecha_ingreso",
    "fecha_retiro",
    "grupo_antiguedad",
  ].filter((c) => disponibles.includes(c));

  const buscado = texto.trim();
  if (buscado.length < 2) {
    throw new ErrorConsulta("Escriba al menos 2 caracteres: una cédula, un código o parte del nombre.");
  }
  const tope = acotar(limite, 10, 1, 50);
  const admin = createAdminClient();

  async function ejecutar(aplicar: (c: Consulta) => Consulta) {
    let consulta: Consulta = admin.from("conductores_con_grupo").select(columnas.join(","));
    consulta = aplicar(consulta).order("estado", { ascending: true }).order("nombre").limit(tope);
    const { data, error } = await consulta;
    if (error) throw new ErrorConsulta(traducirError(error));
    return (data ?? []) as Record<string, unknown>[];
  }

  let coincidencias: Record<string, unknown>[];
  let criterio: string;
  if (/^\d+$/.test(buscado)) {
    coincidencias = await ejecutar((c) => c.or(`cedula.eq.${buscado},codigo.eq.${buscado}`));
    criterio = "cédula o código exactos";
    if (coincidencias.length === 0) {
      coincidencias = await ejecutar((c) => c.like("cedula", `%${buscado}%`));
      criterio = "cédula que contiene los dígitos";
    }
  } else {
    const palabras = buscado
      .split(/\s+/)
      .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((p) => p.length > 0);
    coincidencias = await ejecutar((c) =>
      palabras.reduce((q: Consulta, p) => q.ilike("nombre", `%${p}%`), c)
    );
    criterio = "nombre que contiene todas las palabras";
    if (coincidencias.length === 0) {
      const sinTildes = palabras.map((p) => normalizar(p));
      coincidencias = await ejecutar((c) =>
        sinTildes.reduce((q: Consulta, p) => q.ilike("nombre", `%${p}%`), c)
      );
      criterio = "nombre que contiene todas las palabras, sin tildes";
    }
  }

  const avisos: string[] = [];
  if (coincidencias.length === 0) {
    avisos.push(
      "No hay conductores que coincidan. Puede no ser conductor (revise employees para personal administrativo o candidates para aspirantes)."
    );
  } else if (coincidencias.length > 1) {
    avisos.push(
      "Hay varias coincidencias: confirme con el usuario de quién se trata (cédula) antes de consultar sus datos."
    );
  }
  if (coincidencias.length === tope) {
    avisos.push(`Se alcanzó el límite de ${tope} coincidencias: precise la búsqueda.`);
  }

  return {
    criterio,
    coincidencias,
    documentacion_columnas: documentarColumnas(ctx, columnas),
    donde_buscar: dondeBuscarConductor(),
    como_seguir:
      "Filtre cada recurso de donde_buscar con operador eq sobre la columna indicada, usando la cédula o el código como texto exacto. Para totales use agregar_datos con ese mismo filtro.",
    avisos,
  };
}

// ── estado_de_los_datos ───────────────────────────────────────────────────────

const HORAS_SYNC_VENCIDO = 26;

export async function estadoDeLosDatos() {
  const admin = createAdminClient();
  const ahora = Date.now();
  const avisos: string[] = [];

  const { data: sync, error: errorSync } = await admin
    .from("gema_sync_state")
    .select("dataset, last_synced_date, last_run_at, rows_synced")
    .order("dataset");
  if (errorSync) avisos.push(`No se pudo leer el estado de sincronización de GEMA: ${errorSync.message}`);

  const datasets = (sync ?? []).map((s) => {
    const horas = s.last_run_at
      ? Math.round(((ahora - new Date(s.last_run_at).getTime()) / 3_600_000) * 10) / 10
      : null;
    return {
      dataset: s.dataset,
      ultima_corrida_utc: s.last_run_at,
      horas_desde_ultima_corrida: horas,
      marcador_de_fecha: s.last_synced_date,
      filas_ultima_corrida: s.rows_synced,
      al_dia: horas !== null && horas <= HORAS_SYNC_VENCIDO,
    };
  });
  const vencidos = datasets.filter((d) => !d.al_dia).map((d) => d.dataset);
  if (vencidos.length) {
    avisos.push(
      `Datasets sin sincronizar en las últimas ${HORAS_SYNC_VENCIDO} horas: ${vencidos.join(", ")}. Sus datos recientes pueden faltar.`
    );
  }

  const { data: corrida } = await admin
    .from("riesgo_corridas")
    .select("id, corte, ejecutada_at, conductores_puntuados")
    .eq("estado", "ok")
    .order("ejecutada_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ahora_en_colombia: ahoraEnColombia(),
    gema: {
      como_leerlo:
        "La sincronización con GEMA corre cada madrugada a las 03:00 de Colombia. Juzgue la frescura por horas_desde_ultima_corrida: la columna status de la tabla no refleja fallos. El día en curso nunca está completo, y los datos de viajes y cierres de los últimos 45 días pueden cambiar al volver a sincronizarse.",
      datasets,
    },
    riesgo_predictivo: corrida
      ? {
          ultima_corrida_valida: corrida,
          como_leerlo:
            "Use este id como corrida_id en riesgo_conductores para obtener el riesgo vigente. Si el corte no es la fecha de hoy en Colombia, la corrida de hoy no se ha hecho o falló.",
        }
      : { ultima_corrida_valida: null },
    avisos,
  };
}
