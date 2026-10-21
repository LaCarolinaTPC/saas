Esta documentación técnica ha sido preparada para el equipo de ingeniería, describiendo el funcionamiento del módulo `devengados`, pilar fundamental en la gestión de Tesorería de la plataforma de transporte.

---

# Documentación del Módulo: devengados

## 1. Visión General y Propósito
El módulo `devengados` gestiona la liquidación y entrega de efectivo a los conductores, basándose en la producción neta diaria (cierres de GEMA) y las reglas de negocio de la empresa.

**Responsabilidades principales:**
*   Calcular y validar el cupo disponible de dinero para cada conductor (basado en producción neta menos base diaria).
*   Gestionar el ciclo de vida de los pagos: registros en caja, entregas extemporáneas y reversos (devoluciones).
*   Aplicar políticas de control: limitación de un pago diario, autorización de segundos pagos, y bloqueo de conductores.
*   Auditoría de todos los movimientos de Tesorería para asegurar trazabilidad.

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol |
| :--- | :--- |
| `actions.ts` | **Mutaciones:** Lógica de negocio transaccional (Server Actions). |
| `data.ts` | **Consultas:** Capa de acceso a datos (Lectura, Estado del Conductor). |
| `engine.ts` | **Motor:** Lógica pura de cálculo (quincenas, saldos, límites). |
| `audit.ts` | **Bitácora:** Servicio transversal de registro de eventos. |
| `liquidacion.ts`| **Reporting:** Lógica para la vista de liquidación detallada del conductor. |
| `rendimiento.ts`| **Simulador:** Procesamiento de datos de GEMA (timbradas/promedios). |

**Flujo conceptual:**
`UI` -> `Server Actions (actions.ts)` -> `Motor de Cálculo (engine.ts)` -> `Supabase (RPC/Tables)`

## 3. Modelos de Datos y Entidades
*   **`devengados_entregas`:** Tabla principal que almacena cada movimiento de dinero. Contiene campos de auditoría, control de estados (activa, devuelta, reverso) y flags (segundo pago, extemporánea).
*   **`devengados_bloqueos`:** Gestión de restricciones de pago por conductor.
*   **`profiles` / `user_types`:** Validación de permisos para cajeros y administradores.
*   **`cierres_diarios`:** Fuente de verdad para el cálculo de la producción neta del conductor.

**Tipos Clave:**
*   `EstadoConductor`: Representa la foto actual del conductor (resumen de quincena, bloqueos, viajes del día).
*   `ResumenQuincena`: Resultado del motor `engine.ts` con los cálculos de saldo acumulado y disponible.

## 4. Reglas de Negocio y Lógica Crítica
*   **Regla de Oro:** La producción neta del día debe cubrir la **base diaria** antes de generar excedente liberado.
*   **Acumulación:** Si hay déficit en días anteriores, el excedente actual debe cubrir primero ese déficit (el disponible se mantiene en 0 hasta que el acumulado sea positivo).
*   **Límites de Pago:**
    *   Máximo 1 pago estándar por día.
    *   Segundo pago requiere autorización administrativa explícita (credenciales validadas en tiempo real).
*   **Registro Extemporáneo:** Permite a administradores registrar pagos fuera de fecha (con motivo obligatorio), acreditándolos a un cajero específico para fines de cuadre contable.
*   **Bloqueos:** Un bloqueo activo impide cualquier entrega. El cajero recibe el motivo específico del bloqueo.

## 5. Puntos de Entrada y Funciones Principales

| Función | Propósito | Excepciones |
| :--- | :--- | :--- |
| `registrarEntrega` | Crea un movimiento de dinero (débito). | `supera_disponible`, `pago_duplicado`, `limite_pagos_dia`. |
| `registrarEntregaExtemporanea` | Registro retroactivo por parte de admin. | `fecha_futura`, `fecha_no_cerrada`. |
| `registrarDevolucion` | Reversa una entrega y libera el cupo. | `entrega_no_reversible`. |
| `getEstadoConductor` | Retorna el objeto de estado para la UI. | N/A (lectura). |

## 6. Integraciones y Dependencias
*   **Supabase:** Utiliza `createAdminClient` para operaciones con privilegios elevados y `createClient` para operaciones de sesión.
*   **GEMA:** El módulo consume la tabla `cierres_diarios` (cargada externamente) para procesar la producción neta.
*   **Auditoría:** Se utiliza el módulo `audit.ts` para registrar cada cambio de estado (bloqueos, registros, traslados) independientemente del resultado de la operación (el error de auditoría no bloquea la transacción de negocio).
*   **Permisos:** Integración estricta con `@/lib/permissions` para validar acceso a `tesoreria` y sub-módulos (`caja`, `parametros`, `entregas`).