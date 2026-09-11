-- modulo de recuperacion de incapacidades: expediente, corte y etapa 1
--
-- Contexto: la matriz EPS (`ausentismo`) ya captura la incapacidad, pero nada
-- de lo que viene después: cuánto se reclama a la EPS o a la ARL, si se radicó,
-- qué giró la entidad y cuánto falta. Hoy eso vive en un libro de Excel
-- (`Incapacidades 2024_V1.xlsm`) que mezcla cálculo, cobro y pago en la misma
-- fila, sin rastro de quién cambió qué. Esta migración crea el expediente de
-- recuperación, uno por incapacidad, encima de la matriz y sin tocarla.
--
-- Fase 2 del plan `docs/Plan_desarrollo_incapacidades_GESTIVO.md`. Decisiones
-- de la Fase 0 (2026-09-11) que este script fija:
--   * La gestión arranca con las incapacidades que INICIAN el 2026-09-01 o
--     después (parámetro `fecha_corte_gestion`). El corte es por fecha_inicio,
--     no por fecha de registro: las 626 históricas se cargaron el 2026-09-02 y
--     por created_at parecerían de septiembre. Hoy entran exactamente 23.
--   * El expediente nace solo por un trigger sobre la matriz: la información
--     que RRHH diligencia allí es el insumo de esta segunda parte y no se
--     vuelve a capturar.
--   * No se crean tipos de usuario: el módulo se despliega desde RRHH.
--   * El umbral de días cobrables es un parámetro por entidad (dias_min_cobro).
--   * La ARL responde por todos los días (regla operativa gestivo-cobro-dias).
--   * El salario y otros datos de la liquidación son ajustables, con motivo y
--     con la liquidación anterior conservada.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- ── 1. Parámetros del módulo ─────────────────────────────────────────────────
-- Clave/valor en JSONB. Hoy solo el corte; moverlo hacia atrás NO crea
-- expedientes retroactivos (el trigger corre por fila nueva): incorporar un
-- rango anterior exige la alta manual, con motivo y rastro.

