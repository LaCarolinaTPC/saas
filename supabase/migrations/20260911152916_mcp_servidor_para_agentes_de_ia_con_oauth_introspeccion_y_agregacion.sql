-- mcp servidor para agentes de ia con oauth, introspeccion y agregacion
--
-- Contexto: Gestivo expone sus datos a agentes de IA (Claude, ChatGPT, Codex,
-- Hermes…) mediante un servidor MCP en /api/mcp. Para que el agente no se
-- confunda, cada respuesta lleva el tipo real de cada columna, así que hace
-- falta leer el esquema vivo (la vista puede diferir de las migraciones). Las
-- preguntas del tipo "cuántos por mes" deben resolverse en la base y no
-- volcando filas, y la agregación anterior (external_aggregate) no admite
-- varias métricas, conteos distintos, agrupación por mes ni filtros de nulos.
-- Por último, claude.ai y ChatGPT solo se conectan con OAuth 2.1, así que
-- Gestivo actúa como servidor de autorización para sus administradores.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

-- =============================================================================
-- 1. Introspección de columnas
-- =============================================================================
-- SECURITY INVOKER: pg_catalog es legible por cualquier rol, y así no se amplía
-- el privilegio de nadie. La lista blanca de relaciones vive en el código
-- (src/lib/external/resources.ts); la función solo mira el esquema public.

CREATE OR REPLACE FUNCTION mcp_columnas(p_relaciones text[])
RETURNS TABLE (
  relacion        text,
  columna         text,
  tipo            text,
  nulable         boolean,
  posicion        int,
  valores_enum    text[],
  filas_estimadas bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT
    c.relname::text,
    a.attname::text,
    format_type(a.atttypid, a.atttypmod),
    NOT a.attnotnull,
    a.attnum::int,
    (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder)
       FROM pg_enum e
      WHERE e.enumtypid = a.atttypid),
    CASE WHEN c.relkind IN ('r', 'p', 'm') AND c.reltuples >= 0
         THEN c.reltuples::bigint END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  WHERE c.relname = ANY (p_relaciones)
    AND c.relkind IN ('r', 'v', 'm', 'p')
  ORDER BY c.relname, a.attnum;
$$;

