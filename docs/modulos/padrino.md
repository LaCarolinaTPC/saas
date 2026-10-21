Esta es la documentación técnica del módulo `padrino`, diseñada para un entorno de mantenimiento y escalabilidad en un contexto de arquitectura SaaS para el sector transporte.

---

# Documentación del Módulo: `padrino`

## 1. Visión General y Propósito
El módulo **`padrino`** gestiona el programa de incentivos "Plan Padrino", donde empleados y conductores de la empresa recomiendan candidatos para procesos de contratación. El sistema automatiza el ciclo de vida del referido: desde la validación de elegibilidad (basada en políticas internas), pasando por el seguimiento de hitos de permanencia, hasta el pago de bonificaciones mediante su integración con el módulo de nómina/incentivos.

**Responsabilidades:**
- **Validación de Elegibilidad:** Cruce automático de datos con antecedentes de conductores y empleados.
- **Ciclo de Vida:** Gestión de estados (registro, validación, seguimiento, cierre).
- **Gestión de Certificados:** Validación documental de experiencia previa del referido.
- **Liquidación de Hitos:** Cálculo y aprobación de bonos por hitos de permanencia según permanencia efectiva y desempeño.
- **Analítica:** Reportes de efectividad, costos por contratación y alertas de ausentismo.

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol | Propósito |
| :--- | :--- | :--- |
| `actions.ts` | Servidor (Actions) | Entradas principales del sistema (CRUD, estados, validaciones). |
| `archivos.ts` | Utilidades | Validación de tipos MIME y seguridad de archivos (Magic bytes). |
| `datos.ts` | Capa de Acceso (DAL) | Interacción con Supabase; consultas complejas de base de datos. |
| `hitos.ts` | Lógica de Dominio | Funciones puras para evaluar hitos y reglas de pago. |
| `reglas.ts` | Lógica de Dominio | Reglas de negocio (P1-P3, R1-R5) y definiciones de política. |
| `servidor.ts` | Procesos Batch | Lógica interna (bitácoras, sincronización de hitos, incentivos). |
| `tablero.ts` | Analítica | Lógica de cálculo para dashboards y permanencia por fuente. |
| `tablero-datos.ts` | DAL / Dashboards | Lectura de datos para alimentar el tablero de control. |
| `excel.ts` | Exportación | Generación de archivos Excel para nómina. |

## 3. Modelos de Datos y Entidades
- **`padrino_referidos`**: Entidad principal. Almacena la relación Padrino-Referido, estado, esquema de pago (A o B) y resultados de validación.
- **`padrino_hitos`**: Desglose de pagos proyectados. Contiene estados de ejecución (`pendiente`, `aprobado`, `pagado`).
- **`padrino_politicas`**: Definición dinámica de esquemas de pago.
- **Interfaces Clave**:
    - `Validacion`: Estructura del semáforo de cumplimiento para Padrino (P) y Referido (R).
    - `HechosPermanencia`: Snapshot de datos de GEMA (estado del contrato, retiros) usados para determinar si un hito se causa.

## 4. Reglas de Negocio y Lógica Crítica
- **Validación de Padrino (P1-P3):** Verifica contrato vigente en área operativa, no administrativo (o autorizado por GH), y sin antecedentes disciplinarios/accidentes en los últimos 6 meses.
- **Validación de Referido (R1-R5):** Verifica hoja de vida en selección (últimos 12 meses), procesos en curso, permanencia en contrataciones previas (mínimo 1 mes) y antecedentes.
- **Semáforo:** Evalúa mediante el estado `cumple`, `no_cumple` o `revisar`. Una aprobación de `no_cumple` requiere una marca de `excepcion: true`.
- **Esquema de Pago:**
    - Esquema A: Si el referido certifica experiencia (documento validado por la coordinadora).
    - Esquema B: Por defecto, bonificación estándar.
- **Sincronización:** Los hitos se generan automáticamente al confirmar el estado de `contratado` en el sistema.

## 5. Puntos de Entrada y Funciones Principales
- **`registrarReferido`**: Crea el registro de un referido. Valida que el padrino tenga permiso y no esté bloqueado.
- **`subirCertificado`**: Endpoint de carga. Incluye validación de `magic bytes` para garantizar integridad (evita inyecciones).
- **`decidirElegibilidad`**: Transición de estado (`elegible` / `no_elegible`). Dispara `sincronizarConProceso`.
- **`decidirHito`**: Proceso de segregación de funciones: quien registró el referido no puede aprobar los hitos.
- **`marcarPagados`**: Cierre de ciclo. Escribe en la tabla `incentivos` para que nómina pueda procesar el pago.

## 6. Integraciones y Dependencias
- **Supabase (Admin Client):** Acceso total a base de datos (se usa `createAdminClient` para evitar restricciones RLS en procesos internos de servidor).
- **Módulo `lib/conductores` y `employees`:** Consumo de datos de GEMA para validaciones de permanencia.
- **`exceljs`:** Generación de reportes para el área de Nómina.
- **`crypto`:** Generación de nombres aleatorios para almacenamiento de archivos en el bucket `plan-padrino`.
- **Cron Jobs (implícitos):** El sistema depende de sincronizaciones diarias (3:00 a. m.) para evaluar hitos pendientes.