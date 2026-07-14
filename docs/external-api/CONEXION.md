# Conectar un consultor de IA a la Data API de GESTIVO

> **Documentación completa:** `https://saas-six-vert.vercel.app/docs/api`
> (referencia de endpoints, operadores, paginación, errores y catálogo de
> recursos con columnas en vivo).

API de **solo lectura** sobre los datos del negocio:

- `GET  /api/external/v1/schema`         → qué recursos existen, sus columnas y endpoints.
- `GET  /api/external/v1/<recurso>`      → listado REST del recurso (filtros: `?estado=ACTIVO`, `?fecha=gte.2026-01-01`).
- `GET  /api/external/v1/<recurso>/<id>` → detalle de un registro (por `id`, o `cedula` en conductores).
- `POST /api/external/v1/query`          → consulta genérica (filtros, orden, límite en JSON).
- `POST /api/external/v1/aggregate`      → métricas agregadas (count/sum/avg/min/max) por grupo.

## 1) Datos de conexión

| Parámetro | Valor |
|---|---|
| **Base URL** | `https://saas-six-vert.vercel.app` |
| **Header de autenticación** | `x-api-key: <api-key>` |

> Esta URL pública responde directamente (no requiere bypass de Vercel). La
> seguridad la da la `x-api-key`: sin ella, la API responde `401`.

### API keys

Las claves se crean y revocan en el dashboard: **Configuración → API**
(solo administradores). Tienen formato `sk_live_...`, se muestran una sola
vez al crearlas y se recomienda una clave por integración. La clave estática
`DATA_API_KEY` (variable de entorno) sigue funcionando como mecanismo legado.

## 2) Probar (curl)

```bash
BASE="https://saas-six-vert.vercel.app"
KEY="<DATA_API_KEY>"

# Descubrir recursos
curl -s -H "x-api-key: $KEY" "$BASE/api/external/v1/schema" | jq .

# Consultar: conductores activos
curl -s -X POST -H "x-api-key: $KEY" -H "content-type: application/json" \
  -d '{"resource":"conductores_con_grupo","filters":[{"column":"estado","op":"eq","value":"ACTIVO"}],"limit":20}' \
  "$BASE/api/external/v1/query" | jq .
```

## 3) Conectar en Hermes (o cualquier plataforma de IA)

1. Importa el esquema `openapi.json` (en esta carpeta) como herramienta/acción, o
   configura un nodo HTTP con la Base URL de arriba.
2. Autenticación: tipo **API Key**, en **header**, nombre `x-api-key`, valor = `DATA_API_KEY`.
3. Pega estas instrucciones al modelo para que sepa usar la API:

```
Tienes una Data API de solo lectura de GESTIVO.
- Primero llama getSchema para ver los recursos y columnas disponibles.
- Luego llama queryResource con { resource, filters?, order?, limit? } para traer datos.
- Operadores de filtro: eq, neq, gt, gte, lt, lte, like, ilike, in, is.
- Nunca inventes nombres de recurso o columna: úsalos tal como aparecen en getSchema.
- Límite máximo 1000 filas por consulta; usa filtros para acotar.
```

## Recursos disponibles (19)

rotación: `conductores_con_grupo`, `cierres_diarios`, `viajes_perdidos` ·
ausentismo: `ausentismo` ·
accidentabilidad: `accidentes`, `accidente_evaluaciones`, `accidente_eventos`, `accidente_vehiculos` ·
reclutamiento: `candidates`, `vacancies`, `candidate_vacancy`, `stage_history`, `employees`, `documents` ·
rrhh: `familia`, `incentivos` ·
campañas: `meta_campaigns`, `meta_spend_daily` ·
config: `departments`
