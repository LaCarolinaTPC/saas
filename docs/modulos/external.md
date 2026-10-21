# Documentación del Módulo: external

## 1. Visión General y Propósito

### Resumen Ejecutivo
El módulo **`external`** constituye la capa de integración, seguridad y frontera de acceso de solo lectura (Data API y servidor MCP) del sistema de transporte **Gestivo** (SaaS / ERP). Su propósito fundamental es exponer de manera segura, estructurada y auditada la información operativa, logística, administrativa y financiera del sistema hacia clientes externos, integraciones de terceros y agentes de Inteligencia Artificial (MCP - *Model Context Protocol*).

El módulo resuelve el problema del desacoplamiento y la exfiltración indebida de datos mediante una arquitectura basada en **lista blanca (*whitelist*) estricta**, abstracción de las bases de datos de origen (como la sincronización con el sistema legado GEMA, datos de proveedores de combustible como Petromil o campañas de Meta Ads) y un modelo de autorización basado en el principio de menor privilegio (*Fail-Closed*).

### Responsabilidades Principales
1. **Autenticación Externa y Gestión de Llaves API**: Emisión segura (SHA-256), validación e identificación de claves de API dinámicas (`sk_live_...`) y de claves estáticas legadas con protección contra ataques de tiempo (*timing attacks*).
2. **Control de Acceso Granular (RBAC + Recurso)**: Mapeo dinámico entre los módulos del ERP y los recursos expuestos. Diferenciación entre identidades de máquinas (API keys con tipo de usuario fijo) e identidades humanas (usuarios OAuth con permisos individuales).
3. **Catálogo Unificado de Recursos (*Whitelist Boundary*)**: Definición centralizada y declarativa de las tablas y vistas permitidas para consumo externo, garantizando que datos sensibles de autenticación o registros crudos no puedan ser leídos.
4. **Motor de Consultas y Filtrado Seguro**: Ejecución de consultas paginadas, filtrado PostgREST y sanitización estricta de proyecciones (`select`) para evitar inyecciones SQL o la derivación no autorizada de relaciones por clave foránea.
5. **Auditoría e Histórico de Uso**: Registro no bloqueante (*best-effort*) de cada petición entrante en `api_request_logs` y actualización de la última fecha de uso de las claves.

---

## 2. Arquitectura y Estructura de Archivos

### Tabla de Archivos Analizados

| Archivo | Rol / Propósito Principal |
| :--- | :--- |
| `src/lib/external/resources.ts` | **Frontera de Seguridad y Catálogo:** Lista blanca (`EXTERNAL_RESOURCES`) de tablas/vistas expuestas, metadatos y ordenamiento por defecto. |
| `src/lib/external/acceso.ts` | **Lógica de Permisos:** Mapeo de recursos a módulos del sistema. Cálculo de permisos para tipos de usuario (`accesoDeTipo`) y perfiles con permisos individuales (`accesoDeUsuario`). |
| `src/lib/external/api-keys.ts` | **Criptografía de Claves:** Generación de claves `sk_live_...`, extracción de prefijos para la UI y hasheo SHA-256. |
| `src/lib/external/auth.ts` | **Middleware de Autenticación:** Extracción e identificación de claves en headers (`x-api-key`, `Authorization`), logging asíncrono y control de acceso inicial. |
| `src/lib/external/query.ts` | **Motor de Consultas:** Validación de sintaxis `select`, parseo de operadores de filtro, paginación y ejecución mediante el cliente administrador de Supabase. |

### Diagrama de Flujo Conceptual (Flujo de Consulta Externa)

