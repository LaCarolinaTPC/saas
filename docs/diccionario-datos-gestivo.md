# Diccionario de datos y uso de campos en Gestivo

> Estado reconstruido desde las migraciones y el código del repositorio al 2026-09-11.

## Resumen técnico

Se identificaron **89 tablas activas** en el esquema administrado por las migraciones. El documento explica para qué existe cada tabla, qué representa cada campo y en qué partes de Gestivo se encontró uso directo.

La etiqueta **sin referencia directa encontrada** no significa que la tabla esté vacía o sea inútil: puede ser consumida por SQL (funciones, vistas o triggers), por integraciones externas o por una ruta construida dinámicamente. El inventario describe el esquema esperado por el repositorio, no una introspección de la base desplegada.

## Cómo leer este documento

- **Definición SQL** conserva tipo, nulabilidad, valor por defecto y restricciones declaradas cuando están disponibles.
- **Uso del campo** explica su función de negocio o técnica; las descripciones genéricas se marcan por el contexto del nombre y tipo.
- **Uso comprobado en Gestivo** enumera archivos de aplicación o semillas donde aparece la tabla y clasifica las operaciones detectadas.
- El esquema `auth` y tablas internas de Supabase no se incluyen porque Gestivo no las crea mediante estas migraciones.

## Inventario general

| Módulo | Tablas |
|---|---:|
| Accidentabilidad | 4 |
| Ausentismo | 7 |
| Comunicaciones | 5 |
| Configuración, acceso e integración | 8 |
| Gestión documental y empleados | 5 |
| Integración GEMA | 4 |
| Mantenimiento | 5 |
| Operativo | 10 |
| Reclutamiento y contratación | 11 |
| Rotación y rendimiento | 6 |
| Tesorería/devengados | 3 |
| Transversal | 21 |

## Accidentabilidad

### `accidente_evaluaciones`

Evaluación y decisión de revisión de accidentes.

- **Origen del esquema:** `supabase/migrations/018_accidentes_evaluacion.sql`
- **Operaciones detectadas:** sincronización/upsert, alta, consulta
- **Uso comprobado en Gestivo:**
  - `src/app/api/rotacion/accidentes/route.ts` — sincronización/upsert
  - `src/lib/actions.ts` — alta, sincronización/upsert
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`
  - `src/lib/mcp/catalogo/ausentismo-diario.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/riesgo.ts`
  - `src/lib/rotacion/data/accidentes.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>y 4 archivo(s) más |
| `accidente_id` | `UUID NOT NULL UNIQUE REFERENCES accidentes(id) ON DELETE CASCADE` | Referencia al registro de accidente. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 1 archivo(s) más |
| `gravedad` | `accidente_gravedad` | Almacena «gravedad» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 3 archivo(s) más |
| `responsabilidad` | `accidente_responsabilidad NOT NULL DEFAULT 'en_estudio'` | Almacena «responsabilidad» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/data/accidentes.ts`<br>`src/lib/actions.ts`<br>y 4 archivo(s) más |
| `factores` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «factores» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 3 archivo(s) más |
| `eximentes` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «eximentes» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts` |
| `puntaje` | `INTEGER NOT NULL DEFAULT 0` | Almacena «puntaje» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/actions.ts`<br>y 3 archivo(s) más |
| `puntaje_detalle` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts` |
| `reincidente` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `reincidencia_3m` | `INTEGER NOT NULL DEFAULT 0` | Almacena «reincidencia 3m» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts`<br>y 1 archivo(s) más |
| `reincidencia_6m` | `INTEGER NOT NULL DEFAULT 0` | Almacena «reincidencia 6m» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `reincidencia_12m` | `INTEGER NOT NULL DEFAULT 0` | Almacena «reincidencia 12m» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 1 archivo(s) más |
| `nivel_sugerido` | `accidente_nivel` | Almacena «nivel sugerido» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts`<br>y 1 archivo(s) más |
| `nivel_final` | `accidente_nivel` | Almacena «nivel final» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 1 archivo(s) más |
| `medidas` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «medidas» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `requiere_comite` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 1 archivo(s) más |
| `observaciones` | `TEXT` | Texto libre de contexto operativo y seguimiento. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 1 archivo(s) más |
| `evaluado_por` | `UUID REFERENCES profiles(id)` | Almacena «evaluado por» como parte de accidente_evaluaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts`<br>y 1 archivo(s) más |
| `evaluado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 4 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |

### `accidente_eventos`

Trazabilidad de eventos/cambios del accidente.

- **Origen del esquema:** `supabase/migrations/008_accidentes.sql`
- **Operaciones detectadas:** alta, consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/api/rotacion/accidentes/route.ts` — alta
  - `src/lib/actions.ts` — consulta, alta, actualización
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/rotacion/data/accidentes.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `accidente_id` | `UUID NOT NULL REFERENCES accidentes(id) ON DELETE CASCADE` | Referencia al registro de accidente. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 1 archivo(s) más |
| `tipo` | `TEXT NOT NULL` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `estado_nuevo` | `accidente_estado` | Almacena «estado nuevo» como parte de accidente_eventos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts` |
| `comentario` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `user_id` | `UUID REFERENCES profiles(id)` | Referencia al usuario autenticado relacionado. | `src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |

### `accidente_vehiculos`

Vehículos involucrados en un accidente.

- **Origen del esquema:** `supabase/migrations/008_accidentes.sql`
- **Operaciones detectadas:** alta, consulta, eliminación
- **Uso comprobado en Gestivo:**
  - `src/app/api/rotacion/accidentes/route.ts` — alta
  - `src/lib/actions.ts` — consulta, alta, eliminación
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/mantenimiento.ts`
  - `src/lib/rotacion/data/accidentes.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>y 3 archivo(s) más |
| `accidente_id` | `UUID NOT NULL REFERENCES accidentes(id) ON DELETE CASCADE` | Referencia al registro de accidente. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 1 archivo(s) más |
| `placa` | `TEXT` | Placa del vehículo usada para cruces operativos. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 3 archivo(s) más |
| `descripcion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `es_propio` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 3 archivo(s) más |

### `accidentes`

Cabecera del reporte de accidente y su investigación.

- **Origen del esquema:** `supabase/migrations/008_accidentes.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(auth)/oauth/autorizar/page.tsx`
  - `src/app/(dashboard)/accidentabilidad/consultar/page.tsx`
  - `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`
  - `src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`
  - `src/app/(dashboard)/ausentismo/matriz/actions.ts`
  - `src/app/(dashboard)/rotacion/conductores/SearchBar.tsx`
  - `src/app/(dashboard)/rotacion/conductores/[cedula]/AccidentesSection.tsx`
  - `src/app/(dashboard)/rotacion/conductores/[cedula]/KpiCards.tsx`
  - … y 22 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/app/docs/api/page.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 18 archivo(s) más |
| `consecutivo` | `BIGINT GENERATED ALWAYS AS IDENTITY` | Almacena «consecutivo» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 7 archivo(s) más |
| `conductor_id` | `UUID REFERENCES conductores(id)` | Referencia al registro de conductor. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `conductor_cedula` | `TEXT NOT NULL` | Almacena «conductor cedula» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/data/accidentes.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>y 4 archivo(s) más |
| `conductor_nombre` | `TEXT NOT NULL` | Almacena «conductor nombre» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/page.tsx`<br>y 4 archivo(s) más |
| `conductor_licencia` | `TEXT` | Almacena «conductor licencia» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `fecha_accidente` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts`<br>`src/lib/rotacion/data/accidentes.ts`<br>y 5 archivo(s) más |
| `direccion_accidente` | `TEXT NOT NULL` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/actions.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>y 5 archivo(s) más |
| `resumen_hechos` | `TEXT` | Almacena «resumen hechos» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 3 archivo(s) más |
| `nota_voz_url` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/data/accidentes.ts` |
| `nota_voz_transcripcion` | `TEXT` | Almacena «nota voz transcripcion» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/components/accidentabilidad/ReportWizard.tsx`<br>y 1 archivo(s) más |
| `tiene_peaton` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/actions.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 3 archivo(s) más |
| `peaton_nombre` | `TEXT` | Almacena «peaton nombre» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `peaton_cedula` | `TEXT` | Almacena «peaton cedula» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `peaton_telefono` | `TEXT` | Almacena «peaton telefono» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `peaton_direccion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `peaton_correo` | `TEXT` | Almacena «peaton correo» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `hubo_arreglo` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 4 archivo(s) más |
| `arreglo_monto` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>y 2 archivo(s) más |
| `arreglo_receptor_nombre` | `TEXT` | Almacena «arreglo receptor nombre» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `arreglo_receptor_cedula` | `TEXT` | Almacena «arreglo receptor cedula» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `arreglo_firma_url` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/data/accidentes.ts` |
| `solicito_aseguradora` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/actions.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 4 archivo(s) más |
| `aseguradora_nombre` | `TEXT` | Almacena «aseguradora nombre» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 3 archivo(s) más |
| `abogado_nombre` | `TEXT` | Almacena «abogado nombre» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `abogado_apellidos` | `TEXT` | Almacena «abogado apellidos» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `abogado_cedula` | `TEXT` | Almacena «abogado cedula» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `abogado_celular` | `TEXT` | Almacena «abogado celular» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `firma_conductor_url` | `TEXT NOT NULL` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/data/accidentes.ts` |
| `firma_tercero_url` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/data/accidentes.ts` |
| `estado` | `accidente_estado NOT NULL DEFAULT 'pendiente_revision'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 15 archivo(s) más |
| `created_by` | `UUID REFERENCES profiles(id)` | Usuario que creó el registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>y 2 archivo(s) más |
| `reviewed_by` | `UUID REFERENCES profiles(id)` | Almacena «reviewed by» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts` |
| `reviewed_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/actions.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 6 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `ciudad` | `TEXT` | Almacena «ciudad» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/components/accidentabilidad/ReportWizard.tsx`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 1 archivo(s) más |
| `lesionados` | `accidente_lesionados` | Almacena «lesionados» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/components/accidentabilidad/ReportWizard.tsx`<br>`src/lib/accidentabilidad/policy.ts`<br>y 3 archivo(s) más |
| `danos_materiales` | `accidente_danos` | Almacena «danos materiales» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`<br>y 2 archivo(s) más |
| `fact_exceso_velocidad` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/components/accidentabilidad/ReportWizard.tsx`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `fact_uso_celular` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/components/accidentabilidad/ReportWizard.tsx`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `fact_no_distancia` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/components/accidentabilidad/ReportWizard.tsx`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `fact_fatiga` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/components/accidentabilidad/ReportWizard.tsx`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `responsabilidad_reportada` | `accidente_responsabilidad` | Almacena «responsabilidad reportada» como parte de accidentes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/accidentes/route.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/components/accidentabilidad/ReportWizard.tsx`<br>y 1 archivo(s) más |

## Ausentismo

### `ausentismo`

Dataset histórico/importado de ausentismo usado en analítica de rotación.

- **Origen del esquema:** `supabase/migrations/005_rotacion_tables.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(auth)/oauth/autorizar/page.tsx`
  - `src/app/(dashboard)/ausentismo/actions.ts`
  - `src/app/(dashboard)/ausentismo/ausentismo-client.tsx`
  - `src/app/(dashboard)/ausentismo/indicadores/indicadores-client.tsx`
  - `src/app/(dashboard)/ausentismo/matriz/actions.ts`
  - `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`
  - `src/app/(dashboard)/ausentismo/page.tsx`
  - `src/app/(dashboard)/ausentismo/reincidentes/reincidentes-client.tsx`
  - … y 60 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/lib/incapacidades/expedientes.ts`<br>`src/app/docs/api/page.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 38 archivo(s) más |
| `cedula` | `TEXT NOT NULL` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/rotacion/upload/processors.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 40 archivo(s) más |
| `consecutivo_incapacidad` | `TEXT` | Almacena «consecutivo incapacidad» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/rotacion/upload/ausentismo-carga.ts`<br>`src/lib/ausentismo/matriz-reglas.ts`<br>y 14 archivo(s) más |
| `nombre` | `TEXT` | Nombre legible mostrado en la interfaz y reportes. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 46 archivo(s) más |
| `genero` | `TEXT` | Almacena «genero» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/conductor/[cedula]/route.ts`<br>`src/lib/rotacion/data/conductor.ts`<br>y 2 archivo(s) más |
| `edad` | `INTEGER` | Almacena «edad» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/riesgo/variables.ts`<br>y 11 archivo(s) más |
| `antiguedad` | `TEXT` | Almacena «antiguedad» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/conductor/[cedula]/route.ts`<br>`src/lib/rotacion/data/conductor.ts`<br>y 2 archivo(s) más |
| `vinculacion` | `TEXT` | Almacena «vinculacion» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/api/rotacion/conductor/[cedula]/route.ts`<br>`src/lib/constants.ts`<br>y 3 archivo(s) más |
| `centro_trabajo` | `TEXT` | Almacena «centro trabajo» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/upload/processors.ts`<br>`supabase/seed/seed-ausentismo.ts` |
| `departamento` | `TEXT` | Almacena «departamento» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/upload/processors.ts`<br>`supabase/seed/seed-ausentismo.ts` |
| `area` | `TEXT` | Almacena «area» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/permissions-shared.ts`<br>`src/lib/rotacion/upload/processors.ts`<br>y 1 archivo(s) más |
| `cargo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/ausentismo/cobro.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>y 15 archivo(s) más |
| `indicador_prorroga` | `TEXT` | Almacena «indicador prorroga» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz-reglas.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 17 archivo(s) más |
| `dias_it_pagados` | `INTEGER` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/ausentismo/matriz.ts`<br>y 21 archivo(s) más |
| `origen` | `TEXT` | Sistema o mecanismo del que provino el dato. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/ausentismo/matriz.ts`<br>y 33 archivo(s) más |
| `fecha_inicio` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/ausentismo/matriz.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 31 archivo(s) más |
| `fecha_fin` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>y 26 archivo(s) más |
| `mes_inicio` | `TEXT` | Almacena «mes inicio» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/api/ausentismo/matriz/export/route.ts`<br>y 3 archivo(s) más |
| `cie10` | `TEXT` | Almacena «cie10» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/ausentismo/cobro.ts`<br>y 14 archivo(s) más |
| `diagnostico` | `TEXT` | Almacena «diagnostico» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/indicadores.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 17 archivo(s) más |
| `soat` | `TEXT` | Almacena «soat» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 7 archivo(s) más |
| `grd` | `TEXT` | Almacena «grd» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/indicadores.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>y 9 archivo(s) más |
| `dia_ocurrencia` | `TEXT` | Almacena «dia ocurrencia» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>y 4 archivo(s) más |
| `eps` | `TEXT` | Almacena «eps» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/ausentismo/matriz.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 28 archivo(s) más |
| `ips` | `TEXT` | Almacena «ips» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/ausentismo/matriz.ts`<br>`src/lib/ausentismo/indicadores.ts`<br>y 12 archivo(s) más |
| `profesional_responsable` | `TEXT` | Almacena «profesional responsable» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz.ts`<br>`src/lib/rotacion/upload/ausentismo-carga.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>y 10 archivo(s) más |
| `tipo_conductor` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 20 archivo(s) más |
| `estado` | `TEXT` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>y 34 archivo(s) más |
| `source_file` | `TEXT` | Almacena «source file» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/rotacion/upload/processors.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/ausentismo/matriz.ts`<br>y 5 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 14 archivo(s) más |
| `estado_registro` | `TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_registro IN ('pendiente','cerrado'))` | Almacena «estado registro» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz.ts`<br>`src/lib/ausentismo/auditoria.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 4 archivo(s) más |
| `origen_registro` | `TEXT NOT NULL DEFAULT 'excel' CHECK (origen_registro IN ('excel','formulario'))` | Almacena «origen registro» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/upload/ausentismo-carga.ts`<br>y 5 archivo(s) más |
| `arl` | `TEXT` | Almacena «arl» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/ausentismo/matriz.ts`<br>y 15 archivo(s) más |
| `abierto_por_email` | `TEXT` | Almacena «abierto por email» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `cerrado_por_email` | `TEXT` | Almacena «cerrado por email» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/ausentismo/matriz.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>y 1 archivo(s) más |
| `cerrado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/ausentismo/matriz.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>y 1 archivo(s) más |
| `modificado_por_email` | `TEXT` | Almacena «modificado por email» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/ausentismo-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 5 archivo(s) más |
| `motivo_modificacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/app/(dashboard)/ausentismo/ausentismo-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 6 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 5 archivo(s) más |
| `revision` | `TEXT[] NOT NULL DEFAULT '{}'` | Almacena «revision» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 5 archivo(s) más |
| `consecutivo_llave` | `TEXT GENERATED ALWAYS AS (COALESCE(consecutivo_incapacidad, '')) STORED` | Almacena «consecutivo llave» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/rotacion/upload/types.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts` |
| `lote_carga` | `UUID` | Almacena «lote carga» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/rotacion/upload/ausentismo-carga.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `eliminado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/ausentismo/matriz.ts`<br>y 8 archivo(s) más |
| `eliminado_por_email` | `TEXT` | Almacena «eliminado por email» como parte de ausentismo; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/ausentismo/matriz.ts`<br>y 1 archivo(s) más |
| `motivo_eliminacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/ausentismo/matriz.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>y 1 archivo(s) más |

### `ausentismo_catalogos`

Catálogos validados usados por la matriz de ausentismo.

- **Origen del esquema:** `supabase/migrations/20260902220946_matriz_de_ausentismo_catalogos_validados_y_trazabilidad.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/ausentismo/matriz/actions.ts` — consulta
  - `src/lib/ausentismo/matriz.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/incapacidades/expedientes.ts` — consulta
  - `src/lib/incapacidades/liquidacion.ts` — consulta
  - `src/lib/incapacidades/recaudos.ts` — consulta, alta
  - `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`
  - `src/lib/mcp/catalogo/ausentismo-diario.ts`
  - … y 2 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>y 6 archivo(s) más |
| `tipo` | `TEXT NOT NULL CHECK (tipo IN ('ORIGEN','GRD','EPS','ARL','AFP','IPS','PROFESIONAL','CIE10','CIE10_LETRA'))` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 7 archivo(s) más |
| `codigo` | `TEXT` | Código del sistema origen o catálogo para identificación e integración. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/incapacidades/liquidacion.ts`<br>y 5 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/matriz.ts`<br>y 7 archivo(s) más |
| `relacionado` | `TEXT` | Almacena «relacionado» como parte de ausentismo_catalogos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/matriz.ts`<br>y 1 archivo(s) más |
| `activo` | `BOOLEAN NOT NULL DEFAULT true` | Indica si el registro está disponible para uso operativo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/incapacidades/liquidacion.ts`<br>y 5 archivo(s) más |
| `verificado` | `BOOLEAN NOT NULL DEFAULT true` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 2 archivo(s) más |
| `usos` | `INTEGER NOT NULL DEFAULT 0` | Almacena «usos» como parte de ausentismo_catalogos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/ausentismo/matriz.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>y 2 archivo(s) más |
| `ultimo_uso` | `DATE` | Almacena «ultimo uso» como parte de ausentismo_catalogos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `created_by_email` | `TEXT` | Almacena «created by email» como parte de ausentismo_catalogos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/rotacion/upload/ausentismo-carga.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 5 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 4 archivo(s) más |
| `clase` | `TEXT CHECK (clase IN ('EPS', 'ARL', 'OTRA'))` | Almacena «clase» como parte de ausentismo_catalogos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/matriz.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `nit` | `TEXT` | Almacena «nit» como parte de ausentismo_catalogos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `vigente_desde` | `DATE` | Almacena «vigente desde» como parte de ausentismo_catalogos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `vigente_hasta` | `DATE` | Almacena «vigente hasta» como parte de ausentismo_catalogos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `dias_min_cobro` | `INTEGER CHECK (dias_min_cobro >= 0)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/ausentismo/matriz.ts`<br>`src/lib/incapacidades/expedientes.ts` |

### `ausentismo_conceptos`

Catálogo normalizado de conceptos de ausentismo.

- **Origen del esquema:** `supabase/migrations/20260902180848_ausentismo_catalogo_de_conceptos_y_trazabilidad_de_modificaciones.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/ausentismo/actions.ts` — consulta
  - `src/lib/ausentismo/constants.ts`
  - `src/lib/ausentismo/data.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`
  - `src/lib/mcp/catalogo/ausentismo-diario.ts`
  - `src/lib/mcp/catalogo/contexto.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `key` | `TEXT PRIMARY KEY` | Almacena «key» como parte de ausentismo_conceptos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/constants.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 3 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 4 archivo(s) más |
| `orden` | `INTEGER NOT NULL DEFAULT 100` | Almacena «orden» como parte de ausentismo_conceptos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/data.ts`<br>y 3 archivo(s) más |
| `activo` | `BOOLEAN NOT NULL DEFAULT true` | Indica si el registro está disponible para uso operativo. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/data.ts`<br>y 3 archivo(s) más |
| `cuenta_reincidencia` | `BOOLEAN NOT NULL DEFAULT true` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>y 1 archivo(s) más |
| `exige_soporte` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/constants.ts`<br>y 1 archivo(s) más |
| `created_by_email` | `TEXT` | Almacena «created by email» como parte de ausentismo_conceptos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/constants.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/external/resources.ts`<br>y 4 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/constants.ts`<br>y 1 archivo(s) más |

### `ausentismo_duplicados`

Registros detectados como posibles duplicados en cargas.

- **Origen del esquema:** `supabase/migrations/20260902220946_matriz_de_ausentismo_catalogos_validados_y_trazabilidad.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `cedula` | `TEXT NOT NULL` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `consecutivo_incapacidad` | `TEXT` | Almacena «consecutivo incapacidad» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `nombre` | `TEXT` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `genero` | `TEXT` | Almacena «genero» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `edad` | `INTEGER` | Almacena «edad» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `antiguedad` | `TEXT` | Almacena «antiguedad» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `vinculacion` | `TEXT` | Almacena «vinculacion» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `centro_trabajo` | `TEXT` | Almacena «centro trabajo» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `departamento` | `TEXT` | Almacena «departamento» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `area` | `TEXT` | Almacena «area» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `cargo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `indicador_prorroga` | `TEXT` | Almacena «indicador prorroga» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `dias_it_pagados` | `INTEGER` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `origen` | `TEXT` | Sistema o mecanismo del que provino el dato. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `fecha_inicio` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `fecha_fin` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `mes_inicio` | `TEXT` | Almacena «mes inicio» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `cie10` | `TEXT` | Almacena «cie10» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `diagnostico` | `TEXT` | Almacena «diagnostico» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `soat` | `TEXT` | Almacena «soat» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `grd` | `TEXT` | Almacena «grd» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `dia_ocurrencia` | `TEXT` | Almacena «dia ocurrencia» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `eps` | `TEXT` | Almacena «eps» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `ips` | `TEXT` | Almacena «ips» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `profesional_responsable` | `TEXT` | Almacena «profesional responsable» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `tipo_conductor` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `estado` | `TEXT` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `source_file` | `TEXT` | Almacena «source file» como parte de ausentismo_duplicados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `retirado_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `motivo` | `TEXT NOT NULL DEFAULT 'llave natural repetida en la carga de Excel'` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |

