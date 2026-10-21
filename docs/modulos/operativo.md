# Documentación del Módulo: operativo

## 1. Visión General y Propósito

### Resumen Ejecutivo
El módulo **`operativo`** es el corazón operacional del sistema ERP/SaaS para empresas de transporte terrestre de pasajeros. Su propósito principal es supervisar, validar y optimizar la operación diaria de la flota vehicular y sus conductores. 

Resuelve cuatro problemas clave del negocio de transporte:
1. **Cumplimiento Legal y Documental:** Control de vencimientos de documentos normativos (SOAT, Revisión Técnico-Mecánica, Tarjeta de Operación, Pólizas RCC/RCE) combinando datos del sistema central (GEMA) y archivos digitalizados.
2. **Seguridad Operativa (Inspección Preoperacional):** Ejecución de la lista de chequeo diaria de 34 puntos antes de que un vehículo salga a prestar servicio, garantizando la aptitud mecánica y legal.
3. **Eficiencia en Movilidad y Despacho:** Análisis estadístico de tiempos de vuelta por ruta, hora y tipo de día para ajustar la programación horaria en franjas valle, normal y pico.
4. **Seguridad Vial y Telemetría (Excesos de Velocidad):** Agrupación de eventos GPS de exceso de velocidad por conductor y semana, generando reportes para gestión con Recursos Humanos.

### Responsabilidades Principales
* **Gestión de Archivos Seguros:** Subida y firma de URLs temporales (1 hora) en almacenamiento privado de Supabase Storage.
* **Procesamiento de Vencimientos:** Determinación del estado de vigencia documental aplicando la zona horaria de Bogotá y generando semáforos de alerta (`sin_dato`, `vencido`, `critico`, `proximo`, `al_dia`).
* **Calificación Automática Preoperacional:** Determinación del estado del vehículo (`apto`, `apto_obs`, `no_apto`) e integración automática con la apertura de solicitudes en el módulo de Mantenimiento.
* **Perfiles de Movilidad:** Algoritmos de ordenamiento y agrupación probabilística (medianas, percentiles p10–p90) de duración de trayectos.
* **Consolidación de Telemetría GPS:** Agrupación temporal de eventos de exceso de velocidad en incidencias continuas y consolidación semanal por conductor.
* **Motor de Exportación:** Generación en cliente/servidor de archivos CSV, PDF (orientación horizontal con segmentación temática) y hojas complejas de Excel mediante `exceljs`.

---

## 2. Arquitectura y Estructura de Archivos

El módulo aplica un patrón de **Separación de Responsabilidades (SoC)** claro, dividiendo la lógica en tres capas:
* **`*.ts` (Capa de Datos/Servidor):** Consultas a PostgreSQL mediante Supabase Admin (`service_role`).
* **`*-reglas.ts` / `constants.ts` (Lógica Pura / Dominio):** Funciones puras compartidas entre Servidor y Cliente, sin dependencias de base de datos ni UI.
* **`*-export.ts` (Capa de Exportación):** Transformación de estructuras en memoria hacia archivos binarios CSV, PDF o Excel.

### Tabla de Archivos Analizados

