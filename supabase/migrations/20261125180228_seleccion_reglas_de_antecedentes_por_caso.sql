-- seleccion reglas de antecedentes por caso
--
-- Contexto: Gestión Humana pidió (25-nov-2026) poder parametrizar, por cada
-- respuesta que puede dar Croma, qué pasa solo y qué pide revisión manual. Las
-- reglas de qué se tolera ya existían (entrega 3, ajustes ant_*); faltaban tres
-- casos que estaban fijos en el código o repartidos en otras secciones:
--
--   1. La fuente no responde. Era un sí/no «obligatoria» por fuente; ahora son
--      tres opciones: espera | pasa | revision. Se siembran con lo que hoy
--      diga el sí/no de cada fuente, para que nada cambie al aplicar esto.
--   2. El nombre que devuelve la fuente no es el del aspirante: pasa (no se
--      compara, como hasta hoy) | revision.
--   3. SIMIT por encima del tope y licencia que no sirve según el RUNT: hoy
--      cierran solos a los 30 minutos (descarta); ahora pueden ir a revisión.
--
-- Todo se edita en la pestaña nueva Candidatos › Selección › Antecedentes. Los
-- ajustes «… es obligatoria» de las cuatro fuentes quedan en la base (el código
-- los usa si faltan los nuevos) pero ya no se muestran.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entera.
-- Idempotente: se puede volver a ejecutar (no pisa lo que ya se haya cambiado).

-- ── 1. Si la fuente no responde: sale del sí/no vigente de cada fuente ─────
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
SELECT f.clave, 'regla', f.nombre, f.orden,
       CASE WHEN (SELECT valor FROM seleccion_ajustes WHERE clave = f.vieja) = 'false'::jsonb THEN '"pasa"'::jsonb ELSE '"espera"'::jsonb END,
       '"espera"'::jsonb, 'opcion', 'Gestión Humana, 25-nov-2026 (antes: «es obligatoria»)', 4
FROM (VALUES
  ('ant_policia_sin_respuesta', 'policia_obligatorio', 'Policía: ¿qué pasa si la consulta no responde?', 310),
  ('ant_procuraduria_sin_respuesta', 'procuraduria_obligatorio', 'Procuraduría: ¿qué pasa si la consulta no responde?', 311),
  ('ant_contraloria_sin_respuesta', 'contraloria_obligatorio', 'Contraloría: ¿qué pasa si la consulta no responde?', 312),
  ('ant_rnmc_sin_respuesta', 'rnmc_obligatorio', 'RNMC: ¿qué pasa si la consulta no responde?', 313)
) AS f(clave, vieja, nombre, orden)
ON CONFLICT (clave) DO NOTHING;

-- ── 2. Nombre que no coincide, SIMIT y licencia ────────────────────────────
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('ant_nombre_no_coincide', 'regla', '¿Qué pasa si el nombre que devuelve la fuente no es el del aspirante?', 314,
   '"pasa"'::jsonb, '"revision"'::jsonb, 'opcion', 'Gestión Humana, 25-nov-2026', 4),
  ('ant_simit_accion', 'regla', 'SIMIT: ¿qué pasa si debe más que el tope de multas?', 315,
   '"descarta"'::jsonb, '"descarta"'::jsonb, 'opcion', 'Gestión Humana, 25-nov-2026', 4),
  ('ant_licencia_accion', 'regla', 'RUNT: ¿qué pasa si la licencia no sirve (categoría, vencida, suspendida, restricción auditiva)?', 316,
   '"descarta"'::jsonb, '"descarta"'::jsonb, 'opcion', 'Gestión Humana, 25-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

-- ── 3. RNMC: palabras que siempre van a revisión manual ───────────────────
-- Venía vacía. Se propone una lista de comportamientos que conviene que una
-- persona mire en un conductor de servicio público aunque sea una sola medida:
-- violencia, armas, drogas o alcohol, hurto, irrespeto a la autoridad, acoso y
-- lo ocurrido en el transporte público. Se compara sin tildes ni mayúsculas y
-- por fragmento («arma» también encuentra «armas»; por eso van el nombre y el
-- verbo: «agresión» y «agredir»). Gestión Humana la cambia
-- en Selección › Antecedentes. El valor sugerido se actualiza siempre; el
-- valor, solo si seguía vacío y nadie lo había tocado.
UPDATE seleccion_ajustes
SET valor_sugerido = '["riña", "reñir", "arma", "agresión", "agredir", "lesiones", "lesionar", "amenaza", "violencia", "violenta", "estupefacientes", "psicoactivas", "drogas", "alcohol", "embriaguez", "embriagantes", "hurto", "hurtar", "autoridad", "acoso", "transporte público"]'::jsonb,
    origen = 'Propuesta de Gestivo, 25-nov-2026: falta la confirmación de Gestión Humana'
WHERE clave = 'ant_rnmc_palabras_revision';

UPDATE seleccion_ajustes
SET valor = valor_sugerido, updated_at = now()
WHERE clave = 'ant_rnmc_palabras_revision'
  AND valor = '[]'::jsonb
  AND NOT EXISTS (SELECT 1 FROM seleccion_cambios c WHERE c.tipo = 'ajuste' AND c.clave = 'ant_rnmc_palabras_revision');

SELECT clave, valor, valor_sugerido FROM seleccion_ajustes
WHERE clave LIKE 'ant\_%' ORDER BY orden;
