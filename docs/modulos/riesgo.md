Esta es la documentación técnica del módulo **`riesgo`**, diseñada para facilitar su mantenimiento y comprensión por parte del equipo de ingeniería.

---

# Documentación del Módulo: riesgo

## 1. Visión General y Propósito
El módulo **`riesgo`** implementa un motor de análisis predictivo dentro del ERP de transporte. Su función es identificar, mediante técnicas de regresión logística, conductores con alta probabilidad de retiro voluntario o ocurrencia de faltas no justificadas.

**Propósito de negocio:**
- **Retención:** Anticipar desvinculaciones para permitir intervenciones preventivas.
- **Disciplina:** Detectar patrones de ausentismo o falta de compromiso operativo.
- **Transparencia:** Sustituir la distribución de reportes informales por una herramienta auditable dentro del sistema, protegiendo datos personales mediante logs de acceso.

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol | Propósito |
| :--- | :--- | :--- |
| `auditoria.ts` | Logging | Registro de actividad (ejecución de corridas, exportaciones, consultas). |
| `corrida.ts` | Orquestador | Lógica principal: entrena modelos y genera el panel de puntuación. |
| `datos.ts` | Data Access | Ingesta de fuentes de datos (GEMA) y limpieza de registros. |
| `exportar.ts` | Presentación | Interfaz para exportación (CSV, XLSX, PDF). |
| `fechas.ts` | Utilidad | Operaciones sobre fechas ISO (cálculos de ventanas, rangos). |
| `modelo.ts` | ML Core | Implementación pura de Regresión Logística y métricas (AUC). |
| `panel.ts` | Transformación | Creación de datos estructurados (conductor x mes). |
| `persistir.ts` | Persistence | Interacción con Supabase para almacenamiento de resultados. |
| `riesgo-pdf.ts` | Reportes | Lógica de renderizado de informes PDF vectoriales. |
| `variables.ts` | Feature Eng | Definición de variables explicativas y normalización de datos. |

**Flujo de Proceso:**
`Fuentes (DB)` → `datos.ts` → `panel.ts` → `modelo.ts` (Entrenamiento) → `corrida.ts` (Puntuación) → `persistir.ts` (Guardado) → `exportar.ts` (UI/PDF).

## 3. Modelos de Datos y Entidades

### Tipos TypeScript clave
- **`Fila`**: Unidad mínima de entrenamiento (conductor + mes + variables + outcome).
- **`Modelo`**: Representa los pesos (`w`), intercepto (`b`) y métricas de rendimiento (AUC, base) del modelo entrenado.
- **`ConductorPuntuado`**: Resultado de la inferencia para un individuo (probabilidades + factores influyentes).

### Tablas de Base de Datos
- `riesgo_corridas`: Almacena el metadato de cada ejecución (estado, fechas, conteos).
- `riesgo_conductores`: Almacena el resultado detallado de la puntuación para cada conductor en una corrida.
- `tesoreria_audit_log`: Bitácora de acceso y auditoría de seguridad del módulo.

## 4. Reglas de Negocio y Lógica Crítica

- **Reproducibilidad:** El módulo utiliza un ordenamiento estable en la lectura de datos (paginación por `id`) para evitar variaciones en los resultados entre ejecuciones.
- **Limpieza de "Comodines":** Se descartan automáticamente fichas con cédulas inválidas (p.ej., `99999999`) que, al ser usadas por sistemas como GEMA para turnos sin conductor, sesgarían el modelo.
- **Modelo Dual:** Se entrenan dos tipos de modelos:
    - **Corte temporal (`mR`, `mN`):** Entrenados con datos históricos, usados para reportar calidad (AUC).
    - **Finales (`fR`, `fN`):** Entrenados con todo el histórico evaluable, usados para la puntuación actual.
- **Cálculo de Riesgo:**
    - **Alto:** Probabilidad $\ge 3\times$ la tasa base.
    - **Medio:** Probabilidad $\ge 1.5\times$ la tasa base.
- **Lectura Estable:** Se valida que el volumen de datos en `viajes_perdidos` y `cierres_diarios` sea idéntico al iniciar y finalizar la lectura para evitar el uso de datos en transiciones de sincronización.

## 5. Puntos de Entrada y Funciones Principales

- `ejecutarCorrida(db, opts)`: Función principal que orquesta todo el ciclo de vida, desde la ingesta hasta la puntuación final.
- `guardarCorrida(...)`: Persiste el resultado en `riesgo_corridas` y `riesgo_conductores`.
- `auditarConsulta(...)`: Registro de seguridad para garantizar que RRHH consulte los datos bajo control, implementando un *debounce* de 5 minutos para evitar spam en el log.
- `exportarRiesgo(...)`: Genera el archivo final dependiendo del `FormatoExport`.

## 6. Integraciones y Dependencias

- **Supabase:** Utilizado mediante `createAdminClient()` (RBAC) para consultas de alta criticidad que no dependen de la sesión del usuario (ej. ejecuciones por cron).
- **Módulos Internos:**
    - `src/lib/devengados/audit`: Centraliza la escritura en `tesoreria_audit_log`.
    - `src/lib/exportar`: Reutilizado para generar archivos CSV/XLSX/PDF estandarizados con los colores corporativos.
- **Matemáticas:** Implementación nativa (sin librerías externas) de regresión logística por lotes con regularización L2 y algoritmo de AUC basado en Mann-Whitney.