```
[ Cliente Externo / Agente IA ]
               │
               │ HTTP GET /api/external/v1/<recurso>?<filtros>
               ▼
   ┌──────────────────────┐
   │    extractKey()      │ ──► Extrae de 'x-api-key' o 'Authorization: Bearer'
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │ identificarApiKey()  │ ──► Compara hash SHA-256 en 'api_keys' o timingSafeEqual con DATA_API_KEY
   └──────────┬───────────┘
              │
        [¿Clave Válida?] ──NO ──► HTTP 401 Unauthorized + Log ("clave_invalida")
              │ SÍ
              ▼
   ┌──────────────────────┐
   │   accesoDeClave()    │ ──► Determina los recursos permitidos según el user_type
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │      runQuery()      │
   └──────────┬───────────┘
              │
     [¿En Whitelist?] ────NO ──► HTTP 404 Not Found
              │ SÍ
     [¿Tiene Permiso?] ──NO ──► HTTP 403 Forbidden (recursoNoPermitido)
              │ SÍ
              ▼
   ┌──────────────────────┐
   │   validarSelect()    │ ──► Rechaza relaciones embebidas (ej. *, profiles(*)) -> Anti-data-leak
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │  Supabase (Admin)    │ ──► Aplica Filtros (eq, gte, in...), Order, Paginación (limit/offset)
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │   logRequest()       │ ──► Asíncrono / Non-blocking a 'api_request_logs'
   └──────────┬───────────┘
              │
              ▼
   [ Respuesta JSON con Datos + Metadata de Paginación ]
```

---

## 3. Modelos de Datos y Entidades

### Interfaces y Tipos TypeScript Clave

```typescript
// Define las propiedades de un recurso expuesto en la Data API
export type ExternalResource = {
  name: string;            // Nombre real de la tabla o vista en Postgres
  domain: string;          // Dominio de negocio (rotacion, gema, rrhh, etc.)
  description: string;     // Descripción contextual utilizada por la IA/MCP
  defaultOrder?: string;   // Columna predeterminada para ordenar
  idColumn?: string;       // Columna identificadora principal (default: "id")
};

// Resultado del cálculo de permisos de un actor (Usuario o API Key)
export type AccesoDatos = {
  tipo: string | null;           // Rol/UserType (ej. "admin", "tesoreria", null)
  todos: boolean;                // true si es administrador (acceso total)
  recursos: ReadonlySet<string>; // Conjunto de nombres de recursos autorizados
};

// Discriminador para identificar el origen de la autenticación
export type ApiKeyIdentificada =
  | { tipo: "legado" }
  | { tipo: "api_key"; id: string; nombre: string; tipoUsuario: string | null };

// Estructura de filtros para el motor de consultas
export type Filter = {
  column: string;
  op: string; // "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "in" | "is"
  value: unknown;
};

// Entrada estandarizada para consultas dinámicas
export type QueryInput = {
  select?: string;
  filters?: Filter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  offset?: number;
};
```

### Tablas de Base de Datos Interactivas

#### Tablas de Sistema y Control del Módulo:
* **`api_keys`** *(Lectura y Actualización)*: Almacena el hash SHA-256 (`key_hash`), prefijo visible, estado de activación (`is_active`), rol asignado (`user_type`) y marca de tiempo de último uso (`last_used_at`).
* **`api_request_logs`** *(Inserción)*: Registro de auditoría de peticiones con métricas de cliente (método, ruta, IP, query params, User-Agent, resultado).
* **`user_types`** *(Lectura)*: Contiene la definición de módulos autorizados por rol (`modulos`).
* **`profiles`** *(Lectura)*: Perfiles de usuario de la aplicación para extraer su `user_type` y `permisos_individuales`.

#### Tablas y Vistas Expuestas por Negocio (Whitelist - Selección Representativa):
* **Rotación y Operación**: `conductores_con_grupo`, `cierres_diarios`, `viajes_perdidos`, `vehiculos`, `velocidades`, `pv_deltas`, `operativo_preoperacional`.
* **GEMA (Logística y Recaudo)**: `puntos_virtuales`, `viajes_recaudados`, `ingreso_tercero`, `propietarios`, `historico_despacho`, `cumplimientos`, `abonos`, `totales_cajero`.
* **Mantenimiento y Combustible**: `mantenimiento_reportes`, `mantenimiento_alertas`, `combustible_tanqueos`, `camaras_revisiones`.
* **Talento Humano / RRHH / Ausentismo**: `candidates`, `employees`, `procesos_contratacion`, `ausentismo_registros`, `ausentismo_catalogos`.
* **Riesgo Predictivo**: `riesgo_corridas`, `riesgo_conductores`.
* **Financiera y Tesorería**: `vw_financiera_consolidado`, `vw_financiera_flota_mes`, `devengados_entregas`.

