-- Parte 5 de 5 de la migracion 20260914161822: la comprobacion.
--
-- Se parte en cinco porque el SQL Editor estaba ejecutando el texto viejo
-- guardado en la pestaña. Pegue cada parte en una pestaña NUEVA y en orden:
-- 1 funciones, 2 trigger, 3 vista, 4 limpieza, 5 comprobacion.
--
-- Que debe salir: Dos tablas: EPS con 4 cobrables y 0 bajo umbral, ARL con 2; y el catalogo con 3 dias en las nueve EPS y 1 en ARL BOLIVAR.
--
-- El archivo completo, con el contexto y el porque, esta en
-- supabase/migrations/20260914161822_incapacidades_umbral_de_entrada_eps_desde_3_dias_y_arl_todas.sql

SELECT 'parte 5 de 5 · migracion 20260914161822' AS ejecutando;
-- ── 6. Comprobacion ─────────────────────────────────────────────────────────
-- Lo que queda en la bandeja y con que umbral. Esperado tras aplicar: ningun
-- expediente vigente de EPS por debajo de su umbral.
SELECT
  CASE WHEN upper(COALESCE(origen, '')) IN ('AT', 'EL') THEN 'ARL' ELSE 'EPS' END AS clase,
  count(*) FILTER (WHERE cobrable)     AS cobrables,
  count(*) FILTER (WHERE NOT cobrable) AS bajo_umbral,
  count(*)                             AS total
FROM vw_incapacidad_expedientes
GROUP BY 1
ORDER BY 1;

SELECT tipo, nombre, dias_min_cobro
  FROM ausentismo_catalogos
 WHERE tipo IN ('EPS', 'ARL') AND activo
 ORDER BY tipo, nombre;