| Archivo | Rol dentro del Módulo | Propósito y Contenido |
| :--- | :--- | :--- |
| `src/lib/operativo/archivos.ts` | Almacenamiento | Gestión de archivos binarios en Supabase Storage (bucket privado `operativo`), borrado de compensación y firma de URLs. |
| `src/lib/operativo/constants.ts` | Dominio / Constantes | Tipos compartidos, niveles de vencimiento, colores del semáforo, límites de archivos y helper functions de fechas/formatos. |
| `src/lib/operativo/data.ts` | Acceso a Datos | Consultas principales de tipos de documentos, vencimientos unificados (GEMA + subidos) y fichas vehiculares. Paginado automático PostgREST. |
| `src/lib/operativo/exportar.ts` | Exportación | Funciones para exportar el tablero de vencimientos a PDF segmentado y CSV. |
| `src/lib/operativo/movilidad-reglas.ts` | Lógica de Negocio | Reglas puras para clasificar franjas (pico/valle/normal), calcular bloques de vuelta sugeridos y generar recomendaciones de despacho. |
| `src/lib/operativo/movilidad.ts` | Acceso a Datos | Invocación de funciones RPC en PostgreSQL (`get_movilidad_por_hora_json`) para datos de trayectos y cálculo de festivos en Colombia. |
| `src/lib/operativo/preoperacional-lista.ts` | Dominio / Configuración | Definición estática de la versión del chequeo (`2026-10`), los 34 puntos de inspección, sus niveles críticos y mapeo a conceptos de mantenimiento. |
| `src/lib/operativo/preoperacional-reglas.ts` | Lógica de Negocio | Validación de fallas preoperacionales, cálculo del resultado (`apto`, `apto_obs`, `no_apto`) e indicadores del tablero diario. |
| `src/lib/operativo/preoperacional-data.ts` | Acceso a Datos | Consultas a las tablas de revisiones preoperacionales, conductores, vehículos activos y paginación genérica. |
| `src/lib/operativo/preoperacional-export.ts` | Exportación | Exportador en Excel (`exceljs`) multi-hoja (Revisiones y Detalle de Fallas) para inspecciones preoperacionales. |
| `src/lib/operativo/velocidad-reglas.ts` | Lógica de Negocio | Cálculo de rangos de fechas, división en semanas completas (Lunes-Domingo), clasificación de velocidad y consolidado por conductor. |
| `src/lib/operativo/velocidad.ts` | Acceso a Datos | Invocación de RPC (`get_incidencias_velocidad_json`), parámetros de velocidad y consulta de reportes a RRHH. |
| `src/lib/operativo/velocidad-export.ts` | Exportación | Exportador avanzado de excesos de velocidad a CSV, PDF y Excel matricial multinivel. |

### Diagrama de Flujo Conceptual

```text
                                [ CLIENTE / UI (Next.js) ]
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        │                                   │                                   │
        ▼                                   ▼                                   ▼
 [ Sub-módulo Documentos ]        [ Sub-módulo Preoperacional ]    [ Sub-múltiplo Movilidad / Velocidad ]
        │                                   │                                   │
        ├──────────────┐                    ├──────────────┐                    ├──────────────┐
        ▼              ▼                    ▼              ▼                    ▼              ▼
[constants.ts]   [exportar.ts]      [*-lista.ts]   [*-export.ts]        [*-reglas.ts]  [*-export.ts]
 (Lógica Pura)   (PDF / CSV)        [*-reglas.ts]   (Excel)              (Lógica Pura)  (PDF/CSV/Excel)
        │                                   │                                   │
        └──────────────┬────────────────────┴───────────────────────────────────┘
                       │
                       ▼
            [ Archivos Data / Server ]
       (data.ts, preoperacional-data.ts,
         movilidad.ts, velocidad.ts)
                       │
                       ├─── Supabase Admin (Service Role - Bypasses RLS)
                       │        ├── Storage (Bucket "operativo")
                       │        ├── Tablas SQL (vehiculos, operativo_*, etc.)
                       │        └── RPC (get_movilidad_por_hora_json, get_incidencias_velocidad_json)
                       ▼
            [ Base de Datos PostgreSQL ]
```

---

## 3. Modelos de Datos y Entidades

### Interfaces y Tipos TypeScript Clave

```typescript
// --- CONTROL DOCUMENTAL ---
export type NivelVencimiento = "sin_dato" | "vencido" | "critico" | "proximo" | "al_dia";

export interface TipoDocumento {
  key: string;
  nombre: string;
  columna_gema: string | null; // Sincronización automática con columna DATE de vehiculos
  dias_proximo: number;
  dias_critico: number;
  orden: number;
  activo: boolean;
}

export interface Vencimiento {
  codigo: string;
  placa: string | null;
  ruta: string | null;
  conductor_nombre: string | null;
  tipo: string;
  fecha_gema: string | null;
  fecha_documento: string | null;
  fecha_vigente: string | null; // La más reciente entre GEMA y el documento subido
  discrepancia: boolean;
  dias: number | null;          // Días faltantes según fecha local Bogotá
  nivel: NivelVencimiento;
}

// --- INSPECCIÓN PREOPERACIONAL ---
export type ResultadoPreop = "apto" | "apto_obs" | "no_apto";

export interface PuntoPreop {
  key: string;
  grupo: "motor" | "exterior" | "interior" | "documentos" | "equipo";
  nombre: string;
  critico: boolean;           // Si falla y es crítico -> no_apto
  conceptos: string[];        // Mapeo hacia conceptos del sistema de Mantenimiento
  documentos?: string[];
}

export interface FallaValidada {
  key: string;
  critico: boolean;
  nota: string | null;
  concepto: string | null;    // Concepto técnico asignado para la orden de taller
}

// --- TELEMETRÍA Y VELOCIDAD ---
export interface ParametrosVelocidad {
  umbralKmh: number;          // Umbral de velocidad (ej: 60 km/h)
  minimoIncidencias: number;   // Mínimo semanal para alertar a RRHH (ej: 4)
  minutosAgrupacion: number;  // Ventana temporal para unir eventos GPS (ej: 5 min)
}

export interface Incidencia {
  id: string;                 // Hash estable: vehiculo + timestamp inicio
  vehiculo: string;
  inicio: string;
  fin: string;
  eventos: number;            // Cantidad de puntos GPS registrados
  velocidadMax: number;
  cedula: string | null;      // Asignado por cruce con el despacho
  nombre: string | null;
  ruta: string | null;
}
```