---

## 4. Reglas de Negocio y Lógica Crítica

### 1. Política de Seguridad "Falla Cerrado" (*Fail-Closed*)
* Si un recurso agregado a `EXTERNAL_RESOURCES` no es explicitado en la constante `MODULOS_POR_RECURSO` (archivo `acceso.ts`), el sistema no lo expone a ningún usuario regular. **Únicamente los administradores pueden verlo**.
* Si un usuario no posee un `user_type` válido o este ya no existe en la base de datos, el cálculo retorna `SIN_ACCESO` (un conjunto vacío de recursos).

### 2. Diferenciación de Identidad: Máquina vs. Persona
* **Claves API (`sk_live_...`)**: Son tratadas como máquinas. Su acceso se determina únicamente por el rol (`user_type`) que se le otorgó al momento de su creación en la tabla `api_keys`. No reciben ajustes individuales.
* **Usuarios Humanas (OAuth)**: Su acceso es dinámico. Se calcula combinando los módulos de su tipo de usuario (`user_types.modulos`) junto con sus `permisos_individuales` definidos en su perfil, usando la función `modulosEfectivos`. Un cambio de permisos se aplica instantáneamente en la siguiente llamada API.
* **Clave Legada (`DATA_API_KEY`)**: Clave estática definida en variable de entorno que otorga acceso ilimitado (`ACCESO_TOTAL`).

### 3. Protección Criptográfica y Anti-Exfiltración
* **Storage de Claves**: Las claves completas solo existen en memoria al generarse (`generateApiKey`). En la base de datos solo se guarda su hash SHA-256.
* **Comparación en Tiempo Constante**: Para validar la clave legada se utiliza `crypto.timingSafeEqual`, previniendo ataques de análisis de tiempo de respuesta (*timing side-channel attacks*).
* **Sanitización de Proyección `select`**: La función `validarSelect` prohíbe sintaxis complejas de PostgREST como joins implícitos (`*, profiles(*)`). Utiliza la expresión regular `/^[A-Za-z_][A-Za-z0-9_]*$/` para asegurar que solo se soliciten columnas simples de la tabla consultada. Esto previene que se vulneren los límites de la lista blanca mediante relaciones por clave foránea.

