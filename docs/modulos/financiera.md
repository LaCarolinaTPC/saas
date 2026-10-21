Este documento detalla la arquitectura y funcionamiento del módulo `financiera`, componente crítico del sistema SaaS/ERP de transporte, diseñado para la gestión contable y el análisis de rentabilidad de flotas.

---

# Documentación del Módulo: financiera

## 1. Visión General y Propósito
El módulo **financiera** es el motor central de gestión económica del ERP. Su propósito es consolidar la información operativa (viajes, ingresos) proveniente de GEMA con los costos contables (repuestos, nómina, intereses, etc.) para calcular la rentabilidad real de la flota por vehículo y por período.

**Responsabilidades:**
*   **Consolidación Financiera:** Integrar datos operativos y contables para calcular KPIs financieros.
*   **Carga y Auditoría:** Procesar archivos contables (Excel/CSV) externos, validando la integridad contra los datos de GEMA.
*   **Gestión de Ciclo de Vida:** Controlar el estado de los períodos contables (Abierto/Cerrado).
*   **Análisis de Rentabilidad:** Proporcionar vistas analíticas (flota, mantenimiento, comparación) con lógica de negocio para semáforos de desempeño.

---

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol | Propósito |
| :--- | :--- | :--- |
| `motor.ts` | **Núcleo** | Lógica pura de cálculo, fórmulas financieras y reglas de negocio. |
| `analisis.ts` | **Transformación** | Funciones puras sobre datos consolidados (filtros, agregados). |
| `archivo-contable.ts` | **Validación** | Lectura y validación de archivos contables externos (servidor/cliente). |
| `cargar-contable.ts` | **Persistencia** | Capa de datos para escritura en BD de archivos contables. |
| `consolidacion.ts` | **Sync/Estado** | Orquestación de estados de períodos y llamadas a RPC de Supabase. |
| `consulta.ts` | **Acceso a Datos** | Consultas a Supabase (PostgREST) para poblar interfaces de UI. |
| `pantalla.ts` | **Orquestador** | Carga de datos para componentes de UI (Server Side). |
| `exportar.ts` | **Reporting** | Transformación de modelos a formatos de informe (PDF/Excel). |

**Diagrama de Flujo Conceptual:**
`GEMA (Ingresos/Viajes)` + `Archivo Excel (Costos)` → `Validación` → `Upsert en `financiera_contable_mes`` → `Consolidación (SQL)` → `Análisis (TypeScript)` → `UI/Reporte`.

---

## 3. Modelos de Datos y Entidades

*   **`FilaConsolidada`**: Interfaz maestra. Une los datos operativos (viajes, ingresos, GEMA) con los costos contables.
*   **`VehiculoAcumulado`**: Representación agregada por vehículo (suma de periodos).
*   **`FilaArchivo`**: Representa una línea validada de un reporte contable.
*   **Tablas BD clave:**
    *   `financiera_contable_mes`: Almacena el desglose de costos.
    *   `financiera_periodos`: Gestión de estado (abierto/cerrado) de cada mes.
    *   `financiera_cargas`: Bitácora de operaciones (idempotencia y auditoría).
    *   `vw_financiera_consolidado`: Vista SQL que une operativa y contabilidad.

---

## 4. Reglas de Negocio y Lógica Crítica

*   **Idempotencia en Carga:** La carga de archivos contables es idempotente; si se repite, reemplaza el registro por `(periodo, codigo_vehiculo)`.
*   **Prohibición en Cierre:** Un periodo marcado como `cerrado` en `financiera_periodos` bloquea la carga/reversión. Requiere reapertura administrativa.
*   **Cálculo de Utilidad:**
    *   `Utilidad = Ingresos - (Gastos GEMA + Gastos Contables)`.
    *   `Gastos Contables = Despacho + Intereses + Otros + (Repuestos - Fondo Conductor) + Mano de Obra + Nuevos`.
*   **Filtros en Cascada:** La lógica de filtros (Anio → Mes → Flota → Propietario → Vehículo) se implementa en `analisis.ts` mediante `aplicarFiltros` y `opcionesFiltro`, asegurando que las opciones disponibles siempre sean consistentes con la selección previa.
*   **Semáforos:** Clasificación de desempeño (Excelente/Aceptable/Crítico) basada en umbrales configurables en `financiera_parametros`.

---

## 5. Puntos de Entrada y Funciones Principales

*   **`cargarPantalla(sp, opts)`**: Entrypoint para componentes de servidor. Recupera el contexto completo.
*   **`interpretarFilas(tabla)`**: Valida estrictamente la estructura del archivo contable antes de persistir.
*   **`validarContraConsolidado(...)`**: Cruza datos del archivo con el estado actual de la base, detectando incongruencias (ej. vehículos que no tuvieron actividad).
*   **`agruparPorVehiculo(...)`**: Agrega filas individuales en una estructura acumulada para KPIs.

---

## 6. Integraciones y Dependencias

*   **Supabase (Admin Client):** Uso intensivo de `createAdminClient` para operaciones con privilegios elevados (`service_role`).
*   **ExcelJS:** Generación dinámica de plantillas y reportes (fuera del navegador).
*   **Motor de Cálculos:** Totalmente desacoplado de la base de datos para garantizar la consistencia en pruebas unitarias y reportes (PDF/Excel).
*   **SQL Middleware:** La consolidación pesada (cálculo de espejos) reside en funciones RPC de base de datos para mantener el rendimiento.

---

**Nota del Arquitecto:** El módulo implementa un patrón robusto de "Validación en dos capas": una puramente lógica (`archivo-contable.ts`) y otra de contexto de negocio (`consolidacion.ts`), minimizando el riesgo de corromper la integridad financiera mediante cargas erróneas.