REVOKE ALL ON FUNCTION mcp_columnas(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mcp_columnas(text[]) TO service_role;

-- =============================================================================
-- 2. Agregación del lado del servidor
-- =============================================================================
-- Todo identificador se valida contra pg_attribute de la relación y se cita con
-- %I; todo valor va con %L. SECURITY INVOKER: se aplican los GRANT de
-- service_role, igual que en las lecturas normales de la API.
--
-- p_agrupar  : [{"columna":"fecha","truncar":"mes","zona":"America/Bogota"}, {"columna":"ruta"}]
--              truncar ∈ hora, dia, semana, mes, trimestre, anio (solo columnas de fecha)
--              zona ∈ America/Bogota (defecto), UTC (solo aplica a timestamptz)
-- p_metricas : [{"funcion":"count"}, {"funcion":"sum","columna":"valor"}]
--              funcion ∈ count, count_distinct, sum, avg, min, max
-- p_filtros  : [{"columna":"estado","operador":"eq","valor":"ACTIVO"}]
--              operador ∈ eq, neq, gt, gte, lt, lte, like, ilike, in, is_null, not_null
-- p_orden    : metrica_desc (defecto) | metrica_asc | grupo_asc
-- Devuelve   : {"filas":[...], "total_grupos": n}

CREATE OR REPLACE FUNCTION mcp_agregar(
  p_relacion text,
  p_agrupar  jsonb DEFAULT '[]'::jsonb,
  p_metricas jsonb DEFAULT '[{"funcion":"count"}]'::jsonb,
  p_filtros  jsonb DEFAULT '[]'::jsonb,
  p_orden    text  DEFAULT 'metrica_desc',
  p_limite   int   DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_oid      oid;
  v_item     jsonb;
  v_col      text;
  v_tipo     text;
  v_trunc    text;
  v_zona     text;
  v_expr     text;
  v_alias    text;
  v_fn       text;
  v_op       text;
  v_val      jsonb;
  v_lista    text;
  v_select   text[] := '{}';
  v_group    text[] := '{}';
  v_where    text[] := '{}';
  v_n_grupos int;
  v_orden    text;
  v_sql      text;
  v_filas    jsonb;
  v_total    bigint;
BEGIN
  SELECT c.oid INTO v_oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
   WHERE c.relname = p_relacion AND c.relkind IN ('r', 'v', 'm', 'p');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Relación inexistente: %', p_relacion;
  END IF;

  -- Agrupación ---------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_agrupar, '[]'::jsonb)) LOOP
    v_col := v_item->>'columna';
    SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo
      FROM pg_attribute a
     WHERE a.attrelid = v_oid AND a.attname = v_col AND a.attnum > 0 AND NOT a.attisdropped;
    IF v_tipo IS NULL THEN
      RAISE EXCEPTION 'Columna de agrupación inexistente en %: %', p_relacion, v_col;
    END IF;

    v_trunc := v_item->>'truncar';
    IF v_trunc IS NULL THEN
      v_expr  := quote_ident(v_col);
      v_alias := v_col;
    ELSE
      IF v_trunc NOT IN ('hora', 'dia', 'semana', 'mes', 'trimestre', 'anio') THEN
        RAISE EXCEPTION 'truncar no permitido: % (use hora, dia, semana, mes, trimestre o anio)', v_trunc;
      END IF;
      IF v_tipo NOT IN ('date', 'timestamp with time zone', 'timestamp without time zone') THEN
        RAISE EXCEPTION 'Solo se puede truncar una columna de fecha; % es %', v_col, v_tipo;
      END IF;
      v_zona := COALESCE(v_item->>'zona', 'America/Bogota');
      IF v_zona NOT IN ('America/Bogota', 'UTC') THEN
        RAISE EXCEPTION 'zona no permitida: % (use America/Bogota o UTC)', v_zona;
      END IF;

      v_expr := CASE v_tipo
        WHEN 'timestamp with time zone' THEN format('(%I AT TIME ZONE %L)', v_col, v_zona)
        WHEN 'date' THEN format('(%I)::timestamp', v_col)
        ELSE quote_ident(v_col)
      END;
      v_expr := format('date_trunc(%L, %s)',
        CASE v_trunc
          WHEN 'hora' THEN 'hour' WHEN 'dia' THEN 'day' WHEN 'semana' THEN 'week'
          WHEN 'mes' THEN 'month' WHEN 'trimestre' THEN 'quarter' ELSE 'year'
        END,
        v_expr);
      IF v_trunc <> 'hora' THEN
        v_expr := v_expr || '::date';
      END IF;
      v_alias := v_col || '_' || v_trunc;
    END IF;

    v_select := v_select || format('%s AS %I', v_expr, v_alias);
    v_group  := v_group || v_expr;
  END LOOP;
  v_n_grupos := COALESCE(array_length(v_group, 1), 0);

  -- Métricas -----------------------------------------------------------------
  IF p_metricas IS NULL OR jsonb_typeof(p_metricas) <> 'array' OR jsonb_array_length(p_metricas) = 0 THEN
    p_metricas := '[{"funcion":"count"}]'::jsonb;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_metricas) LOOP
    v_fn  := COALESCE(v_item->>'funcion', 'count');
    v_col := v_item->>'columna';

    IF v_fn NOT IN ('count', 'count_distinct', 'sum', 'avg', 'min', 'max') THEN
      RAISE EXCEPTION 'funcion no permitida: % (use count, count_distinct, sum, avg, min o max)', v_fn;
    END IF;

    IF v_fn = 'count' AND v_col IS NULL THEN
      v_expr  := 'count(*)';
      v_alias := 'conteo';
    ELSE
      IF v_col IS NULL THEN
        RAISE EXCEPTION 'La métrica % requiere columna', v_fn;
      END IF;
      SELECT format_type(a.atttypid, a.atttypmod) INTO v_tipo
        FROM pg_attribute a
       WHERE a.attrelid = v_oid AND a.attname = v_col AND a.attnum > 0 AND NOT a.attisdropped;
      IF v_tipo IS NULL THEN
        RAISE EXCEPTION 'Columna de métrica inexistente en %: %', p_relacion, v_col;
      END IF;
      v_expr := CASE v_fn
        WHEN 'count_distinct' THEN format('count(DISTINCT %I)', v_col)
        WHEN 'avg' THEN format('round(avg(%I)::numeric, 4)', v_col)
        ELSE format('%s(%I)', v_fn, v_col)
      END;
      v_alias := v_fn || '_' || v_col;
    END IF;

    v_select := v_select || format('%s AS %I', v_expr, v_alias);
  END LOOP;

  -- Filtros ------------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_filtros, '[]'::jsonb)) LOOP
    v_col := v_item->>'columna';
    v_op  := v_item->>'operador';
    v_val := v_item->'valor';

    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = v_oid AND a.attname = v_col AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN
      RAISE EXCEPTION 'Columna de filtro inexistente en %: %', p_relacion, v_col;
    END IF;

    IF v_op IN ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike') THEN
      IF v_val IS NULL OR jsonb_typeof(v_val) IN ('null', 'array', 'object') THEN
        RAISE EXCEPTION 'El operador % requiere un valor simple en %', v_op, v_col;
      END IF;
      v_where := v_where || format('%I %s %L', v_col,
        CASE v_op
          WHEN 'eq' THEN '=' WHEN 'neq' THEN '<>' WHEN 'gt' THEN '>' WHEN 'gte' THEN '>='
          WHEN 'lt' THEN '<' WHEN 'lte' THEN '<=' WHEN 'like' THEN 'LIKE' ELSE 'ILIKE'
        END,
        v_val #>> '{}');
    ELSIF v_op = 'in' THEN
      IF v_val IS NULL OR jsonb_typeof(v_val) <> 'array' OR jsonb_array_length(v_val) = 0 THEN
        RAISE EXCEPTION 'El operador in requiere una lista no vacía en %', v_col;
      END IF;
      SELECT string_agg(quote_literal(x), ', ') INTO v_lista FROM jsonb_array_elements_text(v_val) x;
      v_where := v_where || format('%I IN (%s)', v_col, v_lista);
    ELSIF v_op = 'is_null' THEN
      v_where := v_where || format('%I IS NULL', v_col);
    ELSIF v_op = 'not_null' THEN
      v_where := v_where || format('%I IS NOT NULL', v_col);
    ELSE
      RAISE EXCEPTION 'operador no permitido: %', v_op;
    END IF;
  END LOOP;

  -- Orden por posición: evita ambigüedades entre alias y columnas reales.
  v_orden := CASE
    WHEN p_orden = 'grupo_asc' AND v_n_grupos > 0 THEN
      (SELECT string_agg(i::text, ', ') FROM generate_series(1, v_n_grupos) i)
    WHEN p_orden = 'metrica_asc' THEN (v_n_grupos + 1)::text || ' ASC NULLS LAST'
    ELSE (v_n_grupos + 1)::text || ' DESC NULLS LAST'
  END;

  v_sql := format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t) - ''__total_grupos''), ''[]''::jsonb), COALESCE(max(t.__total_grupos), 0) '
    || 'FROM (SELECT %s, count(*) OVER () AS __total_grupos FROM %I%s%s ORDER BY %s LIMIT %s) t',
    array_to_string(v_select, ', '),
    p_relacion,
    CASE WHEN array_length(v_where, 1) > 0 THEN ' WHERE ' || array_to_string(v_where, ' AND ') ELSE '' END,
    CASE WHEN v_n_grupos > 0 THEN ' GROUP BY ' || array_to_string(v_group, ', ') ELSE '' END,
    v_orden,
    greatest(1, least(COALESCE(p_limite, 100), 5000))
  );

  EXECUTE v_sql INTO v_filas, v_total;
  RETURN jsonb_build_object('filas', v_filas, 'total_grupos', v_total);
