Este documento técnico describe el módulo **`mantenimiento`** del sistema SaaS/ERP de transporte, diseñado para gestionar el control de cámaras, sensores, combustible y registros de mantenimiento mecánico (frenos/daños).

---

# Documentación del Módulo: mantenimiento

## 1. Visión General y Propósito
El módulo de mantenimiento es una herramienta crítica para el cumplimiento de estándares operativos y de seguridad en el transporte. Su propósito es:
- **Control de Cámaras y Sensores:** Verificar el estado de los dispositivos de monitoreo y la precisión de los datos de conteo de pasajeros (DFS vs. Aforo) comparados con la recaudación de GEMA.
- **Gestión de Combustible:** Automatizar la conciliación de registros de carga de combustible con las liquidaciones de GEMA, identificando duplicados, desviaciones de precio y diferencias en el consumo.
- **Bitácora de Mantenimiento:** Controlar registros preventivos y correctivos, incluyendo la graduación de frenos (cumplimiento normativo) y el reporte de daños recurrentes.

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol | Propósito |
| :--- | :--- | :--- |
| `camaras-*.ts` | Lógica/Datos | Gestión integral de cámaras, sensores, validación de formularios y análisis de datos históricos. |
| `combustible-*.ts` | Lógica/Datos | Procesamiento de archivos Excel de proveedores, conciliación contra GEMA y manejo de alertas. |
| `danos.ts` / `frenos.ts` | Datos | Acceso a base de datos para reportes de daños, alertas de recurrencia y bitácoras de frenos. |
| `cpa-r-31.ts` | Reportes | Generación de PDFs controlados para el SGC (Sistema de Gestión de Calidad). |
| `colapsables.ts` | UI | Gestión de estado local (localStorage) para persistencia de vistas en la interfaz. |

**Diagrama de flujo de datos:**
`Archivo Excel/Formulario` → `Normalización (Reglas Puras)` → `Cruce (GEMA/Maestro)` → `Base de Datos` → `UI (Tableros/Tablas)`

## 3. Modelos de Datos y Entidades
- **`RevisionCamaras`**: Entidad central para el monitoreo de cámaras. Incluye `vehiculo_codigo`, `viaje`, `aforo`, `con_falla` y `alertas`.
- **`Tanqueo`**: Entidad de combustible que utiliza una `llave` única calculada (`factura|fecha|hora|vehiculo_codigo`) para evitar duplicados.
- **`MaestroVehiculos`**: Estructura clave (Maps) que asocia `codigo` con `placa` para validaciones cruzadas.
- **Integraciones:** Consulta tablas de GEMA (`historico_despacho`, `viajes_recaudados`, `ingreso_tercero`) mediante `Supabase Admin`.

## 4. Reglas de Negocio y Lógica Crítica
- **Semáforo de Diferencias:** Utiliza umbrales dinámicos (`UMBRAL_OK_PASAJEROS`, `UMBRAL_OK_PCT`) para clasificar diferencias entre conteos (caja/sensor) y aforo.
- **Conciliación Inteligente de Combustible:**
    - Detecta automáticamente si una factura fue cargada a dos buses.
    - Corrige internamente buses basándose en la placa reportada frente al `MaestroVehiculos`.
    - Clasifica las causas de diferencia contra GEMA: `duplicado_gema`, `factura_compartida`, `falta_en_gema`, etc.
- **Validación de fechas:** Implementa lógica para detectar "fechas viejas" o "cargues en bloque" (Max filas misma hora) para limpiar datos migrados del Forms.

## 5. Puntos de Entrada y Funciones Principales

| Función | Parámetros | Retorno | Descripción |
| :--- | :--- | :--- | :--- |
| `prepararArchivos` | `archivos[]`, `hoy` | `ArchivoPreparado[]` | Valida y clasifica tanqueos contra la base actual. |
| `validarRevision` | `RevisionEntrada`, `tipos`, `hoy` | `RevisionValidada` | Aplica reglas de negocio antes de persistir una revisión. |
| `conciliarConGema` | `fechas`, `petromil[]`, `gema[]` | `ConciliacionGema` | Lógica central de conciliación de combustibles. |
| `generarPdfCpaR31` | `flota`, `registros`, `fechas` | `Promise<number>` | Genera el formato controlado de mantenimiento de frenos. |

## 6. Integraciones y Dependencias
- **Supabase:** Uso extensivo de `createAdminClient()` (service_role) para saltar políticas RLS, delegando la seguridad de validación a la capa de aplicación (Gestivo).
- **exceljs:** Utilizado para la exportación a Excel con estilos (colores, filtros, semáforos).
- **jspdf / jspdf-autotable:** Motor para la generación de documentos PDF controlados (CPA-R-31).
- **Reglas Puras:** Gran parte de la lógica (como `compararConAforo`) es agnóstica al framework, facilitando las pruebas unitarias y reutilización en clientes y servidores.