Esta es la documentación técnica del módulo **incapacidades**, diseñada para arquitectos y desarrolladores que operan sobre el sistema de transporte (SaaS/ERP).

---

# Documentación del Módulo: incapacidades

## 1. Visión General y Propósito
El módulo **incapacidades** resuelve la gestión operativa del ciclo de vida de recuperación de dinero ante entidades de seguridad social (EPS/ARL) por ausentismo laboral. 
- **Problema:** Automatiza la homologación de incapacidades provenientes de fuentes externas (matrices de datos), su liquidación bajo reglas contables, el seguimiento de radicación ante terceros y la conciliación de saldos (recaudos/ajustes).
- **Responsabilidades:** 
    - Estandarización y homologación de datos recibidos.
    - Ejecución de motores de cálculo de liquidación.
    - Gestión de soportes documentales (adjuntos) asociados al expediente.
    - Auditoría estricta de cambios sobre datos sensibles (salarios, diagnósticos).

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol | Propósito |
| :--- | :--- | :--- |
| `expedientes.ts` | Data Access Layer | Lectura de vistas y estados generales. |
| `liquidacion.ts` | Service Layer | Lógica de negocio (Completar, Ajustar, Liquidar). |
| `liquidacion-reglas.ts`| Domain Logic | Reglas puras de validación y cálculo de ajustes. |
| `motor.ts` | Domain Logic | Motor puro de cálculo financiero (sin acceso a DB). |
| `radicacion.ts` | Service Layer | Estado y flujos de radicación ante entidades. |
| `recaudos.ts` | Service Layer | Aplicación de pagos, ajustes y cierre de expediente. |
| `adjuntos.ts` | Infrastructure | Gestión de archivos (Storage/Supabase). |
| `auditoria.ts` | Cross-cutting | Registro de trazabilidad y logs de consulta. |

**Diagrama de flujo conceptual:**
`Matriz/Alta` → `Homologación` → `Liquidación (Motor)` → `Radicación` → `Recaudo` → `Conciliación/Cierre`.

## 3. Modelos de Datos y Entidades
El módulo interactúa principalmente con:
- **`incapacidad_expedientes`**: Tabla maestra (con control de versiones `version` para prevenir *race conditions*).
- **`vw_incapacidad_expedientes`**: Vista unificada para lectura eficiente en bandejas de trabajo.
- **`incapacidad_liquidaciones`**: Histórico de cálculos vigentes/no vigentes.
- **`incapacidad_ajustes_liquidacion`**: Registro de cambios sobre los datos base.
- **`incapacidad_adjuntos`**: Metadatos de archivos alojados en bucket privado.

**Interfaces clave:**
- `ExpedienteVista`: Representa el estado actual del expediente.
- `ReglaMotor`: Configuración de parámetros de cálculo.
- `AdjuntoConUrl`: Contenedor para archivos con firma temporal de acceso.

## 4. Reglas de Negocio y Lógica Crítica
- **Control de Versiones:** Toda escritura de estado (ajustes/liquidaciones) utiliza `WHERE version = :leida`. Si el registro fue modificado por otro usuario, se lanza `ConflictoVersion`.
- **Motor de Liquidación:**
    - Se basa en el Decreto 1427 de 2022.
    - Diferencia días a cargo de empresa vs. entidad (EPS/ARL).
    - Aplica sobrescrituras de nivel 2: Si el usuario ajusta días/valores, se recalcula la liquidación manteniendo el histórico.
- **Semanas Cotizadas:** Validación crítica para EPS. Bloquea la radicación si el trabajador no cumple con 4 semanas ininterrumpidas (migración 20260929221301), salvo que RRHH acredite manualmente mediante soporte.
- **Conciliación de Saldo:** El saldo operativo se calcula como `valor_reclamado - abonos - ajustes_extintores`. Solo se puede cerrar si el saldo está dentro de la tolerancia configurada o con excepción.

## 5. Puntos de Entrada y Funciones Principales

| Función | Parámetros | Salida | Excepciones |
| :--- | :--- | :--- | :--- |
| `liquidarExpediente` | `id`, `actor`, `opts` | `ResultadoLiquidar` | `FaltanDatos`, `ConflictoVersion` |
| `guardarAdjunto` | `d` (datos archivo), `actor`| `string` (id) | `Error` de Storage/DB |
| `incorporarAltaManual` | `ausentismoId`, `motivo`, `email`| `string` (id) | Error de RPC |
| `radicar` | `id`, `version`, `d`, `actor`| `RadicacionFila` | `ImpideRadicar` |

## 6. Integraciones y Dependencias
- **Supabase (Admin Client):** Uso obligatorio del `service_role` para omitir políticas RLS estándar, dado que el módulo maneja auditoría y estados transaccionales complejos.
- **`lib/exportar`:** Integración para generación de reportes CSV/Excel/PDF con protección de datos personales.
- **`lib/ausentismo`:** Dependencia funcional para leer el maestro de conductores y la matriz de ausentismo original.
- **Auditoría:** Todas las operaciones de escritura disparan registros en `ausentismo_log` o `tesoreria_audit_log` para cumplimiento normativo.