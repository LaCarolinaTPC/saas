-- Matriz de Ausentismo: catálogos validados desde la data y trazabilidad
--
-- Contexto. La tabla `ausentismo` (005) es la "MATRIZ DE AUSENTISMO" de la EPS
-- que RRHH carga desde Excel; cada carga la borra y la vuelve a insertar. Se va
-- a capturar también desde un formulario en dos momentos (apertura con los
-- datos administrativos, cierre con CIE10/DX/SOAT/GRD), y el pedido es que las
-- validaciones nazcan de la data ya registrada: EPS, IPS, profesionales, CIE10
-- con su diagnóstico y su GRD, todo sembrado desde las 628 filas actuales.
--
-- Qué hace, en orden:
--   1. Homologa la data actual: EC → EG, "ISNPECTOR" → "INSPECTOR", espacios
--      dobles en GRD, mes y día de ocurrencia recalculados de la fecha (quita
--      el "LUE"), días perdidos = fin - inicio + 1 donde venían vacíos.
--   2. Crea `ausentismo_catalogos` y lo siembra desde la data con conteo de
--      uso y último uso: ORIGEN, GRD, EPS, ARL, IPS, PROFESIONAL (ligado a su
--      IPS más frecuente), CIE10 (código → DX → GRD) y CIE10_LETRA (regla
--      letra inicial → GRD para proponer el grupo al cerrar).
--   3. Agrega a `ausentismo` el estado del registro (pendiente | cerrado), el
--      origen del registro (excel | formulario), ARL, quién abrió/cerró/
--      modificó, motivo y marcas de revisión. Ninguna columna existente cambia
--      de nombre ni de tipo: el API externo que expone la tabla sigue igual.
--   4. Aparta los duplicados exactos del Excel (4 llaves, 8 filas al
--      2026-09-02) a `ausentismo_duplicados` y crea la llave natural única
--      (cédula, fecha de inicio, consecutivo) que la carga por upsert
--      necesita.
--   5. Marca para revisión las prórrogas sin incapacidad previa contigua y
--      los rangos solapados del mismo empleado.
--   6. Vista `vw_ausentismo_matriz` con las columnas del Excel original.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Ejecutar después de 20260902180848.

-- ── 0. Funciones de apoyo ────────────────────────────────────────────────────
-- Texto limpio para mostrar: sin espacios sobrantes.
CREATE OR REPLACE FUNCTION ausentismo_limpio(x TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(btrim(x), '\s+', ' ', 'g'), '')
$$;

