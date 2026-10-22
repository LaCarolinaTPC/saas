# Documentación del Módulo: mcp

## 1. Visión General y Propósito
El módulo **`mcp`** (Model Context Protocol) constituye la capa de integración inteligente que permite a agentes de IA interactuar de forma segura, estructurada y consciente del negocio con el ecosistema de datos de Gestivo (operación de transporte).

- **Problema de negocio:** Resuelve la brecha de conocimiento entre una IA genérica y la complejidad del dominio de transporte de La Carolina. Provee un "catálogo semántico" que guía a la IA para evitar errores comunes (como confundir cédulas con códigos de conductor, sumar columnas incorrectas o ignorar las reglas de sincronización de GEMA).
- **Responsabilidades:**
    - Autenticación y registro de uso (bitácora) de peticiones externas.
    - Exposición de un catálogo de recursos con advertencias de negocio obligatorias.
    - Abstracción de consultas a la base de datos (Supabase) mediante una capa de herramientas controlada (consultas, agregaciones y búsquedas).
    - Gestión de esquemas vivos para validar la integridad de las peticiones.

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol | Propósito |
| :--- | :--- | :--- |
| `src/lib/mcp/auth.ts` | Seguridad | Autenticación (API Keys/OAuth) y registro de actividad. |
| `src/lib/mcp/servidor.ts` | Infraestructura | Inicialización del SDK MCP, definición de herramientas y prompts. |
| `src/lib/mcp/consultas.ts` | Lógica Core | Motor de consultas, validación de filtros, seguridad y paginación. |
| `src/lib/mcp/esquema.ts` | Esquema Vivo | Introspección de la base de datos (pg_catalog) para validar existencia de tablas. |
| `src/lib/mcp/catalogo/` | Semántica | **Cerebro del módulo**. Contiene la documentación técnica y reglas de negocio. |

**Diagrama de flujo conceptual:**
`Cliente IA` → `Auth (auth.ts)` → `Servidor MCP (servidor.ts)` → `Motor Consultas (consultas.ts)` → `Catálogo (catalogo/)` + `Esquema (esquema.ts)` → `Supabase (Admin)`

## 3. Modelos de Datos y Entidades
- **Identidades:** `IdentidadMcp` define el tipo de acceso (API Key, Legado, OAuth) y `AccesoDatos` (recursos permitidos).
- **Catálogo Semántico:** Estructurado mediante el tipo `DocRecurso`, que define granularidad, columnas sensibles, advertencias y relaciones semánticas entre tablas de Postgres.
- **Base de datos:** Interactúa dinámicamente con las tablas definidas en `src/lib/external/resources` (ej: `ausentismo`, `cierres_diarios`, `vehiculos`, `accidentes`, etc.) utilizando `supabase-js` con `createAdminClient`.

## 4. Reglas de Negocio y Lógica Crítica
- **Sincronización:** Las tablas provenientes de GEMA tienen latencias (cron 03:00 am). La lógica obliga a consultar el `estado_de_los_datos` antes de realizar análisis temporales.
- **Interpretación de fechas:** Las columnas con `timestamptz` que vienen de GEMA se almacenan etiquetadas como UTC, pero representan hora de Colombia. El motor de consultas está instruido para no aplicar desfases adicionales.
- **Recurrencia y Riesgo:** El módulo de riesgo (`riesgo_conductores`) depende de una corrida (`riesgo_corridas`) vigente. El código implementa una regla estricta: tomar siempre la última ejecución con `estado = 'ok'` basada en `ejecutada_at`.
- **Copia de MGX:** los recursos `mgx_v_*` son vistas sobre la copia del ERP MGX (contabilidad, nómina, empleados e inventarios) de siete empresas. Filtran por defecto `empresa = 'emp0'` (La Carolina), también en `obtener_registro`. Sus fechas no tienen zona, y la copia se sincroniza a mano: `estado_de_los_datos` trae un bloque `mgx` con su frescura. `mgx_v_co_movimientos` exige filtro de fecha (`filtroObligatorio`) y declara `filasAproximadas`, porque la introspección no estima vistas.
- **Sensibilidad:** Datos como diagnósticos, teléfonos, correos y salarios están marcados como `sensible: true`, limitando su exposición por defecto.

## 5. Puntos de Entrada y Funciones Principales
- `guia_gestivo`: Herramienta principal para que la IA entienda el contexto de la empresa antes de operar.
- `describir_recurso(nombre)`: Entrega el contrato de datos del recurso (columnas, advertencias, relaciones).
- `consultar_datos(params)`: Lee registros aplicando filtros de seguridad y paginación.
- `agregar_datos(params)`: Motor de cálculo (sumas, promedios, conteos) que evita sumar filas paginadas y protege contra errores de cálculo (ej: sumas sobre contadores acumulados).
- `buscar_conductor(texto)`: Función de búsqueda unificada para normalizar el cruce por cédula/código.

## 6. Integraciones y Dependencias
- **Supabase:** Uso intensivo de `admin client` para lectura y RPCs (ej: `mcp_columnas`, `mcp_agregar`).
- **MCP SDK:** Dependencia de `@modelcontextprotocol/sdk` para la comunicación estandarizada.
- **MGX:** `src/lib/mgx/esquema.ts` (`sqlVistas()`, `columnasDeVistas()`) es la fuente del SQL de las vistas `mgx_v_*`; el verificador del catálogo exige que cada columna de cada vista esté documentada.
- **Módulos internos:** Conecta con `src/lib/external/acceso.ts` para validación de roles y `src/lib/external/resources.ts` para la lista blanca de tablas expuestas.