-- Parte 1 de 5 de la migracion 20260914161822: las funciones del umbral y la puerta de entrada.
--
-- Se parte en cinco porque el SQL Editor estaba ejecutando el texto viejo
-- guardado en la pestaña. Pegue cada parte en una pestaña NUEVA y en orden:
-- 1 funciones, 2 trigger, 3 vista, 4 limpieza, 5 comprobacion.
--
-- Que debe salir: Cuatro avisos de CREATE FUNCTION y dos UPDATE. El de las EPS toca 9 filas la primera vez y 0 si ya se corrio.
--
-- El archivo completo, con el contexto y el porque, esta en
-- supabase/migrations/20260914161822_incapacidades_umbral_de_entrada_eps_desde_3_dias_y_arl_todas.sql

SELECT 'parte 1 de 5 · migracion 20260914161822' AS ejecutando;
-- ── 1. Umbral por defecto: 3 dias la EPS, 1 la ARL ──────────────────────────
-- Un solo lugar para el valor que aplica cuando la entidad no tiene umbral
-- propio (o cuando el expediente aun no esta homologado).
CREATE OR REPLACE FUNCTION incapacidad_dias_min_defecto(p_origen TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $defecto$
  SELECT CASE WHEN upper(COALESCE(p_origen, '')) IN ('AT', 'EL') THEN 1 ELSE 3 END;
$defecto$;

COMMENT ON FUNCTION incapacidad_dias_min_defecto(TEXT) IS
  'Dias minimos que hacen cobrable una incapacidad cuando la entidad no tiene umbral propio: 1 para AT/EL (ARL, responde desde el primer dia) y 3 para el resto (EPS, paga desde el tercer dia).';

-- Las EPS que seguian en la semilla de 4 bajan a 3. No se tocan las que RRHH
-- haya ajustado a otro valor a proposito.
UPDATE ausentismo_catalogos
   SET dias_min_cobro = 3
 WHERE tipo = 'EPS' AND (dias_min_cobro = 4 OR dias_min_cobro IS NULL);

UPDATE ausentismo_catalogos
   SET dias_min_cobro = 1
 WHERE tipo = 'ARL' AND dias_min_cobro IS NULL;

-- ── 2. La puerta de entrada al modulo ───────────────────────────────────────
-- Umbral que aplica a una fila de la matriz antes de que exista expediente:
-- el de su pagador en el catalogo activo, o el de su clase por defecto. Misma
-- homologacion por nombre que usa incapacidad_expediente_desde_matriz.
CREATE OR REPLACE FUNCTION incapacidad_dias_min_entrada(a ausentismo)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $entrada$
  SELECT COALESCE(
    (SELECT c.dias_min_cobro
       FROM ausentismo_catalogos c
      WHERE c.tipo IN ('EPS', 'ARL') AND c.activo
        AND ausentismo_clave(c.nombre) = ausentismo_clave(ausentismo_limpio(incapacidad_pagador(a)))
      ORDER BY (c.tipo = CASE WHEN upper(a.origen) IN ('AT', 'EL') THEN 'ARL' ELSE 'EPS' END) DESC
      LIMIT 1),
    incapacidad_dias_min_defecto(a.origen));
$entrada$;

-- Vigente, con inicio en el corte o despues y con dias suficientes para que
-- haya algo que reclamar. La ARL no mira dias: responde por todos, incluida
-- la incapacidad de un dia y la que todavia no tiene fecha de fin.
CREATE OR REPLACE FUNCTION incapacidad_entra_por_corte(a ausentismo)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $corte$
  SELECT a.eliminado_at IS NULL
     AND a.fecha_inicio IS NOT NULL
     AND a.fecha_inicio >= incapacidad_corte()
     AND (
       upper(COALESCE(a.origen, '')) IN ('AT', 'EL')
       OR (a.dias_it_pagados IS NOT NULL
           AND a.dias_it_pagados >= incapacidad_dias_min_entrada(a))
     );
$corte$;

COMMENT ON FUNCTION incapacidad_entra_por_corte(ausentismo) IS
  'Regla de ingreso al modulo de recuperacion: vigente, iniciada en el corte o despues y, si la paga una EPS, de mas de 2 dias. La ARL entra siempre.';