### Tablas y Vistas de Base de Datos Interconectadas

El módulo lee e inserta en las siguientes tablas mediante `createAdminClient()`:

* **Tablas de Catálogo y Configuración:**
  * `operativo_documento_tipos`: Definición de documentos a controlar y sus umbrales de alerta en días.
  * `operativo_velocidad_parametros`: Configuración global de umbrales para telemetría.
* **Tablas Operativas (Transaccionales):**
  * `operativo_vehiculo_documentos`: Histórico de documentos cargados con metadata de archivos y anulaciones.
  * `operativo_preoperacional`: Registro de cabecera de la inspección diaria realizada por el inspector.
  * `operativo_preoperacional_fallas`: Detalle de puntos que fallaron en cada inspección (con `mantenimiento_reporte_id`).
  * `operativo_velocidad_reportes`: Escalaciones y observaciones enviadas formalmente a RRHH.
* **Vistas de Base de Datos:**
  * `vw_operativo_vencimientos`: Consolida el vehículo, los tipos de documento y cruza la fecha registrada en `vehiculos` (GEMA) con el último registro de `operativo_vehiculo_documentos`.
* **Tablas de Integración con otros Módulos / Masters:**
  * `vehiculos`: Maestro de flota de la empresa (sincronizado con GEMA).
  * `conductores`: Maestro de personal operativo.
  * `historico_despacho`: Registros de viajes ejecutados para cruzarlos por horario con eventos de velocidad.
  * `velocidades`: Almacén de registros telemáticos GPS.
* **Funciones PostgreSQL / RPC:**
  * `get_movilidad_por_hora_json(p_desde, p_hasta, p_festivos)`: Agrupa tiempos de recorrido calculando medianas y percentiles (p10, p25, p75, p90).
  * `get_incidencias_velocidad_json(p_desde, p_hasta, p_umbral, p_minutos)`: Agrupa registros GPS raw superiores al umbral y los asocia al conductor despachado a esa hora.
* **Supabase Storage:**
  * Bucket privado: `operativo` (archivos organizados bajo la estructura `{codigo}/{tipo}/{timestamp}-{hash}.{ext}`).

---

## 4. Reglas de Negocio y Lógica Crítica

### 1. Gestión de Vencimientos y Control de Zona Horaria
* **Prioridad de Fecha Vigente:** Se calcula evaluando `fecha_gema` y `fecha_documento`. La más reciente rige el estado. Si ambas están ausentes, se asigna `sin_dato`.
* **Evaluación de Días y Gravedad:**
  * `dias = fecha_vigente - hoyBogota()` (Calculado directamente con días calendario UTC sin instanciar `new Date(ISO)` local, evitando diferencias por la medianoche UTC/Bogotá).
  * Gravedad (0 es el peor): `sin_dato` (0) > `vencido` (1, `dias < 0`) > `critico` (2, `dias <= dias_critico`) > `proximo` (3, `dias <= dias_proximo`) > `al_dia` (4).
* **Política de Sin Dato:** Si no hay fecha registrada, se asume el estado de mayor gravedad (`sin_dato`), exigiendo verificación inmediata para evitar operar vehículos desprotegidos.

### 2. Evaluación de la Inspección Preoperacional
* **Matriz de Reglas para Aptitud Operativa:**
  * Si existen **1 o más fallas críticas** (`critico === true`) OR **1 o más documentos obligatorios vencidos** $\rightarrow$ Resultado: **`no_apto`**.
  * Si existen fallas pero **ninguna es crítica** y no hay documentos vencidos $\rightarrow$ Resultado: **`apto_obs`** (Apto con observación).
  * Si no hay fallas ni documentos vencidos $\rightarrow$ Resultado: **`apto`**.