-- Clave de comparación: minúsculas, sin tildes, un solo espacio. Con esto
-- "Alteracion Neurológica" y "ALTERACION NEUROLOGICA" son el mismo valor.
CREATE OR REPLACE FUNCTION ausentismo_clave(x TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(ausentismo_limpio(translate(x, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')))
$$;

-- ── 1. Homologación de la data actual ────────────────────────────────────────
UPDATE ausentismo SET origen = 'EG' WHERE origen = 'EC';

UPDATE ausentismo SET cargo = 'INSPECTOR DE PATIO' WHERE cargo = 'ISNPECTOR DE PATIO';

UPDATE ausentismo SET
  grd = ausentismo_limpio(grd),
  eps = ausentismo_limpio(eps),
  ips = ausentismo_limpio(ips),
  profesional_responsable = ausentismo_limpio(profesional_responsable),
  diagnostico = ausentismo_limpio(diagnostico),
  cie10 = upper(ausentismo_limpio(cie10)),
  cargo = ausentismo_limpio(cargo)
WHERE grd IS DISTINCT FROM ausentismo_limpio(grd)
   OR eps IS DISTINCT FROM ausentismo_limpio(eps)
   OR ips IS DISTINCT FROM ausentismo_limpio(ips)
   OR profesional_responsable IS DISTINCT FROM ausentismo_limpio(profesional_responsable)
   OR diagnostico IS DISTINCT FROM ausentismo_limpio(diagnostico)
   OR cie10 IS DISTINCT FROM upper(ausentismo_limpio(cie10))
   OR cargo IS DISTINCT FROM ausentismo_limpio(cargo);

-- Mes y día de ocurrencia se derivan de la fecha de inicio; así desaparece el
-- "LUE" y cualquier otra variante escrita a mano.
UPDATE ausentismo SET
  mes_inicio = (ARRAY['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO',
                      'AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'])
                 [EXTRACT(MONTH FROM fecha_inicio)::int],
  dia_ocurrencia = (ARRAY['DOMINGO','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO'])
                 [EXTRACT(DOW FROM fecha_inicio)::int + 1]
WHERE fecha_inicio IS NOT NULL;

-- El lector del Excel buscaba "DIAS DE IT PAGADOS" y la hoja dice "DIAS
-- PERDIDOS", así que la columna llegó vacía en todas las filas. Se calcula.
UPDATE ausentismo
  SET dias_it_pagados = (fecha_fin - fecha_inicio) + 1
  WHERE dias_it_pagados IS NULL AND fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL;

-- ── 2. Catálogo validado ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ausentismo_catalogos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ORIGEN | GRD | EPS | ARL | AFP | IPS | PROFESIONAL | CIE10 | CIE10_LETRA
  tipo TEXT NOT NULL CHECK (tipo IN
    ('ORIGEN','GRD','EPS','ARL','AFP','IPS','PROFESIONAL','CIE10','CIE10_LETRA')),
  -- CIE10: el código (M545). ORIGEN: EG, EL, AT, LM, LP. EPS/ARL/AFP: NIT o
  -- código de la Superintendencia cuando se conozca. CIE10_LETRA: la letra.
  codigo TEXT,
  -- CIE10: el diagnóstico (DX). CIE10_LETRA: el GRD que propone esa letra.
  nombre TEXT NOT NULL,
  -- CIE10: GRD del código. PROFESIONAL: IPS con la que más aparece.
  relacionado TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  -- Lo sembrado desde la data y lo confirmado por un admin es verificado; lo
  -- que se crea desde el selector nace sin verificar pero se puede usar.
  verificado BOOLEAN NOT NULL DEFAULT true,
  usos INTEGER NOT NULL DEFAULT 0,
  ultimo_uso DATE,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un nombre por tipo (sin importar mayúsculas ni tildes). CIE10 se excluye
-- porque dos códigos distintos pueden compartir diagnóstico.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ausentismo_catalogos_nombre
  ON ausentismo_catalogos (tipo, ausentismo_clave(nombre))
  WHERE tipo NOT IN ('CIE10','CIE10_LETRA');
-- Un código por tipo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ausentismo_catalogos_codigo
  ON ausentismo_catalogos (tipo, upper(codigo))
  WHERE codigo IS NOT NULL AND tipo <> 'CIE10_LETRA';
-- La regla letra → GRD admite varias filas por letra (H: oído y ojo).
CREATE UNIQUE INDEX IF NOT EXISTS idx_ausentismo_catalogos_letra
  ON ausentismo_catalogos (codigo, ausentismo_clave(nombre))
  WHERE tipo = 'CIE10_LETRA';
CREATE INDEX IF NOT EXISTS idx_ausentismo_catalogos_tipo_activo
  ON ausentismo_catalogos (tipo, activo, usos DESC);

DROP TRIGGER IF EXISTS trg_ausentismo_catalogos_updated ON ausentismo_catalogos;
CREATE TRIGGER trg_ausentismo_catalogos_updated
  BEFORE UPDATE ON ausentismo_catalogos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2a. ORIGEN: lista cerrada pedida por RRHH. EC histórico ya se homologó a EG.
INSERT INTO ausentismo_catalogos (tipo, codigo, nombre, usos, ultimo_uso)
SELECT 'ORIGEN', o.codigo, o.nombre,
       (SELECT count(*) FROM ausentismo a WHERE a.origen = o.codigo),
       (SELECT max(fecha_inicio) FROM ausentismo a WHERE a.origen = o.codigo)
FROM (VALUES
  ('EG', 'Enfermedad general'),
  ('EL', 'Enfermedad laboral'),
  ('AT', 'Accidente de trabajo'),
  ('LM', 'Licencia de maternidad'),
  ('LP', 'Licencia de paternidad')
) AS o(codigo, nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM ausentismo_catalogos c WHERE c.tipo = 'ORIGEN' AND upper(c.codigo) = o.codigo
);

-- 2b. GRD: los grupos tal como están en la data, ya sin espacios dobles.
INSERT INTO ausentismo_catalogos (tipo, nombre, usos, ultimo_uso)
SELECT 'GRD', grd, count(*), max(fecha_inicio)
FROM ausentismo
WHERE grd IS NOT NULL
GROUP BY grd
HAVING NOT EXISTS (
  SELECT 1 FROM ausentismo_catalogos c
  WHERE c.tipo = 'GRD' AND ausentismo_clave(c.nombre) = ausentismo_clave(grd)
);

-- 2c. EPS y ARL: lo que la columna `eps` traía mezclado se separa por nombre.
INSERT INTO ausentismo_catalogos (tipo, nombre, usos, ultimo_uso)
SELECT CASE WHEN eps ILIKE 'ARL%' THEN 'ARL' ELSE 'EPS' END, eps, count(*), max(fecha_inicio)
FROM ausentismo
WHERE eps IS NOT NULL
GROUP BY eps
HAVING NOT EXISTS (
  SELECT 1 FROM ausentismo_catalogos c
  WHERE c.tipo = CASE WHEN eps ILIKE 'ARL%' THEN 'ARL' ELSE 'EPS' END
    AND ausentismo_clave(c.nombre) = ausentismo_clave(eps)
);

-- 2d. IPS.
INSERT INTO ausentismo_catalogos (tipo, nombre, usos, ultimo_uso)
SELECT 'IPS', ips, count(*), max(fecha_inicio)
FROM ausentismo
WHERE ips IS NOT NULL
GROUP BY ips
HAVING NOT EXISTS (
  SELECT 1 FROM ausentismo_catalogos c
  WHERE c.tipo = 'IPS' AND ausentismo_clave(c.nombre) = ausentismo_clave(ips)
);

-- 2e. PROFESIONAL, ligado a la IPS con la que más veces aparece.
INSERT INTO ausentismo_catalogos (tipo, nombre, relacionado, usos, ultimo_uso)
SELECT 'PROFESIONAL', p.profesional, p.ips, t.usos, t.ultimo_uso
FROM (
  SELECT DISTINCT ON (profesional_responsable)
         profesional_responsable AS profesional, ips, count(*) AS n
  FROM ausentismo
  WHERE profesional_responsable IS NOT NULL
  GROUP BY profesional_responsable, ips
  ORDER BY profesional_responsable, n DESC, ips
) p
JOIN (
  SELECT profesional_responsable, count(*) AS usos, max(fecha_inicio) AS ultimo_uso
  FROM ausentismo WHERE profesional_responsable IS NOT NULL
  GROUP BY profesional_responsable
) t ON t.profesional_responsable = p.profesional
WHERE NOT EXISTS (
  SELECT 1 FROM ausentismo_catalogos c
  WHERE c.tipo = 'PROFESIONAL' AND ausentismo_clave(c.nombre) = ausentismo_clave(p.profesional)
);

-- 2f. CIE10: código → diagnóstico más frecuente → GRD más frecuente. En la
-- data cada código tiene un solo DX y un solo GRD, pero se toma el modo por
-- si una carga futura trae variantes.
INSERT INTO ausentismo_catalogos (tipo, codigo, nombre, relacionado, usos, ultimo_uso)
SELECT 'CIE10', d.cie10, d.diagnostico, g.grd, t.usos, t.ultimo_uso
FROM (
  SELECT DISTINCT ON (cie10) cie10, diagnostico, count(*) AS n
  FROM ausentismo WHERE cie10 IS NOT NULL AND diagnostico IS NOT NULL
  GROUP BY cie10, diagnostico ORDER BY cie10, n DESC, diagnostico
) d
LEFT JOIN (
  SELECT DISTINCT ON (cie10) cie10, grd, count(*) AS n
  FROM ausentismo WHERE cie10 IS NOT NULL AND grd IS NOT NULL
  GROUP BY cie10, grd ORDER BY cie10, n DESC, grd
) g ON g.cie10 = d.cie10
JOIN (
  SELECT cie10, count(*) AS usos, max(fecha_inicio) AS ultimo_uso
  FROM ausentismo WHERE cie10 IS NOT NULL GROUP BY cie10
) t ON t.cie10 = d.cie10
WHERE NOT EXISTS (
  SELECT 1 FROM ausentismo_catalogos c WHERE c.tipo = 'CIE10' AND upper(c.codigo) = d.cie10
);

-- 2g. Regla letra inicial del CIE10 → GRD, con su frecuencia. Al cerrar un
-- registro con un código nuevo, el formulario propone el GRD de su letra; si
-- la letra tiene varios (H: oído y ojo), el usuario elige.
INSERT INTO ausentismo_catalogos (tipo, codigo, nombre, usos, ultimo_uso)
SELECT 'CIE10_LETRA', l.letra, l.grd, l.usos, l.ultimo_uso
FROM (
  SELECT left(cie10, 1) AS letra, grd, count(*) AS usos, max(fecha_inicio) AS ultimo_uso
  FROM ausentismo
  WHERE cie10 IS NOT NULL AND grd IS NOT NULL
  GROUP BY left(cie10, 1), grd
) l
WHERE NOT EXISTS (
  SELECT 1 FROM ausentismo_catalogos c
  WHERE c.tipo = 'CIE10_LETRA' AND c.codigo = l.letra
    AND ausentismo_clave(c.nombre) = ausentismo_clave(l.grd)
);

-- ── 3. Trazabilidad y estado del registro en la matriz ───────────────────────
ALTER TABLE ausentismo
  -- pendiente: abierto con los datos administrativos; cerrado: con CIE10/DX/SOAT/GRD.
  ADD COLUMN IF NOT EXISTS estado_registro TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado_registro IN ('pendiente','cerrado')),
  -- excel: vino de la carga; formulario: se capturó en la app. La carga por
  -- upsert solo toca filas de origen excel.
  ADD COLUMN IF NOT EXISTS origen_registro TEXT NOT NULL DEFAULT 'excel'
    CHECK (origen_registro IN ('excel','formulario')),
  -- ARL cuando el origen es AT o EL. `eps` se conserva tal cual por el API.
  ADD COLUMN IF NOT EXISTS arl TEXT,
  ADD COLUMN IF NOT EXISTS abierto_por_email TEXT,
  ADD COLUMN IF NOT EXISTS cerrado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS cerrado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS modificado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS motivo_modificacion TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Marcas de revisión: prorroga_sin_previa | solape | duplicado_retirado
  ADD COLUMN IF NOT EXISTS revision TEXT[] NOT NULL DEFAULT '{}',
  -- Llave natural apta para el upsert de PostgREST (no acepta expresiones):
  -- el consecutivo vacío cuenta como valor propio.
  ADD COLUMN IF NOT EXISTS consecutivo_llave TEXT
    GENERATED ALWAYS AS (COALESCE(consecutivo_incapacidad, '')) STORED;

DROP TRIGGER IF EXISTS trg_ausentismo_updated ON ausentismo;
CREATE TRIGGER trg_ausentismo_updated
  BEFORE UPDATE ON ausentismo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Lo que ya trae diagnóstico está cerrado.
UPDATE ausentismo SET estado_registro = 'cerrado'
  WHERE cie10 IS NOT NULL AND estado_registro = 'pendiente';

-- La ARL que venía en la columna EPS pasa a su campo.
UPDATE ausentismo SET arl = eps
  WHERE arl IS NULL AND eps ILIKE 'ARL%';

-- ── 4. Duplicados del Excel y llave natural ──────────────────────────────────
-- Copia de respaldo con la misma forma que la matriz. No se borra nada sin
-- dejarlo aquí primero.
CREATE TABLE IF NOT EXISTS ausentismo_duplicados (
  LIKE ausentismo INCLUDING DEFAULTS,
  retirado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo TEXT NOT NULL DEFAULT 'llave natural repetida en la carga de Excel'
);
-- LIKE sin INCLUDING GENERATED copia `consecutivo_llave` como texto simple y
-- en la misma posición, así el INSERT ... SELECT s.* de abajo alinea columnas.

WITH ranking AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY cedula, fecha_inicio, consecutivo_llave
           ORDER BY created_at, id
         ) AS n
  FROM ausentismo
),
sobrantes AS (
  DELETE FROM ausentismo a
  USING ranking r
  WHERE a.id = r.id AND r.n > 1
  RETURNING a.*
)
INSERT INTO ausentismo_duplicados
SELECT s.*, now(), 'llave natural repetida en la carga de Excel'
FROM sobrantes s;

-- La fila que se conservó queda marcada: RRHH decide si el Excel traía la
-- misma incapacidad dos veces o si eran dos distintas mal registradas.
UPDATE ausentismo a
  SET revision = array_append(revision, 'duplicado_retirado')
  WHERE EXISTS (
    SELECT 1 FROM ausentismo_duplicados d
    WHERE d.cedula = a.cedula AND d.fecha_inicio = a.fecha_inicio
      AND d.consecutivo_llave = a.consecutivo_llave
  )
  AND NOT ('duplicado_retirado' = ANY(revision));

CREATE UNIQUE INDEX IF NOT EXISTS idx_ausentismo_llave_natural
  ON ausentismo (cedula, fecha_inicio, consecutivo_llave);

CREATE INDEX IF NOT EXISTS idx_ausentismo_estado_registro
  ON ausentismo (estado_registro) WHERE estado_registro = 'pendiente';

-- ── 5. Marcas de revisión derivadas de la propia data ────────────────────────
-- Prórroga sin una incapacidad previa del mismo empleado que termine el día
-- anterior (10 casos al 2026-09-02).
UPDATE ausentismo a
  SET revision = array_append(revision, 'prorroga_sin_previa')
  WHERE upper(a.indicador_prorroga) = 'PRORROGA'
    AND NOT EXISTS (
      SELECT 1 FROM ausentismo p
      WHERE p.cedula = a.cedula AND p.id <> a.id
        AND p.fecha_fin = a.fecha_inicio - 1
    )
    AND NOT ('prorroga_sin_previa' = ANY(a.revision));

-- Rangos que se pisan con otra incapacidad del mismo empleado.
UPDATE ausentismo a
  SET revision = array_append(revision, 'solape')
  WHERE a.fecha_inicio IS NOT NULL AND a.fecha_fin IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ausentismo o
      WHERE o.cedula = a.cedula AND o.id <> a.id
        AND o.fecha_inicio IS NOT NULL AND o.fecha_fin IS NOT NULL
        AND a.fecha_inicio <= o.fecha_fin AND a.fecha_fin >= o.fecha_inicio
    )
    AND NOT ('solape' = ANY(a.revision));

