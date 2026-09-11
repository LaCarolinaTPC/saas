# Servidor MCP de Gestivo

Conecta cualquier agente de IA compatible con MCP (Claude, ChatGPT, Codex,
Cursor, Hermes, n8n, agentes de voz…) a los datos de Gestivo, en **solo
lectura** y con la documentación de cada dato incluida en cada respuesta.

| | |
|---|---|
| **URL** | `https://saas-six-vert.vercel.app/api/mcp` |
| **Transporte** | Streamable HTTP, sin sesiones (respuestas JSON) |
| **Autenticación** | OAuth 2.1 (administradores de Gestivo) o API key `sk_live_…` |
| **Código** | `src/app/api/mcp/route.ts`, `src/lib/mcp/`, `src/lib/oauth/` |

## Antes del primer uso

1. Aplicar en el SQL Editor la migración
   `supabase/migrations/20260911152916_mcp_servidor_para_agentes_de_ia_con_oauth_introspeccion_y_agregacion.sql`.
   Sin ella el MCP funciona a medias: no hay tipos de columna, no hay
   `agregar_datos` y OAuth falla.
2. Desplegar. Opcional: `GESTIVO_URL_PUBLICA=https://…` en Vercel si Gestivo
   responde en varios dominios. Fija el emisor OAuth, que debe ser estable.

## Cómo conectarse

### Con OAuth (sin copiar claves)

Para claude.ai, Claude Desktop, ChatGPT y cualquier cliente que ofrezca
"iniciar sesión". Solo puede autorizar un **administrador** de Gestivo.

- **claude.ai / Claude Desktop:** Configuración → Conectores → *Agregar conector
  personalizado* → pegar la URL → *Conectar*. Se abre Gestivo: iniciar sesión y
  pulsar **Autorizar**.
- **ChatGPT:** en *Apps y conectores* (modo desarrollador) crear un conector con
  la URL y autenticación OAuth. El resto es igual.
- **Claude Code:** `claude mcp add --transport http gestivo https://saas-six-vert.vercel.app/api/mcp`
  y luego `/mcp` → *Authenticate*.

Las autorizaciones activas se ven y se revocan en **Configuración → API →
Agentes conectados por OAuth**. Si el usuario deja de ser administrador, sus
agentes pierden el acceso en la siguiente llamada.

### Con API key

Para Claude Code, Codex, Cursor, VS Code, Hermes, n8n, agentes de voz y scripts.
Cree una clave por integración en **Configuración → API** y envíela como
`Authorization: Bearer sk_live_…` (también se acepta `x-api-key`).

**Claude Code**
```bash
claude mcp add --transport http gestivo https://saas-six-vert.vercel.app/api/mcp \
  --header "Authorization: Bearer $GESTIVO_API_KEY"
```

**Codex** (`~/.codex/config.toml`)
```toml
[mcp_servers.gestivo]
url = "https://saas-six-vert.vercel.app/api/mcp"
bearer_token_env_var = "GESTIVO_API_KEY"
```

**Cursor** (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "gestivo": {
      "url": "https://saas-six-vert.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer ${env:GESTIVO_API_KEY}" }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`)
```json
{
  "servers": {
    "gestivo": {
      "type": "http",
      "url": "https://saas-six-vert.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer ${input:gestivo-key}" }
    }
  },
  "inputs": [{ "id": "gestivo-key", "type": "promptString", "password": true, "description": "API key de Gestivo" }]
}
```

**Hermes, n8n y plataformas de agentes o de voz:** nodo o herramienta "MCP
client" con transporte *HTTP Streamable*, la URL de arriba y el header
`Authorization: Bearer <clave>`.

**Clientes que solo hablan stdio:**
```bash
npx -y mcp-remote https://saas-six-vert.vercel.app/api/mcp --header "Authorization:Bearer ${GESTIVO_API_KEY}"
```

## Herramientas

| Herramienta | Para qué |
|---|---|
| `guia_gestivo` | Primera llamada: negocio, fecha y hora en Colombia, reglas de los datos y mapa de recursos con su granularidad. |
| `describir_recurso` | Documentación completa de un recurso: columnas reales con tipo, significado, unidad y valores; trampas; con qué no confundirlo. |
| `consultar_datos` | Registros con filtros, orden y paginación, con la documentación de las columnas devueltas. |
| `agregar_datos` | Conteos, sumas, promedios, mínimos, máximos y valores distintos sobre todas las filas, por grupo o por periodo. |
| `obtener_registro` | Un registro completo por su identificador. |
| `buscar_conductor` | Resuelve a una persona por cédula, código o nombre, y dice dónde buscar sus datos. |
| `glosario` | Vocabulario del negocio y palabras con dos significados. |
| `estado_de_los_datos` | Frescura de la sincronización con GEMA y última corrida válida del riesgo predictivo. |

También publica los recursos MCP `gestivo://guia`, `gestivo://glosario` y
`gestivo://recursos/{nombre}`, y el prompt `analizar_conductor`.

