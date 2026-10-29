Esta documentación técnica describe el módulo de **ausentismo**, un componente crítico del sistema ERP de transporte. Su función es gestionar el ciclo de vida de las novedades de personal, permitiendo el control de incapacidades, permisos y ausencias, así como la generación de indicadores de gestión y soporte para el cobro ante entidades (EPS/ARL).

---

# Documentación del Módulo: ausentismo

## 1. Visión General y Propósito
El módulo de ausentismo resuelve la necesidad de centralizar, auditar y analizar las novedades de asistencia de los conductores y personal operativo. 
- **Problema de negocio:** La alta rotación y complejidad de las incapacidades en el sector transporte, donde los conductores requieren seguimiento preciso ante EPS/ARL, control de reincidencias para evitar el ausentismo injustificado y el cálculo de días "a cargo" para la optimización de recobros.
- **Responsabilidades:**
    - Registro y auditoría de incapacidades y ausencias.
    - Generación de informes de cobro (EPS/ARL).
    - Alerta temprana de reincidencia (descargos/terminación de contrato).
    - Reportes estadísticos (KPIs) de ausentismo para RRHH.

---

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol y Propósito |
| :--- | :--- |
| `auditoria.ts` | Gestión de logs (`ausentismo_log`, `tesoreria_audit_log`). |
| `cobro.ts` | Lógica de agrupación y exportación de informes de recobro (PDF/XLSX). |
| `constants.ts` | Definiciones, reglas de negocio constantes y tipos compartidos. |
| `data.ts` | Capa de acceso a datos (Supabase) para lectura y reincidentes. |
| `exportar.ts` | Lógica de transformación de datos para reportes. |
| `indicadores.ts` | Motor de cálculo de indicadores (KPIs) puro (independiente de UI). |
| `indicadores-pdf/excel.ts` | Generación de reportes de indicadores. |
| `matriz.ts` | Operaciones principales de la Matriz (CRUD de filas). |
| `matriz-reglas.ts` | Reglas de negocio puras (fechas, umbrales de cobro, validación). |
| `periodos.ts` | Lógica para conceptos que cubren rangos (ej. vacaciones). |

---

## 3. Modelos de Datos y Entidades
- **Tablas principales:**
    - `ausentismo`: Tabla central de registros de ausencias.
    - `ausentismo_conceptos`: Catálogo de tipos de ausencia.
    - `ausentismo_log`: Bitácora histórica detallada (auditoría).
    - `ausentismo_notificaciones`: Seguimiento de procesos disciplinarios.
    - `ausentismo_parametros`: Fila única con los días seguidos sin justificar para la citación a descargos y la terminación de contrato (4 y 5 por defecto).
- **Interfaces Clave:**
    - `MatrizFila`: Representa un registro en la matriz.
    - `AusentismoRegistro`: Estructura base de datos para la UI de registros.
    - `Reincidente`: Modelo computado que agrega el historial del conductor con su alerta calculada.

---

## 4. Reglas de Negocio y Lógica Crítica
- **Cálculo de Recobro (`diasACargoPagador`):** La EPS no paga los primeros 2 días de una incapacidad inicial (según la configuración `DIAS_EMPLEADOR_EPS`). La ARL paga desde el día 1 en AT/EL. Las prórrogas se cubren al 100% por el pagador.
- **Reincidencia:**
    - Se basa en conceptos marcados como `cuenta_reincidencia`.
    - Niveles de alerta automáticos: `terminación` (5+ días sin justificar por defecto), `descargos` (4 días por defecto), `critica` (2 faltas no justificadas), `alta` (1 falta o soporte pendiente).
    - Los días de descargos y terminación se configuran en Reincidentes (engranaje junto a «Tipo de reincidencia»), con permiso de editar Ausentismo. Son globales: mueven la alerta, el aviso del día, las notificaciones pendientes, la validación al marcar «notificado» y los informes. El cambio queda en la auditoría general como `reincidencia_parametros`.
- **Periodos:** Conceptos con `cubre_rango` (ej. vacaciones) se expanden automáticamente entre `fecha_inicio` y `fecha_fin` en las vistas diarias.

---

## 5. Puntos de Entrada y Funciones Principales
- **`auditarMatriz`:** Registra cambios en el `ausentismo_log` para fines de auditoría.
- **`getMatriz`:** Punto principal de lectura de datos, aplicando filtros de cobro, paginación y condiciones del conductor.
- **`getReincidentes`:** Función core que procesa el histórico de registros para determinar alertas disciplinarias.
- **`exportarInformeCobro`:** Punto de entrada para el flujo de cobros, generando archivos para la gestión financiera.

---

## 6. Integraciones y Dependencias
- **Supabase:** Uso del cliente `admin` para operaciones de base de datos con privilegios.
- **Librerías internas:** Conexión con `@/lib/exportar/` (CSV, PDF, Excel) para el tratamiento de reportes de salida.
- **Maestro GEMA (conductores/vehículos):** Integración con la tabla `conductores` para validar el estado actual (activo/retirado) del personal afectado, vital para no emitir citaciones a descargos de personas desvinculadas.