CREATE TABLE IF NOT EXISTS incapacidad_parametros (
  clave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  descripcion TEXT,
  actualizado_por_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO incapacidad_parametros (clave, valor, descripcion) VALUES
  ('fecha_corte_gestion', '"2026-09-01"'::jsonb,
   'Entran en gestión las incapacidades vigentes de la matriz con fecha_inicio igual o posterior a esta fecha. Las anteriores solo por alta manual.')
ON CONFLICT (clave) DO NOTHING;

CREATE OR REPLACE FUNCTION incapacidad_corte()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (valor #>> '{}')::date FROM incapacidad_parametros WHERE clave = 'fecha_corte_gestion';
$$;

-- ── 2. Reglas versionadas del motor ──────────────────────────────────────────
-- Misma forma que `REGLAS[...].parametros` en src/lib/incapacidades/motor.ts.
-- Inmutables una vez usadas por una liquidación; solo una puede ser operativa.

CREATE TABLE IF NOT EXISTS incapacidad_reglas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  parametros JSONB NOT NULL,
  -- La regla con la que liquida GESTIVO. Las demás son de compatibilidad.
  operativa BOOLEAN NOT NULL DEFAULT false,
  vigente_desde DATE,
  vigente_hasta DATE,
  aprobado_por_email TEXT,
  aprobado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_incapacidad_reglas_operativa
  ON incapacidad_reglas (operativa) WHERE operativa;

INSERT INTO incapacidad_reglas (codigo, descripcion, parametros, operativa, vigente_desde, aprobado_por_email, aprobado_at) VALUES
  ('excel-2024-v1',
   'Fórmulas literales del libro Incapacidades 2024_V1.xlsm (79 filas completas). Solo compatibilidad y pruebas.',
   '{"divisorSalario":30,"factorPorTipo":{"AT":1,"EG":1},"factorPorDefecto":0.67,"diasEmpleador":{"porEntidad":{"ARL SURA":1},"porClaseArl":null,"porDefecto":2},"redondeoValorEntidad":null}'::jsonb,
   false, NULL, NULL, NULL),
  ('excel-2024-v1-round0',
   'Variante observada en Q70: el valor entidad redondeado a cero decimales.',
   '{"divisorSalario":30,"factorPorTipo":{"AT":1,"EG":1},"factorPorDefecto":0.67,"diasEmpleador":{"porEntidad":{"ARL SURA":1},"porClaseArl":null,"porDefecto":2},"redondeoValorEntidad":0}'::jsonb,
   false, NULL, NULL, NULL),
  ('gestivo-cobro-dias',
   'Regla operativa de GESTIVO (decisión 12.2 del 2026-09-11): la ARL responde por todos los días; la EPS reconoce una inicial desde el día 3 y una prórroga completa.',
   '{"divisorSalario":30,"factorPorTipo":{"AT":1,"EG":1},"factorPorDefecto":0.67,"diasEmpleador":{"porEntidad":{},"porClaseArl":0,"porDefecto":2},"redondeoValorEntidad":null}'::jsonb,
   true, DATE '2026-09-01', 'administradordatos@lacarolina.com.co', TIMESTAMPTZ '2026-09-11 00:00:00-05')
ON CONFLICT (codigo) DO NOTHING;

-- ── 3. El catálogo de entidades aprende a radicar ────────────────────────────
-- `ausentismo_catalogos` ya valida EPS y ARL por nombre. Para reclamar hace
-- falta la clase, el NIT, la vigencia y el umbral de días cobrables, que es
-- POR ENTIDAD (decisión 12.17). Semilla: 4 para las EPS (el valor de
-- COBRO_EPS_DIAS_MIN que aplica el informe de cobro), 1 para las ARL. RRHH y
-- Administración los completan desde Parámetros; nada más cambia en la matriz.

ALTER TABLE ausentismo_catalogos
  ADD COLUMN IF NOT EXISTS clase TEXT CHECK (clase IN ('EPS', 'ARL', 'OTRA')),
  ADD COLUMN IF NOT EXISTS nit TEXT,
  ADD COLUMN IF NOT EXISTS vigente_desde DATE,
  ADD COLUMN IF NOT EXISTS vigente_hasta DATE,
  ADD COLUMN IF NOT EXISTS dias_min_cobro INTEGER CHECK (dias_min_cobro >= 0);

UPDATE ausentismo_catalogos SET clase = 'EPS' WHERE tipo = 'EPS' AND clase IS NULL;
UPDATE ausentismo_catalogos SET clase = 'ARL' WHERE tipo = 'ARL' AND clase IS NULL;
UPDATE ausentismo_catalogos SET dias_min_cobro = 4 WHERE tipo = 'EPS' AND dias_min_cobro IS NULL;
UPDATE ausentismo_catalogos SET dias_min_cobro = 1 WHERE tipo = 'ARL' AND dias_min_cobro IS NULL;

-- ── 4. El expediente: uno por incapacidad ────────────────────────────────────
-- `ausentismo` sigue siendo la incapacidad y no cambia. Todo lo nuevo
-- referencia ausentismo.id. En la etapa 1 el expediente solo trae lo que la
-- matriz aporta: ningún campo de gestión es obligatorio y nada se inventa.

CREATE TABLE IF NOT EXISTS incapacidad_expedientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ausentismo_id UUID NOT NULL UNIQUE REFERENCES ausentismo (id) ON DELETE RESTRICT,

  -- Etapa 1: recepción.
  recibido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recibido_desde TEXT NOT NULL CHECK (recibido_desde IN ('matriz_formulario', 'matriz_excel', 'alta_manual')),
  -- Copia de la fila de la matriz al momento de recibirla. Auditable, no editable.
  recibido_json JSONB NOT NULL,
  matriz_updated_at TIMESTAMPTZ,
  -- La matriz cambió después de recibir el expediente; RRHH decide qué hacer.
  matriz_cambio_pendiente BOOLEAN NOT NULL DEFAULT false,

  -- Persona homologada contra los maestros (la cédula sola no basta: hay
  -- comodines y fichas sin código en el maestro de conductores).
  persona_fuente TEXT CHECK (persona_fuente IN ('conductores', 'employees', 'sin_resolver')),
  persona_ref TEXT,

  -- Salario: lo diligencia el funcionario en la etapa 2 (decisión 12.4).
  -- Nunca se toma solo el actual de employees.
  salario_base NUMERIC(14,2) CHECK (salario_base > 0),
  salario_moneda TEXT NOT NULL DEFAULT 'COP',
  salario_vigencia_desde DATE,
  salario_fuente TEXT CHECK (salario_fuente IN ('manual', 'employees')),
  salario_resuelto_por_email TEXT,
  salario_resuelto_at TIMESTAMPTZ,

  -- Homologaciones: automáticas solo cuando son inequívocas.
  tipo_homologado TEXT,
  entidad_catalogo_id UUID REFERENCES ausentismo_catalogos (id),
  entidad_nombre_recibido TEXT,
  pendiente_homologacion BOOLEAN NOT NULL DEFAULT false,

  -- Ajustes de liquidación (decisión 12.18). Nivel 1 cambia entradas (arriba y
  -- modalidad); nivel 2 sobrescribe el resultado. Todos con motivo, en
  -- incapacidad_ajustes_liquidacion.
  modalidad_ajustada TEXT CHECK (modalidad_ajustada IN ('INICIAL', 'PRORROGA')),
  dias_entidad_ajustados INTEGER CHECK (dias_entidad_ajustados >= 0),
  valor_reclamado_ajustado NUMERIC(14,2) CHECK (valor_reclamado_ajustado >= 0),

  -- Gestión (etapa 2). Borrador mínimo de estados mientras 12.13 siga abierta.
  responsable_email TEXT,
  estado TEXT NOT NULL DEFAULT 'recibido' CHECK (estado IN
    ('recibido', 'en_completar', 'liquidado', 'radicado', 'con_recaudo', 'conciliado', 'cerrado', 'excepcion')),
  motivo_excepcion TEXT,
  valor_reclamado NUMERIC(14,2) CHECK (valor_reclamado >= 0),
  proxima_accion TEXT,
  proxima_accion_fecha DATE,
  observaciones TEXT,

  -- Revisión de Control Interno (Z del libro). Vocabulario POR CONFIRMAR (12.8).
  revision_estado TEXT,
  revision_por_email TEXT,
  revision_at TIMESTAMPTZ,
  revision_comentario TEXT,

  -- Marca SMLV (E del libro): informativa, no interviene en ningún cálculo.
  marca_smlv BOOLEAN,

  -- Alta manual de una incapacidad anterior al corte (decisión 12.16).
  alta_manual_motivo TEXT,
  alta_manual_por_email TEXT,

  -- Concurrencia optimista y rastro.
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  eliminado_at TIMESTAMPTZ,
  eliminado_por_email TEXT,
  motivo_eliminacion TEXT
);

CREATE INDEX IF NOT EXISTS idx_incapacidad_expedientes_estado ON incapacidad_expedientes (estado, recibido_at DESC);
CREATE INDEX IF NOT EXISTS idx_incapacidad_expedientes_entidad ON incapacidad_expedientes (entidad_catalogo_id);
CREATE INDEX IF NOT EXISTS idx_incapacidad_expedientes_pendientes
  ON incapacidad_expedientes (pendiente_homologacion) WHERE pendiente_homologacion;

-- updated_at y version avanzan solos en cada UPDATE; la aplicación escribe
-- `WHERE version = :leida` y detecta el conflicto cuando no afecta filas.
CREATE OR REPLACE FUNCTION incapacidad_expediente_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incapacidad_expediente_touch ON incapacidad_expedientes;
CREATE TRIGGER trg_incapacidad_expediente_touch
  BEFORE UPDATE ON incapacidad_expedientes
  FOR EACH ROW EXECUTE FUNCTION incapacidad_expediente_touch();

-- ── 5. Liquidaciones: el cálculo explicado, una fila por recálculo ───────────
-- Cambiar la regla o ajustar un dato nunca altera una liquidación anterior:
-- se inserta otra y la vieja deja de ser vigente. P y M son distribución
-- histórica, no un desembolso.

CREATE TABLE IF NOT EXISTS incapacidad_liquidaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE CASCADE,
  regla_id UUID REFERENCES incapacidad_reglas (id),
  regla_codigo TEXT NOT NULL,
  -- F, G, H, I, J, K, L tal como se usaron.
  entradas JSONB NOT NULL,
  -- Sobrescrituras de nivel 2 aplicadas en este cálculo ({} si ninguna).
  sobrescrituras JSONB NOT NULL DEFAULT '{}'::jsonb,
  dias_incapacidad INTEGER NOT NULL,
  dias_entidad INTEGER NOT NULL,
  dias_empresa INTEGER NOT NULL,
  factor NUMERIC(6,4) NOT NULL,
  valor_total NUMERIC(14,2) NOT NULL,
  valor_entidad NUMERIC(14,2) NOT NULL,
  valor_empresa NUMERIC(14,2) NOT NULL,
  redondeo INTEGER,
  calculado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculado_por_email TEXT,
  es_vigente BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_incapacidad_liquidaciones_vigente
  ON incapacidad_liquidaciones (expediente_id) WHERE es_vigente;
CREATE INDEX IF NOT EXISTS idx_incapacidad_liquidaciones_expediente
  ON incapacidad_liquidaciones (expediente_id, calculado_at DESC);

-- ── 6. Ajustes de liquidación: campo, antes, después y motivo ─────────────────
-- Es lo que permitirá, al cierre del piloto, contar por campo y por entidad
-- cuántas veces hubo que ajustar a mano: si una sobrescritura se repite para
-- una misma EPS o tipo, hay que corregir el parámetro, no seguir ajustando.

CREATE TABLE IF NOT EXISTS incapacidad_ajustes_liquidacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE CASCADE,
  campo TEXT NOT NULL CHECK (campo IN
    ('salario_base', 'salario_vigencia_desde', 'entidad_catalogo_id', 'tipo_homologado',
     'modalidad_ajustada', 'dias_entidad_ajustados', 'valor_reclamado_ajustado')),
  nivel TEXT NOT NULL CHECK (nivel IN ('entrada', 'sobrescritura')),
  valor_anterior JSONB,
  valor_nuevo JSONB,
  motivo TEXT NOT NULL CHECK (length(btrim(motivo)) >= 5),
  ajustado_por_email TEXT NOT NULL,
  -- La liquidación que produjo este ajuste, cuando recalculó.
  liquidacion_id UUID REFERENCES incapacidad_liquidaciones (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incapacidad_ajustes_expediente
  ON incapacidad_ajustes_liquidacion (expediente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incapacidad_ajustes_campo
  ON incapacidad_ajustes_liquidacion (campo);

-- ── 7. Soportes del expediente ───────────────────────────────────────────────
-- Bucket privado `incapacidades`; los archivos se sirven con URL firmada desde
-- el servidor. No se borran: se anulan con motivo.

CREATE TABLE IF NOT EXISTS incapacidad_adjuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id UUID NOT NULL REFERENCES incapacidad_expedientes (id) ON DELETE CASCADE,
  relacionado_tipo TEXT NOT NULL DEFAULT 'expediente'
    CHECK (relacionado_tipo IN ('expediente', 'liquidacion', 'radicacion', 'recaudo', 'ajuste')),
  relacionado_id UUID,
  archivo_ruta TEXT NOT NULL,
  archivo_nombre TEXT NOT NULL,
  archivo_mime TEXT,
  archivo_tamano INTEGER,
  subido_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulado_at TIMESTAMPTZ,
  anulado_por_email TEXT,
  motivo_anulacion TEXT
);

CREATE INDEX IF NOT EXISTS idx_incapacidad_adjuntos_expediente
  ON incapacidad_adjuntos (expediente_id) WHERE anulado_at IS NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('incapacidades', 'incapacidades', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "service_role lee incapacidades" ON storage.objects;
CREATE POLICY "service_role lee incapacidades" ON storage.objects
  FOR SELECT TO service_role USING (bucket_id = 'incapacidades');

DROP POLICY IF EXISTS "service_role sube incapacidades" ON storage.objects;
CREATE POLICY "service_role sube incapacidades" ON storage.objects
  FOR INSERT TO service_role WITH CHECK (bucket_id = 'incapacidades');

DROP POLICY IF EXISTS "service_role borra incapacidades" ON storage.objects;
CREATE POLICY "service_role borra incapacidades" ON storage.objects
  FOR DELETE TO service_role USING (bucket_id = 'incapacidades');

-- ── 8. Etapa 1: el expediente nace de la matriz ──────────────────────────────

-- Quién paga la incapacidad según la matriz: la ARL cuando el origen es AT o
-- EL (misma regla que ORIGENES_ARL en matriz-reglas.ts), la EPS en el resto.
CREATE OR REPLACE FUNCTION incapacidad_pagador(a ausentismo)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN upper(a.origen) IN ('AT', 'EL') THEN COALESCE(a.arl, a.eps) ELSE a.eps END;
$$;

-- Crea el expediente de una fila de la matriz si no existe. Devuelve el id
-- (nuevo o existente). Solo guarda lo que la matriz tiene; homologa entidad y
-- tipo únicamente cuando el nombre o el código coinciden con el catálogo
-- activo; si no, deja `pendiente_homologacion`. Ningún cero, ningún "NO",
-- ninguna fecha por defecto.
CREATE OR REPLACE FUNCTION incapacidad_expediente_desde_matriz(
  a ausentismo,
  p_desde TEXT,
  p_motivo TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_pagador TEXT;
  v_entidad UUID;
  v_tipo TEXT;
  v_persona_fuente TEXT;
  v_persona_ref TEXT;
BEGIN
  SELECT id INTO v_id FROM incapacidad_expedientes WHERE ausentismo_id = a.id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  v_pagador := ausentismo_limpio(incapacidad_pagador(a));

  -- Entidad: por nombre, contra el catálogo activo de EPS/ARL, prefiriendo el
  -- tipo que corresponde al origen.
  IF v_pagador IS NOT NULL THEN
    SELECT c.id INTO v_entidad
    FROM ausentismo_catalogos c
    WHERE c.tipo IN ('EPS', 'ARL') AND c.activo
      AND ausentismo_clave(c.nombre) = ausentismo_clave(v_pagador)
    ORDER BY (c.tipo = CASE WHEN upper(a.origen) IN ('AT', 'EL') THEN 'ARL' ELSE 'EPS' END) DESC
    LIMIT 1;
  END IF;

  -- Tipo: por código exacto del catálogo ORIGEN.
  SELECT upper(c.codigo) INTO v_tipo
  FROM ausentismo_catalogos c
  WHERE c.tipo = 'ORIGEN' AND c.activo AND upper(c.codigo) = upper(a.origen)
  LIMIT 1;

  -- Persona: el comodín de GEMA no es nadie; luego el maestro de conductores,
  -- luego empleados.
  IF a.cedula IS NULL OR a.cedula = '99999999' THEN
    v_persona_fuente := 'sin_resolver';
  ELSIF EXISTS (SELECT 1 FROM conductores k WHERE k.cedula = a.cedula) THEN
    v_persona_fuente := 'conductores';
    v_persona_ref := a.cedula;
  ELSIF EXISTS (SELECT 1 FROM employees e WHERE e.document_number = a.cedula) THEN
    v_persona_fuente := 'employees';
    v_persona_ref := a.cedula;
  ELSE
    v_persona_fuente := 'sin_resolver';
  END IF;

  INSERT INTO incapacidad_expedientes (
    ausentismo_id, recibido_desde, recibido_json, matriz_updated_at,
    persona_fuente, persona_ref,
    tipo_homologado, entidad_catalogo_id, entidad_nombre_recibido, pendiente_homologacion,
    alta_manual_motivo, alta_manual_por_email
  ) VALUES (
    a.id, p_desde, to_jsonb(a), a.updated_at,
    v_persona_fuente, v_persona_ref,
    v_tipo, v_entidad, v_pagador, (v_tipo IS NULL OR v_entidad IS NULL),
    CASE WHEN p_desde = 'alta_manual' THEN p_motivo END,
    CASE WHEN p_desde = 'alta_manual' THEN p_email END
  )
  ON CONFLICT (ausentismo_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM incapacidad_expedientes WHERE ausentismo_id = a.id;
  END IF;

  INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
  VALUES (
    v_id,
    CASE WHEN p_desde = 'alta_manual' THEN 'expediente_alta_manual' ELSE 'expediente_creado' END,
    NULL,
    jsonb_build_object(
      'ausentismo_id', a.id, 'recibido_desde', p_desde, 'motivo', p_motivo,
      'pendiente_homologacion', (v_tipo IS NULL OR v_entidad IS NULL),
      'persona_fuente', v_persona_fuente
    ),
    p_email
  );

  RETURN v_id;
END;
$$;

-- Alta manual (decisión 12.16): una incapacidad anterior al corte que RRHH
-- decide gestionar, con motivo obligatorio. Es lo que llama la aplicación por
-- RPC; la función de arriba recibe la fila completa y PostgREST no puede
-- pasarle un tipo compuesto.
CREATE OR REPLACE FUNCTION incapacidad_alta_manual(
  p_ausentismo_id UUID,
  p_motivo TEXT,
  p_email TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  a ausentismo%ROWTYPE;
BEGIN
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'El alta manual exige un motivo de al menos 10 caracteres.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO a FROM ausentismo WHERE id = p_ausentismo_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'La incapacidad % no existe en la matriz.', p_ausentismo_id USING ERRCODE = 'no_data_found';
  END IF;
  IF a.eliminado_at IS NOT NULL THEN
    RAISE EXCEPTION 'La incapacidad está eliminada en la matriz; restáurela antes de incorporarla.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM incapacidad_expedientes e WHERE e.ausentismo_id = a.id) THEN
    RAISE EXCEPTION 'La incapacidad ya tiene expediente.' USING ERRCODE = 'unique_violation';
  END IF;
  RETURN incapacidad_expediente_desde_matriz(a, 'alta_manual', btrim(p_motivo), p_email);
END;
$$;

-- ¿Esta fila de la matriz entra en gestión por regla? Vigente y con inicio
-- igual o posterior al corte. Nunca por created_at.
CREATE OR REPLACE FUNCTION incapacidad_entra_por_corte(a ausentismo)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT a.eliminado_at IS NULL
     AND a.fecha_inicio IS NOT NULL
     AND a.fecha_inicio >= incapacidad_corte();
$$;

-- AFTER INSERT: la etapa 1 nace aquí (decisión 12.11).
CREATE OR REPLACE FUNCTION incapacidad_matriz_insertada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF incapacidad_entra_por_corte(NEW) THEN
    PERFORM incapacidad_expediente_desde_matriz(
      NEW,
      CASE WHEN NEW.origen_registro = 'formulario' THEN 'matriz_formulario' ELSE 'matriz_excel' END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incapacidad_matriz_insertada ON ausentismo;
CREATE TRIGGER trg_incapacidad_matriz_insertada
  AFTER INSERT ON ausentismo
  FOR EACH ROW EXECUTE FUNCTION incapacidad_matriz_insertada();

-- AFTER UPDATE: la matriz cambió después de recibir el expediente. No se
-- recalcula ni se tocan radicaciones: se marca el cambio pendiente con el
-- detalle en la bitácora y RRHH decide (precedencia POR CONFIRMAR, 12.12). La
-- eliminación lógica deja el expediente en excepción; la restauración lo
-- devuelve a recibido. Una fila que pasa a cumplir el corte (fecha corregida o
-- restaurada) recibe su expediente como si fuera nueva.
CREATE OR REPLACE FUNCTION incapacidad_matriz_actualizada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_exp incapacidad_expedientes%ROWTYPE;
  v_cambios JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_exp FROM incapacidad_expedientes WHERE ausentismo_id = NEW.id;

  IF v_exp.id IS NULL THEN
    IF incapacidad_entra_por_corte(NEW) AND NOT incapacidad_entra_por_corte(OLD) THEN
      PERFORM incapacidad_expediente_desde_matriz(
        NEW,
        CASE WHEN NEW.origen_registro = 'formulario' THEN 'matriz_formulario' ELSE 'matriz_excel' END
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Eliminada en la matriz → excepción. Restaurada → vuelve a recibido.
  IF NEW.eliminado_at IS NOT NULL AND OLD.eliminado_at IS NULL THEN
    UPDATE incapacidad_expedientes
       SET estado = 'excepcion',
           motivo_excepcion = 'La incapacidad fue eliminada en la matriz EPS' ||
                              COALESCE(': ' || NEW.motivo_eliminacion, ''),
           matriz_updated_at = NEW.updated_at
     WHERE id = v_exp.id;
    INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
    VALUES (v_exp.id, 'expediente_excepcion',
            jsonb_build_object('estado', v_exp.estado),
            jsonb_build_object('estado', 'excepcion', 'motivo', NEW.motivo_eliminacion),
            NEW.eliminado_por_email);
    RETURN NEW;
  END IF;

  IF NEW.eliminado_at IS NULL AND OLD.eliminado_at IS NOT NULL THEN
    UPDATE incapacidad_expedientes
       SET estado = CASE WHEN estado = 'excepcion' THEN 'recibido' ELSE estado END,
           motivo_excepcion = NULL,
           matriz_cambio_pendiente = true,
           matriz_updated_at = NEW.updated_at
     WHERE id = v_exp.id;
    INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
    VALUES (v_exp.id, 'expediente_restaurado',
            jsonb_build_object('estado', v_exp.estado),
            jsonb_build_object('estado', 'recibido'),
            NEW.modificado_por_email);
    RETURN NEW;
  END IF;

  -- Campos que alimentan la liquidación o la identidad del expediente.
  IF NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio THEN v_cambios := v_cambios || jsonb_build_object('fecha_inicio', jsonb_build_array(OLD.fecha_inicio, NEW.fecha_inicio)); END IF;
  IF NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin THEN v_cambios := v_cambios || jsonb_build_object('fecha_fin', jsonb_build_array(OLD.fecha_fin, NEW.fecha_fin)); END IF;
  IF NEW.dias_it_pagados IS DISTINCT FROM OLD.dias_it_pagados THEN v_cambios := v_cambios || jsonb_build_object('dias_it_pagados', jsonb_build_array(OLD.dias_it_pagados, NEW.dias_it_pagados)); END IF;
  IF NEW.origen IS DISTINCT FROM OLD.origen THEN v_cambios := v_cambios || jsonb_build_object('origen', jsonb_build_array(OLD.origen, NEW.origen)); END IF;
  IF NEW.indicador_prorroga IS DISTINCT FROM OLD.indicador_prorroga THEN v_cambios := v_cambios || jsonb_build_object('indicador_prorroga', jsonb_build_array(OLD.indicador_prorroga, NEW.indicador_prorroga)); END IF;
  IF NEW.eps IS DISTINCT FROM OLD.eps THEN v_cambios := v_cambios || jsonb_build_object('eps', jsonb_build_array(OLD.eps, NEW.eps)); END IF;
  IF NEW.arl IS DISTINCT FROM OLD.arl THEN v_cambios := v_cambios || jsonb_build_object('arl', jsonb_build_array(OLD.arl, NEW.arl)); END IF;
  IF NEW.cedula IS DISTINCT FROM OLD.cedula THEN v_cambios := v_cambios || jsonb_build_object('cedula', jsonb_build_array(OLD.cedula, NEW.cedula)); END IF;
  IF NEW.nombre IS DISTINCT FROM OLD.nombre THEN v_cambios := v_cambios || jsonb_build_object('nombre', jsonb_build_array(OLD.nombre, NEW.nombre)); END IF;
  IF NEW.cargo IS DISTINCT FROM OLD.cargo THEN v_cambios := v_cambios || jsonb_build_object('cargo', jsonb_build_array(OLD.cargo, NEW.cargo)); END IF;
  IF NEW.tipo_conductor IS DISTINCT FROM OLD.tipo_conductor THEN v_cambios := v_cambios || jsonb_build_object('tipo_conductor', jsonb_build_array(OLD.tipo_conductor, NEW.tipo_conductor)); END IF;
  IF NEW.cie10 IS DISTINCT FROM OLD.cie10 THEN v_cambios := v_cambios || jsonb_build_object('cie10', jsonb_build_array(OLD.cie10, NEW.cie10)); END IF;
  IF NEW.diagnostico IS DISTINCT FROM OLD.diagnostico THEN v_cambios := v_cambios || jsonb_build_object('diagnostico', jsonb_build_array(OLD.diagnostico, NEW.diagnostico)); END IF;

  IF v_cambios <> '{}'::jsonb THEN
    UPDATE incapacidad_expedientes
       SET matriz_cambio_pendiente = true,
           matriz_updated_at = NEW.updated_at
     WHERE id = v_exp.id;
    INSERT INTO ausentismo_log (registro_id, accion, datos_anteriores, datos_nuevos, user_email)
    VALUES (v_exp.id, 'expediente_matriz_cambiada', NULL, v_cambios, NEW.modificado_por_email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incapacidad_matriz_actualizada ON ausentismo;
CREATE TRIGGER trg_incapacidad_matriz_actualizada
  AFTER UPDATE ON ausentismo
  FOR EACH ROW EXECUTE FUNCTION incapacidad_matriz_actualizada();

-- ── 9. Backfill único: las incapacidades que ya cumplen el corte ─────────────
-- Medido el 2026-09-10: 23. El corte es por fecha_inicio; las 626 históricas
-- cargadas el 2026-09-02 no entran.
DO $$
DECLARE
  a ausentismo%ROWTYPE;
  v_n INTEGER := 0;
BEGIN
  FOR a IN
    SELECT * FROM ausentismo x
    WHERE incapacidad_entra_por_corte(x)
      AND NOT EXISTS (SELECT 1 FROM incapacidad_expedientes e WHERE e.ausentismo_id = x.id)
    ORDER BY x.fecha_inicio, x.id
  LOOP
    PERFORM incapacidad_expediente_desde_matriz(
      a,
      CASE WHEN a.origen_registro = 'formulario' THEN 'matriz_formulario' ELSE 'matriz_excel' END
    );
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'Expedientes creados en el backfill: %', v_n;
END $$;

-- ── 10. Vista de lectura ─────────────────────────────────────────────────────
-- Expediente + lo que la matriz aporta + entidad del catálogo + liquidación
-- vigente + cobrable según el umbral de SU entidad. Solo service_role.
DROP VIEW IF EXISTS vw_incapacidad_expedientes;
CREATE VIEW vw_incapacidad_expedientes AS
SELECT
  e.id,
  e.ausentismo_id,
  e.recibido_at,
  e.recibido_desde,
  e.matriz_cambio_pendiente,
  e.persona_fuente,
  e.salario_base,
  e.salario_vigencia_desde,
  e.salario_fuente,
  e.tipo_homologado,
  e.entidad_catalogo_id,
  e.entidad_nombre_recibido,
  e.pendiente_homologacion,
  e.modalidad_ajustada,
  e.dias_entidad_ajustados,
  e.valor_reclamado_ajustado,
  e.responsable_email,
  e.estado,
  e.motivo_excepcion,
  e.valor_reclamado,
  e.proxima_accion,
  e.proxima_accion_fecha,
  e.alta_manual_motivo,
  e.version,
  e.updated_at,
  -- De la matriz (solo lectura).
  a.cedula,
  a.nombre,
  a.cargo,
  a.tipo_conductor,
  a.consecutivo_incapacidad,
  a.fecha_inicio,
  a.fecha_fin,
  a.dias_it_pagados            AS dias_incapacidad,
  a.origen,
  a.indicador_prorroga,
  incapacidad_pagador(a)       AS pagador_recibido,
  a.cie10,
  a.diagnostico,
  a.origen_registro,
  a.eliminado_at               AS matriz_eliminada_at,
  -- Entidad homologada.
  c.nombre                     AS entidad_nombre,
  c.clase                      AS entidad_clase,
  c.nit                        AS entidad_nit,
  c.dias_min_cobro             AS entidad_dias_min_cobro,
  -- Cobrable según el umbral de su entidad (o el de su clase si la entidad
  -- no está homologada: ARL desde 1 día, EPS desde 4).
  (a.dias_it_pagados IS NOT NULL AND a.dias_it_pagados >= COALESCE(
      c.dias_min_cobro,
      CASE WHEN upper(a.origen) IN ('AT', 'EL') THEN 1 ELSE 4 END)) AS cobrable,
  -- Liquidación vigente.
  l.id                         AS liquidacion_id,
  l.regla_codigo,
  l.dias_entidad,
  l.dias_empresa,
  l.valor_total,
  l.valor_entidad,
  l.valor_empresa,
  l.calculado_at,
  (SELECT count(*) FROM incapacidad_ajustes_liquidacion j WHERE j.expediente_id = e.id) AS ajustes,
  (SELECT count(*) FROM incapacidad_adjuntos d WHERE d.expediente_id = e.id AND d.anulado_at IS NULL) AS adjuntos
FROM incapacidad_expedientes e
JOIN ausentismo a ON a.id = e.ausentismo_id
LEFT JOIN ausentismo_catalogos c ON c.id = e.entidad_catalogo_id
LEFT JOIN incapacidad_liquidaciones l ON l.expediente_id = e.id AND l.es_vigente
WHERE e.eliminado_at IS NULL;

-- ── 11. Accesos ──────────────────────────────────────────────────────────────
-- RLS habilitada y sin políticas: solo el service role entra (patrón de
-- riesgo_corridas). Son datos personales: nada de SELECT a authenticated.

ALTER TABLE incapacidad_parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE incapacidad_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE incapacidad_expedientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE incapacidad_liquidaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE incapacidad_ajustes_liquidacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE incapacidad_adjuntos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON incapacidad_parametros, incapacidad_reglas, incapacidad_expedientes,
  incapacidad_liquidaciones, incapacidad_ajustes_liquidacion, incapacidad_adjuntos,
  vw_incapacidad_expedientes
  FROM anon, authenticated, public;
GRANT ALL ON incapacidad_parametros, incapacidad_reglas, incapacidad_expedientes,
  incapacidad_liquidaciones, incapacidad_ajustes_liquidacion, incapacidad_adjuntos
  TO service_role;
GRANT SELECT ON vw_incapacidad_expedientes TO service_role;

-- ── 12. El módulo ────────────────────────────────────────────────────────────
-- Decisión 12.9: se despliega desde RRHH. Contabilidad y Revisoría, si entran
-- después, se habilitan desde Configuración → Usuarios sin tocar código.

UPDATE user_types
  SET modulos = modulos || '["incapacidades"]'::jsonb
  WHERE key IN ('admin', 'rrhh') AND NOT (modulos ? 'incapacidades');

COMMENT ON TABLE incapacidad_expedientes IS
  'Expediente de recuperación de una incapacidad ante la EPS o la ARL, 1:1 con ausentismo. Nace por trigger cuando la incapacidad inicia desde fecha_corte_gestion; lo demás lo completa RRHH. Datos personales: solo service_role.';
COMMENT ON TABLE incapacidad_reglas IS
  'Versiones del motor de cálculo (src/lib/incapacidades/motor.ts). Solo una operativa; las demás son de compatibilidad con el libro Excel.';
COMMENT ON TABLE incapacidad_liquidaciones IS
  'Un cálculo explicado por fila: entradas, regla, días y valores. Recalcular inserta otra y deja la anterior sin vigencia.';
COMMENT ON TABLE incapacidad_ajustes_liquidacion IS
  'Cada ajuste a mano de un dato de la liquidación: campo, antes, después y motivo. Para contar al cierre del piloto qué se ajusta y a qué entidad.';
COMMENT ON TABLE incapacidad_parametros IS
  'Parámetros del módulo de incapacidades. fecha_corte_gestion: desde qué fecha de inicio entran las incapacidades en gestión.';

-- ── 13. Comprobación ─────────────────────────────────────────────────────────
-- Esperado: expedientes = incapacidades vigentes con inicio >= corte (23 al
-- 2026-09-10); anteriores_con_expediente = 0; los cinco pagadores del arranque
-- homologados (pendientes = 0 si el catálogo trae los nombres exactos).
SELECT
  incapacidad_corte()                                                        AS corte,
  (SELECT count(*) FROM incapacidad_expedientes)                             AS expedientes,
  (SELECT count(*) FROM ausentismo a WHERE incapacidad_entra_por_corte(a))   AS deberian_tener,
  (SELECT count(*) FROM incapacidad_expedientes e JOIN ausentismo a ON a.id = e.ausentismo_id
     WHERE a.fecha_inicio < incapacidad_corte() AND e.recibido_desde <> 'alta_manual') AS anteriores_con_expediente,
  (SELECT count(*) FROM incapacidad_expedientes WHERE pendiente_homologacion) AS pendientes_homologacion,
  (SELECT count(*) FROM incapacidad_expedientes WHERE persona_fuente = 'sin_resolver') AS personas_sin_resolver;

SELECT estado, count(*) FROM incapacidad_expedientes GROUP BY estado ORDER BY estado;
SELECT codigo, operativa FROM incapacidad_reglas ORDER BY codigo;
SELECT tipo, nombre, clase, dias_min_cobro FROM ausentismo_catalogos WHERE tipo IN ('EPS', 'ARL') AND activo ORDER BY tipo, nombre;
SELECT key, modulos ? 'incapacidades' AS tiene_incapacidades FROM user_types ORDER BY key;