### `ausentismo_log`

Auditoría de cambios en casos de ausentismo.

- **Origen del esquema:** `supabase/migrations/042_ausentismo_registros.sql`
- **Operaciones detectadas:** alta, consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/ausentismo/actions.ts` — alta
  - `src/lib/ausentismo/auditoria.ts`
  - `src/lib/incapacidades/adjuntos.ts` — consulta, alta
  - `src/lib/incapacidades/auditoria.ts`
  - `src/lib/incapacidades/expedientes.ts` — consulta
  - `src/lib/incapacidades/liquidacion.ts` — consulta, alta, actualización
  - `src/lib/incapacidades/radicacion.ts` — consulta, alta, actualización
  - `src/lib/incapacidades/recaudos.ts` — alta, actualización
  - … y 1 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>y 5 archivo(s) más |
| `registro_id` | `UUID NOT NULL` | Referencia al registro de registro. | `src/lib/ausentismo/auditoria.ts`<br>`src/lib/incapacidades/adjuntos.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>y 4 archivo(s) más |
| `accion` | `TEXT NOT NULL` | Almacena «accion» como parte de ausentismo_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/auditoria.ts`<br>`src/lib/ausentismo/auditoria.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>y 5 archivo(s) más |
| `datos_anteriores` | `JSONB` | Almacena «datos anteriores» como parte de ausentismo_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/auditoria.ts`<br>y 3 archivo(s) más |
| `datos_nuevos` | `JSONB` | Almacena «datos nuevos» como parte de ausentismo_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>y 4 archivo(s) más |
| `user_id` | `UUID REFERENCES auth.users(id)` | Referencia al usuario autenticado relacionado. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/auditoria.ts` |
| `user_email` | `TEXT` | Almacena «user email» como parte de ausentismo_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>y 5 archivo(s) más |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>y 4 archivo(s) más |

### `ausentismo_notificaciones`

Notificaciones y evidencias de descargos/terminación.

- **Origen del esquema:** `supabase/migrations/20260904173119_ausentismo_notificaciones_de_descargos_y_terminacion.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/ausentismo/actions.ts` — consulta, alta
  - `src/lib/ausentismo/constants.ts`
  - `src/lib/ausentismo/data.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`
  - `src/lib/mcp/catalogo/ausentismo-diario.ts`
  - `src/lib/mcp/catalogo/contexto.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 3 archivo(s) más |
| `cedula` | `TEXT NOT NULL` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/data.ts`<br>y 4 archivo(s) más |
| `codigo` | `TEXT` | Código del sistema origen o catálogo para identificación e integración. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/data.ts`<br>y 4 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 4 archivo(s) más |
| `nivel` | `TEXT NOT NULL CHECK (nivel IN ('descargos', 'terminacion'))` | Almacena «nivel» como parte de ausentismo_notificaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/ausentismo/data.ts`<br>y 4 archivo(s) más |
| `racha_desde` | `DATE NOT NULL` | Almacena «racha desde» como parte de ausentismo_notificaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/data.ts`<br>y 1 archivo(s) más |
| `racha_hasta` | `DATE NOT NULL` | Almacena «racha hasta» como parte de ausentismo_notificaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/data.ts`<br>y 1 archivo(s) más |
| `dias` | `INTEGER NOT NULL CHECK (dias > 0)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/constants.ts`<br>y 1 archivo(s) más |
| `notificado_en` | `DATE NOT NULL` | Almacena «notificado en» como parte de ausentismo_notificaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/constants.ts`<br>y 2 archivo(s) más |
| `observaciones` | `TEXT` | Texto libre de contexto operativo y seguimiento. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/constants.ts`<br>`src/lib/ausentismo/data.ts`<br>y 2 archivo(s) más |
| `created_by` | `UUID REFERENCES auth.users(id)` | Usuario que creó el registro. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `created_by_email` | `TEXT` | Almacena «created by email» como parte de ausentismo_notificaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/constants.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/external/resources.ts`<br>y 4 archivo(s) más |
| `anulada_en` | `TIMESTAMPTZ` | Almacena «anulada en» como parte de ausentismo_notificaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/data.ts`<br>y 1 archivo(s) más |
| `anulada_por_email` | `TEXT` | Almacena «anulada por email» como parte de ausentismo_notificaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `motivo_anulacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts` |

### `ausentismo_registros`

Casos transaccionales de ausentismo con soporte y seguimiento.

- **Origen del esquema:** `supabase/migrations/042_ausentismo_registros.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/ausentismo/actions.ts` — consulta, alta
  - `src/app/(dashboard)/ausentismo/page.tsx`
  - `src/lib/ausentismo/data.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`
  - `src/lib/mcp/catalogo/ausentismo-diario.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/riesgo.ts`
  - … y 3 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 6 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/external/resources.ts`<br>y 8 archivo(s) más |
| `cedula` | `TEXT NOT NULL` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>y 6 archivo(s) más |
| `codigo` | `TEXT` | Código del sistema origen o catálogo para identificación e integración. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/data.ts`<br>y 6 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 7 archivo(s) más |
| `telefono` | `TEXT` | Número telefónico de contacto. | `src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 1 archivo(s) más |
| `tipo` | `TEXT NOT NULL` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>y 8 archivo(s) más |
| `contacto` | `TEXT` | Almacena «contacto» como parte de ausentismo_registros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `justificacion` | `TEXT` | Almacena «justificacion» como parte de ausentismo_registros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `incapacidad_inicio` | `DATE` | Almacena «incapacidad inicio» como parte de ausentismo_registros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `incapacidad_fin` | `DATE` | Almacena «incapacidad fin» como parte de ausentismo_registros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `reintegro` | `DATE` | Almacena «reintegro» como parte de ausentismo_registros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `soporte` | `TEXT NOT NULL DEFAULT 'no_aplica'` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/data.ts`<br>y 5 archivo(s) más |
| `created_by` | `UUID REFERENCES profiles(id) ON DELETE SET NULL` | Usuario que creó el registro. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `created_by_email` | `TEXT` | Almacena «created by email» como parte de ausentismo_registros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/ausentismo/data.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 5 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 1 archivo(s) más |
| `codigo_vehiculo` | `TEXT REFERENCES vehiculos(codigo) ON DELETE SET NULL` | Almacena «codigo vehiculo» como parte de ausentismo_registros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `fecha_inicio` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/data.ts`<br>y 4 archivo(s) más |
| `fecha_fin` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/ausentismo/data.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 4 archivo(s) más |
| `soporte_observaciones` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `tipo_inicial` | `TEXT REFERENCES ausentismo_conceptos(key)` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts` |
| `tipo_modificado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `modificado_por_email` | `TEXT` | Almacena «modificado por email» como parte de ausentismo_registros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |
| `motivo_modificacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/app/(dashboard)/ausentismo/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts` |

## Comunicaciones

### `wa_canal`

Configuración cifrada del canal de WhatsApp.

- **Origen del esquema:** `supabase/migrations/20260901201838_canal_whatsapp_configurable.sql`
- **Operaciones detectadas:** consulta, sincronización/upsert
- **Uso comprobado en Gestivo:**
  - `src/lib/comunicaciones/actions.ts` — consulta, sincronización/upsert
  - `src/lib/comunicaciones/whatsapp.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)` | Identificador único del registro. | `src/lib/comunicaciones/whatsapp.ts`<br>`src/lib/comunicaciones/actions.ts` |
| `phone_number_id` | `TEXT NOT NULL` | Referencia al registro de phone number. | `src/lib/comunicaciones/whatsapp.ts`<br>`src/lib/comunicaciones/actions.ts` |
| `waba_id` | `TEXT` | Referencia al registro de waba. | `src/lib/comunicaciones/actions.ts`<br>`src/lib/comunicaciones/whatsapp.ts` |
| `access_token` | `TEXT NOT NULL` | Almacena «access token» como parte de wa_canal; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/actions.ts`<br>`src/lib/comunicaciones/whatsapp.ts` |
| `app_secret` | `TEXT` | Almacena «app secret» como parte de wa_canal; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/actions.ts`<br>`src/lib/comunicaciones/whatsapp.ts` |
| `verify_token` | `TEXT NOT NULL` | Almacena «verify token» como parte de wa_canal; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/actions.ts`<br>`src/lib/comunicaciones/whatsapp.ts` |
| `numero_mostrado` | `TEXT` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/comunicaciones/actions.ts`<br>`src/lib/comunicaciones/whatsapp.ts` |
| `actualizado_por` | `TEXT` | Almacena «actualizado por» como parte de wa_canal; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/actions.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/comunicaciones/actions.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |

### `wa_contactos`

Contactos del canal de WhatsApp.

- **Origen del esquema:** `supabase/migrations/20260901200651_modulo_comunicaciones_whatsapp.sql`
- **Operaciones detectadas:** consulta, sincronización/upsert
- **Uso comprobado en Gestivo:**
  - `src/app/api/webhook/whatsapp/route.ts` — consulta, sincronización/upsert
  - `src/lib/comunicaciones/data.ts` — consulta
  - `src/lib/comunicaciones/ficha.ts` — consulta
  - `src/lib/comunicaciones/registro.ts` — consulta, sincronización/upsert

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>y 1 archivo(s) más |
| `telefono` | `TEXT NOT NULL UNIQUE` | Número telefónico de contacto. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/comunicaciones/registro.ts`<br>`src/lib/comunicaciones/data.ts`<br>y 1 archivo(s) más |
| `nombre` | `TEXT` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/comunicaciones/ficha.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/registro.ts` |

### `wa_conversaciones`

Conversaciones y estado de atención por WhatsApp.

- **Origen del esquema:** `supabase/migrations/20260901200651_modulo_comunicaciones_whatsapp.sql`
- **Operaciones detectadas:** consulta, sincronización/upsert, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/api/webhook/whatsapp/route.ts` — consulta, sincronización/upsert
  - `src/lib/comunicaciones/actions.ts` — actualización
  - `src/lib/comunicaciones/data.ts` — consulta
  - `src/lib/comunicaciones/ficha.ts` — consulta
  - `src/lib/comunicaciones/registro.ts` — consulta, sincronización/upsert
  - `src/lib/mcp/catalogo/reclutamiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>y 3 archivo(s) más |
| `contacto_id` | `UUID NOT NULL REFERENCES wa_contactos(id) ON DELETE CASCADE` | Referencia al registro de contacto. | `src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/registro.ts` |
| `estado` | `TEXT NOT NULL DEFAULT 'abierta'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>y 2 archivo(s) más |
| `ultimo_entrante_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts` |
| `ultimo_mensaje_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/registro.ts` |
| `no_leidos` | `INTEGER NOT NULL DEFAULT 0` | Almacena «no leidos» como parte de wa_conversaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/actions.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/comunicaciones/ficha.ts` |
| `proceso_id` | `UUID REFERENCES procesos_contratacion(id) ON DELETE SET NULL` | Referencia al registro de proceso. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/actions.ts`<br>y 1 archivo(s) más |

### `wa_mensajes`

Mensajes entrantes y salientes de conversaciones.

- **Origen del esquema:** `supabase/migrations/20260901200651_modulo_comunicaciones_whatsapp.sql`
- **Operaciones detectadas:** consulta, alta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/api/webhook/whatsapp/route.ts` — consulta, alta
  - `src/lib/comunicaciones/data.ts` — consulta
  - `src/lib/comunicaciones/ficha.ts` — consulta
  - `src/lib/comunicaciones/medios.ts`
  - `src/lib/comunicaciones/registro.ts` — alta, actualización

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>y 2 archivo(s) más |
| `conversacion_id` | `UUID NOT NULL REFERENCES wa_conversaciones(id) ON DELETE CASCADE` | Referencia al registro de conversacion. | `src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>y 2 archivo(s) más |
| `direccion` | `TEXT NOT NULL` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>y 1 archivo(s) más |
| `contenido` | `TEXT NOT NULL DEFAULT ''` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/registro.ts`<br>`src/app/api/webhook/whatsapp/route.ts` |
| `wamid` | `TEXT UNIQUE` | Almacena «wamid» como parte de wa_mensajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/registro.ts` |
| `estado` | `TEXT` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/comunicaciones/ficha.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/data.ts`<br>y 1 archivo(s) más |
| `error_codigo` | `INTEGER` | Almacena «error codigo» como parte de wa_mensajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/registro.ts` |
| `error_mensaje` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/registro.ts` |
| `media_tipo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/registro.ts` |
| `media_id` | `TEXT` | Referencia al registro de media. | `src/lib/comunicaciones/medios.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/registro.ts` |
| `mime_type` | `TEXT` | Almacena «mime type» como parte de wa_mensajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/medios.ts`<br>y 1 archivo(s) más |
| `nombre_archivo` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/comunicaciones/medios.ts`<br>`src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>y 1 archivo(s) más |
| `enviado_por` | `TEXT` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/registro.ts` |
| `timestamp` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Almacena «timestamp» como parte de wa_mensajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/data.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>y 2 archivo(s) más |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/comunicaciones/ficha.ts` |
| `media_path` | `TEXT; ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS plantilla TEXT; INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp', 'whatsapp', false) ON CONFLICT (id) DO NOTHING` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/comunicaciones/data.ts`<br>`src/lib/comunicaciones/medios.ts`<br>`src/app/api/webhook/whatsapp/route.ts`<br>y 1 archivo(s) más |

### `whatsapp_messages`

Mensajes de WhatsApp del módulo legado.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** alta, consulta, actualización, eliminación
- **Uso comprobado en Gestivo:**
  - `src/app/api/webhooks/[slug]/route.ts` — alta
  - `src/lib/actions.ts` — consulta, actualización, eliminación

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `webhook_log_id` | `UUID REFERENCES webhook_logs(id)` | Referencia al registro de webhook log. | `src/app/api/webhooks/[slug]/route.ts` |
| `candidate_id` | `UUID REFERENCES candidates(id)` | Referencia al candidato relacionado. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `phone_number` | `TEXT NOT NULL` | Almacena «phone number» como parte de whatsapp_messages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhooks/[slug]/route.ts` |
| `message_type` | `TEXT DEFAULT 'text'` | Almacena «message type» como parte de whatsapp_messages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhooks/[slug]/route.ts` |
| `content` | `TEXT` | Almacena «content» como parte de whatsapp_messages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `media_url` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `direction` | `TEXT DEFAULT 'inbound'` | Almacena «direction» como parte de whatsapp_messages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhooks/[slug]/route.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/actions.ts` |

## Configuración, acceso e integración

### `api_keys`

Credenciales hash y permisos de la API externa.

- **Origen del esquema:** `supabase/migrations/028_api_keys.sql`
- **Operaciones detectadas:** consulta, alta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/configuracion/api/actions.ts` — consulta, alta
  - `src/app/(dashboard)/configuracion/api/page.tsx` — consulta
  - `src/lib/external/api-keys.ts` — actualización
  - `src/lib/external/auth.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | Identificador único del registro. | `src/lib/external/auth.ts`<br>`src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/app/(dashboard)/configuracion/api/page.tsx` |
| `name` | `text not null` | Nombre legible mostrado en la interfaz y reportes. | `src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/lib/external/auth.ts` |
| `key_prefix` | `text not null` | Almacena «key prefix» como parte de api_keys; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/app/(dashboard)/configuracion/api/actions.ts` |
| `key_hash` | `text not null unique` | Almacena «key hash» como parte de api_keys; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/external/api-keys.ts`<br>`src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts` |
| `is_active` | `boolean not null default true` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts` |
| `created_by` | `uuid references profiles(id) on delete set null` | Usuario que creó el registro. | `src/app/(dashboard)/configuracion/api/actions.ts` |
| `created_at` | `timestamptz not null default now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/app/(dashboard)/configuracion/api/actions.ts` |
| `last_used_at` | `timestamptz` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/lib/external/auth.ts` |
| `revoked_at` | `timestamptz` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/app/(dashboard)/configuracion/api/actions.ts` |

### `api_request_logs`

Bitácora de consumo de la API externa.

- **Origen del esquema:** `supabase/migrations/044_api_request_logs.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/configuracion/api/actions.ts` — consulta
  - `src/lib/external/auth.ts` — alta
  - `src/lib/mcp/auth.ts` — alta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | Identificador único del registro. | `src/lib/external/auth.ts`<br>`src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/mcp/auth.ts` |
| `api_key_id` | `uuid REFERENCES api_keys(id) ON DELETE CASCADE` | Referencia al registro de api key. | `src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts`<br>`src/lib/mcp/auth.ts` |
| `method` | `text NOT NULL` | Almacena «method» como parte de api_request_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts`<br>`src/lib/mcp/auth.ts` |
| `path` | `text NOT NULL` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts`<br>`src/lib/mcp/auth.ts` |
| `query` | `text` | Almacena «query» como parte de api_request_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts`<br>`src/lib/mcp/auth.ts` |
| `resultado` | `text NOT NULL` | Almacena «resultado» como parte de api_request_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/auth.ts`<br>`src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts` |
| `ip` | `text` | Almacena «ip» como parte de api_request_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts`<br>`src/lib/mcp/auth.ts` |
| `user_agent` | `text` | Almacena «user agent» como parte de api_request_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/api/actions.ts`<br>`src/lib/external/auth.ts`<br>`src/lib/mcp/auth.ts` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/app/(dashboard)/configuracion/api/actions.ts` |
| `oauth_concesion_id` | `uuid REFERENCES oauth_concesiones(id) ON DELETE SET NULL` | Referencia al registro de oauth concesion. | `src/lib/mcp/auth.ts` |

### `app_settings`

Parámetros configurables de la aplicación.

- **Origen del esquema:** `supabase/migrations/010_app_settings.sql`
- **Operaciones detectadas:** consulta, sincronización/upsert
- **Uso comprobado en Gestivo:**
  - `src/lib/devengados/actions.ts`
  - `src/lib/devengados/data.ts`
  - `src/lib/devengados/engine.ts`
  - `src/lib/mcp/catalogo/rotacion.ts`
  - `src/lib/settings.ts` — consulta, sincronización/upsert

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `key` | `TEXT PRIMARY KEY` | Almacena «key» como parte de app_settings; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/settings.ts`<br>`src/lib/devengados/data.ts` |
| `value` | `TEXT` | Almacena «value» como parte de app_settings; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/settings.ts` |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/settings.ts` |
| `updated_by` | `UUID REFERENCES profiles(id)` | Usuario que realizó la última modificación. | `src/lib/settings.ts` |

### `notifications`

Notificaciones internas para usuarios.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, alta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/configuracion/page.tsx`
  - `src/app/api/rotacion/accidentes/route.ts` — consulta, alta
  - `src/lib/actions.ts` — consulta, alta, actualización

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts` |
| `user_id` | `UUID REFERENCES profiles(id) ON DELETE CASCADE` | Referencia al usuario autenticado relacionado. | `src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts` |
| `title` | `TEXT NOT NULL` | Almacena «title» como parte de notifications; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts` |
| `message` | `TEXT` | Almacena «message» como parte de notifications; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts` |
| `link` | `TEXT` | Almacena «link» como parte de notifications; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts` |
| `is_read` | `BOOLEAN DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/actions.ts` |

### `profiles`

Perfil, rol y alcance organizacional de cada usuario autenticado.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, alta, sincronización/upsert
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`
  - `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`
  - `src/app/(dashboard)/configuracion/api/page.tsx` — consulta
  - `src/app/(dashboard)/configuracion/usuarios/actions.ts` — consulta
  - `src/app/(dashboard)/configuracion/usuarios/page.tsx` — consulta
  - `src/app/(dashboard)/documentos/page.tsx`
  - `src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`
  - `src/app/api/rotacion/accidentes/route.ts` — consulta, alta
  - … y 16 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>y 20 archivo(s) más |
| `full_name` | `TEXT NOT NULL` | Almacena «full name» como parte de profiles; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>`src/lib/actions.ts`<br>`src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>y 10 archivo(s) más |
| `email` | `TEXT NOT NULL` | Correo electrónico para contacto o identidad. | `src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>y 9 archivo(s) más |
| `avatar_url` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `role` | `user_role NOT NULL DEFAULT 'consulta'` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts`<br>`src/proxy.ts` |
| `is_active` | `BOOLEAN DEFAULT true` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/lib/actions.ts`<br>`src/app/api/rotacion/accidentes/route.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/actions.ts`<br>y 11 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 2 archivo(s) más |
| `user_type` | `TEXT REFERENCES user_types(key)` | Almacena «user type» como parte de profiles; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/app/(dashboard)/configuracion/usuarios/page.tsx`<br>`src/lib/devengados/actions.ts`<br>y 4 archivo(s) más |
| `scope_departments` | `TEXT[]` | Almacena «scope departments» como parte de profiles; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/lib/permissions.ts`<br>`src/app/(dashboard)/configuracion/usuarios/page.tsx`<br>y 1 archivo(s) más |

### `user_types`

Roles funcionales y matriz de permisos.

- **Origen del esquema:** `supabase/migrations/016_user_types_permissions.sql`
- **Operaciones detectadas:** consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/configuracion/usuarios/actions.ts` — consulta, actualización
  - `src/app/(dashboard)/configuracion/usuarios/page.tsx` — consulta
  - `src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`
  - `src/lib/devengados/data.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/permissions-shared.ts`
  - `src/lib/permissions.ts` — consulta
  - `src/proxy.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `key` | `TEXT PRIMARY KEY` | Almacena «key» como parte de user_types; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`<br>`src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/lib/devengados/data.ts`<br>y 3 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`<br>`src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/lib/devengados/data.ts`<br>y 3 archivo(s) más |
| `descripcion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`<br>`src/app/(dashboard)/configuracion/usuarios/actions.ts` |
| `modulos` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «modulos» como parte de user_types; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`<br>`src/lib/devengados/data.ts`<br>y 2 archivo(s) más |
| `alcance` | `TEXT NOT NULL DEFAULT 'all' CHECK (alcance IN ('all', 'departamentos'))` | Almacena «alcance» como parte de user_types; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`<br>`src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/lib/permissions.ts` |
| `puede_editar` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`<br>`src/lib/permissions.ts` |
| `es_sistema` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`<br>`src/app/(dashboard)/configuracion/usuarios/actions.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/devengados/data.ts`<br>`src/lib/external/resources.ts` |
| `submodulos` | `JSONB NOT NULL DEFAULT '{}'` | Almacena «submodulos» como parte de user_types; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/usuarios/actions.ts`<br>`src/lib/permissions.ts`<br>`src/proxy.ts`<br>y 4 archivo(s) más |

