import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { EXTERNAL_RESOURCES } from "@/lib/external/resources";
import {
  ErrorConsulta,
  FUNCIONES,
  LIMITE_FILAS,
  LIMITE_GRUPOS,
  OPERADORES,
  ORDENES_AGREGACION,
  TRUNCAMIENTOS,
  agregarDatos,
  buscarConductor,
  construirGuia,
  consultarDatos,
  consultarGlosario,
  describirRecurso,
  estadoDeLosDatos,
  obtenerRegistro,
} from "@/lib/mcp/consultas";
import { obtenerDocRecurso } from "@/lib/mcp/catalogo";

// Definición del servidor MCP de Gestivo: herramientas, recursos y prompts.
// Se crea una instancia por petición HTTP (modo sin estado), así que aquí no
// debe quedar nada que dependa de una sesión.

export const VERSION_MCP = "1.0.0";

const INSTRUCCIONES = `Servidor de datos de Gestivo, la plataforma de gestión humana y operativa de La Carolina (transporte de pasajeros en busetas). Es de SOLO LECTURA.

Cómo trabajar para no confundir información:
1. Llame guia_gestivo al empezar: explica el negocio, la fecha actual en Colombia, las reglas de los datos y qué representa cada recurso.
2. Llame describir_recurso antes de consultar un recurso por primera vez.
3. Cuente, sume y rankee con agregar_datos (calcula sobre todas las filas). No sume filas paginadas de consultar_datos.
4. Resuelva a una persona con buscar_conductor antes de consultar sus datos.
5. Respete los avisos y advertencias de cada respuesta. Si un dato no existe, dígalo: no lo invente.`;

const ANOTACIONES = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export type RegistrarLlamada = (
  herramienta: string,
  argumentos: unknown,
  resultado: "ok" | "error"
) => Promise<void>;

function respuesta(datos: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(datos) }] };
}

async function ejecutar(
  herramienta: string,
  argumentos: unknown,
  registrar: RegistrarLlamada,
  fn: () => Promise<unknown> | unknown
): Promise<CallToolResult> {
  try {
    const datos = await fn();
    await registrar(herramienta, argumentos, "ok");
    return respuesta(datos);
  } catch (e) {
    await registrar(herramienta, argumentos, "error");
    if (e instanceof ErrorConsulta) {
      return { ...respuesta({ error: e.message }), isError: true };
    }
    console.error(`[mcp] error inesperado en ${herramienta}:`, e);
    return {
      ...respuesta({
        error:
          "Error interno del servidor de Gestivo. Reintente una vez; si persiste, informe al usuario que la herramienta falló en lugar de suponer datos.",
      }),
      isError: true,
    };
  }
}

// ── Esquemas de entrada compartidos ───────────────────────────────────────────

const recursoSchema = z
  .string()
  .min(1)
  .describe("Nombre exacto del recurso tal como aparece en guia_gestivo, p. ej. cierres_diarios.");

const valorSimple = z.union([z.string(), z.number(), z.boolean()]);

const filtrosSchema = z
  .array(
    z.object({
      columna: z.string().describe("Nombre real de la columna."),
      operador: z
        .enum(OPERADORES)
        .describe(
          "eq (=), neq (≠), gt (>), gte (≥), lt (<), lte (≤), like / ilike (texto con % como comodín; ilike ignora mayúsculas), in (valor = lista), is_null y not_null (sin valor)."
        ),
      valor: z
        .union([valorSimple, z.array(z.union([z.string(), z.number()]))])
        .optional()
        .describe("Valor a comparar. Fechas en AAAA-MM-DD. Cédulas y códigos como texto. Lista solo con in."),
    })
  )
  .max(20)
  .optional()
  .describe(
    "Condiciones combinadas con Y. Para un rango de fechas use dos filtros sobre la misma columna: gte con la fecha inicial y lte con la final."
  );

const aplicarFiltroPorDefectoSchema = z
  .boolean()
  .optional()
  .describe(
    "Por defecto true. Algunos recursos excluyen siempre ciertas filas (p. ej. registros eliminados o anulados; describir_recurso lo indica). Use false solo si necesita ver precisamente esas filas."
  );

// ── Servidor ──────────────────────────────────────────────────────────────────

