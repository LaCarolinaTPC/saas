# Documentación del Módulo: recruitment

## 1. Visión General y Propósito

### Resumen Ejecutivo
En la industria del transporte y logística, la atracción, selección y contratación de conductores (operadores) es un proceso operacional crítico impactado por alta rotación y escasez de talento. El módulo **`recruitment`** proporciona el motor analítico y de transformación de datos para evaluar la efectividad de las campañas de reclutamiento de la empresa.

Este módulo procesa el embudo de conversión (*funnel*) de postulantes, integrando métricas de prospección digital (p. ej., Meta Ads / Facebook / Instagram / WhatsApp) con la progresión en tiempo real de los candidatos a través del pipeline de selección. Su objetivo principal es ofrecer visibilidad sobre el costo por contratación (CAC de conductores), tasas de conversión por canal, eficiencia del proceso de selección y la salud operativa diaria del reclutamiento.

### Responsabilidades Principales
1. **Atribución y Normalización de Canales:** Clasificar los orígenes de candidatos (`source`) en canales unificados de reclutamiento (WhatsApp, Referidos, Computrabajo, etc.).
2. **Construcción Dinámica del Embudo:** Mapear etapas de selección personalizadas (`pipeline_stages`) para derivar volumetrías diarias de avance, evaluaciones, aptitud y contrataciones.
3. **Agregación de Conversaciones y Leads:** Unificar el flujo de conversaciones generadas por pautas publicitarias (Meta Ads) con los datos de postulación efectiva.
4. **Cálculo de Métricas Financieras y Operativas:** Calcular indicadores clave como el Costo por Contratación (*Cost Per Hire*), conversión porcentual por canal, agregación temporal e indicadores de salud operacional mediante semaforización.

---

## 2. Arquitectura y Estructura de Archivos

El módulo está diseñado bajo el patrón de **Funciones Puras** y **Capa de Dominio Estadístico/Analítico**, independiente de dependencias directas de infraestructura o UI, garantizando alta testeabilidad y rendimiento.

### Archivos Analizados

| Archivo | Rol | Propósito |
| :--- | :--- | :--- |
| `src/lib/recruitment/derive.ts` | **Motor de Mapeo y Transformación** | Convierte filas crudas de la base de datos (candidatos, pauta publicitaria y etapas) en métricas agregadas por día y canal (`DailyMetric[]`). |
| `src/lib/recruitment/funnel.ts` | **Motor de Calculo y KPIs** | Aplica reglas de negocio sobre las métricas diarias para obtener totales globales, métricas por fuente, KPIs de conversión, semáforo operacional y series de tiempo. |

### Diagrama de Flujo Conceptual

```mermaid
flowchart TD
    subgraph Data Sources [Origen de Datos - DB / Supabase]
        A[candidate_vacancy] -->|Candidatos / Stages| D1[deriveDailyMetrics]
        B[meta_spend_daily] -->|Leads / Conversaciones| D1
        C[pipeline_stages] -->|Estructura Pipeline| D1
    end

    subgraph Transformation Layer [src/lib/recruitment/derive.ts]
        D1 -->|Atribución via sourceToChannel| D2[Mapeo por Fecha | Canal]
        D2 -->|Normalización según orden/tipo de etapa| D3[DailyMetric Array]
    end

    subgraph Analytics Layer [src/lib/recruitment/funnel.ts]
        D3 --> E1[computeTotals]
        D3 --> E2[computeSourceStats]
        D3 --> E3[computeKpis]
        D3 --> E4[semaforoDia]
        D3 --> E5[byDate]
        
        GastoMeta[Meta Spend Data] --> E1
    end

    subgraph UI/Reporting Output [Paneles / Dashboards]
        E1 --> Out1[Totales & Costo x Contratación]
        E2 --> Out2[Rendimiento por Canal]
        E3 --> Out3[KPIs de Conversión]
        E4 --> Out4[Semáforo de Salud Diaria]
        E5 --> Out5[Gráficos Diarios de Tendencia]
    end
```

---

## 3. Modelos de Datos y Entidades

### Interfaces y Tipos TypeScript Clave