### `webhook_configs`

Configuración de integraciones salientes.

- **Origen del esquema:** `supabase/migrations/003_webhook_configs.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/integraciones/[slug]/page.tsx` — consulta
  - `src/app/api/webhooks/[slug]/route.ts` — consulta, alta
  - `src/lib/actions.ts` — consulta, alta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `name` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts`<br>`src/app/(dashboard)/integraciones/[slug]/page.tsx` |
| `slug` | `TEXT NOT NULL UNIQUE` | Almacena «slug» como parte de webhook_configs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhooks/[slug]/route.ts`<br>`src/app/(dashboard)/integraciones/[slug]/page.tsx`<br>`src/lib/actions.ts` |
| `is_active` | `BOOLEAN DEFAULT true` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/app/api/webhooks/[slug]/route.ts`<br>`src/lib/actions.ts` |
| `field_mappings` | `JSONB NOT NULL DEFAULT '{}'` | Almacena «field mappings» como parte de webhook_configs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhooks/[slug]/route.ts`<br>`src/lib/actions.ts` |
| `auth_secret` | `TEXT` | Almacena «auth secret» como parte de webhook_configs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/actions.ts` |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |

### `webhook_logs`

Bitácora de entregas de webhooks.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, alta, actualización, eliminación
- **Uso comprobado en Gestivo:**
  - `src/app/api/webhooks/[slug]/route.ts` — consulta, alta
  - `src/lib/actions.ts` — consulta, actualización, eliminación
  - `src/lib/external/resources.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts`<br>`src/lib/external/resources.ts` |
| `source` | `TEXT NOT NULL DEFAULT 'webhook'` | Almacena «source» como parte de webhook_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhooks/[slug]/route.ts`<br>`src/lib/actions.ts` |
| `payload` | `JSONB NOT NULL` | Almacena «payload» como parte de webhook_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `candidate_id` | `UUID REFERENCES candidates(id)` | Referencia al candidato relacionado. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `status` | `TEXT DEFAULT 'recibido'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts`<br>`src/lib/external/resources.ts` |
| `error_message` | `TEXT` | Almacena «error message» como parte de webhook_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhooks/[slug]/route.ts` |
| `processing_result` | `JSONB` | Almacena «processing result» como parte de webhook_logs; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/webhooks/[slug]/route.ts`<br>`src/lib/actions.ts` |
| `processed_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/api/webhooks/[slug]/route.ts`<br>`src/lib/actions.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/actions.ts`<br>`src/lib/external/resources.ts` |

## Gestión documental y empleados

### `disciplinary_records`

Procesos o registros disciplinarios.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/actions.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts` |
| `employee_id` | `UUID REFERENCES employees(id) ON DELETE CASCADE` | Referencia al empleado relacionado. | `src/lib/actions.ts` |
| `type` | `TEXT NOT NULL` | Almacena «type» como parte de disciplinary_records; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts` |
| `description` | `TEXT NOT NULL` | Almacena «description» como parte de disciplinary_records; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts` |
| `date` | `DATE NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/actions.ts` |
| `status` | `descargo_status DEFAULT 'abierto'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/actions.ts` |
| `resolution` | `TEXT` | Almacena «resolution» como parte de disciplinary_records; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts` |
| `attachments` | `JSONB` | Almacena «attachments» como parte de disciplinary_records; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `created_by` | `UUID REFERENCES profiles(id)` | Usuario que creó el registro. | `src/lib/actions.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/actions.ts` |

### `document_categories`

Catálogo de categorías documentales.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`
  - `src/app/(dashboard)/documentos/page.tsx`
  - `src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`
  - `src/lib/actions.ts` — consulta
  - `src/lib/constants.ts`
  - `src/lib/mcp/catalogo/reclutamiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>y 3 archivo(s) más |
| `name` | `TEXT NOT NULL UNIQUE` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/actions.ts`<br>`src/app/(dashboard)/documentos/page.tsx`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>y 2 archivo(s) más |
| `slug` | `TEXT NOT NULL UNIQUE` | Almacena «slug» como parte de document_categories; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/constants.ts`<br>`src/app/(dashboard)/documentos/page.tsx`<br>`src/lib/actions.ts`<br>y 1 archivo(s) más |
| `color` | `TEXT DEFAULT '#4F46E5'` | Almacena «color» como parte de document_categories; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/constants.ts`<br>`src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/app/(dashboard)/documentos/page.tsx`<br>y 2 archivo(s) más |
| `required_for_hiring` | `BOOLEAN DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |

### `documents`

Metadatos de documentos de empleados.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** alta, consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/candidatos/[id]/page.tsx`
  - `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`
  - `src/app/(dashboard)/documentos/document-tabs.tsx`
  - `src/app/(dashboard)/documentos/page.tsx`
  - `src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`
  - `src/app/(dashboard)/empleados/[id]/page.tsx`
  - `src/app/(dashboard)/integraciones/[slug]/config-form.tsx`
  - `src/app/api/webhooks/[slug]/route.ts` — alta
  - … y 4 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>y 8 archivo(s) más |
| `name` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/external/resources.ts`<br>`src/app/(dashboard)/documentos/document-tabs.tsx`<br>`src/lib/actions.ts`<br>y 8 archivo(s) más |
| `file_path` | `TEXT NOT NULL` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>`src/lib/actions.ts`<br>y 3 archivo(s) más |
| `file_size` | `BIGINT` | Almacena «file size» como parte de documents; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/documentos/page.tsx`<br>`src/app/api/webhooks/[slug]/route.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `mime_type` | `TEXT` | Almacena «mime type» como parte de documents; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>y 2 archivo(s) más |
| `category_id` | `UUID REFERENCES document_categories(id)` | Referencia al registro de category. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `status` | `document_status DEFAULT 'pendiente'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/actions.ts`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>y 7 archivo(s) más |
| `classification_confidence` | `REAL` | Almacena «classification confidence» como parte de documents; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `needs_review` | `BOOLEAN DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `candidate_id` | `UUID REFERENCES candidates(id) ON DELETE SET NULL` | Referencia al candidato relacionado. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `employee_id` | `UUID REFERENCES employees(id) ON DELETE SET NULL` | Referencia al empleado relacionado. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `assigned_to` | `UUID REFERENCES profiles(id)` | Almacena «assigned to» como parte de documents; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts` |
| `uploaded_by` | `UUID REFERENCES profiles(id)` | Almacena «uploaded by» como parte de documents; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `expires_at` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>y 4 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/documentos/page.tsx`<br>`src/lib/mcp/catalogo/contexto.ts` |

### `employee_events`

Eventos laborales del empleado.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/actions.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts` |
| `employee_id` | `UUID REFERENCES employees(id) ON DELETE CASCADE` | Referencia al empleado relacionado. | `src/lib/actions.ts` |
| `type` | `novedad_type NOT NULL` | Almacena «type» como parte de employee_events; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts` |
| `description` | `TEXT` | Almacena «description» como parte de employee_events; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts` |
| `start_date` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/actions.ts` |
| `end_date` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/actions.ts` |
| `status` | `TEXT DEFAULT 'pendiente'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/actions.ts` |
| `attachments` | `JSONB` | Almacena «attachments» como parte de employee_events; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `created_by` | `UUID REFERENCES profiles(id)` | Usuario que creó el registro. | `src/lib/actions.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/actions.ts` |

### `employees`

Maestro de empleados sincronizados o creados manualmente.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, alta, actualización, eliminación
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/ausentismo/matriz/actions.ts` — consulta
  - `src/app/(dashboard)/documentos/page.tsx`
  - `src/app/(dashboard)/empleados/empleados-client.tsx`
  - `src/app/(dashboard)/empleados/page.tsx`
  - `src/app/(dashboard)/incapacidades/expediente-ficha.tsx`
  - `src/app/(dashboard)/incapacidades/[id]/actions.ts`
  - `src/app/(dashboard)/incapacidades/[id]/gestion.tsx`
  - `src/app/api/rotacion/upload-records/route.ts` — consulta
  - … y 13 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/app/(dashboard)/incapacidades/[id]/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>y 15 archivo(s) más |
| `candidate_id` | `UUID REFERENCES candidates(id)` | Referencia al candidato relacionado. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts` |
| `full_name` | `TEXT NOT NULL` | Almacena «full name» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/(dashboard)/documentos/page.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 5 archivo(s) más |
| `document_number` | `TEXT` | Almacena «document number» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/api/rotacion/upload-records/route.ts`<br>y 8 archivo(s) más |
| `email` | `TEXT` | Correo electrónico para contacto o identidad. | `src/lib/incapacidades/liquidacion.ts`<br>`src/app/(dashboard)/empleados/empleados-client.tsx`<br>`src/lib/actions.ts`<br>y 7 archivo(s) más |
| `phone` | `TEXT` | Número telefónico de contacto. | `src/lib/actions.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>y 2 archivo(s) más |
| `avatar_url` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `department_id` | `UUID REFERENCES departments(id)` | Referencia al registro de department. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/contratacion/actions.ts`<br>y 2 archivo(s) más |
| `position` | `TEXT NOT NULL` | Almacena «position» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/(dashboard)/empleados/empleados-client.tsx`<br>`src/lib/actions.ts`<br>y 5 archivo(s) más |
| `status` | `employee_status DEFAULT 'activo'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/gema/sync.ts`<br>y 9 archivo(s) más |
| `hire_date` | `DATE NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/incapacidades/liquidacion.ts`<br>`src/app/(dashboard)/empleados/empleados-client.tsx`<br>y 4 archivo(s) más |
| `end_date` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/api/rotacion/upload-records/route.ts`<br>y 2 archivo(s) más |
| `contract_type` | `contract_type DEFAULT 'indefinido'` | Almacena «contract type» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `salary` | `NUMERIC` | Almacena «salary» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `salary_currency` | `TEXT DEFAULT 'COP'` | Almacena «salary currency» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `supervisor_id` | `UUID REFERENCES profiles(id)` | Referencia al registro de supervisor. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `location` | `TEXT` | Almacena «location» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `eps` | `TEXT` | Almacena «eps» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 6 archivo(s) más |
| `afp` | `TEXT` | Almacena «afp» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `arl` | `TEXT` | Almacena «arl» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 6 archivo(s) más |
| `caja_compensacion` | `TEXT` | Almacena «caja compensacion» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/upload-records/route.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `observations` | `TEXT` | Almacena «observations» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>y 9 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 6 archivo(s) más |
| `gema_codigo` | `TEXT` | Almacena «gema codigo» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/gema/sync.ts` |
| `source` | `TEXT DEFAULT 'manual'` | Almacena «source» como parte de employees; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |

## Integración GEMA

### `gema_sync_state`

Estado y marcas de agua de sincronización con GEMA.

- **Origen del esquema:** `supabase/migrations/011_gema_sync.sql`
- **Operaciones detectadas:** consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/rotacion/datos/page.tsx` — consulta
  - `src/app/api/cron/sync-gema/route.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/gema/actions.ts` — consulta
  - `src/lib/gema/sync.ts` — actualización
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - … y 3 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `dataset` | `TEXT PRIMARY KEY` | Almacena «dataset» como parte de gema_sync_state; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/actions.ts`<br>y 6 archivo(s) más |
| `last_synced_date` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/actions.ts`<br>y 5 archivo(s) más |
| `last_run_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/consultas.ts`<br>`src/lib/external/resources.ts`<br>y 3 archivo(s) más |
| `rows_synced` | `INTEGER DEFAULT 0` | Almacena «rows synced» como parte de gema_sync_state; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/gema/actions.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 1 archivo(s) más |
| `status` | `TEXT DEFAULT 'idle'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/cron/sync-gema/route.ts`<br>y 5 archivo(s) más |
| `error` | `TEXT` | Almacena «error» como parte de gema_sync_state; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/consultas.ts`<br>`src/lib/gema/actions.ts`<br>y 6 archivo(s) más |

### `ingreso_tercero`

Ingresos de terceros importados desde GEMA.

- **Origen del esquema:** `supabase/migrations/011_gema_sync.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/rotacion/datos/DatosClient.tsx`
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - `src/lib/mcp/catalogo/rotacion.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 3 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>y 3 archivo(s) más |
| `tipo_cierre` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 1 archivo(s) más |
| `ruta` | `TEXT` | Almacena «ruta» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 3 archivo(s) más |
| `grupo_liquidacion` | `TEXT` | Almacena «grupo liquidacion» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 1 archivo(s) más |
| `tipo_prom` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `tipo_gps` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `codigo_vehiculo` | `TEXT` | Almacena «codigo vehiculo» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>y 2 archivo(s) más |
| `placa` | `TEXT` | Placa del vehículo usada para cruces operativos. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 3 archivo(s) más |
| `cedula_conductor` | `TEXT` | Almacena «cedula conductor» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>y 2 archivo(s) más |
| `codigo_conductor` | `TEXT` | Almacena «codigo conductor» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 2 archivo(s) más |
| `conductor_nombre` | `TEXT` | Almacena «conductor nombre» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 1 archivo(s) más |
| `cedula_propietario` | `TEXT` | Almacena «cedula propietario» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 1 archivo(s) más |
| `propietario_nombre` | `TEXT` | Almacena «propietario nombre» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `tipo_propietario` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `pasaje` | `NUMERIC(12,2)` | Almacena «pasaje» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `viajes` | `NUMERIC(10,2)` | Almacena «viajes» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 4 archivo(s) más |
| `timbradas` | `NUMERIC(12,2)` | Almacena «timbradas» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 3 archivo(s) más |
| `timbradas_cu` | `NUMERIC(12,2)` | Almacena «timbradas cu» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `descuento` | `NUMERIC(12,2)` | Almacena «descuento» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `fet` | `NUMERIC(14,2)` | Almacena «fet» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `factor_calidad` | `NUMERIC(14,2)` | Almacena «factor calidad» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `valor_camb` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `bruto` | `NUMERIC(14,2)` | Almacena «bruto» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>y 2 archivo(s) más |
| `total_cartulina` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `cartu_admon` | `NUMERIC(14,2)` | Almacena «cartu admon» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `cartu_estudio` | `NUMERIC(14,2)` | Almacena «cartu estudio» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `cartu_fondo` | `NUMERIC(14,2)` | Almacena «cartu fondo» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `cartu_poliza` | `NUMERIC(14,2)` | Almacena «cartu poliza» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `cartu_presta` | `NUMERIC(14,2)` | Almacena «cartu presta» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `salario` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `anticipo` | `NUMERIC(14,2)` | Almacena «anticipo» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 2 archivo(s) más |
| `factura` | `NUMERIC(14,2)` | Almacena «factura» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts` |
| `incentivo_c` | `NUMERIC(14,2)` | Almacena «incentivo c» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `valor_descuentos` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts` |
| `combustible` | `NUMERIC(14,2)` | Almacena «combustible» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `sitra` | `NUMERIC(14,2)` | Almacena «sitra» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `rtica` | `NUMERIC(14,2)` | Almacena «rtica» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `admon` | `NUMERIC(14,2)` | Almacena «admon» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `liquido` | `NUMERIC(14,2)` | Almacena «liquido» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `source_file` | `TEXT DEFAULT 'GEMA'` | Almacena «source file» como parte de ingreso_tercero; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 2 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/external/resources.ts`<br>y 3 archivo(s) más |

### `propietarios`

Propietarios importados desde GEMA.

- **Origen del esquema:** `supabase/migrations/011_gema_sync.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/rotacion/datos/DatosClient.tsx`
  - `src/app/(dashboard)/tesoreria/devengados/parametros/parametros-client.tsx`
  - `src/lib/comunicaciones/ficha.ts`
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts` — consulta
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema-operacion.ts`
  - `src/lib/mcp/catalogo/gema.ts`
  - … y 2 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>y 6 archivo(s) más |
| `cedula` | `TEXT NOT NULL UNIQUE` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 6 archivo(s) más |
| `codigo` | `TEXT` | Código del sistema origen o catálogo para identificación e integración. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 6 archivo(s) más |
| `nombre` | `TEXT` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 6 archivo(s) más |
| `tipo_identificacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `tipo_propietario` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 4 archivo(s) más |
| `plazo_pago` | `TEXT` | Almacena «plazo pago» como parte de propietarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `direccion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 2 archivo(s) más |
| `telefono` | `TEXT` | Número telefónico de contacto. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 1 archivo(s) más |
| `celular` | `TEXT` | Almacena «celular» como parte de propietarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 1 archivo(s) más |
| `correo` | `TEXT` | Almacena «correo» como parte de propietarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 1 archivo(s) más |
| `estado` | `TEXT NOT NULL DEFAULT 'ACTIVO'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/lib/gema/sync.ts`<br>y 5 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>y 2 archivo(s) más |

### `viajes_recaudados`

Viajes y recaudo importados desde GEMA.

- **Origen del esquema:** `supabase/migrations/011_gema_sync.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/rotacion/datos/DatosClient.tsx`
  - `src/app/(dashboard)/tesoreria/devengados/simulador/page.tsx`
  - `src/lib/devengados/data.ts`
  - `src/lib/devengados/rendimiento.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts` — consulta
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema-operacion.ts`
  - … y 4 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 7 archivo(s) más |
| `numero` | `BIGINT NOT NULL UNIQUE` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>y 7 archivo(s) más |
| `fecha_viaje` | `DATE NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 6 archivo(s) más |
| `hora_despacho` | `TEXT` | Almacena «hora despacho» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 4 archivo(s) más |
| `hora_llegada` | `TEXT` | Almacena «hora llegada» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/gema/sync.ts`<br>y 3 archivo(s) más |
| `codigo_vehiculo` | `TEXT` | Almacena «codigo vehiculo» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 6 archivo(s) más |
| `placa` | `TEXT` | Placa del vehículo usada para cruces operativos. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/rotacion/data/mapa-calor.ts`<br>`src/lib/gema/sync.ts`<br>y 6 archivo(s) más |
| `conductor_nombre` | `TEXT` | Almacena «conductor nombre» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>y 2 archivo(s) más |
| `codigo_conductor` | `TEXT` | Almacena «codigo conductor» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/devengados/rendimiento.ts`<br>y 4 archivo(s) más |
| `cedula_conductor` | `TEXT` | Almacena «cedula conductor» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 4 archivo(s) más |
| `viaje` | `TEXT` | Almacena «viaje» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 7 archivo(s) más |
| `inicial` | `NUMERIC(14,2)` | Almacena «inicial» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `final` | `NUMERIC(14,2)` | Almacena «final» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `descuento` | `NUMERIC(14,2)` | Almacena «descuento» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 3 archivo(s) más |
| `timbradas` | `NUMERIC(12,2)` | Almacena «timbradas» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 6 archivo(s) más |
| `timbradas_real` | `NUMERIC(12,2)` | Almacena «timbradas real» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `bruto` | `NUMERIC(14,2)` | Almacena «bruto» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/devengados/rendimiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 6 archivo(s) más |
| `anticipo` | `NUMERIC(14,2)` | Almacena «anticipo» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 3 archivo(s) más |
| `factura` | `NUMERIC(14,2)` | Almacena «factura» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts` |
| `ahorro` | `NUMERIC(14,2)` | Almacena «ahorro» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/rendimiento.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 3 archivo(s) más |
| `neto` | `NUMERIC(14,2)` | Almacena «neto» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 5 archivo(s) más |
| `fecha_recaudo` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 1 archivo(s) más |
| `is_extemporaneo` | `BOOLEAN DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `cajero` | `TEXT` | Almacena «cajero» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `pasaje` | `NUMERIC(12,2)` | Almacena «pasaje» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `propietario_nombre` | `TEXT` | Almacena «propietario nombre» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `cedula_propietario` | `TEXT` | Almacena «cedula propietario» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 1 archivo(s) más |
| `estado` | `TEXT` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>y 6 archivo(s) más |
| `novedad` | `TEXT` | Almacena «novedad» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 5 archivo(s) más |
| `ruta_programada` | `TEXT` | Almacena «ruta programada» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 4 archivo(s) más |
| `ruta_reprogramada` | `TEXT` | Almacena «ruta reprogramada» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/devengados/data.ts`<br>y 4 archivo(s) más |
| `is_viaje_contable` | `BOOLEAN DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts` |
| `source_file` | `TEXT DEFAULT 'GEMA'` | Almacena «source file» como parte de viajes_recaudados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 2 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 4 archivo(s) más |

## Mantenimiento

### `mantenimiento_alertas`

Alertas preventivas/correctivas de mantenimiento.