export function crearServidorMcp(registrar: RegistrarLlamada): McpServer {
  const servidor = new McpServer(
    { name: "gestivo", title: "Gestivo", version: VERSION_MCP },
    { instructions: INSTRUCCIONES }
  );

  servidor.registerTool(
    "guia_gestivo",
    {
      title: "Guía de Gestivo",
      description:
        "LLÁMELA PRIMERO en cada conversación. Explica qué es Gestivo y a qué empresa sirve, da la fecha y hora actual en Colombia, dice cómo usar estas herramientas sin confundir datos, lista las reglas generales (identificadores, fechas y zona horaria, dinero, estados) y muestra el mapa de dominios con cada recurso y su granularidad (qué representa una fila).",
      annotations: ANOTACIONES,
    },
    async () => ejecutar("guia_gestivo", {}, registrar, () => construirGuia())
  );

  servidor.registerTool(
    "describir_recurso",
    {
      title: "Describir un recurso",
      description:
        "Documentación completa de UN recurso antes de consultarlo: columnas reales con tipo, significado, unidad y valores posibles; identificador, columna de fecha, columnas y filtro por defecto; relaciones con otros recursos; trampas conocidas; con qué NO confundirlo y ejemplos de preguntas y cómo responderlas. Llámela la primera vez que vaya a usar cada recurso.",
      inputSchema: { recurso: recursoSchema },
      annotations: ANOTACIONES,
    },
    async (args) => ejecutar("describir_recurso", args, registrar, () => describirRecurso(args.recurso))
  );

  servidor.registerTool(
    "consultar_datos",
    {
      title: "Consultar registros",
      description: `Lee registros de un recurso con filtros, orden y paginación. Cada respuesta trae la documentación de las columnas devueltas, los filtros realmente aplicados (incluido el filtro por defecto del recurso), el total de registros que cumplen los filtros y avisos. Úsela para ver registros concretos o listas cortas. NO la use para contar, sumar, promediar ni rankear: para eso use agregar_datos, que calcula sobre todas las filas. Sin 'columnas' devuelve solo las columnas por defecto del recurso, que nunca incluyen datos sensibles; pida las demás por nombre. Máximo ${LIMITE_FILAS.maximo} filas por página.`,
      inputSchema: {
        recurso: recursoSchema,
        columnas: z
          .array(z.string())
          .max(80)
          .optional()
          .describe("Columnas a devolver. Si se omite, se usan las columnas por defecto del recurso."),
        filtros: filtrosSchema,
        orden: z
          .object({
            columna: z.string(),
            direccion: z.enum(["asc", "desc"]).optional().describe("Por defecto desc."),
          })
          .optional()
          .describe("Orden de las filas. Si se omite, lo más reciente primero."),
        limite: z
          .number()
          .int()
          .min(1)
          .max(LIMITE_FILAS.maximo)
          .optional()
          .describe(`Filas por página (por defecto ${LIMITE_FILAS.defecto}).`),
        desplazamiento: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Filas a saltar. Para la página siguiente use paginacion.siguiente_desplazamiento."),
        aplicar_filtro_por_defecto: aplicarFiltroPorDefectoSchema,
        incluir_documentacion: z
          .boolean()
          .optional()
          .describe(
            "Por defecto true. Póngalo en false solo al pedir páginas siguientes de una consulta cuya documentación ya recibió."
          ),
      },
      annotations: ANOTACIONES,
    },
    async (args) => ejecutar("consultar_datos", args, registrar, () => consultarDatos(args))
  );

  servidor.registerTool(
    "agregar_datos",
    {
      title: "Contar, sumar y agrupar",
      description:
        "Calcula en la base sobre TODAS las filas que cumplen los filtros: conteos, conteos de valores distintos, sumas, promedios, mínimos y máximos, agrupados por columnas y, si quiere, por periodo de una columna de fecha (hora, día, semana, mes, trimestre o año, en hora de Colombia). Es la herramienta correcta para '¿cuántos…?', '¿quién tiene más…?', 'total por mes' o 'promedio por ruta'. La respuesta explica qué mide cada campo y documenta las columnas usadas. Lea los avisos: algunas columnas no se deben sumar (p. ej. contadores acumulados).",
      inputSchema: {
        recurso: recursoSchema,
        agrupar_por: z
          .array(
            z.object({
              columna: z.string(),
              truncar: z
                .enum(TRUNCAMIENTOS)
                .optional()
                .describe("Solo para columnas de fecha: agrupa por ese periodo."),
            })
          )
          .max(5)
          .optional()
          .describe("Columnas que definen los grupos. Sin agrupar, devuelve una sola fila con el total."),
        metricas: z
          .array(
            z.object({
              funcion: z.enum(FUNCIONES).describe("count sin columna cuenta filas; count_distinct cuenta valores distintos."),
              columna: z.string().optional().describe("Obligatoria salvo en count."),
            })
          )
          .max(8)
          .optional()
          .describe("Métricas a calcular. Por defecto, count (número de filas)."),
        filtros: filtrosSchema,
        orden: z
          .enum(ORDENES_AGREGACION)
          .optional()
          .describe(
            "metrica_desc (la primera métrica de mayor a menor; por defecto), metrica_asc, o grupo_asc (series de tiempo; por defecto si agrupa por periodo)."
          ),
        limite: z
          .number()
          .int()
          .min(1)
          .max(LIMITE_GRUPOS.maximo)
          .optional()
          .describe(`Grupos a devolver (por defecto ${LIMITE_GRUPOS.defecto}).`),
        aplicar_filtro_por_defecto: aplicarFiltroPorDefectoSchema,
      },
      annotations: ANOTACIONES,
    },
    async (args) => ejecutar("agregar_datos", args, registrar, () => agregarDatos(args))
  );

  servidor.registerTool(
    "obtener_registro",
    {
      title: "Obtener un registro",
      description:
        "Trae un registro completo por su identificador (ver 'identificador' en describir_recurso), con todas sus columnas no sensibles documentadas. Las columnas sensibles se omiten y se listan; pídalas en 'columnas' solo si el usuario las necesita.",
      inputSchema: {
        recurso: recursoSchema,
        id: z.string().min(1).describe("Valor del identificador, como texto exacto."),
        columnas: z
          .array(z.string())
          .max(80)
          .optional()
          .describe("Columnas específicas, incluidas las sensibles si hacen falta."),
      },
      annotations: ANOTACIONES,
    },
    async (args) =>
      ejecutar("obtener_registro", args, registrar, () =>
        obtenerRegistro(args.recurso, args.id, args.columnas)
      )
  );

  servidor.registerTool(
    "buscar_conductor",
    {
      title: "Buscar conductor",
      description:
        "Encuentra conductores, activos y retirados, por cédula, código de conductor o parte del nombre en el maestro (conductores_con_grupo). Úsela para identificar a la persona antes de consultar sus datos y para no confundir homónimos. Devuelve además en qué recursos y con qué columna buscar a ese conductor.",
      inputSchema: {
        texto: z.string().min(2).describe("Cédula, código o parte del nombre."),
        limite: z.number().int().min(1).max(50).optional().describe("Máximo de coincidencias (por defecto 10)."),
      },
      annotations: ANOTACIONES,
    },
    async (args) =>
      ejecutar("buscar_conductor", args, registrar, () => buscarConductor(args.texto, args.limite))
  );

  servidor.registerTool(
    "glosario",
    {
      title: "Glosario del negocio",
      description:
        "Define términos del negocio de Gestivo (timbradas, viajes perdidos, cierre, devengados, quincena, IT, novedad, cartulina, FET…) y advierte las palabras que significan cosas distintas según el módulo. Sin 'termino' devuelve el glosario completo.",
      inputSchema: {
        termino: z.string().optional().describe("Palabra o expresión a buscar."),
      },
      annotations: ANOTACIONES,
    },
    async (args) => ejecutar("glosario", args, registrar, () => consultarGlosario(args.termino))
  );

  servidor.registerTool(
    "estado_de_los_datos",
    {
      title: "Frescura de los datos",
      description:
        "Indica qué tan actualizados están los datos: última sincronización de cada conjunto de GEMA (conductores, cierres, viajes, puntos virtuales…), última corrida válida del riesgo predictivo y fecha y hora actual en Colombia. Consúltela antes de afirmar algo sobre hoy, ayer o los últimos días.",
      annotations: ANOTACIONES,
    },
    async () => ejecutar("estado_de_los_datos", {}, registrar, () => estadoDeLosDatos())
  );

  // ── Recursos MCP (para clientes que los adjuntan como contexto) ─────────────

  servidor.registerResource(
    "guia",
    "gestivo://guia",
    {
      title: "Guía de Gestivo",
      description: "Negocio, reglas generales y mapa de recursos con su granularidad.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify(await construirGuia()) },
      ],
    })
  );

  servidor.registerResource(
    "glosario",
    "gestivo://glosario",
    {
      title: "Glosario de Gestivo",
      description: "Vocabulario del negocio y términos ambiguos.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(consultarGlosario()) }],
    })
  );

  servidor.registerResource(
    "recurso",
    new ResourceTemplate("gestivo://recursos/{nombre}", {
      list: async () => ({
        resources: EXTERNAL_RESOURCES.map((r) => ({
          uri: `gestivo://recursos/${r.name}`,
          name: r.name,
          title: obtenerDocRecurso(r.name)?.titulo ?? r.name,
          description: obtenerDocRecurso(r.name)?.resumen ?? r.description,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Documentación de un recurso",
      description: "Lo mismo que describir_recurso, como recurso adjuntable.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const nombre = String(Array.isArray(variables.nombre) ? variables.nombre[0] : variables.nombre);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(await describirRecurso(nombre)),
          },
        ],
      };
    }
  );

  // ── Prompts ─────────────────────────────────────────────────────────────────

  servidor.registerPrompt(
    "analizar_conductor",
    {
      title: "Analizar un conductor",
      description: "Panorama de un conductor cruzando los módulos de Gestivo, sin mezclar fuentes.",
      argsSchema: {
        conductor: z.string().describe("Cédula, código o nombre del conductor."),
      },
    },
    ({ conductor }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Analiza al conductor "${conductor}" con los datos de Gestivo.

1. Llama guia_gestivo si aún no lo hiciste y luego buscar_conductor. Si hay más de una coincidencia, pregúntame cuál es antes de seguir.
2. Con su cédula, revisa con agregar_datos y consultar_datos los recursos que indique donde_buscar: producción (cierres_diarios), viajes perdidos imputables a él, ausencias del día (ausentismo_registros), incapacidades (ausentismo), accidentes y riesgo predictivo vigente (según estado_de_los_datos).
3. Antes de usar cada recurso, llama describir_recurso y respeta sus advertencias.
4. Presenta los hallazgos por módulo, diciendo de qué recurso y periodo sale cada cifra y la frescura de los datos. No mezcles incapacidades con ausencias diarias, ni presentes el riesgo predictivo como un hecho.`,
          },
        },
      ],
    })
  );

  return servidor;
}
