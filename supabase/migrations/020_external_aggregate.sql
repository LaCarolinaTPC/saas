-- Data API externa — Agregación del lado del servidor
-- =============================================================================
-- Función segura para responder preguntas tipo "quién tiene MÁS / cuántos hay"
-- sobre TODAS las filas (sin volcar registros). Hace GROUP BY + count/sum/avg/
-- min/max con identificadores validados y recursos en whitelist.
--
-- La consume /api/external/v1/aggregate vía supabase.rpc('external_aggregate', ...).

CREATE OR REPLACE FUNCTION external_aggregate(
  p_resource  text,
  p_group_by  text[],
  p_agg       text DEFAULT 'count',
  p_metric    text DEFAULT NULL,
  p_filters   jsonb DEFAULT '[]'::jsonb,
  p_limit     int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_resources text[] := ARRAY[
    'conductores_con_grupo','cierres_diarios','viajes_perdidos','ausentismo',
    'accidentes','accidente_evaluaciones','accidente_eventos','accidente_vehiculos',
    'candidates','vacancies','candidate_vacancy','stage_history','employees','documents',
    'familia','incentivos','meta_campaigns','meta_spend_daily','departments'
  ];
  allowed_aggs text[] := ARRAY['count','sum','avg','min','max'];
  ident_rx text := '^[a-z_][a-z0-9_]*$';

  v_group_cols text;
  v_agg_expr   text;
  v_where      text := '';
  v_filter     jsonb;
  v_col        text;
  v_op         text;
  v_op_sql     text;
  v_sql        text;
  v_result     jsonb;
BEGIN
  -- Recurso en whitelist
  IF NOT (p_resource = ANY(allowed_resources)) THEN
    RAISE EXCEPTION 'Recurso no permitido: %', p_resource;
  END IF;

  -- Agregación permitida
  IF NOT (p_agg = ANY(allowed_aggs)) THEN
    RAISE EXCEPTION 'Agregación no permitida: %', p_agg;
  END IF;

  -- group_by: requerido y con identificadores válidos
  IF p_group_by IS NULL OR array_length(p_group_by, 1) IS NULL THEN
    RAISE EXCEPTION 'group_by es requerido';
  END IF;
  FOREACH v_col IN ARRAY p_group_by LOOP
    IF v_col !~ ident_rx THEN
      RAISE EXCEPTION 'Columna de agrupación inválida: %', v_col;
    END IF;
  END LOOP;
  v_group_cols := (SELECT string_agg(quote_ident(c), ', ') FROM unnest(p_group_by) c);

  -- Expresión de agregación
  IF p_agg = 'count' THEN
    v_agg_expr := 'count(*)';
  ELSE
    IF p_metric IS NULL OR p_metric !~ ident_rx THEN
      RAISE EXCEPTION 'metric inválido o ausente para %', p_agg;
    END IF;
    v_agg_expr := p_agg || '(' || quote_ident(p_metric) || ')';
  END IF;

  -- Filtros opcionales
  FOR v_filter IN SELECT * FROM jsonb_array_elements(p_filters) LOOP
    v_col := v_filter->>'column';
    v_op  := COALESCE(v_filter->>'op', 'eq');
    IF v_col !~ ident_rx THEN
      RAISE EXCEPTION 'Columna de filtro inválida: %', v_col;
    END IF;
    v_op_sql := CASE v_op
      WHEN 'eq'    THEN '='   WHEN 'neq'  THEN '<>'
      WHEN 'gt'    THEN '>'   WHEN 'gte'  THEN '>='
      WHEN 'lt'    THEN '<'   WHEN 'lte'  THEN '<='
      WHEN 'like'  THEN 'like' WHEN 'ilike' THEN 'ilike'
      ELSE NULL END;
    IF v_op_sql IS NULL THEN
      RAISE EXCEPTION 'Operador de filtro no permitido: %', v_op;
    END IF;
    v_where := v_where
      || CASE WHEN v_where = '' THEN ' WHERE ' ELSE ' AND ' END
      || quote_ident(v_col) || ' ' || v_op_sql || ' '
      || quote_literal(v_filter->>'value');
  END LOOP;

  v_sql := format(
    'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM ('
    || 'SELECT %s, %s AS value FROM %I %s GROUP BY %s ORDER BY value DESC NULLS LAST LIMIT %s) t',
    v_group_cols, v_agg_expr, p_resource, v_where, v_group_cols,
    greatest(1, least(p_limit, 5000))
  );

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;

-- Solo el backend (service_role) ejecuta esta función; el endpoint la protege con API key.
REVOKE ALL ON FUNCTION external_aggregate(text, text[], text, text, jsonb, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION external_aggregate(text, text[], text, text, jsonb, int) TO service_role;