CREATE INDEX IF NOT EXISTS idx_ausentismo_revision
  ON ausentismo USING GIN (revision);

-- ── 6. Vista con las columnas del Excel original ─────────────────────────────
CREATE OR REPLACE VIEW vw_ausentismo_matriz AS
SELECT
  a.id,
  a.consecutivo_incapacidad,
  a.cedula                  AS documento_de_identidad,
  a.nombre,
  a.cargo,
  a.indicador_prorroga,
  a.dias_it_pagados         AS dias_perdidos,
  a.origen,
  a.fecha_inicio,
  a.fecha_fin,
  a.mes_inicio,
  a.dia_ocurrencia          AS dia_de_ocurrencia_del_evento,
  a.eps,
  a.arl,
  a.ips,
  a.profesional_responsable,
  a.tipo_conductor          AS tipo_de_conductor,
  a.estado,
  a.cie10,
  a.diagnostico             AS dx,
  a.soat,
  a.grd,
  a.estado_registro,
  a.origen_registro,
  a.revision,
  a.abierto_por_email,
  a.cerrado_por_email,
  a.cerrado_at,
  a.modificado_por_email,
  a.motivo_modificacion,
  a.source_file,
  a.created_at,
  a.updated_at
FROM ausentismo a;

-- ── 7. Seguridad y permisos ──────────────────────────────────────────────────
ALTER TABLE ausentismo_catalogos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ausentismo_duplicados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ausentismo_catalogos FROM anon, public;
REVOKE ALL ON ausentismo_duplicados FROM anon, public;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  ausentismo,
  ausentismo_catalogos,
  ausentismo_duplicados
TO service_role;
GRANT SELECT ON vw_ausentismo_matriz TO service_role;
