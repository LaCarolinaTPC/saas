# Documentación del Módulo: `accidentabilidad`

## 1. Visión General y Propósito
El módulo `accidentabilidad` es el núcleo de gestión de riesgos viales dentro del sistema SaaS/ERP de transporte. Su propósito es centralizar el ciclo de vida del reporte de accidentes: desde la recolección de datos en campo (vehículos, croquis, evidencia fotográfica) hasta la evaluación administrativa bajo la **Política de Correctivos por Accidentalidad Vial**.

**Responsabilidades principales:**
*   **Gestión de Evidencia:** Procesamiento de fotos, croquis (dibujo asistido) e información del reporte gráfico (IPAT).
*   **Motor de Reglas:** Implementación de la matriz de ponderación para determinar la gravedad y el nivel de correctivo disciplinario aplicable al conductor.
*   **Integración de Datos:** Sincronización entre el reporte operativo, el maestro de vehículos (GEMA) y la gestión de catálogos configurables.
*   **Migración:** Soporte para la carga histórica desde matrices externas (GO-R-22).

---

## 2. Arquitectura y Estructura de Archivos

| Archivo | Rol / Propósito |
| :--- | :--- |
| `actions.ts` | Servidor (Server Actions). Gestión de estados, persistencia, permisos y manipulación de archivos. |
| `croquis.ts` | Lógica pura de dibujo. Define estructuras para representar el IPAT y transformarlas. |
| `datos.ts` | Orquestación de lectura/escritura de catálogos y formateo de datos entre el UI y la BD. |
| `formato.ts` | Definición de tipos compartidos (TypeScript) y esquemas del formulario de accidentes. |
| `fotos.ts` | Validación de rutas y seguridad para el almacenamiento de archivos multimedia. |
| `historico.ts` | Lógica de negocio para importar datos desde formatos Excel/CSV antiguos. |
| `policy.ts` | Motor de evaluación. Implementa las reglas de negocio de la política de seguridad vial. |

---

## 3. Modelos de Datos y Entidades

### Interfaces Clave (TypeScript)
*   **`Croquis`**: Estructura de datos que representa el lienzo del IPAT (versión 1, plantillas, lista de `Elemento`s).
*   **`FormatoPayload`**: Objeto integral que contiene toda la información de un accidente (vehículo propio, terceros, víctimas, factores, agente).
*   **`AccidenteHistorico`**: Modelo adaptado de filas externas (Excel) para su integración al sistema.
*   **`FactorPolitica`**: Enum de causas raíz (`exceso_velocidad`, `fatiga_comprobada`, etc.) que disparan acciones automáticas.

### Entidades de Base de Datos (Supabase)
*   `accidentes`: Tabla principal (metadatos, fotos, croquis, flags de política).
*   `accidente_catalogos`: Catálogos configurables (ciudad, tipo de vehículo, factores).
*   `accidente_eventos`: Historial de auditoría (quién editó, qué foto se agregó, cierres de investigación).
*   `accidente_vehiculos` / `accidente_victimas`: Tablas relacionadas para terceros y lesionados.

---

## 4. Reglas de Negocio y Lógica Crítica

*   **Política de Correctivos:** Se basa en una matriz que suma puntos por **Gravedad** (leve a fatal) y **Factores** (agravantes/atenuantes).
*   **Clasificación Automática:** La función `clasificarGravedad` determina la gravedad real basándose en el peor escenario entre daños y lesionados.
*   **Sugerencia de Nivel:** `sugerirNivel` aplica una lógica "if-then" para sugerir un nivel (I al IV).
    *   *Nivel IV*: Accidente fatal o negligencia grave (celular/velocidad).
    *   *Nivel III*: Reincidencia en < 3 meses o accidentes graves.
*   **Croquis a Escala:** Utiliza `PX_POR_METRO` (20px = 1m) para mantener proporciones reales en lienzos de 800x600px.
*   **N.º interno del vehículo, obligatorio:** es la llave con la que el accidente se imputa al bus (mantenimiento, propietario, ruta, indicadores por vehículo). La regla es una sola, `faltantesVehiculoPropio` (`formato.ts`, con pruebas), y la aplican **las tres capas**: el asistente (no deja pasar del paso «Datos del accidente»), la edición y el servidor (`POST /api/rotacion/accidentes` y `actualizarAccidente`). En la base lo respalda el `CHECK accidentes_vehiculo_codigo_obligatorio`, creado `NOT VALID` para no tocar las 7 filas históricas que ya estaban sin el dato.
    *   *Por qué se escapaba:* el código solo se llenaba al **elegir una sugerencia** del buscador. Quien tecleaba la placa a mano dejaba el campo vacío — así se guardaron 7 de 1.575 reportes, 6 de ellos con placa. Por eso el formulario además **resuelve el N.º interno desde la placa** (coincidencia única en el maestro, normalizando espacios y guiones) y ofrece mover a su campo lo que parezca un interno escrito en «Placa». Exigir el dato sin ayudar a encontrarlo solo traslada el problema a quien reporta, muchas veces en la vía.
    *   *Lo que NO se exige:* que el código exista en el maestro `vehiculos`. De los 159 códigos usados hay uno (`903`) que no está, y rechazarlo sería inventar un bloqueo donde el dato es correcto.
*   **Costo de reparación:** tarjeta «8. Costo de reparación» en el detalle de cada reporte de Gestivo. La llena solo quien tiene el permiso especial `accidentabilidad.costo_reparacion` («Registrar el costo de reparación (director de mantenimiento)»); «editar» no lo da. Arranca en 0 (default de la columna; la migración `20261029191752` dejó en 0 los reportes que lo tenían vacío) y se valida en el navegador y en el servidor con `validarCosto` (`costo.ts`, con pruebas): pesos enteros, con o sin puntos de miles, ni negativos ni decimales. Cada cambio queda en el historial del accidente con el valor anterior y el nuevo. En el histórico GO-R-22 el costo viene de la matriz y no se edita.

---

## 5. Puntos de Entrada y Funciones Principales

*   **`buscarVehiculos(q: string)`**: Autocompletado optimizado para el maestro de vehículos. Valida permisos `accidentabilidad` o `reporte_accidente`.
*   **`agregarFotosAccidente(...)`**: Actualiza la lista de fotos en la BD y registra un evento en `accidente_eventos`.
*   **`crearItemCatalogo(...)`**: Función administrativa protegida (`assertAdmin`) para gestionar catálogos configurables.
*   **`mapearFila(...)`**: (En `historico.ts`) Valida y transforma filas de Excel crudo a objetos compatibles con el modelo de dominio.

---

## 6. Integraciones y Dependencias

*   **Supabase (Admin Client):** Uso intensivo para transacciones atómicas de lectura/escritura (`createAdminClient`).
*   **Next.js (Revalidation):** Uso de `revalidatePath` para mantener la consistencia de caché en la UI tras modificaciones.
*   **@/lib/permissions:** Sistema de control de acceso basado en roles para funciones sensibles (edición vs. consulta).
*   **Almacenamiento (Bucket `accidentes`):** La integridad de los archivos se garantiza mediante validaciones de regex en `fotos.ts` y `croquis.ts` antes de persistir la ruta en la base de datos.