- **Origen del esquema:** `supabase/migrations/049_modulo_mantenimiento.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/mantenimiento/actions.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/mantenimiento/danos.ts` — consulta
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/mantenimiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 1 archivo(s) más |
| `concepto_id` | `UUID NOT NULL REFERENCES mantenimiento_conceptos(id)` | Referencia al registro de concepto. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts` |
| `cantidad` | `INTEGER NOT NULL DEFAULT 2 CHECK (cantidad >= 2)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 1 archivo(s) más |
| `estado` | `TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada'))` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `orden_taller` | `TEXT` | Almacena «orden taller» como parte de mantenimiento_alertas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mantenimiento/danos.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts` |
| `notas_cierre` | `TEXT` | Almacena «notas cierre» como parte de mantenimiento_alertas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mantenimiento/danos.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts` |
| `cerrada_por` | `UUID REFERENCES profiles(id) ON DELETE SET NULL` | Almacena «cerrada por» como parte de mantenimiento_alertas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts` |
| `cerrada_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mantenimiento/danos.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 1 archivo(s) más |
| `codigo_vehiculo` | `TEXT NOT NULL REFERENCES vehiculos(codigo)` | Almacena «codigo vehiculo» como parte de mantenimiento_alertas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 2 archivo(s) más |
| `source_id` | `UUID` | Identificador en el sistema origen; evita duplicados y permite reconciliación. | `src/lib/mcp/catalogo/mantenimiento.ts` |

### `mantenimiento_auditoria`

Auditoría del módulo de mantenimiento.

- **Origen del esquema:** `supabase/migrations/049_modulo_mantenimiento.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/mantenimiento/actions.ts` — consulta, alta
  - `src/app/(publico)/reportar-dano/actions.ts` — consulta, alta
  - `src/lib/mcp/catalogo/mantenimiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/app/(publico)/reportar-dano/actions.ts` |
| `alerta_id` | `UUID REFERENCES mantenimiento_alertas(id) ON DELETE CASCADE` | Referencia al registro de alerta. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts` |
| `reporte_id` | `UUID REFERENCES mantenimiento_reportes(id) ON DELETE CASCADE` | Referencia al registro de reporte. | `src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/app/(publico)/reportar-dano/actions.ts` |
| `accion` | `TEXT NOT NULL CHECK (accion IN ('reporte_creado', 'alerta_abierta', 'alerta_cerrada', 'buseta_creada'))` | Almacena «accion» como parte de mantenimiento_auditoria; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/app/(publico)/reportar-dano/actions.ts` |
| `detalle` | `JSONB` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/app/(publico)/reportar-dano/actions.ts` |
| `user_id` | `UUID REFERENCES profiles(id) ON DELETE SET NULL` | Referencia al usuario autenticado relacionado. | `src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/app/(publico)/reportar-dano/actions.ts` |
| `user_email` | `TEXT` | Almacena «user email» como parte de mantenimiento_auditoria; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/mantenimiento/actions.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts` |

### `mantenimiento_conceptos`

Catálogo de conceptos de mantenimiento.

- **Origen del esquema:** `supabase/migrations/049_modulo_mantenimiento.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/mantenimiento/actions.ts` — consulta, alta
  - `src/app/(dashboard)/mantenimiento/alertas/alertas-client.tsx`
  - `src/app/(dashboard)/mantenimiento/mantenimiento-client.tsx`
  - `src/app/(dashboard)/mantenimiento/page.tsx` — consulta
  - `src/app/(dashboard)/mantenimiento/registrar/page.tsx` — consulta
  - `src/app/(dashboard)/mantenimiento/reportes/reportes-client.tsx`
  - `src/app/(publico)/reportar-dano/actions.ts` — consulta
  - `src/lib/external/resources.ts`
  - … y 3 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/alertas/alertas-client.tsx`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>y 7 archivo(s) más |
| `nombre` | `TEXT NOT NULL UNIQUE` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(publico)/reportar-dano/actions.ts`<br>`src/app/(dashboard)/mantenimiento/reportes/reportes-client.tsx`<br>y 7 archivo(s) más |
| `descripcion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/(publico)/reportar-dano/actions.ts`<br>y 6 archivo(s) más |
| `activo` | `BOOLEAN NOT NULL DEFAULT true` | Indica si el registro está disponible para uso operativo. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/app/(publico)/reportar-dano/actions.ts`<br>y 5 archivo(s) más |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 3 archivo(s) más |

### `mantenimiento_frenos`

Mediciones e historial de graduación de frenos.

- **Origen del esquema:** `supabase/migrations/20260901202556_graduacion_de_frenos.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/mantenimiento/frenos/actions.ts` — consulta, alta
  - `src/lib/external/resources.ts`
  - `src/lib/mantenimiento/frenos.ts` — consulta
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/mantenimiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mantenimiento/frenos.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `fecha` | `DATE NOT NULL DEFAULT CURRENT_DATE` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `codigo_vehiculo` | `TEXT NOT NULL REFERENCES vehiculos(codigo)` | Almacena «codigo vehiculo» como parte de mantenimiento_frenos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mantenimiento/frenos.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `graduacion` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/frenos/actions.ts`<br>`src/lib/mantenimiento/frenos.ts` |
| `observacion` | `TEXT` | Almacena «observacion» como parte de mantenimiento_frenos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/mantenimiento/frenos/actions.ts`<br>`src/lib/mantenimiento/frenos.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts` |
| `registrado_por` | `UUID REFERENCES profiles(id) ON DELETE SET NULL` | Almacena «registrado por» como parte de mantenimiento_frenos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/mantenimiento/frenos/actions.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts` |
| `registrado_por_email` | `TEXT` | Almacena «registrado por email» como parte de mantenimiento_frenos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mantenimiento/frenos.ts`<br>`src/app/(dashboard)/mantenimiento/frenos/actions.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mantenimiento/frenos.ts`<br>y 1 archivo(s) más |
| `source_id` | `UUID` | Identificador en el sistema origen; evita duplicados y permite reconciliación. | `src/lib/mcp/catalogo/mantenimiento.ts` |

### `mantenimiento_reportes`

Reportes de daño o necesidad de mantenimiento.

- **Origen del esquema:** `supabase/migrations/049_modulo_mantenimiento.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/mantenimiento/actions.ts` — consulta, alta
  - `src/app/(publico)/reportar-dano/actions.ts` — consulta, alta
  - `src/lib/external/resources.ts`
  - `src/lib/mantenimiento/danos.ts` — consulta
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/mantenimiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 2 archivo(s) más |
| `source_id` | `UUID UNIQUE` | Identificador en el sistema origen; evita duplicados y permite reconciliación. | `src/lib/mcp/catalogo/mantenimiento.ts` |
| `cedula_conductor` | `TEXT NOT NULL REFERENCES conductores(cedula)` | Almacena «cedula conductor» como parte de mantenimiento_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 2 archivo(s) más |
| `concepto_id` | `UUID NOT NULL REFERENCES mantenimiento_conceptos(id)` | Referencia al registro de concepto. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/app/(publico)/reportar-dano/actions.ts` |
| `descripcion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/(publico)/reportar-dano/actions.ts`<br>y 2 archivo(s) más |
| `fecha_reporte` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mantenimiento/danos.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>y 2 archivo(s) más |
| `alerta_id` | `UUID REFERENCES mantenimiento_alertas(id) ON DELETE SET NULL` | Referencia al registro de alerta. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mantenimiento/danos.ts` |
| `created_by` | `UUID REFERENCES profiles(id) ON DELETE SET NULL` | Usuario que creó el registro. | `src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts` |
| `created_by_email` | `TEXT` | Almacena «created by email» como parte de mantenimiento_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 1 archivo(s) más |
| `codigo_vehiculo` | `TEXT NOT NULL REFERENCES vehiculos(codigo)` | Almacena «codigo vehiculo» como parte de mantenimiento_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/app/(dashboard)/mantenimiento/actions.ts`<br>`src/lib/mantenimiento/danos.ts`<br>y 3 archivo(s) más |

## Operativo

### `geo_direcciones`

Caché de geocodificación de direcciones.

- **Origen del esquema:** `supabase/migrations/056_mapa_calor_geocodificacion.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/rotacion/data/mapa-calor.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `lat` | `numeric(7,3) NOT NULL` | Almacena «lat» como parte de geo_direcciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/rotacion/data/mapa-calor.ts` |
| `lng` | `numeric(7,3) NOT NULL` | Almacena «lng» como parte de geo_direcciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/rotacion/data/mapa-calor.ts` |
| `direccion` | `text NOT NULL` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/rotacion/data/mapa-calor.ts` |
| `fuente` | `text NOT NULL DEFAULT 'nominatim'` | Almacena «fuente» como parte de geo_direcciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/rotacion/data/mapa-calor.ts` |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |

### `geo_trazados`

Trazados geográficos calculados para rutas.

- **Origen del esquema:** `supabase/migrations/067_geo_trazados.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/rotacion/data/mapa-calor.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `despacho` | `BIGINT PRIMARY KEY` | Almacena «despacho» como parte de geo_trazados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/rotacion/data/mapa-calor.ts` |
| `puntos` | `JSONB NOT NULL` | Almacena «puntos» como parte de geo_trazados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/rotacion/data/mapa-calor.ts` |
| `fuente` | `TEXT NOT NULL DEFAULT 'osrm'` | Almacena «fuente» como parte de geo_trazados; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/rotacion/data/mapa-calor.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |

### `operativo_documento_tipos`

Tipos y reglas de documentos obligatorios del vehículo.

- **Origen del esquema:** `supabase/migrations/20260904191056_modulo_operativo_documentos_del_vehiculo_y_vencimientos.sql`
- **Operaciones detectadas:** consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/operativo/actions.ts` — consulta, actualización
  - `src/app/api/operativo/documentos/route.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - `src/lib/operativo/constants.ts`
  - `src/lib/operativo/data.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `key` | `TEXT PRIMARY KEY` | Almacena «key» como parte de operativo_documento_tipos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>y 3 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `columna_gema` | `TEXT CHECK (columna_gema IN ( 'fecha_soat', 'fecha_tecno', 'fecha_tarjeta_op', 'fecha_srcc', 'fecha_srce', 'fecha_full_amparo', 'fecha_contrato' ))` | Almacena «columna gema» como parte de operativo_documento_tipos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/constants.ts`<br>`src/lib/operativo/data.ts` |
| `dias_proximo` | `INTEGER NOT NULL DEFAULT 30 CHECK (dias_proximo > 0)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/operativo/constants.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>y 1 archivo(s) más |
| `dias_critico` | `INTEGER NOT NULL DEFAULT 15 CHECK (dias_critico >= 0)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/constants.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>y 1 archivo(s) más |
| `orden` | `INTEGER NOT NULL DEFAULT 100` | Almacena «orden» como parte de operativo_documento_tipos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/data.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `activo` | `BOOLEAN NOT NULL DEFAULT true` | Indica si el registro está disponible para uso operativo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>`src/lib/operativo/data.ts`<br>y 3 archivo(s) más |
| `updated_by_email` | `TEXT` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/actions.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |

### `operativo_vehiculo_documentos`

Documentos y vencimientos registrados por vehículo.

- **Origen del esquema:** `supabase/migrations/20260904191056_modulo_operativo_documentos_del_vehiculo_y_vencimientos.sql`
- **Operaciones detectadas:** consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/operativo/actions.ts` — consulta, actualización
  - `src/app/api/operativo/documentos/route.ts`
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - `src/lib/operativo/data.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>y 2 archivo(s) más |
| `codigo_vehiculo` | `TEXT NOT NULL REFERENCES vehiculos(codigo)` | Almacena «codigo vehiculo» como parte de operativo_vehiculo_documentos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>y 3 archivo(s) más |
| `tipo` | `TEXT NOT NULL REFERENCES operativo_documento_tipos(key)` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>y 3 archivo(s) más |
| `numero` | `TEXT` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `entidad` | `TEXT` | Almacena «entidad» como parte de operativo_vehiculo_documentos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `fecha_expedicion` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/api/operativo/documentos/route.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/data.ts` |
| `fecha_vencimiento` | `DATE NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>`src/lib/operativo/data.ts` |
| `archivo_ruta` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/operativo/data.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `archivo_nombre` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>`src/lib/operativo/data.ts` |
| `archivo_mime` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/api/operativo/documentos/route.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/data.ts` |
| `archivo_tamano` | `INTEGER` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/app/api/operativo/documentos/route.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/data.ts` |
| `observaciones` | `TEXT` | Texto libre de contexto operativo y seguimiento. | `src/app/api/operativo/documentos/route.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/data.ts` |
| `created_by` | `UUID REFERENCES auth.users(id)` | Usuario que creó el registro. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/operativo/documentos/route.ts` |
| `created_by_email` | `TEXT` | Almacena «created by email» como parte de operativo_vehiculo_documentos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/operativo/documentos/route.ts`<br>`src/lib/operativo/data.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/operativo/data.ts`<br>y 1 archivo(s) más |
| `anulado_en` | `TIMESTAMPTZ` | Almacena «anulado en» como parte de operativo_vehiculo_documentos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>`src/lib/operativo/data.ts` |
| `anulado_por_email` | `TEXT` | Almacena «anulado por email» como parte de operativo_vehiculo_documentos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/operativo/actions.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/data.ts` |
| `motivo_anulacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>`src/lib/operativo/data.ts` |

### `operativo_velocidad_parametros`

Umbrales configurables para detectar exceso de velocidad.

- **Origen del esquema:** `supabase/migrations/20260904212545_operativo_exceso_de_velocidad_incidencias_por_conductor_y_reporte_a_rrhh.sql`
- **Operaciones detectadas:** consulta, sincronización/upsert
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/operativo/velocidad/actions.ts` — consulta, sincronización/upsert
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - `src/lib/operativo/velocidad.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)` | Identificador único del registro. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/operativo/velocidad.ts`<br>y 1 archivo(s) más |
| `umbral_kmh` | `NUMERIC(5,1) NOT NULL DEFAULT 60 CHECK (umbral_kmh >= 50 AND umbral_kmh <= 150)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/operativo/velocidad.ts` |
| `minimo_incidencias` | `INTEGER NOT NULL DEFAULT 4 CHECK (minimo_incidencias >= 1 AND minimo_incidencias <= 100)` | Almacena «minimo incidencias» como parte de operativo_velocidad_parametros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/operativo/velocidad.ts` |
| `minutos_agrupacion` | `INTEGER NOT NULL DEFAULT 5 CHECK (minutos_agrupacion >= 1 AND minutos_agrupacion <= 120)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/operativo/velocidad.ts` |
| `updated_by_email` | `TEXT` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/velocidad.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/velocidad.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>y 1 archivo(s) más |

### `operativo_velocidad_reportes`

Incidencias de velocidad consolidadas y reportadas a RR. HH.

- **Origen del esquema:** `supabase/migrations/20260904212545_operativo_exceso_de_velocidad_incidencias_por_conductor_y_reporte_a_rrhh.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/operativo/velocidad/actions.ts` — consulta, alta
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - `src/lib/operativo/velocidad.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/operativo/velocidad.ts`<br>y 1 archivo(s) más |
| `cedula` | `TEXT NOT NULL` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `codigo` | `TEXT` | Código del sistema origen o catálogo para identificación e integración. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/operativo/velocidad.ts`<br>y 2 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `semana_desde` | `DATE NOT NULL` | Almacena «semana desde» como parte de operativo_velocidad_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/velocidad.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>y 1 archivo(s) más |
| `semana_hasta` | `DATE NOT NULL` | Almacena «semana hasta» como parte de operativo_velocidad_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/velocidad.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts` |
| `incidencias` | `INTEGER NOT NULL CHECK (incidencias > 0)` | Almacena «incidencias» como parte de operativo_velocidad_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/operativo/velocidad.ts`<br>y 2 archivo(s) más |
| `velocidad_max` | `NUMERIC(6,2)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/operativo/velocidad.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts` |
| `reportado_en` | `DATE NOT NULL` | Almacena «reportado en» como parte de operativo_velocidad_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/velocidad.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts` |
| `observaciones` | `TEXT` | Texto libre de contexto operativo y seguimiento. | `src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/operativo/velocidad.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `created_by` | `UUID REFERENCES auth.users(id)` | Usuario que creó el registro. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts` |
| `created_by_email` | `TEXT` | Almacena «created by email» como parte de operativo_velocidad_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/operativo/velocidad.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/operativo/velocidad.ts`<br>y 1 archivo(s) más |
| `anulada_en` | `TIMESTAMPTZ` | Almacena «anulada en» como parte de operativo_velocidad_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `anulada_por_email` | `TEXT` | Almacena «anulada por email» como parte de operativo_velocidad_reportes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/operativo/velocidad/actions.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `motivo_anulacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/actions.ts` |

### `puntos_virtuales`

Maestro de puntos virtuales/geográficos operativos.

- **Origen del esquema:** `supabase/migrations/027_puntos_virtuales.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/api/cron/sync-gema/route.ts`
  - `src/app/docs/api/page.tsx`
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts` — consulta
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - `src/lib/rotacion/data/alarmas.ts` — consulta
  - … y 1 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/app/docs/api/page.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 2 archivo(s) más |
| `numero` | `BIGINT NOT NULL UNIQUE` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 3 archivo(s) más |
| `imei` | `TEXT` | Almacena «imei» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `placa` | `TEXT` | Placa del vehículo usada para cruces operativos. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/rotacion/data/mapa-calor.ts`<br>`src/lib/gema/sync.ts`<br>y 4 archivo(s) más |
| `codigo_vehiculo` | `TEXT` | Almacena «codigo vehiculo» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>y 4 archivo(s) más |
| `registradora` | `BIGINT` | Almacena «registradora» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/rotacion/data/mapa-calor.ts`<br>y 2 archivo(s) más |
| `pasajeros_dia` | `INTEGER` | Almacena «pasajeros dia» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `fecha_hora` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 5 archivo(s) más |
| `hora` | `TEXT` | Almacena «hora» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 5 archivo(s) más |
| `cod_pv` | `TEXT` | Almacena «cod pv» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/rotacion/data/mapa-calor.ts`<br>y 2 archivo(s) más |
| `punto_virtual` | `TEXT` | Almacena «punto virtual» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/rotacion/data/mapa-calor.ts`<br>y 3 archivo(s) más |
| `descripcion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `estado` | `TEXT` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 3 archivo(s) más |
| `bloqueo` | `BOOLEAN DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts` |
| `velocidad` | `NUMERIC(8,2)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 4 archivo(s) más |
| `latitud` | `DOUBLE PRECISION` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/rotacion/data/alarmas.ts`<br>y 3 archivo(s) más |
| `longitud` | `DOUBLE PRECISION` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/rotacion/data/alarmas.ts`<br>y 3 archivo(s) más |
| `direccion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/rotacion/data/mapa-calor.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `is_base` | `BOOLEAN` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 1 archivo(s) más |
| `subidas` | `INTEGER` | Almacena «subidas» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>y 2 archivo(s) más |
| `bajadas` | `INTEGER` | Almacena «bajadas» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `abordo` | `INTEGER` | Almacena «abordo» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `subidas_p1` | `INTEGER` | Almacena «subidas p1» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `subidas_p2` | `INTEGER` | Almacena «subidas p2» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `subidas_p3` | `INTEGER` | Almacena «subidas p3» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `bajadas_p1` | `INTEGER` | Almacena «bajadas p1» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `bajadas_p2` | `INTEGER` | Almacena «bajadas p2» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `bajadas_p3` | `INTEGER` | Almacena «bajadas p3» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `numero_despacho` | `BIGINT` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `viaje_despacho` | `TEXT` | Almacena «viaje despacho» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `hora_despacho` | `TEXT` | Almacena «hora despacho» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `source_file` | `TEXT DEFAULT 'GEMA'` | Almacena «source file» como parte de puntos_virtuales; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 1 archivo(s) más |

### `pv_deltas`

Deltas operativos por punto virtual usados en mapas y análisis.

- **Origen del esquema:** `supabase/migrations/061_pv_deltas.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema-operacion.ts`
  - `src/lib/mcp/catalogo/gema.ts`
  - `src/lib/mcp/catalogo/operativo.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `numero` | `BIGINT PRIMARY KEY` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `hora` | `INT` | Almacena «hora» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 2 archivo(s) más |
| `lat` | `NUMERIC(8,4)` | Almacena «lat» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts` |
| `lng` | `NUMERIC(8,4)` | Almacena «lng» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts` |
| `cod_pv` | `TEXT` | Almacena «cod pv» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `punto_virtual` | `TEXT` | Almacena «punto virtual» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `direccion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `codigo_vehiculo` | `TEXT` | Almacena «codigo vehiculo» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 2 archivo(s) más |
| `ruta` | `TEXT` | Almacena «ruta» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `dsub` | `INT NOT NULL` | Almacena «dsub» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `dbaj` | `INT NOT NULL` | Almacena «dbaj» como parte de pv_deltas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts` |
| `velocidad` | `REAL` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 1 archivo(s) más |
| `numero_despacho` | `BIGINT` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 1 archivo(s) más |

### `vehiculos`

Maestro de vehículos sincronizado con GEMA.

- **Origen del esquema:** `supabase/migrations/057_vehiculos_gema.sql`
- **Operaciones detectadas:** consulta, alta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/accidentabilidad/consultar/[id]/editar/page.tsx`
  - `src/app/(dashboard)/accidentabilidad/consultar/[id]/page.tsx`
  - `src/app/(dashboard)/ausentismo/actions.ts`
  - `src/app/(dashboard)/ausentismo/ausentismo-client.tsx`
  - `src/app/(dashboard)/ausentismo/page.tsx`
  - `src/app/(dashboard)/mantenimiento/actions.ts` — consulta, alta
  - `src/app/(dashboard)/mantenimiento/alertas/alertas-client.tsx`
  - `src/app/(dashboard)/mantenimiento/frenos/actions.ts` — consulta, alta
  - … y 49 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `codigo` | `TEXT PRIMARY KEY` | Código del sistema origen o catálogo para identificación e integración. | `src/app/(dashboard)/tesoreria/devengados/simulador/rendimiento-client.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/devengados/rendimiento.ts`<br>y 39 archivo(s) más |