```typescript
// Define el tipo operacional de una etapa dentro del pipeline dinámico
export interface StageInfo {
  key: string;       // Identificador único de la etapa
  orden: number;     // Posición relativa en el embudo
  tipo: string;      // 'normal' | 'ganado' | 'perdido'
}

// Representación de un candidato en la base de datos
export interface CandidateRow {
  source: string | null;       // Origen del candidato (ej. "Meta Ads", "Referido")
  applied_at: string | null;   // Fecha de postulación ISO String
  current_stage: string | null;// Clave de la etapa actual en la que se encuentra
}

// Registro diario de interacción publicitaria en Meta
export interface MetaDailyRow {
  fecha: string;               // YYYY-MM-DD
  leads: number | null;        // Conversiones/interacciones iniciadas
}

// Métrica agregada diaria por canal (Estructura base del embudo)
export interface DailyMetric {
  fecha: string;
  canal: string;
  conversaciones: number;
  postulantes: number;
  pasan: number;
  continuan: number;
  evaluaciones: number;
  aptos: number;
  contratados: number;
  motivo_fuga: string | null;
}

// Totales consolidados del embudo
export interface FunnelTotals {
  conversaciones: number;
  postulantes: number;
  pasan: number;
  continuan: number;
  evaluaciones: number;
  aptos: number;
  contratados: number;
  contratadosMeta: number;
  gastoMeta: number;
  costoPorContratacion: number | null;
}

// Tipo de semáforo operacional
export type Semaforo = "verde" | "amarillo" | "rojo";
```

### Tablas de Base de Datos Relacionadas (Inferidas)

El módulo interactúa (mediante lecturas previas) con los siguientes modelos persistidos en la base de datos (p. ej., Supabase/PostgreSQL):

1. **`candidate_vacancy`**: Almacena las postulaciones (`applied_at`, `source`, `current_stage`).
2. **`pipeline_stages`**: Almacena la configuración dinámica del flujo de contratación (`key`, `orden`, `tipo`).
3. **`meta_spend_daily`**: Almacena la inversión publicitaria y leads recopilados diariamente por la integración con Meta Ads (`fecha`, `leads`, `gasto`).

---

## 4. Reglas de Negocio y Lógica Crítica

### 1. Normalización de Canales (`sourceToChannel`)
Dado que las fuentes de ingreso de prospectos pueden contener variaciones en texto, la función aplica las siguientes reglas de negocio:
* `WhatsApp`: Si el string incluye "whats", "meta", "facebook" o "instagram".
* `Referido`: Si incluye "refer".
* `Computrabajo`: Si incluye "computrabajo".
* `ManyChat`: Si incluye "manychat".
* `Varylo`: Si incluye "varylo".
* `Otros`: Valor por defecto si no coincide con las reglas anteriores.

### 2. Progresión Dinámica del Pipeline (`deriveDailyMetrics`)
El progreso de los postulantes no asume un pipeline rígido; se adapta dinámicamente según `orden` y `tipo` de la etapa:
* **Primera Etapa (`firstOrden`) / Última Etapa Normal (`lastOrden`):** Se identifican dinámicamente filtrando las etapas con `tipo === 'normal'`.
* **Postulante:** Todo registro con `applied_at` incrementa en +1 la métrica `postulantes`.
* **Pasan:** Candidatos en etapa tipo `'ganado'`, o en etapa no-`'perdido'` cuyo orden sea superior a `firstOrden`.
* **Continúan:** Candidatos en etapa `'normal'` con orden superior a `firstOrden`.
* **Evaluaciones y Aptos:** Candidatos en etapa `'ganado'`, o en etapa no-`'perdido'` cuyo orden sea mayor o igual a `lastOrden`.
* **Contratados:** Únicamente candidatos en etapas con `tipo === 'ganado'`.

### 3. Atribución de Pauta Publicitaria (Meta Ads)
Las conversaciones iniciadas registradas en `meta_spend_daily` se atribuyen directamente al canal **`WhatsApp`** en la fecha correspondiente.

### 4. Cálculo de Costo por Contratación
El costo por contratación se limita exclusivamente a los canales considerados de pago (`META_CHANNELS = ["WhatsApp", "ManyChat", "Varylo"]`):
$$\text{costoPorContratacion} = \frac{\text{gastoMeta}}{\text{contratadosMeta}}$$
*Si $\text{contratadosMeta} = 0$, retorna `null` para evitar divisiones por cero.*