END;
$$;

REVOKE ALL ON FUNCTION mcp_agregar(text, jsonb, jsonb, jsonb, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mcp_agregar(text, jsonb, jsonb, jsonb, text, int) TO service_role;

-- =============================================================================
-- 3. OAuth 2.1 (Gestivo como servidor de autorización del MCP)
-- =============================================================================
-- Ningún secreto se guarda en claro: códigos, tokens y secretos de cliente se
-- persisten como SHA-256. RLS sin políticas: solo service_role accede.

-- Clientes registrados dinámicamente (RFC 7591): claude.ai, ChatGPT, Cursor…
CREATE TABLE IF NOT EXISTS oauth_clientes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            text NOT NULL UNIQUE,
  nombre               text NOT NULL,
  redirect_uris        text[] NOT NULL,
  uri_cliente          text,
  metodo_autenticacion text NOT NULL DEFAULT 'none'
    CHECK (metodo_autenticacion IN ('none', 'client_secret_post', 'client_secret_basic')),
  secreto_hash         text,
  software_id          text,
  software_version     text,
  creado_at            timestamptz NOT NULL DEFAULT now()
);

-- Una concesión = un administrador autorizó a un cliente. Agrupa la familia de
-- tokens: revocarla corta el acceso de ese agente de inmediato.
CREATE TABLE IF NOT EXISTS oauth_concesiones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES oauth_clientes(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alcance       text NOT NULL,
  recurso       text,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_at timestamptz,
  revocado_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_oauth_concesiones_activas
  ON oauth_concesiones (creado_at DESC) WHERE revocado_at IS NULL;

-- Códigos de autorización: un solo uso, 10 minutos, con reto PKCE (S256).
CREATE TABLE IF NOT EXISTS oauth_codigos (
  codigo_hash    text PRIMARY KEY,
  cliente_id     uuid NOT NULL REFERENCES oauth_clientes(id) ON DELETE CASCADE,
  usuario_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  alcance        text NOT NULL,
  recurso        text,
  expira_at      timestamptz NOT NULL,
  usado_at       timestamptz,
  creado_at      timestamptz NOT NULL DEFAULT now()
);

-- Tokens de acceso (1 hora) y de refresco (30 días, rotan en cada uso).
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token_hash   text PRIMARY KEY,
  concesion_id uuid NOT NULL REFERENCES oauth_concesiones(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('acceso', 'refresco')),
  expira_at    timestamptz NOT NULL,
  usado_at     timestamptz,
  revocado_at  timestamptz,
  creado_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_concesion ON oauth_tokens (concesion_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expira ON oauth_tokens (expira_at);

ALTER TABLE oauth_clientes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_concesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_codigos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens      ENABLE ROW LEVEL SECURITY;

GRANT ALL ON oauth_clientes, oauth_concesiones, oauth_codigos, oauth_tokens TO service_role;

-- =============================================================================
-- 4. Registro de uso
-- =============================================================================
-- Las llamadas del MCP quedan en la misma bitácora que la Data API. Las que
-- llegan por OAuth no tienen api_key_id: se asocian a su concesión.

ALTER TABLE api_request_logs
  ADD COLUMN IF NOT EXISTS oauth_concesion_id uuid REFERENCES oauth_concesiones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_api_request_logs_concesion_fecha
  ON api_request_logs (oauth_concesion_id, created_at DESC)
  WHERE oauth_concesion_id IS NOT NULL;

GRANT ALL ON api_request_logs TO service_role;