* **Integración con Mantenimiento:** Cada punto de chequeo tiene asignado uno o varios `conceptos` de taller (ej. `FRENOS`, `MOTOR`, `LUCES DELANTERAS`). Si el punto falla, el inspector asigna un concepto que genera automáticamente una orden en el módulo de Mantenimiento. Puntos como Aseo o Extintor no generan órdenes mecánicas (`conceptos: []`).
* **Excepción de Documentos en Preoperacional:** Únicamente los documentos en estado `vencido` detienen el bus (`no_apto`). El estado `sin_dato` no detiene el vehículo en la revisión preoperacional para evitar paralizaciones por falta de sincronización de pólizas masivas en el sistema central.

### 3. Clasificación Estadística de Movilidad
* **Sensibilidad de Muestra Fiable (`minViajesFiable`):** Para evitar sesgos por pocas observaciones, el número mínimo de viajes requeridos por hora se ajusta según los días consultados:
  $$\text{minViajes} = \min(15, \max(3, \text{dias} \times 2))$$
* **Determinación de Franjas de Tráfico (`pico`, `valle`, `normal`):** Se calcula la mediana ponderada global del día. Una hora específica se considera:
  * **`pico`**: Si su mediana de tiempo supera el promedio del día por encima de la tolerancia ($\max(10 \text{ min}, 5\% \text{ del promedio})$).
  * **`valle`**: Si su mediana de tiempo está por debajo del promedio según la misma tolerancia.
  * **`normal`**: En los demás casos.
* **Bloques de Vuelta Recomendados (`bloquesDeVuelta`):** Horas contiguas cuyos tiempos medidos no difieran en más de 12 minutos (`TOLERANCIA_BLOQUE`) se agrupan en un bloque horaria único. El tiempo sugerido para el bloque se calcula con holgura usando el mayor valor del **Percentil 75 ($P_{75}$)** de esas horas.

### 4. Telemetría de Velocidad y Agrupación Temporal
* **Creación de Incidencias Continuous:** Dos lecturas GPS superiores a `umbralKmh` (ej. 60 km/h) registradas en el mismo vehículo que se encuentren separadas por un intervalo menor a `minutosAgrupacion` (ej. 5 min) se fusionan en **una sola incidencia**.
* **Asignación de Conductor:** La incidencia se cruza con la tabla `historico_despacho`. Se busca la placa/vehículo y la franja `[hora_despacho, hora_llegada]`. Si no hay despacho registrado en esa franja, la incidencia se clasifica como `"sin conductor"` para revisión de flota.
* **Ventana Semanal de RRHH:** El análisis segmenta el tiempo en semanas estrictas de Lunes a Domingo (`lunesDe()`). Si un conductor acumula un número de incidencias en la misma semana mayor o igual a `minimoIncidencias` (default: 4), se marca como **`reportable`** para ser escalado al área de Recursos Humanos.

---

## 5. Puntos de Entrada y Funciones Principales

### Sub-módulo: Archivos (`src/lib/operativo/archivos.ts`)

```typescript
/** Sube un binario al bucket privado "operativo" con ruta única. */
export async function guardarArchivo(
  codigo: string, 
  tipo: string, 
  archivo: Buffer, 
  mimeType: string
): Promise<string | null>

/** Borra un archivo subido (utilizado para reversión en caso de fallar el registro DB). */
export async function eliminarArchivo(ruta: string): Promise<void>

/** Genera URLs firmadas masivas con validez de 1 hora. Returns: Map<ruta, urlSigned> */
export async function firmarArchivos(rutas: (string | null)[]): Promise<Map<string, string>>
```

### Sub-módulo: Vencimientos y Datos (`src/lib/operativo/data.ts`)

```typescript
/** Retorna los tipos de documento activos configurados. */
export async function getTipos(soloActivos = true): Promise<TipoDocumento[]>

/** Obtiene el consolidado de vencimientos calculando niveles y días ajustados a la hora de Bogotá. */
export async function getVencimientos(hoy: string, codigo?: string): Promise<Vencimiento[]>

/** Genera el resumen ejecutivo agrupado por vehículo ordenado por la gravedad de su peor nivel. */
export async function resumenVencimientos(hoy: string): Promise<ResumenVencimientos>
```