| `placa` | `TEXT` | Placa del vehículo usada para cruces operativos. | `src/lib/mcp/catalogo/gema.ts`<br>`src/app/(dashboard)/mantenimiento/registrar/registrar-client.tsx`<br>`src/lib/ausentismo/data.ts`<br>y 36 archivo(s) más |
| `modelo` | `TEXT` | Almacena «modelo» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 4 archivo(s) más |
| `motor` | `TEXT` | Almacena «motor» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>y 4 archivo(s) más |
| `chasis` | `TEXT` | Almacena «chasis» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>y 2 archivo(s) más |
| `color` | `TEXT` | Almacena «color» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/constants.ts`<br>`src/lib/operativo/velocidad-export.ts`<br>`src/app/(dashboard)/ausentismo/ausentismo-client.tsx`<br>y 13 archivo(s) más |
| `capacidad_sentado` | `INTEGER` | Almacena «capacidad sentado» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `capacidad_en_pie` | `INTEGER` | Almacena «capacidad en pie» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `tarjeta_propiedad` | `TEXT` | Almacena «tarjeta propiedad» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `pasaje_ordinario` | `NUMERIC(12,2)` | Almacena «pasaje ordinario» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `pasaje_festivo` | `NUMERIC(12,2)` | Almacena «pasaje festivo» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `registro` | `BIGINT` | Almacena «registro» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/ausentismo-client.tsx`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 16 archivo(s) más |
| `max_factura` | `NUMERIC(12,2)` | Almacena «max factura» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `numero_tarjeta_op` | `TEXT` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `automatico` | `BOOLEAN` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `estado` | `INTEGER` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 28 archivo(s) más |
| `id_unidad` | `TEXT` | Almacena «id unidad» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `vinculado` | `BOOLEAN` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `parametro_conteo` | `TEXT` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `activo_cartulina` | `BOOLEAN` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `activo_poliza` | `BOOLEAN` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `tipo_propietario` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `tipo_propietario_op` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `observacion` | `TEXT` | Almacena «observacion» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/mantenimiento/frenos/actions.ts`<br>`src/app/(dashboard)/mantenimiento/frenos/reportes/reportes-client.tsx`<br>y 6 archivo(s) más |
| `tipo_carroceria` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `marca` | `TEXT` | Almacena «marca» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/velocidad-client.tsx`<br>y 19 archivo(s) más |
| `clase` | `TEXT` | Almacena «clase» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/mantenimiento/mantenimiento-client.tsx`<br>`src/app/(dashboard)/mantenimiento/registrar/registrar-client.tsx`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>y 7 archivo(s) más |
| `grupo_liquidacion` | `TEXT` | Almacena «grupo liquidacion» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 1 archivo(s) más |
| `grupo_cu` | `TEXT` | Almacena «grupo cu» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `tipo_gps` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 1 archivo(s) más |
| `conductor_nombre` | `TEXT` | Almacena «conductor nombre» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/operativo/vehiculos/vehiculos-client.tsx`<br>`src/lib/operativo/data.ts`<br>y 8 archivo(s) más |
| `cedula_conductor` | `TEXT` | Almacena «cedula conductor» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 18 archivo(s) más |
| `propietario_nombre` | `TEXT` | Almacena «propietario nombre» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 3 archivo(s) más |
| `cedula_propietario` | `TEXT` | Almacena «cedula propietario» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 4 archivo(s) más |
| `propietario_admin` | `TEXT` | Almacena «propietario admin» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 2 archivo(s) más |
| `cedula_propietario_admin` | `TEXT` | Almacena «cedula propietario admin» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `ruta` | `TEXT` | Almacena «ruta» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/app/(dashboard)/rotacion/mapa-calor/MapaCalorClient.tsx`<br>y 22 archivo(s) más |
| `nombre_cartulina` | `TEXT` | Almacena «nombre cartulina» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `fecha_tecno` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/operativo/constants.ts`<br>y 1 archivo(s) más |
| `fecha_tarjeta_op` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/operativo/constants.ts`<br>y 1 archivo(s) más |
| `fecha_soat` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/operativo/constants.ts`<br>y 1 archivo(s) más |
| `fecha_contrato` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>y 2 archivo(s) más |
| `fecha_srcc` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/operativo/constants.ts`<br>y 1 archivo(s) más |
| `fecha_srce` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/operativo/constants.ts`<br>y 1 archivo(s) más |
| `fecha_full_amparo` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/vehiculos/[codigo]/page.tsx`<br>y 2 archivo(s) más |
| `source_file` | `TEXT DEFAULT 'GEMA'` | Almacena «source file» como parte de vehiculos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 15 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/app/(dashboard)/operativo/actions.ts`<br>y 7 archivo(s) más |

### `velocidades`

Lecturas o eventos de velocidad obtenidos de GEMA.

- **Origen del esquema:** `supabase/migrations/058_velocidades_gema.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/operativo/velocidad/page.tsx`
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts` — consulta
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema.ts`
  - `src/lib/mcp/catalogo/mantenimiento.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - `src/lib/operativo/velocidad.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `codigo_vehiculo` | `TEXT NOT NULL` | Almacena «codigo vehiculo» como parte de velocidades; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>y 4 archivo(s) más |
| `fecha_hora` | `TIMESTAMPTZ NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>y 4 archivo(s) más |
| `hora` | `TEXT` | Almacena «hora» como parte de velocidades; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 4 archivo(s) más |
| `latitud` | `DOUBLE PRECISION` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/velocidad.ts`<br>y 2 archivo(s) más |
| `longitud` | `DOUBLE PRECISION` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/operativo/velocidad.ts`<br>y 2 archivo(s) más |
| `velocidad` | `NUMERIC(6,2)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/app/(dashboard)/operativo/velocidad/page.tsx`<br>`src/lib/gema/sync.ts`<br>y 4 archivo(s) más |
| `direccion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 1 archivo(s) más |
| `source_file` | `TEXT DEFAULT 'GEMA'` | Almacena «source file» como parte de velocidades; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/external/resources.ts`<br>y 3 archivo(s) más |

## Reclutamiento y contratación

### `candidate_vacancy`

Vincula candidatos con vacantes y conserva su etapa actual.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, eliminación, alta, sincronización/upsert, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/campanas/page.tsx` — consulta
  - `src/app/(dashboard)/candidatos/client.tsx`
  - `src/app/(dashboard)/configuracion/pipeline/actions.ts` — consulta, eliminación
  - `src/app/(dashboard)/configuracion/pipeline/page.tsx` — consulta
  - `src/app/(dashboard)/vacantes/vacantes-client.tsx`
  - `src/app/api/webhooks/[slug]/route.ts` — consulta, alta
  - `src/lib/actions.ts` — consulta
  - `src/lib/contratacion/actions.ts` — sincronización/upsert, actualización
  - … y 4 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>y 7 archivo(s) más |
| `candidate_id` | `UUID REFERENCES candidates(id) ON DELETE CASCADE` | Referencia al candidato relacionado. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>y 1 archivo(s) más |
| `vacancy_id` | `UUID REFERENCES vacancies(id) ON DELETE CASCADE` | Referencia al registro de vacancy. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/lib/actions.ts`<br>y 2 archivo(s) más |
| `current_stage` | `TEXT` | Almacena «current stage» como parte de candidate_vacancy; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/app/(dashboard)/campanas/page.tsx`<br>y 6 archivo(s) más |
| `assigned_to` | `UUID REFERENCES profiles(id)` | Almacena «assigned to» como parte de candidate_vacancy; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts` |
| `applied_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/campanas/page.tsx`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/recruitment/derive.ts`<br>y 1 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |

### `candidates`

Datos personales y de contacto de aspirantes.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/campanas/page.tsx` — consulta
  - `src/app/(dashboard)/candidatos/client.tsx`
  - `src/app/(dashboard)/documentos/page.tsx`
  - `src/app/(dashboard)/integraciones/webhook-logs-table.tsx`
  - `src/app/(dashboard)/page.tsx`
  - `src/app/(dashboard)/vacantes/[id]/page.tsx`
  - `src/app/api/webhooks/[slug]/route.ts` — consulta
  - `src/components/candidatos/candidate-table.tsx`
  - … y 9 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>y 12 archivo(s) más |
| `full_name` | `TEXT NOT NULL` | Almacena «full name» como parte de candidates; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/(dashboard)/documentos/page.tsx`<br>`src/app/(dashboard)/candidatos/client.tsx`<br>y 8 archivo(s) más |
| `document_type` | `TEXT DEFAULT 'CC'` | Almacena «document type» como parte de candidates; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `document_number` | `TEXT UNIQUE` | Almacena «document number» como parte de candidates; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts`<br>y 4 archivo(s) más |
| `phone` | `TEXT` | Número telefónico de contacto. | `src/app/api/webhooks/[slug]/route.ts`<br>`src/components/candidatos/kanban-board.tsx`<br>`src/lib/actions.ts`<br>y 3 archivo(s) más |
| `email` | `TEXT` | Correo electrónico para contacto o identidad. | `src/components/candidatos/kanban-board.tsx`<br>`src/lib/actions.ts`<br>`src/app/(dashboard)/candidatos/client.tsx`<br>y 5 archivo(s) más |
| `location` | `TEXT` | Almacena «location» como parte de candidates; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/integraciones/webhook-logs-table.tsx`<br>y 1 archivo(s) más |
| `linkedin_url` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `avatar_url` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `source` | `TEXT DEFAULT 'manual'` | Almacena «source» como parte de candidates; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/api/webhooks/[slug]/route.ts`<br>`src/components/candidatos/kanban-board.tsx`<br>y 6 archivo(s) más |
| `skills` | `TEXT[]` | Almacena «skills» como parte de candidates; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `notes` | `TEXT` | Almacena «notes» como parte de candidates; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 6 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/(dashboard)/documentos/page.tsx`<br>y 1 archivo(s) más |

### `departments`

Catálogo de áreas/departamentos.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, sincronización/upsert
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/candidatos/client.tsx`
  - `src/app/(dashboard)/configuracion/usuarios/page.tsx` — consulta
  - `src/app/(dashboard)/configuracion/usuarios/usuarios-client.tsx`
  - `src/app/(dashboard)/empleados/empleados-client.tsx`
  - `src/app/(dashboard)/empleados/[id]/page.tsx`
  - `src/app/(dashboard)/vacantes/nueva/page.tsx`
  - `src/app/(dashboard)/vacantes/vacantes-client.tsx`
  - `src/app/(dashboard)/vacantes/[id]/page.tsx`
  - … y 6 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/vacantes/nueva/page.tsx`<br>y 10 archivo(s) más |
| `name` | `TEXT NOT NULL UNIQUE` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/external/resources.ts`<br>`src/app/(dashboard)/vacantes/nueva/page.tsx`<br>`src/lib/actions.ts`<br>y 9 archivo(s) más |
| `description` | `TEXT` | Almacena «description» como parte de departments; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/external/resources.ts`<br>`src/lib/actions.ts`<br>`src/app/(dashboard)/vacantes/nueva/page.tsx`<br>y 3 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/external/resources.ts`<br>y 3 archivo(s) más |
| `origen` | `TEXT NOT NULL DEFAULT 'manual'` | Sistema o mecanismo del que provino el dato. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>y 2 archivo(s) más |

### `meta_campaigns`

Campañas publicitarias de Meta.

- **Origen del esquema:** `supabase/migrations/015_campanas_reclutamiento.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/app/api/campanas/sync-meta/route.ts`
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/reclutamiento.ts`
  - `src/lib/meta/sync.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/meta/sync.ts` |
| `meta_campaign_id` | `TEXT UNIQUE` | Referencia al registro de meta campaign. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts` |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/meta/sync.ts`<br>y 1 archivo(s) más |
| `estado` | `TEXT` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `fecha_inicio` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `fecha_fin` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `gasto` | `NUMERIC(14,2) DEFAULT 0` | Almacena «gasto» como parte de meta_campaigns; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `impresiones` | `BIGINT DEFAULT 0` | Almacena «impresiones» como parte de meta_campaigns; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts` |
| `clics` | `BIGINT DEFAULT 0` | Almacena «clics» como parte de meta_campaigns; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts` |
| `leads` | `BIGINT DEFAULT 0` | Almacena «leads» como parte de meta_campaigns; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts` |
| `moneda` | `TEXT DEFAULT 'COP'` | Almacena «moneda» como parte de meta_campaigns; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |

### `meta_spend_daily`

Inversión diaria por campaña de Meta.

- **Origen del esquema:** `supabase/migrations/015_campanas_reclutamiento.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/campanas/page.tsx` — consulta
  - `src/app/api/campanas/sync-meta/route.ts`
  - `src/app/docs/api/page.tsx`
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/reclutamiento.ts`
  - `src/lib/meta/sync.ts`
  - `src/lib/recruitment/derive.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/docs/api/page.tsx`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/docs/api/page.tsx`<br>y 4 archivo(s) más |
| `meta_campaign_id` | `TEXT` | Referencia al registro de meta campaign. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts` |
| `gasto` | `NUMERIC(14,2) DEFAULT 0` | Almacena «gasto» como parte de meta_spend_daily; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts`<br>`src/app/(dashboard)/campanas/page.tsx`<br>y 2 archivo(s) más |
| `impresiones` | `BIGINT DEFAULT 0` | Almacena «impresiones» como parte de meta_spend_daily; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts` |
| `clics` | `BIGINT DEFAULT 0` | Almacena «clics» como parte de meta_spend_daily; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts` |
| `leads` | `BIGINT DEFAULT 0` | Almacena «leads» como parte de meta_spend_daily; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/meta/sync.ts`<br>`src/lib/recruitment/derive.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |

### `notes`

Notas internas asociadas a candidatos.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/candidatos/[id]/page.tsx`
  - `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`
  - `src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`
  - `src/app/(dashboard)/empleados/[id]/page.tsx`
  - `src/app/api/webhooks/[slug]/route.ts` — consulta, alta
  - `src/lib/actions.ts` — consulta
  - `src/lib/mcp/catalogo/reclutamiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>y 4 archivo(s) más |
| `entity_type` | `TEXT NOT NULL` | Almacena «entity type» como parte de notes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts` |
| `entity_id` | `UUID NOT NULL` | Referencia al registro de entity. | `src/lib/actions.ts` |
| `author_id` | `UUID REFERENCES profiles(id)` | Referencia al registro de author. | `src/lib/actions.ts` |
| `content` | `TEXT NOT NULL` | Almacena «content» como parte de notes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>`src/lib/actions.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/app/(dashboard)/empleados/[id]/empleado-detail-client.tsx`<br>y 1 archivo(s) más |

### `pipeline_stages`

Etapas configurables del pipeline de selección.

- **Origen del esquema:** `supabase/migrations/017_pipeline_stages.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/campanas/page.tsx` — consulta
  - `src/app/(dashboard)/candidatos/page.tsx` — consulta
  - `src/app/(dashboard)/candidatos/[id]/page.tsx`
  - `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`
  - `src/app/(dashboard)/configuracion/pipeline/actions.ts` — consulta, alta
  - `src/app/(dashboard)/configuracion/pipeline/page.tsx` — consulta
  - `src/app/(dashboard)/page.tsx`
  - `src/components/candidatos/candidate-table.tsx`
  - … y 3 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/configuracion/pipeline/actions.ts`<br>`src/components/candidatos/candidate-table.tsx`<br>y 7 archivo(s) más |
| `key` | `TEXT UNIQUE NOT NULL` | Almacena «key» como parte de pipeline_stages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/pipeline/actions.ts`<br>`src/lib/constants.ts`<br>`src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>y 7 archivo(s) más |
| `label` | `TEXT NOT NULL` | Almacena «label» como parte de pipeline_stages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/constants.ts`<br>`src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/app/(dashboard)/page.tsx`<br>y 6 archivo(s) más |
| `color` | `TEXT NOT NULL DEFAULT '#DBEAFE'` | Almacena «color» como parte de pipeline_stages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/constants.ts`<br>`src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/app/(dashboard)/candidatos/[id]/page.tsx`<br>y 5 archivo(s) más |
| `text_color` | `TEXT NOT NULL DEFAULT '#2563EB'` | Almacena «text color» como parte de pipeline_stages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/pipeline/actions.ts`<br>`src/app/(dashboard)/candidatos/page.tsx`<br>`src/app/(dashboard)/configuracion/pipeline/page.tsx` |
| `orden` | `INTEGER NOT NULL DEFAULT 0` | Almacena «orden» como parte de pipeline_stages; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/configuracion/pipeline/actions.ts`<br>`src/lib/recruitment/derive.ts`<br>`src/app/(dashboard)/campanas/page.tsx`<br>y 3 archivo(s) más |
| `tipo` | `TEXT NOT NULL DEFAULT 'normal' CHECK (tipo IN ('normal', 'ganado', 'perdido'))` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/recruitment/derive.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/configuracion/pipeline/actions.ts`<br>y 3 archivo(s) más |
| `activo` | `BOOLEAN NOT NULL DEFAULT true` | Indica si el registro está disponible para uso operativo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/candidatos/page.tsx`<br>`src/app/(dashboard)/configuracion/pipeline/actions.ts`<br>y 2 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/app/(dashboard)/candidatos/page.tsx` |

### `procesos_contratacion`

Seguimiento operativo de contratación.

- **Origen del esquema:** `supabase/migrations/021_procesos_contratacion.sql`
- **Operaciones detectadas:** consulta, alta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/candidatos/page.tsx` — consulta
  - `src/lib/comunicaciones/ficha.ts` — consulta
  - `src/lib/contratacion/actions.ts` — consulta, alta, actualización
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/reclutamiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>y 2 archivo(s) más |
| `candidate_id` | `UUID REFERENCES candidates(id) ON DELETE SET NULL` | Referencia al candidato relacionado. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts` |
| `fecha_creacion` | `DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Bogota')::date)` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/candidatos/page.tsx`<br>y 2 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/lib/contratacion/actions.ts`<br>y 3 archivo(s) más |
| `cedula` | `TEXT NOT NULL` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>y 3 archivo(s) más |
| `celular` | `TEXT` | Almacena «celular» como parte de procesos_contratacion; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>y 1 archivo(s) más |
| `reingreso` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `estado` | `TEXT NOT NULL DEFAULT 'pendiente'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>y 3 archivo(s) más |
| `causa_no_contrato` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `observacion` | `TEXT` | Almacena «observacion» como parte de procesos_contratacion; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `simit` | `TEXT` | Almacena «simit» como parte de procesos_contratacion; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `simit_valor` | `NUMERIC NOT NULL DEFAULT 0` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `antecedentes` | `TEXT` | Almacena «antecedentes» como parte de procesos_contratacion; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `licencia_categoria` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `medio_postulacion` | `TEXT` | Almacena «medio postulacion» como parte de procesos_contratacion; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/(dashboard)/candidatos/page.tsx` |
| `fecha_citacion` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `fecha_examenes` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `fecha_prueba_manejo` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `fecha_contrato` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/contratacion/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `created_by` | `UUID REFERENCES profiles(id)` | Usuario que creó el registro. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>y 3 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `vacancy_id` | `UUID REFERENCES vacancies(id) ON DELETE SET NULL` | Referencia al registro de vacancy. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts` |

### `recruitment_daily_metrics`

Métricas diarias del embudo de reclutamiento.

- **Origen del esquema:** `supabase/migrations/015_campanas_reclutamiento.sql`
- **Uso comprobado en Gestivo:** sin referencia directa encontrada en `src/` ni en las semillas.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `canal` | `TEXT NOT NULL DEFAULT 'WhatsApp'` | Almacena «canal» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `conversaciones` | `INTEGER DEFAULT 0` | Almacena «conversaciones» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `postulantes` | `INTEGER DEFAULT 0` | Almacena «postulantes» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `pasan` | `INTEGER DEFAULT 0` | Almacena «pasan» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `continuan` | `INTEGER DEFAULT 0` | Almacena «continuan» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `evaluaciones` | `INTEGER DEFAULT 0` | Almacena «evaluaciones» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `aptos` | `INTEGER DEFAULT 0` | Almacena «aptos» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `contratados` | `INTEGER DEFAULT 0` | Almacena «contratados» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `motivo_fuga` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `source` | `TEXT DEFAULT 'manual'` | Almacena «source» como parte de recruitment_daily_metrics; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |

### `stage_history`

Historial de movimientos del candidato entre etapas.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta, alta, actualización, eliminación
- **Uso comprobado en Gestivo:**
  - `src/app/api/webhooks/[slug]/route.ts` — consulta, alta
  - `src/lib/actions.ts` — consulta, actualización, eliminación
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/reclutamiento.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/api/webhooks/[slug]/route.ts`<br>y 1 archivo(s) más |
| `candidate_vacancy_id` | `UUID REFERENCES candidate_vacancy(id) ON DELETE CASCADE` | Referencia al registro de candidate vacancy. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `from_stage` | `TEXT` | Almacena «from stage» como parte de stage_history; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts` |
| `to_stage` | `TEXT` | Almacena «to stage» como parte de stage_history; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `changed_by` | `UUID REFERENCES profiles(id)` | Almacena «changed by» como parte de stage_history; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `notes` | `TEXT` | Almacena «notes» como parte de stage_history; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/api/webhooks/[slug]/route.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |

### `vacancies`

Vacantes abiertas o cerradas del proceso de selección.

- **Origen del esquema:** `supabase/migrations/001_initial_schema.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/candidatos/client.tsx`
  - `src/app/(dashboard)/candidatos/page.tsx` — consulta
  - `src/app/(dashboard)/candidatos/[id]/page.tsx`
  - `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`
  - `src/app/(dashboard)/comunicaciones/BandejaClient.tsx`
  - `src/app/(dashboard)/page.tsx`
  - `src/app/(dashboard)/vacantes/page.tsx`
  - `src/app/(dashboard)/vacantes/vacantes-client.tsx`
  - … y 11 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>y 14 archivo(s) más |
| `title` | `TEXT NOT NULL` | Almacena «title» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/components/contratacion/procesos-client.tsx`<br>`src/app/(dashboard)/comunicaciones/BandejaClient.tsx`<br>y 13 archivo(s) más |
| `department_id` | `UUID REFERENCES departments(id)` | Referencia al registro de department. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/contratacion/actions.ts`<br>y 1 archivo(s) más |
| `description` | `TEXT` | Almacena «description» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/external/resources.ts`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>y 1 archivo(s) más |
| `requirements` | `TEXT` | Almacena «requirements» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `location` | `TEXT` | Almacena «location» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/candidatos/[id]/tabs-client.tsx`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>y 2 archivo(s) más |
| `modality` | `modality DEFAULT 'presencial'` | Almacena «modality» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/vacantes/vacantes-client.tsx`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `contract_type` | `contract_type DEFAULT 'indefinido'` | Almacena «contract type» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/vacantes/vacantes-client.tsx`<br>`src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `salary_min` | `NUMERIC` | Almacena «salary min» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/(dashboard)/vacantes/vacantes-client.tsx`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `salary_max` | `NUMERIC` | Almacena «salary max» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/app/(dashboard)/vacantes/vacantes-client.tsx`<br>`src/lib/mcp/catalogo/reclutamiento.ts` |
| `salary_currency` | `TEXT DEFAULT 'COP'` | Almacena «salary currency» como parte de vacancies; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `status` | `vacancy_status DEFAULT 'borrador'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/app/api/webhooks/[slug]/route.ts`<br>y 6 archivo(s) más |
| `created_by` | `UUID REFERENCES profiles(id)` | Usuario que creó el registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts` |
| `published_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/vacantes/vacantes-client.tsx`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts` |
| `closes_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/reclutamiento.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/actions.ts`<br>`src/lib/external/resources.ts`<br>y 8 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/constants.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |

## Rotación y rendimiento

### `cierres_diarios`

Producción y cierre diario por conductor/vehículo.

- **Origen del esquema:** `supabase/migrations/005_rotacion_tables.sql`
- **Operaciones detectadas:** consulta, alta, sincronización/upsert
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/tesoreria/devengados/simulador/rendimiento-client.tsx`
  - `src/app/api/rotacion/conductor/[cedula]/route.ts` — consulta
  - `src/app/api/rotacion/rendimiento/route.ts`
  - `src/app/api/rotacion/upload/route.ts`
  - `src/app/docs/api/page.tsx`
  - `src/components/rotacion/upload/UploadCard.tsx`
  - `src/lib/devengados/data.ts`
  - `src/lib/devengados/liquidacion.ts` — consulta
  - … y 15 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/app/docs/api/page.tsx`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>y 15 archivo(s) más |
| `cod_conductor` | `TEXT NOT NULL` | Almacena «cod conductor» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/devengados/rendimiento.ts`<br>y 13 archivo(s) más |
| `conductor_nombre` | `TEXT` | Almacena «conductor nombre» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>y 5 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 18 archivo(s) más |
| `tipo_cierre` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/devengados/rendimiento.ts`<br>`src/lib/devengados/liquidacion.ts`<br>`src/lib/gema/sync.ts`<br>y 4 archivo(s) más |
| `ruta` | `TEXT` | Almacena «ruta» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/devengados/rendimiento.ts`<br>y 17 archivo(s) más |
| `grupo_liquidacion` | `TEXT` | Almacena «grupo liquidacion» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 3 archivo(s) más |
| `vehiculo` | `TEXT` | Almacena «vehiculo» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/rendimiento.ts`<br>`src/lib/devengados/liquidacion.ts`<br>`src/lib/gema/sync.ts`<br>y 5 archivo(s) más |
| `viajes` | `NUMERIC(10,2) DEFAULT 0` | Almacena «viajes» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/rendimiento.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 17 archivo(s) más |
| `timbradas` | `NUMERIC(12,2) DEFAULT 0` | Almacena «timbradas» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/app/api/rotacion/rendimiento/route.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 14 archivo(s) más |
| `diff_tim` | `NUMERIC(12,2) DEFAULT 0` | Almacena «diff tim» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/rendimiento/route.ts`<br>`src/lib/rotacion/data/rendimiento.ts`<br>`src/app/api/rotacion/conductor/[cedula]/route.ts`<br>y 4 archivo(s) más |
| `prom_tim` | `NUMERIC(12,2) DEFAULT 0` | Almacena «prom tim» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/conductor/[cedula]/route.ts`<br>`src/app/api/rotacion/rendimiento/route.ts`<br>`src/lib/gema/sync.ts`<br>y 4 archivo(s) más |
| `pct_indiv` | `NUMERIC(6,2)` | Almacena «pct indiv» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/conductor/[cedula]/route.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 3 archivo(s) más |
| `pct_grupo` | `NUMERIC(6,2)` | Almacena «pct grupo» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/conductor/[cedula]/route.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 3 archivo(s) más |
| `pct_total` | `NUMERIC(6,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/devengados/rendimiento.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/liquidacion.ts`<br>y 5 archivo(s) más |
| `tim_grupo` | `NUMERIC(12,2)` | Almacena «tim grupo» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`supabase/seed/seed-cierres.ts` |
| `viajes_grupo` | `NUMERIC(10,2)` | Almacena «viajes grupo» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`supabase/seed/seed-cierres.ts` |
| `prom_grupo` | `NUMERIC(12,2)` | Almacena «prom grupo» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`supabase/seed/seed-cierres.ts` |
| `source_file` | `TEXT` | Almacena «source file» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 3 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 5 archivo(s) más |
| `origen` | `TEXT DEFAULT 'excel'` | Sistema o mecanismo del que provino el dato. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 9 archivo(s) más |
| `cedula_conductor` | `TEXT` | Almacena «cedula conductor» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 12 archivo(s) más |
| `bruto` | `NUMERIC(14,2)` | Almacena «bruto» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/devengados/rendimiento.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 9 archivo(s) más |
| `salario_bruto_dia` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/devengados/rendimiento.ts`<br>`src/lib/devengados/liquidacion.ts`<br>`src/lib/gema/sync.ts`<br>y 3 archivo(s) más |
| `salario_neto_dia` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/devengados/liquidacion.ts`<br>y 4 archivo(s) más |
| `ahorro` | `NUMERIC(14,2)` | Almacena «ahorro» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/liquidacion.ts`<br>`src/lib/devengados/rendimiento.ts`<br>`src/lib/gema/sync.ts`<br>y 4 archivo(s) más |
| `ahorro_obli` | `NUMERIC(14,2)` | Almacena «ahorro obli» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/liquidacion.ts`<br>`src/lib/devengados/rendimiento.ts`<br>`src/lib/gema/sync.ts`<br>y 2 archivo(s) más |
| `anticipo` | `NUMERIC(14,2)` | Almacena «anticipo» como parte de cierres_diarios; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 3 archivo(s) más |

### `conductores`

Maestro analítico de conductores para rotación y rendimiento.

- **Origen del esquema:** `supabase/migrations/005_rotacion_tables.sql`
- **Operaciones detectadas:** consulta, alta, eliminación, actualización, sincronización/upsert
- **Uso comprobado en Gestivo:**
  - `src/app/(auth)/oauth/autorizar/page.tsx`
  - `src/app/(dashboard)/ausentismo/actions.ts` — consulta, alta
  - `src/app/(dashboard)/ausentismo/ausentismo-client.tsx`
  - `src/app/(dashboard)/ausentismo/matriz/actions.ts`
  - `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`
  - `src/app/(dashboard)/ausentismo/page.tsx`
  - `src/app/(dashboard)/ausentismo/reincidentes/reincidentes-client.tsx`
  - `src/app/(dashboard)/comunicaciones/FichaContacto.tsx`
  - … y 105 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/lib/actions.ts`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>y 74 archivo(s) más |
| `cedula` | `TEXT NOT NULL UNIQUE` | Documento de identidad usado para identificar y cruzar personas. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/rotacion/data/rendimiento.ts`<br>y 75 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/mcp/consultas.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 82 archivo(s) más |
| `codigo` | `TEXT` | Código del sistema origen o catálogo para identificación e integración. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/(dashboard)/tesoreria/devengados/simulador/rendimiento-client.tsx`<br>y 63 archivo(s) más |
| `correo` | `TEXT` | Almacena «correo» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/lib/actions.ts`<br>y 18 archivo(s) más |
| `direccion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/components/accidentabilidad/ReportWizard.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/consultas.ts`<br>y 12 archivo(s) más |
| `celular` | `TEXT` | Almacena «celular» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/contratacion/actions.ts`<br>`src/lib/actions.ts`<br>y 18 archivo(s) más |
| `telefono` | `TEXT` | Número telefónico de contacto. | `src/lib/comunicaciones/ficha.ts`<br>`src/lib/ausentismo/data.ts`<br>`src/app/(dashboard)/ausentismo/actions.ts`<br>y 13 archivo(s) más |
| `tipo_conductor` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 21 archivo(s) más |
| `licencia` | `TEXT` | Almacena «licencia» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/actions.ts`<br>`src/lib/comunicaciones/ficha.ts`<br>`src/lib/mcp/catalogo/ausentismo-diario.ts`<br>y 13 archivo(s) más |
| `venc_licencia` | `DATE` | Almacena «venc licencia» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/comunicaciones/ficha.ts`<br>y 3 archivo(s) más |
| `venc_contrato` | `DATE` | Almacena «venc contrato» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 1 archivo(s) más |
| `fecha_ingreso` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/api/rotacion/upload/route.ts`<br>`src/app/(dashboard)/conductores/conductores-client.tsx`<br>y 15 archivo(s) más |
| `fecha_retiro` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/devengados/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>y 14 archivo(s) más |
| `experiencia` | `TEXT` | Almacena «experiencia» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `fecha_nacimiento` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 2 archivo(s) más |
| `observacion` | `TEXT` | Almacena «observacion» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/app/(dashboard)/tesoreria/devengados/caja-client.tsx`<br>`src/lib/comunicaciones/ficha.ts`<br>y 13 archivo(s) más |
| `eps` | `TEXT` | Almacena «eps» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/lib/ausentismo/matriz.ts`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>y 20 archivo(s) más |
| `arl` | `TEXT` | Almacena «arl» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/matriz-client.tsx`<br>`src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/ausentismo/matriz.ts`<br>y 16 archivo(s) más |
| `pension` | `TEXT` | Almacena «pension» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 1 archivo(s) más |
| `compensacion` | `TEXT` | Almacena «compensacion» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/app/api/rotacion/upload-records/route.ts`<br>y 2 archivo(s) más |
| `tipo_sangre` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 1 archivo(s) más |
| `nivel_educativo` | `TEXT` | Almacena «nivel educativo» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 2 archivo(s) más |
| `num_hijos` | `INTEGER` | Almacena «num hijos» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 2 archivo(s) más |
| `estado_civil` | `TEXT` | Almacena «estado civil» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 2 archivo(s) más |
| `reubicado` | `TEXT` | Almacena «reubicado» como parte de conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/ausentismo/matriz/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/(dashboard)/conductores/[cedula]/page.tsx`<br>y 3 archivo(s) más |
| `estado` | `TEXT NOT NULL DEFAULT 'ACTIVO'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/app/(dashboard)/tesoreria/devengados/caja-client.tsx`<br>`src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/contratacion/actions.ts`<br>y 65 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/mcp/catalogo/mantenimiento.ts`<br>`src/lib/actions.ts`<br>y 29 archivo(s) más |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/mcp/catalogo/reclutamiento.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 8 archivo(s) más |
| `fecha_reingreso` | `DATE NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/api/rotacion/upload/route.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/(dashboard)/rotacion/conductores/[cedula]/ProfileHeader.tsx`<br>y 3 archivo(s) más |

### `data_uploads`

Trazabilidad de archivos cargados al módulo de rotación.

- **Origen del esquema:** `supabase/migrations/005_rotacion_tables.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/rotacion/datos/page.tsx` — consulta
  - `src/app/api/rotacion/upload/route.ts` — alta
  - `src/app/api/rotacion/upload-records/route.ts` — alta
  - `src/lib/rotacion/upload/types.ts`
  - `supabase/seed/seed-ausentismo.ts` — alta
  - `supabase/seed/seed-cierres.ts` — alta
  - `supabase/seed/seed-conductores.ts` — alta
  - `supabase/seed/seed-familia.ts` — alta
  - … y 1 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/app/api/rotacion/upload/route.ts`<br>`src/app/api/rotacion/upload-records/route.ts` |
| `file_name` | `TEXT NOT NULL` | Almacena «file name» como parte de data_uploads; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `supabase/seed/seed-conductores.ts`<br>`src/app/api/rotacion/upload/route.ts`<br>`src/app/api/rotacion/upload-records/route.ts`<br>y 4 archivo(s) más |
| `file_type` | `TEXT NOT NULL` | Almacena «file type» como parte de data_uploads; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `supabase/seed/seed-conductores.ts`<br>`src/app/(dashboard)/rotacion/datos/page.tsx`<br>`src/app/api/rotacion/upload/route.ts`<br>y 5 archivo(s) más |
| `rows_processed` | `INTEGER DEFAULT 0` | Almacena «rows processed» como parte de data_uploads; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `supabase/seed/seed-conductores.ts`<br>`src/app/(dashboard)/rotacion/datos/page.tsx`<br>`src/app/api/rotacion/upload/route.ts`<br>y 5 archivo(s) más |
| `rows_errors` | `INTEGER DEFAULT 0` | Almacena «rows errors» como parte de data_uploads; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `supabase/seed/seed-conductores.ts`<br>`src/app/api/rotacion/upload/route.ts`<br>`src/app/api/rotacion/upload-records/route.ts`<br>y 4 archivo(s) más |
| `periodo` | `TEXT` | Almacena «periodo» como parte de data_uploads; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/upload/route.ts`<br>`src/app/api/rotacion/upload-records/route.ts`<br>`supabase/seed/seed-viajes-perdidos.ts`<br>y 1 archivo(s) más |
| `fecha_corte` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `supabase/seed/seed-ausentismo.ts` |
| `status` | `TEXT DEFAULT 'processing'` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/app/api/rotacion/upload/route.ts`<br>`src/app/api/rotacion/upload-records/route.ts`<br>`supabase/seed/seed-conductores.ts`<br>y 4 archivo(s) más |
| `error_log` | `JSONB` | Almacena «error log» como parte de data_uploads; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/api/rotacion/upload/route.ts`<br>`src/app/api/rotacion/upload-records/route.ts` |
| `uploaded_by` | `TEXT` | Almacena «uploaded by» como parte de data_uploads; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/rotacion/datos/page.tsx`<br>`src/app/api/rotacion/upload/route.ts`<br>`src/app/api/rotacion/upload-records/route.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/app/(dashboard)/rotacion/datos/page.tsx` |

### `familia`

Composición o datos familiares del conductor.

- **Origen del esquema:** `supabase/migrations/005_rotacion_tables.sql`
- **Operaciones detectadas:** consulta, eliminación, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/rotacion/conductores/[cedula]/FamiliaSection.tsx`
  - `src/app/(dashboard)/rotacion/conductores/[cedula]/page.tsx`
  - `src/app/api/rotacion/conductor/[cedula]/route.ts` — consulta
  - `src/app/api/rotacion/upload/route.ts` — eliminación
  - `src/app/docs/api/page.tsx`
  - `src/components/rotacion/upload/UploadCard.tsx`
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - … y 6 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/app/docs/api/page.tsx`<br>`src/lib/oauth/servicio.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 3 archivo(s) más |
| `cedula_empleado` | `TEXT NOT NULL` | Almacena «cedula empleado» como parte de familia; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/api/rotacion/conductor/[cedula]/route.ts`<br>y 2 archivo(s) más |
| `nombre_familiar` | `TEXT` | Almacena «nombre familiar» como parte de familia; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/rotacion/conductores/[cedula]/FamiliaSection.tsx`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/api/rotacion/conductor/[cedula]/route.ts`<br>y 2 archivo(s) más |
| `parentesco` | `TEXT` | Almacena «parentesco» como parte de familia; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/(dashboard)/rotacion/conductores/[cedula]/FamiliaSection.tsx`<br>`src/app/api/rotacion/conductor/[cedula]/route.ts`<br>y 4 archivo(s) más |
| `edad` | `INTEGER` | Almacena «edad» como parte de familia; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/(dashboard)/rotacion/conductores/[cedula]/FamiliaSection.tsx`<br>y 5 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |

### `incentivos`

Incentivos reconocidos a conductores.

- **Origen del esquema:** `supabase/migrations/007_rotacion_incentivos.sql`
- **Operaciones detectadas:** eliminación, consulta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/rotacion/conductores/[cedula]/IncentivosSection.tsx`
  - `src/app/(dashboard)/rotacion/conductores/[cedula]/page.tsx`
  - `src/app/(dashboard)/rotacion/datos/DatosClient.tsx`
  - `src/app/api/rotacion/upload/route.ts` — eliminación
  - `src/app/docs/api/page.tsx`
  - `src/components/rotacion/upload/UploadCard.tsx`
  - `src/lib/accidentabilidad/policy.ts`
  - `src/lib/external/resources.ts`
  - … y 6 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/app/docs/api/page.tsx`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 5 archivo(s) más |
| `cedula` | `TEXT NOT NULL` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/rotacion/data/conductor.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 7 archivo(s) más |
| `nombre` | `TEXT` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/external/resources.ts`<br>y 5 archivo(s) más |
| `mes_entrega` | `TEXT` | Almacena «mes entrega» como parte de incentivos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/app/(dashboard)/rotacion/conductores/[cedula]/IncentivosSection.tsx`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `periodo` | `DATE` | Almacena «periodo» como parte de incentivos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/api/rotacion/upload/route.ts`<br>y 5 archivo(s) más |
| `valor` | `NUMERIC(14,2) DEFAULT 0` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>y 5 archivo(s) más |
| `concepto` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `source_file` | `TEXT` | Almacena «source file» como parte de incentivos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts` |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/ausentismo-accidentabilidad.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |

### `viajes_perdidos`

Viajes no realizados y su causal.

- **Origen del esquema:** `supabase/migrations/005_rotacion_tables.sql`
- **Operaciones detectadas:** consulta, alta, eliminación
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/rotacion/conductores/[cedula]/page.tsx`
  - `src/app/(dashboard)/rotacion/datos/DatosClient.tsx`
  - `src/app/api/external/v1/aggregate/route.ts`
  - `src/app/api/rotacion/conductor/[cedula]/route.ts` — consulta
  - `src/app/api/rotacion/rendimiento/route.ts`
  - `src/app/api/rotacion/upload/route.ts`
  - `src/app/docs/api/page.tsx`
  - `src/components/rotacion/upload/UploadCard.tsx`
  - … y 14 archivo(s) adicionales.

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/app/docs/api/page.tsx`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>y 12 archivo(s) más |
| `cedula_conductor` | `TEXT NOT NULL` | Almacena «cedula conductor» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/riesgo/datos.ts`<br>y 11 archivo(s) más |
| `tipologia` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/riesgo/datos.ts`<br>`src/lib/rotacion/data/rendimiento.ts`<br>y 7 archivo(s) más |
| `novedad` | `TEXT` | Almacena «novedad» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 10 archivo(s) más |
| `detalle_novedad` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 2 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>y 14 archivo(s) más |
| `despacho` | `TEXT` | Almacena «despacho» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 6 archivo(s) más |
| `tipo_propietario` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 4 archivo(s) más |
| `vehiculo` | `TEXT` | Almacena «vehiculo» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 3 archivo(s) más |
| `placa` | `TEXT` | Placa del vehículo usada para cruces operativos. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 6 archivo(s) más |
| `conductor_nombre` | `TEXT` | Almacena «conductor nombre» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 4 archivo(s) más |
| `turno` | `TEXT` | Almacena «turno» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 2 archivo(s) más |
| `viaje` | `TEXT` | Almacena «viaje» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 6 archivo(s) más |
| `ruta` | `TEXT` | Almacena «ruta» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 12 archivo(s) más |
| `planillero` | `TEXT` | Almacena «planillero» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 1 archivo(s) más |
| `periodo` | `TEXT` | Almacena «periodo» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/app/api/rotacion/rendimiento/route.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 9 archivo(s) más |
| `quincena` | `SMALLINT` | Almacena «quincena» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/app/api/rotacion/rendimiento/route.ts`<br>y 5 archivo(s) más |
| `source_file` | `TEXT` | Almacena «source file» como parte de viajes_perdidos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 3 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/ausentismo-diario.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 5 archivo(s) más |
| `origen` | `TEXT DEFAULT 'excel'` | Sistema o mecanismo del que provino el dato. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>y 10 archivo(s) más |

## Tesorería/devengados

### `devengados_bloqueos`

Bloqueos de operación por fecha en devengados.

- **Origen del esquema:** `supabase/migrations/034_devengados_validacion.sql`
- **Operaciones detectadas:** alta, consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/devengados/actions.ts` — alta
  - `src/lib/devengados/data.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/devengados/data.ts`<br>`src/lib/devengados/actions.ts` |
| `cedula_conductor` | `TEXT NOT NULL` | Almacena «cedula conductor» como parte de devengados_bloqueos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/devengados/actions.ts` |
| `conductor_nombre` | `TEXT` | Almacena «conductor nombre» como parte de devengados_bloqueos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/devengados/actions.ts` |
| `motivo` | `TEXT NOT NULL` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/devengados/actions.ts`<br>`src/lib/devengados/data.ts` |
| `bloqueado_por` | `UUID REFERENCES profiles(id)` | Almacena «bloqueado por» como parte de devengados_bloqueos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/actions.ts` |
| `bloqueado_por_email` | `TEXT` | Almacena «bloqueado por email» como parte de devengados_bloqueos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/devengados/actions.ts` |
| `activo` | `BOOLEAN NOT NULL DEFAULT true` | Indica si el registro está disponible para uso operativo. | `src/lib/devengados/data.ts`<br>`src/lib/devengados/actions.ts` |
| `desbloqueado_por` | `UUID REFERENCES profiles(id)` | Almacena «desbloqueado por» como parte de devengados_bloqueos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/actions.ts` |
| `desbloqueado_por_email` | `TEXT` | Almacena «desbloqueado por email» como parte de devengados_bloqueos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/actions.ts` |
| `desbloqueo_motivo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/devengados/actions.ts` |
| `desbloqueado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/devengados/actions.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/devengados/data.ts` |