### 5. Criterio del Semáforo Operacional Diario (`semaforoDia`)
Evalúa la eficiencia de reclutamiento de un día particular:
* **Verde (Excelente):** `contratados >= 2` **O** `conversión >= 8%` **O** `continuan >= 5`.
* **Amarillo (Aceptable):** `continuan >= 3` **O** `contratados >= 1` **O** `evaluaciones >= 2`.
* **Rojo (Crítico):** No cumple con ninguna de las condiciones anteriores (bajo rendimiento de atracción/selección).

---

## 5. Puntos de Entrada y Funciones Principales

### En `src/lib/recruitment/derive.ts`

#### `sourceToChannel(source: string | null): string`
* **Parámetros:** `source` (string del origen o null).
* **Retorno:** Nombre normalizado del canal.
* **Excepciones:** Ninguna. Maneja valores nulos o indefinidos devolviendo `"Otros"`.

#### `deriveDailyMetrics(candidates: CandidateRow[], metaDaily: MetaDailyRow[], stages: StageInfo[]): DailyMetric[]`
* **Parámetros:**
  * `candidates`: Listado de postulaciones.
  * `metaDaily`: Registros de leads diarios de Meta.
  * `stages`: Configuración de las etapas del embudo.
* **Retorno:** Un arreglo de `DailyMetric` agrupado por `fecha|canal` y ordenado cronológicamente.
* **Casos Borde:** Si no hay etapas normales, se asume un orden por defecto de `1`. Salta candidatos sin `applied_at`.

---

### En `src/lib/recruitment/funnel.ts`

#### `computeTotals(rows: DailyMetric[], gastoMeta: number): FunnelTotals`
* **Parámetros:** `rows` (Métricas diarias), `gastoMeta` (Monto total invertido en pauta).
* **Retorno:** Objeto `FunnelTotals` con la sumatoria de todos los pasos del embudo y el costo por contratación atribuible a Meta.

#### `computeSourceStats(rows: DailyMetric[]): SourceStat[]`
* **Parámetros:** `rows` (Métricas diarias).
* **Retorno:** Arreglo de métricas por canal, incluyendo total de postulantes, contratados y porcentaje de conversión, ordenado descendentemente por contratados.

#### `computeKpis(t: FunnelTotals): Kpis`
* **Parámetros:** `t` (Totales calculados vía `computeTotals`).
* **Retorno:** Porcentajes de conversión entre etapas:
  * `convAPostulante`: % Conversiones a Postulantes.
  * `cvAContratado`: % CV a Contratado (vía Meta).
  * `convAContratado`: % Conversiones a Contratado Total.

#### `semaforoDia(r: DailyMetric): Semaforo`
* **Parámetros:** `r` (Fila de métrica diaria).
* **Retorno:** `"verde"` | `"amarillo"` | `"rojo"`.

#### `byDate(rows: DailyMetric[]): { fecha: string; postulantes: number; contratados: number; }[]`
* **Parámetros:** `rows` (Métricas diarias).
* **Retorno:** Arreglo agrupado únicamente por `fecha` (consolidando canales) para la renderización de gráficos cronológicos.

---

## 6. Integraciones y Dependencias

### Dependencias Internas y Externas
* **Runtime / Bibliotecas:** No requiere librerías de terceros (Zero external dependencies). Está escrito en TypeScript totalmente puro y funcional.
* **Módulos Internos:** `derive.ts` importa el tipo `DailyMetric` desde `./funnel`.

### Puntos de Integración con el ERP / SaaS
1. **Base de Datos (Supabase / Postgres):**
   * Feed de datos de postulantes cargados mediante la vista o tabla `candidate_vacancy`.
   * Parámetros de etapas configurados en el panel de administración a través de `pipeline_stages`.
2. **Integración Meta Ads / Webhooks:**
   * Módulo de marketing/gastos que alimenta la tabla `meta_spend_daily` (gasto real y conversaciones iniciadas).
3. **Capa de Presentación (Frontend / Dashboards):**
   * Utilizado por componentes React/Next.js de la vista de "Campañas de Reclutamiento" para renderizar KPIs, tablas por fuente, velocímetros de semáforo y gráficos de tendencia.