### Sub-módulo: Preoperacional (`src/lib/operativo/preoperacional-reglas.ts` & `preoperacional-data.ts`)

```typescript
/** Validaciones puras de notas, límites de caracteres y concepto mecánico asignado. */
export function validarFallas(entrada: FallaEntrada[]): FallaValidada[]

/** Calcula la aptitud operativa (apto, apto_obs, no_apto) según fallas y documentos. */
export function calcularResultado(
  fallas: { critico: boolean }[], 
  docs: DocumentoPreop[]
): ResultadoCalculado

/** Obtiene las revisiones preoperacionales ejecutadas en una fecha dada. */
export async function getRevisionesDia(fecha: string): Promise<RevisionPreop[]>
```

### Sub-módulo: Movilidad (`src/lib/operativo/movilidad.ts` & `movilidad-reglas.ts`)

```typescript
/** Invoca el RPC de PostgreSQL calculando previamente días festivos colombianos del periodo. */
export async function getMovilidadPorHora(desde: string, hasta: string): Promise<FilaMovilidad[]>

/** Procesa el perfil completo de una ruta analizando franjas, bloques y la mejor/peor hora. */
export function perfilRuta(filas: FilaMovilidad[], ruta: string, tipoDia: TipoDia): PerfilRuta

/** Produce reglas y textos de recomendación operativa según el comportamiento del tráfico. */
export function recomendaciones(p: PerfilRuta): Recomendacion[]
```

### Sub-módulo: Velocidad (`src/lib/operativo/velocidad.ts` & `velocidad-reglas.ts`)

```typescript
/** Obtiene incidencias fusionadas y asociadas al conductor despachado. */
export async function getIncidenciasVelocidad(
  desde: string, 
  hasta: string, 
  p: ParametrosVelocidad
): Promise<Incidencia[]>

/** Construye la matriz semanal para consolidar los excesos por conductor. */
export function consolidarPorConductor(grupos: ConductorSemana[]): ConductorConsolidado[]
```

---

## 6. Integraciones y Dependencias

### Integraciones Internas (`src/lib/...`)
* **`src/lib/supabase/admin`:** Exporta `createAdminClient()`. Utiliza la clave `service_role` de Supabase para omitir las políticas de RLS, asumiendo que el middleware de la aplicación o las Server Actions de Gestivo ya han verificado la sesión y permisos del usuario.
* **`src/lib/tesoreria/calendario-pago`:** Importa `festivosColombia(año)`. Necesario para incluir dinámicamente los días festivos colombianos al momento de consultar las métricas de movilidad (los festivos se procesan estadísticamente con la misma regla de un domingo).
* **`src/lib/exportar/csv` & `src/lib/exportar/pdf-tabla`:** Abstracciones compartidas para construir reportes planos e informes PDF horizontales con encabezados, marcas de agua y paleta de colores.

### Dependencias Externas (npm / Node.js)
* **`crypto` (Nativo Node.js):** Uso de `randomBytes(4)` para generar hashes aleatorios e irrepetibles al construir nombres de archivos en el Storage.
* **`exceljs`:** Importado de forma dinámica (`await import("exceljs")`) únicamente en las funciones de exportación. Evita engrosar el bundle inicial de JavaScript del cliente y permite dar estilos celda por celda, fondos ARGB para semáforos, comentarios y congelamiento de paneles en los archivos Excel exportados.
* **`Intl` (JS Native API):** Formateo estricto con zona horaria `America/Bogota` para determinar "hoy" sin interferencia de zonas locales del servidor/navegador.

---

## Resumen de Salida y Estado del Módulo

El módulo **`operativo`** demuestra un diseño altamente robusto:
1. **Puro y Aislado:** La lógica de decisión (fechas, semáforos, aptitud del bus, segmentación de velocidades) vive en archivos `*-reglas.ts` y `constants.ts` totalmente libres de efectos secundarios, facilitando pruebas unitarias.
2. **Resiliente a límites:** Supera la restricción por defecto de PostgREST (1.000 filas por consulta) implementando utilidades de paginación o delegando la agregación masiva a funciones RPC en PostgreSQL (`get_movilidad_por_hora_json` y `get_incidencias_velocidad_json`).
3. **Control Horario Seguro:** Es totalmente inmune a errores comunes de desfasaje de fechas GMT/UTC al manejar cadenas de texto formateadas `YYYY-MM-DD` y formateadores explícitos para la zona horaria de Colombia.