### `devengados_entregas`

Entregas de dinero y movimientos del flujo de devengados.

- **Origen del esquema:** `supabase/migrations/030_devengados.sql`
- **Operaciones detectadas:** consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/lib/devengados/actions.ts` — consulta, actualización
  - `src/lib/devengados/data.ts` — consulta
  - `src/lib/devengados/liquidacion.ts` — consulta
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema.ts`
  - `src/lib/mcp/catalogo/rotacion.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID DEFAULT gen_random_uuid() PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/devengados/actions.ts`<br>y 3 archivo(s) más |
| `fecha` | `DATE NOT NULL` | Fecha de ocurrencia usada en filtros, periodos e indicadores. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/actions.ts`<br>y 4 archivo(s) más |
| `periodo` | `TEXT NOT NULL` | Almacena «periodo» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `quincena` | `SMALLINT NOT NULL CHECK (quincena IN (1, 2))` | Almacena «quincena» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/actions.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 3 archivo(s) más |
| `cedula_conductor` | `TEXT NOT NULL` | Almacena «cedula conductor» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/gema.ts`<br>y 3 archivo(s) más |
| `codigo_conductor` | `TEXT` | Almacena «codigo conductor» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `conductor_nombre` | `TEXT` | Almacena «conductor nombre» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/actions.ts`<br>y 1 archivo(s) más |
| `viajes` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «viajes» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 4 archivo(s) más |
| `valor_entregado` | `NUMERIC(14,2) NOT NULL CHECK (valor_entregado > 0)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/liquidacion.ts`<br>y 2 archivo(s) más |
| `cuenta_contable` | `TEXT NOT NULL DEFAULT '281505010'` | Almacena «cuenta contable» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `movimiento` | `TEXT NOT NULL DEFAULT 'DEBITO'` | Almacena «movimiento» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 4 archivo(s) más |
| `observacion` | `TEXT` | Almacena «observacion» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts` |
| `trasladada_gema` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/actions.ts`<br>`src/lib/devengados/data.ts`<br>y 1 archivo(s) más |
| `trasladada_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/devengados/actions.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `trasladada_por` | `UUID REFERENCES profiles(id)` | Almacena «trasladada por» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/actions.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `aprobada_por` | `UUID REFERENCES profiles(id)` | Almacena «aprobada por» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/external/resources.ts`<br>y 3 archivo(s) más |
| `estado` | `TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'devuelta', 'reverso'))` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/devengados/actions.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts`<br>y 4 archivo(s) más |
| `devolucion_de` | `UUID REFERENCES devengados_entregas(id)` | Almacena «devolucion de» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `devolucion_motivo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts` |
| `devuelta_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/data.ts` |
| `devuelta_por` | `UUID REFERENCES profiles(id)` | Almacena «devuelta por» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `segundo_pago` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `autorizado_por` | `TEXT` | Almacena «autorizado por» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `autorizacion_motivo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `autorizado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/rotacion.ts` |
| `saldo_antes` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `saldo_despues` | `NUMERIC(14,2)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `extemporanea` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/devengados/actions.ts`<br>y 1 archivo(s) más |
| `registrada_por` | `UUID REFERENCES profiles(id)` | Almacena «registrada por» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/rotacion.ts`<br>`src/lib/devengados/actions.ts`<br>`src/lib/devengados/data.ts`<br>y 1 archivo(s) más |
| `registrada_por_email` | `TEXT` | Almacena «registrada por email» como parte de devengados_entregas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `registro_motivo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |
| `registro_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/devengados/data.ts`<br>`src/lib/mcp/catalogo/rotacion.ts` |

### `tesoreria_audit_log`

Auditoría de acciones sensibles de tesorería.

- **Origen del esquema:** `supabase/migrations/032_tesoreria_subpermisos_auditoria.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/app/api/auth/evento/route.ts`
  - `src/lib/ausentismo/auditoria.ts`
  - `src/lib/devengados/audit.ts`
  - `src/lib/incapacidades/auditoria.ts`
  - `src/lib/mcp/catalogo/operativo.ts`
  - `src/lib/riesgo/auditoria.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/devengados/audit.ts`<br>`src/lib/incapacidades/auditoria.ts`<br>y 1 archivo(s) más |
| `user_id` | `UUID REFERENCES auth.users(id)` | Referencia al usuario autenticado relacionado. | `src/lib/devengados/audit.ts`<br>`src/lib/ausentismo/auditoria.ts` |
| `user_email` | `TEXT` | Almacena «user email» como parte de tesoreria_audit_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/audit.ts`<br>`src/lib/ausentismo/auditoria.ts`<br>`src/lib/incapacidades/auditoria.ts`<br>y 1 archivo(s) más |
| `accion` | `TEXT NOT NULL` | Almacena «accion» como parte de tesoreria_audit_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/auditoria.ts`<br>`src/lib/devengados/audit.ts`<br>`src/lib/ausentismo/auditoria.ts`<br>y 2 archivo(s) más |
| `cedula_conductor` | `TEXT` | Almacena «cedula conductor» como parte de tesoreria_audit_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/devengados/audit.ts` |
| `conductor_nombre` | `TEXT` | Almacena «conductor nombre» como parte de tesoreria_audit_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/audit.ts`<br>`src/lib/mcp/catalogo/operativo.ts` |
| `valor` | `NUMERIC` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/incapacidades/auditoria.ts`<br>`src/lib/devengados/audit.ts`<br>y 1 archivo(s) más |
| `detalle` | `JSONB NOT NULL DEFAULT '{}'` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/incapacidades/auditoria.ts`<br>`src/lib/ausentismo/auditoria.ts`<br>`src/lib/devengados/audit.ts`<br>y 2 archivo(s) más |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/mcp/catalogo/operativo.ts`<br>`src/lib/devengados/audit.ts`<br>`src/lib/incapacidades/auditoria.ts`<br>y 1 archivo(s) más |
| `ip` | `TEXT` | Almacena «ip» como parte de tesoreria_audit_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/audit.ts` |
| `equipo` | `TEXT` | Almacena «equipo» como parte de tesoreria_audit_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/audit.ts`<br>`src/lib/mcp/catalogo/operativo.ts`<br>`src/app/api/auth/evento/route.ts` |
| `modulo` | `TEXT NOT NULL DEFAULT 'tesoreria'` | Almacena «modulo» como parte de tesoreria_audit_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/audit.ts`<br>`src/lib/incapacidades/auditoria.ts`<br>`src/lib/riesgo/auditoria.ts`<br>y 2 archivo(s) más |
| `resultado` | `TEXT NOT NULL DEFAULT 'exitoso'` | Almacena «resultado» como parte de tesoreria_audit_log; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/devengados/audit.ts`<br>`src/lib/incapacidades/auditoria.ts`<br>`src/lib/riesgo/auditoria.ts`<br>y 1 archivo(s) más |
| `rol` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/auditoria.ts`<br>`src/lib/riesgo/auditoria.ts`<br>`src/lib/ausentismo/auditoria.ts`<br>y 1 archivo(s) más |
| `valor_anterior` | `TEXT` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/devengados/audit.ts` |
| `valor_nuevo` | `TEXT` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/devengados/audit.ts` |

## Transversal

### `anotaciones_viajes`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911162140_tablas_espejo_de_gema_timbradas_descontadas_tickets_transfer_anotaciones_y_cumplimientos.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema-operacion.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts` |
| `id_viaje` | `bigint NOT NULL` | Almacena «id viaje» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `fecha_viaje` | `date NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `num_viaje` | `integer` | Almacena «num viaje» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `codigo_vehiculo` | `text` | Almacena «codigo vehiculo» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `placa_vehiculo` | `text` | Almacena «placa vehiculo» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `conductor` | `text` | Almacena «conductor» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `ruta_programada` | `text` | Almacena «ruta programada» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `ruta_reprogramada` | `text` | Almacena «ruta reprogramada» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `cod_novedad` | `integer` | Almacena «cod novedad» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `novedad` | `text` | Almacena «novedad» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `observacion` | `text` | Almacena «observacion» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `estado` | `smallint` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `fecha_generacion` | `timestamp` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts` |
| `usuario_generacion` | `text` | Almacena «usuario generacion» como parte de anotaciones_viajes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `sincronizado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts` |

### `cumplimientos`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911162140_tablas_espejo_de_gema_timbradas_descontadas_tickets_transfer_anotaciones_y_cumplimientos.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema-operacion.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts` |
| `id_viaje` | `bigint NOT NULL` | Almacena «id viaje» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `fecha_viaje` | `date NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `turno` | `integer` | Almacena «turno» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `num_viaje` | `integer` | Almacena «num viaje» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `codigo_vehiculo` | `text` | Almacena «codigo vehiculo» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `placa_vehiculo` | `text` | Almacena «placa vehiculo» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `ruta` | `text` | Almacena «ruta» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>y 1 archivo(s) más |
| `hora_despacho` | `text` | Almacena «hora despacho» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `punto_control` | `text` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `abreviatura` | `text` | Almacena «abreviatura» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `hora_cumplimiento` | `text` | Almacena «hora cumplimiento» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `hora_llegada` | `text` | Almacena «hora llegada» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `min_diferencia` | `integer` | Almacena «min diferencia» como parte de cumplimientos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `sincronizado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts` |

### `historico_despacho`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911184759_historico_de_despacho_de_gema_tal_cual.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema-operacion.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `numero` | `bigint PRIMARY KEY` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `fecha_viaje` | `date NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `hora_procesado` | `text` | Almacena «hora procesado» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `hora_despacho` | `text` | Almacena «hora despacho» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `hora_llegada` | `text` | Almacena «hora llegada» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `fecha_recaudo` | `timestamp` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `codigo` | `text` | Código del sistema origen o catálogo para identificación e integración. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `placa` | `text` | Placa del vehículo usada para cruces operativos. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `conductor_cod` | `text` | Almacena «conductor cod» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts` |
| `conductor` | `text` | Almacena «conductor» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `conductor_ced` | `text` | Almacena «conductor ced» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts` |
| `turno` | `integer` | Almacena «turno» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `viaje` | `integer` | Almacena «viaje» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `estado` | `text` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `ruta_reprogramada` | `text` | Almacena «ruta reprogramada» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `ruta_programada` | `text` | Almacena «ruta programada» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `novedad` | `text` | Almacena «novedad» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `sigla_novedad` | `text` | Almacena «sigla novedad» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `tipologia_novedad` | `text` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `detalle_novedad` | `text` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `despachador` | `text` | Almacena «despachador» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `planillero` | `text` | Almacena «planillero» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `tipo_paquete` | `text` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `is_ruleta` | `boolean` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `is_cuna` | `boolean` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `tipo_propietario` | `text` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `propietario` | `text` | Almacena «propietario» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `propietario_ced` | `text` | Almacena «propietario ced» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts` |
| `timbradas` | `integer` | Almacena «timbradas» como parte de historico_despacho; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/gema/sync.ts`<br>y 1 archivo(s) más |
| `is_pago` | `boolean` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts` |
| `tipo_gps` | `text` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `sincronizado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts` |

### `incapacidad_adjuntos`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911201033_modulo_de_recuperacion_de_incapacidades_expediente_corte_y_etapa_1.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/api/incapacidades/adjuntos/route.ts`
  - `src/lib/incapacidades/adjuntos.ts` — consulta, alta
  - `src/lib/incapacidades/expedientes.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/adjuntos.ts`<br>`src/app/api/incapacidades/adjuntos/route.ts` |
| `expediente_id` | `UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE CASCADE` | Referencia al registro de expediente. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/adjuntos.ts`<br>`src/app/api/incapacidades/adjuntos/route.ts` |
| `relacionado_tipo` | `TEXT NOT NULL DEFAULT 'expediente' CHECK (relacionado_tipo IN ('expediente', 'liquidacion', 'radicacion', 'recaudo', 'ajuste'))` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/app/api/incapacidades/adjuntos/route.ts`<br>`src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `relacionado_id` | `UUID` | Referencia al registro de relacionado. | `src/app/api/incapacidades/adjuntos/route.ts`<br>`src/lib/incapacidades/adjuntos.ts` |
| `archivo_ruta` | `TEXT NOT NULL` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/incapacidades/adjuntos.ts` |
| `archivo_nombre` | `TEXT NOT NULL` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `archivo_mime` | `TEXT` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `archivo_tamano` | `INTEGER` | Referencia o metadato de un archivo/evidencia usado por el proceso. | `src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `subido_por_email` | `TEXT` | Almacena «subido por email» como parte de incapacidad_adjuntos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/adjuntos.ts` |
| `anulado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `anulado_por_email` | `TEXT` | Almacena «anulado por email» como parte de incapacidad_adjuntos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/adjuntos.ts` |
| `motivo_anulacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/adjuntos.ts`<br>`src/lib/incapacidades/expedientes.ts` |

### `incapacidad_ajustes`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911211305_incapacidades_recaudos_aplicaciones_ajustes_y_conciliacion.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/incapacidades/recaudos.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/recaudos.ts` |
| `expediente_id` | `UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE RESTRICT` | Referencia al registro de expediente. | `src/lib/incapacidades/recaudos.ts` |
| `tipo` | `TEXT NOT NULL CHECK (tipo IN ('glosa_aceptada', 'descuento_entidad', 'diferencia_redondeo', 'correccion', 'nota_informativa'))` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/recaudos.ts` |
| `valor` | `NUMERIC(14,2) NOT NULL CHECK (valor <> 0)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/recaudos.ts` |
| `extingue_saldo` | `BOOLEAN NOT NULL DEFAULT true` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/incapacidades/recaudos.ts` |
| `motivo` | `TEXT NOT NULL CHECK (length(btrim(motivo)) >= 5)` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/recaudos.ts` |
| `autorizado_por_email` | `TEXT` | Almacena «autorizado por email» como parte de incapacidad_ajustes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/recaudos.ts` |
| `anulado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/recaudos.ts` |
| `anulado_por_email` | `TEXT` | Almacena «anulado por email» como parte de incapacidad_ajustes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts` |
| `motivo_anulacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/recaudos.ts` |

### `incapacidad_ajustes_liquidacion`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911201033_modulo_de_recuperacion_de_incapacidades_expediente_corte_y_etapa_1.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/incapacidades/expedientes.ts` — consulta
  - `src/lib/incapacidades/liquidacion.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `expediente_id` | `UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE CASCADE` | Referencia al registro de expediente. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `campo` | `TEXT NOT NULL CHECK (campo IN ('salario_base', 'salario_vigencia_desde', 'entidad_catalogo_id', 'tipo_homologado', 'modalidad_ajustada', 'dias_entidad_ajustados', 'valor_reclamado_ajustado'))` | Almacena «campo» como parte de incapacidad_ajustes_liquidacion; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `nivel` | `TEXT NOT NULL CHECK (nivel IN ('entrada', 'sobrescritura'))` | Almacena «nivel» como parte de incapacidad_ajustes_liquidacion; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `valor_anterior` | `JSONB` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `valor_nuevo` | `JSONB` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `motivo` | `TEXT NOT NULL CHECK (length(btrim(motivo)) >= 5)` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `ajustado_por_email` | `TEXT NOT NULL` | Almacena «ajustado por email» como parte de incapacidad_ajustes_liquidacion; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `liquidacion_id` | `UUID REFERENCES incapacidad_liquidaciones (id)` | Referencia al registro de liquidacion. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/expedientes.ts` |

### `incapacidad_expedientes`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911201033_modulo_de_recuperacion_de_incapacidades_expediente_corte_y_etapa_1.sql`
- **Operaciones detectadas:** consulta, alta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/api/incapacidades/adjuntos/route.ts` — consulta
  - `src/lib/incapacidades/expedientes.ts` — consulta
  - `src/lib/incapacidades/liquidacion.ts` — consulta, alta, actualización
  - `src/lib/incapacidades/radicacion.ts` — consulta, actualización
  - `src/lib/incapacidades/recaudos.ts` — consulta, actualización

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>y 2 archivo(s) más |
| `ausentismo_id` | `UUID NOT NULL UNIQUE REFERENCES ausentismo (id) ON DELETE RESTRICT` | Referencia al registro de ausentismo. | `src/lib/incapacidades/expedientes.ts` |
| `recibido_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/expedientes.ts` |
| `recibido_desde` | `TEXT NOT NULL CHECK (recibido_desde IN ('matriz_formulario', 'matriz_excel', 'alta_manual'))` | Almacena «recibido desde» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `recibido_json` | `JSONB NOT NULL` | Almacena «recibido json» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `matriz_updated_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `matriz_cambio_pendiente` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/incapacidades/expedientes.ts` |
| `persona_fuente` | `TEXT CHECK (persona_fuente IN ('conductores', 'employees', 'sin_resolver'))` | Almacena «persona fuente» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `persona_ref` | `TEXT` | Almacena «persona ref» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `salario_base` | `NUMERIC(14,2) CHECK (salario_base > 0)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `salario_moneda` | `TEXT NOT NULL DEFAULT 'COP'` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `salario_vigencia_desde` | `DATE` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `salario_fuente` | `TEXT CHECK (salario_fuente IN ('manual', 'employees'))` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `salario_resuelto_por_email` | `TEXT` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/liquidacion.ts` |
| `salario_resuelto_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/liquidacion.ts` |
| `tipo_homologado` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `entidad_catalogo_id` | `UUID REFERENCES ausentismo_catalogos (id)` | Referencia al registro de entidad catalogo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>`src/lib/incapacidades/radicacion.ts`<br>y 1 archivo(s) más |
| `entidad_nombre_recibido` | `TEXT` | Almacena «entidad nombre recibido» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `pendiente_homologacion` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `modalidad_ajustada` | `TEXT CHECK (modalidad_ajustada IN ('INICIAL', 'PRORROGA'))` | Almacena «modalidad ajustada» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `dias_entidad_ajustados` | `INTEGER CHECK (dias_entidad_ajustados >= 0)` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `valor_reclamado_ajustado` | `NUMERIC(14,2) CHECK (valor_reclamado_ajustado >= 0)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `responsable_email` | `TEXT` | Almacena «responsable email» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `estado` | `TEXT NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido', 'en_completar', 'liquidado', 'radicado', 'con_recaudo', 'conciliado', 'cerrado', 'excepcion'))` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>y 2 archivo(s) más |
| `motivo_excepcion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/expedientes.ts` |
| `valor_reclamado` | `NUMERIC(14,2) CHECK (valor_reclamado >= 0)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>y 1 archivo(s) más |
| `proxima_accion` | `TEXT` | Almacena «proxima accion» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `proxima_accion_fecha` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `observaciones` | `TEXT` | Texto libre de contexto operativo y seguimiento. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>y 1 archivo(s) más |
| `revision_estado` | `TEXT` | Almacena «revision estado» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `revision_por_email` | `TEXT` | Almacena «revision por email» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `revision_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `revision_comentario` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `marca_smlv` | `BOOLEAN` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `alta_manual_motivo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/expedientes.ts` |
| `alta_manual_por_email` | `TEXT` | Almacena «alta manual por email» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `version` | `INTEGER NOT NULL DEFAULT 1` | Almacena «version» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>y 1 archivo(s) más |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/recaudos.ts`<br>`src/lib/incapacidades/radicacion.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/radicacion.ts`<br>y 1 archivo(s) más |
| `eliminado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/api/incapacidades/adjuntos/route.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts`<br>y 1 archivo(s) más |
| `eliminado_por_email` | `TEXT` | Almacena «eliminado por email» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `motivo_eliminacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | Sin referencia literal localizada junto al uso de la tabla; puede ser automático, SQL o integración externa. |
| `cerrado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/recaudos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `cerrado_por_email` | `TEXT` | Almacena «cerrado por email» como parte de incapacidad_expedientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `motivo_cierre` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/recaudos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `cierre_por_excepcion` | `BOOLEAN` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/incapacidades/recaudos.ts`<br>`src/lib/incapacidades/expedientes.ts` |

### `incapacidad_liquidaciones`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911201033_modulo_de_recuperacion_de_incapacidades_expediente_corte_y_etapa_1.sql`
- **Operaciones detectadas:** consulta, alta, actualización
- **Uso comprobado en Gestivo:**
  - `src/lib/incapacidades/expedientes.ts` — consulta
  - `src/lib/incapacidades/liquidacion.ts` — alta, actualización

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `expediente_id` | `UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE CASCADE` | Referencia al registro de expediente. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `regla_id` | `UUID REFERENCES incapacidad_reglas (id)` | Referencia al registro de regla. | `src/lib/incapacidades/liquidacion.ts` |
| `regla_codigo` | `TEXT NOT NULL` | Almacena «regla codigo» como parte de incapacidad_liquidaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `entradas` | `JSONB NOT NULL` | Almacena «entradas» como parte de incapacidad_liquidaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `sobrescrituras` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | Almacena «sobrescrituras» como parte de incapacidad_liquidaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `dias_incapacidad` | `INTEGER NOT NULL` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `dias_entidad` | `INTEGER NOT NULL` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `dias_empresa` | `INTEGER NOT NULL` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `factor` | `NUMERIC(6,4) NOT NULL` | Almacena «factor» como parte de incapacidad_liquidaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `valor_total` | `NUMERIC(14,2) NOT NULL` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `valor_entidad` | `NUMERIC(14,2) NOT NULL` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `valor_empresa` | `NUMERIC(14,2) NOT NULL` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `redondeo` | `INTEGER` | Almacena «redondeo» como parte de incapacidad_liquidaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `calculado_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/expedientes.ts` |
| `calculado_por_email` | `TEXT` | Almacena «calculado por email» como parte de incapacidad_liquidaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `es_vigente` | `BOOLEAN NOT NULL DEFAULT true` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |

### `incapacidad_parametros`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911201033_modulo_de_recuperacion_de_incapacidades_expediente_corte_y_etapa_1.sql`
- **Operaciones detectadas:** consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/lib/incapacidades/expedientes.ts` — consulta
  - `src/lib/incapacidades/recaudos.ts` — consulta, actualización

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `clave` | `TEXT PRIMARY KEY` | Almacena «clave» como parte de incapacidad_parametros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/recaudos.ts` |
| `valor` | `JSONB NOT NULL` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/recaudos.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `descripcion` | `TEXT` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/incapacidades/expedientes.ts` |
| `actualizado_por_email` | `TEXT` | Almacena «actualizado por email» como parte de incapacidad_parametros; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/recaudos.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/recaudos.ts` |

### `incapacidad_radicaciones`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911205408_incapacidades_radicacion_ante_la_entidad_y_umbral_por_entidad.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/incapacidades/expedientes.ts` — consulta
  - `src/lib/incapacidades/radicacion.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/radicacion.ts` |
| `expediente_id` | `UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE CASCADE` | Referencia al registro de expediente. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `entidad_catalogo_id` | `UUID NOT NULL REFERENCES ausentismo_catalogos (id)` | Referencia al registro de entidad catalogo. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `estado` | `TEXT NOT NULL DEFAULT 'solicitada' CHECK (estado IN ('solicitada', 'radicada', 'devuelta', 'anulada'))` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `fecha_solicitud` | `DATE NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `fecha_radicacion` | `DATE` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `codigo_radicacion` | `TEXT` | Almacena «codigo radicacion» como parte de incapacidad_radicaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `valor_reclamado` | `NUMERIC(14,2) NOT NULL CHECK (valor_reclamado >= 0)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `liquidacion_id` | `UUID REFERENCES incapacidad_liquidaciones (id)` | Referencia al registro de liquidacion. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `bajo_umbral` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `excepcion_motivo` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `motivo_devolucion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/radicacion.ts` |
| `devuelta_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/radicacion.ts` |
| `observaciones` | `TEXT` | Texto libre de contexto operativo y seguimiento. | `src/lib/incapacidades/radicacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `registrada_por_email` | `TEXT` | Almacena «registrada por email» como parte de incapacidad_radicaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/radicacion.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/radicacion.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/radicacion.ts` |
| `anulada_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/radicacion.ts` |
| `anulada_por_email` | `TEXT` | Almacena «anulada por email» como parte de incapacidad_radicaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/radicacion.ts` |
| `motivo_anulacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/radicacion.ts` |

### `incapacidad_recaudo_aplicaciones`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911211305_incapacidades_recaudos_aplicaciones_ajustes_y_conciliacion.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/incapacidades/recaudos.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/recaudos.ts` |
| `recaudo_id` | `UUID NOT NULL REFERENCES incapacidad_recaudos (id) ON DELETE RESTRICT` | Referencia al registro de recaudo. | `src/lib/incapacidades/recaudos.ts` |
| `expediente_id` | `UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE RESTRICT` | Referencia al registro de expediente. | `src/lib/incapacidades/recaudos.ts` |
| `radicacion_id` | `UUID REFERENCES incapacidad_radicaciones (id)` | Referencia al registro de radicacion. | `src/lib/incapacidades/recaudos.ts` |
| `valor_aplicado` | `NUMERIC(14,2) NOT NULL CHECK (valor_aplicado > 0)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/recaudos.ts` |
| `aplicado_por_email` | `TEXT` | Almacena «aplicado por email» como parte de incapacidad_recaudo_aplicaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/recaudos.ts` |
| `anulada_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/recaudos.ts` |
| `anulada_por_email` | `TEXT` | Almacena «anulada por email» como parte de incapacidad_recaudo_aplicaciones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts` |
| `motivo_anulacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/recaudos.ts` |

### `incapacidad_recaudos`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911211305_incapacidades_recaudos_aplicaciones_ajustes_y_conciliacion.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/lib/incapacidades/recaudos.ts` — consulta, alta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/recaudos.ts` |
| `entidad_catalogo_id` | `UUID NOT NULL REFERENCES ausentismo_catalogos (id)` | Referencia al registro de entidad catalogo. | `src/lib/incapacidades/recaudos.ts` |
| `fecha_giro` | `DATE NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/recaudos.ts` |
| `valor` | `NUMERIC(14,2) NOT NULL CHECK (valor > 0)` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/incapacidades/recaudos.ts` |
| `referencia` | `TEXT` | Almacena «referencia» como parte de incapacidad_recaudos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts` |
| `medio` | `TEXT CHECK (medio IN ('transferencia', 'consignacion', 'cruce', 'cheque', 'otro'))` | Almacena «medio» como parte de incapacidad_recaudos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts` |
| `observaciones` | `TEXT` | Texto libre de contexto operativo y seguimiento. | `src/lib/incapacidades/recaudos.ts` |
| `registrado_por_email` | `TEXT` | Almacena «registrado por email» como parte de incapacidad_recaudos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/recaudos.ts` |
| `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de la última modificación. | `src/lib/incapacidades/recaudos.ts` |
| `anulado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/recaudos.ts` |
| `anulado_por_email` | `TEXT` | Almacena «anulado por email» como parte de incapacidad_recaudos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/recaudos.ts` |
| `motivo_anulacion` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/incapacidades/recaudos.ts` |

### `incapacidad_reglas`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911201033_modulo_de_recuperacion_de_incapacidades_expediente_corte_y_etapa_1.sql`
- **Operaciones detectadas:** consulta
- **Uso comprobado en Gestivo:**
  - `src/lib/incapacidades/expedientes.ts` — consulta
  - `src/lib/incapacidades/liquidacion-reglas.ts`
  - `src/lib/incapacidades/liquidacion.ts` — consulta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion-reglas.ts` |
| `codigo` | `TEXT NOT NULL UNIQUE` | Código del sistema origen o catálogo para identificación e integración. | `src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/liquidacion-reglas.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `descripcion` | `TEXT NOT NULL` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion-reglas.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `parametros` | `JSONB NOT NULL` | Almacena «parametros» como parte de incapacidad_reglas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/liquidacion-reglas.ts`<br>`src/lib/incapacidades/liquidacion.ts`<br>`src/lib/incapacidades/expedientes.ts` |
| `operativa` | `BOOLEAN NOT NULL DEFAULT false` | Indicador lógico que habilita, clasifica o controla una regla del proceso. | `src/lib/incapacidades/expedientes.ts`<br>`src/lib/incapacidades/liquidacion.ts` |
| `vigente_desde` | `DATE` | Almacena «vigente desde» como parte de incapacidad_reglas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `vigente_hasta` | `DATE` | Almacena «vigente hasta» como parte de incapacidad_reglas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `aprobado_por_email` | `TEXT` | Almacena «aprobado por email» como parte de incapacidad_reglas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/incapacidades/expedientes.ts` |
| `aprobado_at` | `TIMESTAMPTZ` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/incapacidades/expedientes.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/incapacidades/expedientes.ts` |

### `oauth_clientes`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911152916_mcp_servidor_para_agentes_de_ia_con_oauth_introspeccion_y_agregacion.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/configuracion/api/page.tsx` — consulta
  - `src/lib/oauth/servicio.ts` — consulta, alta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/oauth/servicio.ts`<br>`src/app/(dashboard)/configuracion/api/page.tsx` |
| `client_id` | `text NOT NULL UNIQUE` | Referencia al registro de client. | `src/lib/oauth/servicio.ts` |
| `nombre` | `text NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/oauth/servicio.ts`<br>`src/app/(dashboard)/configuracion/api/page.tsx` |
| `redirect_uris` | `text[] NOT NULL` | Almacena «redirect uris» como parte de oauth_clientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts`<br>`src/app/(dashboard)/configuracion/api/page.tsx` |
| `uri_cliente` | `text` | Almacena «uri cliente» como parte de oauth_clientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `metodo_autenticacion` | `text NOT NULL DEFAULT 'none' CHECK (metodo_autenticacion IN ('none', 'client_secret_post', 'client_secret_basic'))` | Almacena «metodo autenticacion» como parte de oauth_clientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `secreto_hash` | `text` | Almacena «secreto hash» como parte de oauth_clientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `software_id` | `text` | Referencia al registro de software. | `src/lib/oauth/servicio.ts` |
| `software_version` | `text` | Almacena «software version» como parte de oauth_clientes; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `creado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/lib/oauth/servicio.ts` |

### `oauth_codigos`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911152916_mcp_servidor_para_agentes_de_ia_con_oauth_introspeccion_y_agregacion.sql`
- **Operaciones detectadas:** alta
- **Uso comprobado en Gestivo:**
  - `src/lib/oauth/servicio.ts` — alta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `codigo_hash` | `text PRIMARY KEY` | Almacena «codigo hash» como parte de oauth_codigos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `cliente_id` | `uuid NOT NULL REFERENCES oauth_clientes(id) ON DELETE CASCADE` | Referencia al registro de cliente. | `src/lib/oauth/servicio.ts` |
| `usuario_id` | `uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE` | Referencia al registro de usuario. | `src/lib/oauth/servicio.ts` |
| `redirect_uri` | `text NOT NULL` | Almacena «redirect uri» como parte de oauth_codigos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `code_challenge` | `text NOT NULL` | Almacena «code challenge» como parte de oauth_codigos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `alcance` | `text NOT NULL` | Almacena «alcance» como parte de oauth_codigos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `recurso` | `text` | Almacena «recurso» como parte de oauth_codigos; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `expira_at` | `timestamptz NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts` |
| `usado_at` | `timestamptz` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts` |
| `creado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts` |

### `oauth_concesiones`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911152916_mcp_servidor_para_agentes_de_ia_con_oauth_introspeccion_y_agregacion.sql`
- **Operaciones detectadas:** consulta, actualización
- **Uso comprobado en Gestivo:**
  - `src/app/(dashboard)/configuracion/api/page.tsx` — consulta
  - `src/lib/oauth/servicio.ts` — actualización

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/oauth/servicio.ts`<br>`src/app/(dashboard)/configuracion/api/page.tsx` |
| `cliente_id` | `uuid NOT NULL REFERENCES oauth_clientes(id) ON DELETE CASCADE` | Referencia al registro de cliente. | `src/lib/oauth/servicio.ts` |
| `usuario_id` | `uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE` | Referencia al registro de usuario. | `src/lib/oauth/servicio.ts` |
| `alcance` | `text NOT NULL` | Almacena «alcance» como parte de oauth_concesiones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `recurso` | `text` | Almacena «recurso» como parte de oauth_concesiones; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `creado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/app/(dashboard)/configuracion/api/page.tsx`<br>`src/lib/oauth/servicio.ts` |
| `ultimo_uso_at` | `timestamptz` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts`<br>`src/app/(dashboard)/configuracion/api/page.tsx` |
| `revocado_at` | `timestamptz` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts`<br>`src/app/(dashboard)/configuracion/api/page.tsx` |

### `oauth_tokens`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911152916_mcp_servidor_para_agentes_de_ia_con_oauth_introspeccion_y_agregacion.sql`
- **Operaciones detectadas:** alta, actualización
- **Uso comprobado en Gestivo:**
  - `src/lib/oauth/servicio.ts` — alta, actualización

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `token_hash` | `text PRIMARY KEY` | Almacena «token hash» como parte de oauth_tokens; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/oauth/servicio.ts` |
| `concesion_id` | `uuid NOT NULL REFERENCES oauth_concesiones(id) ON DELETE CASCADE` | Referencia al registro de concesion. | `src/lib/oauth/servicio.ts` |
| `tipo` | `text NOT NULL CHECK (tipo IN ('acceso', 'refresco'))` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/oauth/servicio.ts` |
| `expira_at` | `timestamptz NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts` |
| `usado_at` | `timestamptz` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts` |
| `revocado_at` | `timestamptz` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts` |
| `creado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/oauth/servicio.ts` |

### `riesgo_conductores`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260910155217_modulo_de_riesgo_predictivo_de_conductores.sql`
- **Operaciones detectadas:** alta, eliminación
- **Uso comprobado en Gestivo:**
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/riesgo.ts`
  - `src/lib/mcp/consultas.ts`
  - `src/lib/riesgo/persistir.ts` — alta, eliminación

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `corrida_id` | `UUID NOT NULL REFERENCES riesgo_corridas (id) ON DELETE CASCADE` | Referencia al registro de corrida. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/external/resources.ts`<br>y 2 archivo(s) más |
| `cedula` | `TEXT NOT NULL` | Documento de identidad usado para identificar y cruzar personas. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/consultas.ts`<br>y 2 archivo(s) más |
| `codigo` | `TEXT` | Código del sistema origen o catálogo para identificación e integración. | `src/lib/mcp/consultas.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>y 2 archivo(s) más |
| `nombre` | `TEXT NOT NULL` | Nombre legible mostrado en la interfaz y reportes. | `src/lib/mcp/consultas.ts`<br>`src/lib/external/resources.ts`<br>`src/lib/riesgo/persistir.ts`<br>y 2 archivo(s) más |
| `tipo_conductor` | `TEXT` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>y 1 archivo(s) más |
| `prob_retiro` | `NUMERIC(6,5) NOT NULL` | Almacena «prob retiro» como parte de riesgo_conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/external/resources.ts` |
| `nivel_retiro` | `TEXT NOT NULL CHECK (nivel_retiro IN ('Alto', 'Medio', 'Bajo'))` | Almacena «nivel retiro» como parte de riesgo_conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `factores_retiro` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «factores retiro» como parte de riesgo_conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `prob_novedad` | `NUMERIC(6,5) NOT NULL` | Almacena «prob novedad» como parte de riesgo_conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts` |
| `nivel_novedad` | `TEXT NOT NULL CHECK (nivel_novedad IN ('Alto', 'Medio', 'Bajo'))` | Almacena «nivel novedad» como parte de riesgo_conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `factores_novedad` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «factores novedad» como parte de riesgo_conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `variables` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | Almacena «variables» como parte de riesgo_conductores; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/external/resources.ts` |

### `riesgo_corridas`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260910155217_modulo_de_riesgo_predictivo_de_conductores.sql`
- **Operaciones detectadas:** consulta, alta
- **Uso comprobado en Gestivo:**
  - `src/lib/external/resources.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/riesgo.ts`
  - `src/lib/mcp/consultas.ts` — consulta
  - `src/lib/riesgo/persistir.ts` — consulta, alta

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único del registro. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/mcp/consultas.ts`<br>y 1 archivo(s) más |
| `corte` | `DATE NOT NULL` | Almacena «corte» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 2 archivo(s) más |
| `ejecutada_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/consultas.ts`<br>y 1 archivo(s) más |
| `ejecutada_por_email` | `TEXT` | Almacena «ejecutada por email» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `origen` | `TEXT NOT NULL DEFAULT 'cron' CHECK (origen IN ('cron', 'manual'))` | Sistema o mecanismo del que provino el dato. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/consultas.ts`<br>y 2 archivo(s) más |
| `estado` | `TEXT NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok', 'error'))` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>y 2 archivo(s) más |
| `error` | `TEXT` | Almacena «error» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/consultas.ts`<br>`src/lib/mcp/catalogo/riesgo.ts`<br>y 1 archivo(s) más |
| `observaciones` | `INTEGER` | Texto libre de contexto operativo y seguimiento. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `conductores_puntuados` | `INTEGER` | Almacena «conductores puntuados» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/consultas.ts` |
| `cortes` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «cortes» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `modelos` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | Almacena «modelos» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/riesgo.ts`<br>`src/lib/riesgo/persistir.ts`<br>`src/lib/external/resources.ts` |
| `descriptivos` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «descriptivos» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `retiros_mes` | `JSONB NOT NULL DEFAULT '[]'::jsonb` | Almacena «retiros mes» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `conteos` | `JSONB NOT NULL DEFAULT '{}'::jsonb` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `duracion_ms` | `INTEGER` | Almacena «duracion ms» como parte de riesgo_corridas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/riesgo/persistir.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |
| `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | Fecha y hora de creación; sirve para ordenar y auditar. | `src/lib/external/resources.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/riesgo.ts` |

### `tickets_transfer`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911162140_tablas_espejo_de_gema_timbradas_descontadas_tickets_transfer_anotaciones_y_cumplimientos.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema-operacion.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts` |
| `id_viaje` | `bigint NOT NULL` | Almacena «id viaje» como parte de tickets_transfer; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `fecha_viaje` | `date` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `num_viaje` | `integer` | Almacena «num viaje» como parte de tickets_transfer; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `codigo_vehiculo` | `text` | Almacena «codigo vehiculo» como parte de tickets_transfer; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `placa_vehiculo` | `text` | Almacena «placa vehiculo» como parte de tickets_transfer; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `cantidad_total` | `integer` | Valor monetario o acumulado usado en cálculos, conciliación y reportes. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts` |
| `cantidad_descuento` | `integer` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `cantidad_incentivo` | `integer` | Medida cuantitativa usada en cálculos, filtros, indicadores o georreferenciación. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `tickets` | `text` | Almacena «tickets» como parte de tickets_transfer; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `tickets_detalles` | `jsonb` | Contenido descriptivo mostrado o utilizado como contexto del registro. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `estado` | `smallint` | Estado del ciclo de vida que controla filtros y acciones permitidas. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `fecha_generacion` | `timestamp NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts` |
| `dia_generacion` | `date GENERATED ALWAYS AS (fecha_generacion::date) STORED` | Almacena «dia generacion» como parte de tickets_transfer; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts` |
| `usuario_generacion` | `text` | Almacena «usuario generacion» como parte de tickets_transfer; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `fecha_anulacion` | `timestamp` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts` |
| `usuario_anulacion` | `text` | Almacena «usuario anulacion» como parte de tickets_transfer; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `sincronizado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts` |

### `timbradas_descontadas`

Tabla operativa del sistema Gestivo.

- **Origen del esquema:** `supabase/migrations/20260911162140_tablas_espejo_de_gema_timbradas_descontadas_tickets_transfer_anotaciones_y_cumplimientos.sql`
- **Operaciones detectadas:** referencia/uso indirecto
- **Uso comprobado en Gestivo:**
  - `src/lib/external/resources.ts`
  - `src/lib/gema/sync.ts`
  - `src/lib/mcp/catalogo/contexto.ts`
  - `src/lib/mcp/catalogo/gema-operacion.ts`

| Campo | Definición SQL | Uso del campo | Evidencia de uso directo |
|---|---|---|---|
| `id` | `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | Identificador único del registro. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts` |
| `id_viaje` | `bigint NOT NULL` | Almacena «id viaje» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `fecha_viaje` | `date` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `num_viaje` | `integer` | Almacena «num viaje» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `codigo_vehiculo` | `text` | Almacena «codigo vehiculo» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts`<br>y 1 archivo(s) más |
| `placa_vehiculo` | `text` | Almacena «placa vehiculo» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `conductor` | `text` | Almacena «conductor» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/contexto.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts`<br>y 1 archivo(s) más |
| `identificacion_conductor` | `text` | Almacena «identificacion conductor» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts` |
| `tim_descuento` | `numeric(12,2)` | Almacena «tim descuento» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `motivo_descuento` | `text` | Clasificación del registro para aplicar reglas, segmentar y reportar. | `src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/contexto.ts` |
| `observacion` | `text` | Almacena «observacion» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `fecha_generacion` | `timestamp NOT NULL` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts`<br>`src/lib/external/resources.ts` |
| `dia_generacion` | `date GENERATED ALWAYS AS (fecha_generacion::date) STORED` | Almacena «dia generacion» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/mcp/catalogo/gema-operacion.ts` |
| `usuario_generacion` | `text` | Almacena «usuario generacion» como parte de timbradas_descontadas; Gestivo lo conserva para presentar, filtrar, validar o integrar el registro según el flujo del módulo. | `src/lib/gema/sync.ts`<br>`src/lib/mcp/catalogo/gema-operacion.ts` |
| `sincronizado_at` | `timestamptz NOT NULL DEFAULT now()` | Fecha o marca de tiempo usada para trazabilidad, filtros y cálculos del proceso. | `src/lib/mcp/catalogo/gema-operacion.ts` |

## Relaciones y flujos principales

- **Selección:** `candidates` → `candidate_vacancy` → `stage_history` / `notes` → `procesos_contratacion` → `employees`.
- **Rotación:** `conductores` concentra la persona; `cierres_diarios`, `viajes_perdidos`, `ausentismo`, `familia`, `incentivos` y `accidentes` aportan señales para análisis y fichas.
- **Tesorería:** `cierres_diarios` alimenta cálculos de devengados; `devengados_entregas` registra movimientos; `devengados_bloqueos` controla fechas y `tesoreria_audit_log` conserva trazabilidad.
- **Mantenimiento:** `vehiculos` es el maestro; `mantenimiento_reportes`, `mantenimiento_alertas`, `mantenimiento_frenos` y `mantenimiento_auditoria` registran ejecución, alertas y control.
- **Operación:** `velocidades`, `pv_deltas`, `puntos_virtuales`, `geo_direcciones` y `geo_trazados` soportan mapas, recorridos e incidencias; los documentos del vehículo viven en `operativo_vehiculo_documentos`.
- **Comunicaciones:** `wa_contactos` agrupa la identidad, `wa_conversaciones` el caso de atención y `wa_mensajes` el intercambio; `wa_canal` configura el proveedor.

## Limitaciones y mantenimiento

1. El resultado se reconstruye estáticamente; debe contrastarse con `information_schema` si se sospechan cambios manuales en producción.
2. Las consultas dinámicas, funciones SQL, vistas, triggers y consumidores externos pueden usar campos que no aparecen directamente en TypeScript.
3. Cuando se agregue una migración, ejecute `node scripts/generar-diccionario-datos.mjs` y revise las descripciones nuevas antes de publicar.
4. No se exponen secretos ni valores reales: el documento describe estructura y finalidad, no contenido de producción.

## Fuentes

- `supabase/migrations/*.sql`: definición y evolución del esquema.
- `src/**/*.{ts,tsx}`: uso en páginas, acciones, API y servicios de Gestivo.
- `supabase/seed/*.ts`: procesos de carga y datos de desarrollo.