### 4. Límites de Paginación y Filtrado
* Paginación obligatoria: Tamaño por defecto = 100 registros (`DEFAULT_LIMIT`). Límite máximo insuperable = 1000 registros (`MAX_LIMIT`).
* Filtros estrictos: Solo se permiten operadores dentro del conjunto blanco: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`.

---

## 5. Puntos de Entrada y Funciones Principales

### Archivo: `src/lib/external/api-keys.ts`

#### `generateApiKey()`
* **Propósito**: Genera un par criptográfico para una nueva API Key.
* **Parámetros**: Ninguno.
* **Retorno**: `{ key: string, prefix: string, hash: string }`
* **Excepciones**: Puede lanzar errores derivados del módulo nativo `crypto` si la entropía falla.

#### `hashApiKey(key: string)`
* **Propósito**: Genera el digest SHA-256 en formato hexadecimal de una string.
* **Parámetros**: `key` - Clave en texto plano.
* **Retorno**: `string` (64 caracteres hex).

---

### Archivo: `src/lib/external/auth.ts`

#### `identificarApiKey(provided: string)`
* **Propósito**: Identifica el tipo y metadata de una clave API sin generar respuesta HTTP.
* **Parámetros**: `provided` - Clave en texto plano enviada por el cliente.
* **Retorno**: `Promise<ApiKeyIdentificada | null>`
* **Comportamiento**:
  1. Compara contra `process.env.DATA_API_KEY` usando tiempo constante.
  2. Si inicia con `sk_live_`, busca en `api_keys` por `key_hash`. Actualiza `last_used_at` de forma asíncrona.

#### `requireApiKey(request: NextRequest)`
* **Propósito**: Middleware de autenticación principal para Serverless Routes.
* **Parámetros**: `request` - Objeto `NextRequest`.
* **Retorno**: `Promise<{ error: NextResponse, acceso?: undefined } | { error: null, acceso: AccesoDatos }>`
* **Errores**: Retorna `NextResponse` con estado `401` si la clave no está presente o es inválida.

---

### Archivo: `src/lib/external/acceso.ts`

#### `accesoDeTipo(tipo: string | null | undefined)`
* **Propósito**: Calcula la lista de recursos autorizados a partir de una llave de rol.
* **Parámetros**: `tipo` - Nombre del tipo de usuario (ej: `"tesoreria"`).
* **Retorno**: `Promise<AccesoDatos>`

#### `accesoDeUsuario(usuarioId: string)`
* **Propósito**: Calcula la lista de recursos para un usuario real del ERP.
* **Parámetros**: `usuarioId` - UUID del usuario en `profiles`.
* **Retorno**: `Promise<AccesoDatos>`

---

### Archivo: `src/lib/external/query.ts`

#### `runQuery(resourceName: string | undefined, input: QueryInput, acceso: AccesoDatos)`
* **Propósito**: Ejecuta la consulta SQL parametrizada a Supabase aplicando seguridad y ordenamiento.
* **Parámetros**:
  * `resourceName`: Nombre del recurso/tabla a consultar.
  * `input`: Parámetros de consulta (filtros, orden, select, paginación).
  * `acceso`: Objeto `AccesoDatos` calculado durante la autenticación.
* **Retorno**: `Promise<NextResponse>` conteniendo el payload estandarizado:
  ```json
  {
    "resource": "puntos_virtuales",
    "count": 100,
    "total": 5420,
    "limit": 100,
    "offset": 0,
    "nextOffset": 100,
    "data": [...]
  }
  ```
* **Respuestas de Error**:
  * `400 Bad Request`: Si falta el nombre del recurso, el operador de filtro no es válido o la cláusula `select` viola las reglas de seguridad.
  * `403 Forbidden`: Si la clave/usuario no tiene acceso al recurso solicitado.
  * `404 Not Found`: Si el recurso no existe en la lista blanca.

---

## 6. Integraciones y Dependencias

### Dependencias Internas del Proyecto (`src/lib`)
* **`@/lib/supabase/admin` (`createAdminClient`)**: Utilizado para instanciar el cliente con privilegios de `service_role`. Esto es fundamental ya que la Data API implementa su propia capa de autorización orientada a recursos e ignora las políticas RLS directas del cliente anon, garantizando un control estricto mediante código TypeScript.
* **`@/lib/permissions-shared`**: Utiliza `modulosEfectivos`, `normalizarIndividuales` y el tipo `ModuleKey` para la resolución modular compartida con el resto del backend de Gestivo.

### Integraciones con Sistemas Externos y Módulos del Dominio
* **GEMA ERP**: Sincronización de despacho, pasajeros, recaudo, parque automotor, tarjetas de operación, tiquetería y cajas.
* **Mantenimiento y Petromil**: Consulta de datos de tanqueo de ACPM y bitácoras de fallas mecánicas.
* **Meta Ads**: Datos de campañas publicitarias y gasto diario para atracción de conductores/candidatos.
* **Riesgo Predictivo**: Exposición de los scores y salidas de los modelos de Machine Learning/analítica predictiva para la prevención de deserción y faltas de conductores.

### Librerías Externas
* **`crypto` (Módulo nativo de Node.js)**: Utilizado para `createHash("sha256")`, `randomBytes(24)` y `timingSafeEqual`.
* **`next/server` (`NextRequest`, `NextResponse`)**: Integración directa con los Route Handlers de Next.js App Router.