## Cómo evita que el agente se confunda

- **Descubrimiento por etapas.** El agente no recibe los 43 recursos con sus 760
  columnas de golpe: primero el mapa (`guia_gestivo`), luego el recurso que
  necesita (`describir_recurso`) y por último los datos.
- **Cada respuesta se explica sola.** Trae qué representa una fila, el
  significado, la unidad y los valores posibles de cada columna devuelta, los
  filtros aplicados de verdad, el total que cumple los filtros y los avisos.
- **Respuestas acotadas.** Sin columnas pedidas se devuelven las 5-12 útiles del
  recurso; textos y JSON largos se recortan; la respuesta tiene un tope de tamaño.
- **Filtros por defecto explícitos.** Registros eliminados o anulados se excluyen
  y la respuesta lo dice, con el motivo.
- **Totales en la base.** `agregar_datos` calcula sobre todas las filas, para que
  el agente no sume páginas; agrupa por mes en hora de Colombia y avisa cuando
  una columna no se debe sumar.
- **Errores que enseñan.** Un nombre mal escrito responde con sugerencias ("¿quiso
  decir cierres_diarios?") y la lista de columnas válidas.
- **Trampas documentadas.** Por ejemplo, `ausentismo` (certificados de
  incapacidad) frente a `ausentismo_registros` (ausencias del día), los
  acumulados de `puntos_virtuales` frente a los incrementos de `pv_deltas`, o las
  horas de GEMA guardadas como UTC.

## Seguridad

- Solo lectura. La frontera es la lista blanca `src/lib/external/resources.ts`,
  y cada columna, filtro y orden se valida contra el esquema vivo (no se
  aceptan relaciones embebidas ni SQL).
- Columnas sensibles (teléfonos, diagnósticos, puntajes de riesgo…) nunca salen
  por defecto: hay que pedirlas por nombre, y la respuesta lo advierte.
- OAuth 2.1 con PKCE S256 obligatorio, registro dinámico de clientes, tokens de
  acceso de 1 hora y de refresco de 30 días con rotación y detección de reuso.
  Códigos, tokens y secretos se guardan como SHA-256.
- Solo un administrador autoriza, y la condición se vuelve a verificar en cada uso.
- Cada llamada queda en `api_request_logs` (método `MCP`, ruta
  `/api/mcp/<herramienta>`, argumentos), visible en Configuración → API.

## Mantenimiento

Para exponer un recurso nuevo:

1. Agregarlo a `EXTERNAL_RESOURCES` en `src/lib/external/resources.ts`.
2. Documentarlo en el archivo de su dominio en `src/lib/mcp/catalogo/`
   (granularidad, columnas, columnas por defecto sin datos sensibles, trampas).
3. Correr `npm run mcp:verificar-catalogo`, que falla si falta documentación o
   si una columna por defecto es sensible.
4. Si la tabla es nueva, incluir su `GRANT … TO service_role` en la migración.

Prueba de humo contra un despliegue:

```bash
GESTIVO_MCP_URL=https://saas-six-vert.vercel.app/api/mcp GESTIVO_API_KEY=sk_live_… npm run mcp:probar
```
