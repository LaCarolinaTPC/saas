-- croquis del accidente y auxiliar de ruta
--
-- Contexto: el formato GO-R-16 (versión 08) trae en la página 2 el «Reporte
-- gráfico (IPAT)», una cuadrícula con rosa de los vientos donde se dibuja el
-- croquis a mano. Gestivo no tenía dónde hacerlo. Lo dibuja el auxiliar de
-- ruta en el sitio, desde el celular, con su propio usuario de Gestivo.
--
-- Columnas en accidentes:
--   croquis_path            PNG del croquis en el bucket privado accidentes
--                           (croquis/<uuid>.png), con encabezado GO-R-16 y leyenda;
--   croquis_json            el dibujo (vía, figuras, flechas) para reabrirlo y
--                           corregirlo; la imagen se regenera desde aquí;
--   croquis_omitido_motivo  por qué no se hizo croquis (obligatorio si se omite);
--   ipat_croquis            fotos del croquis oficial del IPAT que levanta el
--                           agente, en fotos/ como las fotos del accidente.
--
-- Permiso propio `reporte_accidente`, como `registro_dano`: abre solo
-- /accidentabilidad/reportar. Lo reciben el admin y quien ya tiene
-- Accidentabilidad (para que nadie pierda la opción del menú). El tipo
-- `auxiliar_ruta` queda creado sin usuarios; se asigna en Configuración.
--
-- Se puede correr entero más de una vez.

ALTER TABLE public.accidentes
  ADD COLUMN IF NOT EXISTS croquis_path TEXT,
  ADD COLUMN IF NOT EXISTS croquis_json JSONB,
  ADD COLUMN IF NOT EXISTS croquis_omitido_motivo TEXT,
  ADD COLUMN IF NOT EXISTS ipat_croquis TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.accidentes.croquis_path IS
  'PNG del croquis (formato GO-R-16, página 2) en el bucket privado accidentes: croquis/<uuid>.png.';
COMMENT ON COLUMN public.accidentes.croquis_json IS
  'Dibujo del croquis (plantilla de vía, figuras, flechas, textos) para reabrirlo y corregirlo.';
COMMENT ON COLUMN public.accidentes.croquis_omitido_motivo IS
  'Motivo por el que no se dibujó el croquis; nulo si hay croquis o si el reporte es anterior.';
COMMENT ON COLUMN public.accidentes.ipat_croquis IS
  'Fotos del croquis oficial del IPAT en el bucket privado accidentes (fotos/<uuid>.jpg).';

-- Permisos: el admin y quien ya tiene Accidentabilidad reciben la clave nueva.
UPDATE user_types
SET modulos = modulos || '["reporte_accidente"]'::jsonb
WHERE (key = 'admin' OR modulos ? 'accidentabilidad')
  AND NOT (modulos ? 'reporte_accidente');

INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema)
VALUES (
  'auxiliar_ruta',
  'Auxiliar de ruta',
  'Solo reporta accidentes desde el sitio (formato, fotos y croquis); ve sus reportes recientes',
  '["reporte_accidente"]'::jsonb,
  'all',
  false,
  false
)
ON CONFLICT (key) DO NOTHING;

-- Comprobación: columnas nuevas y tipos de usuario con el permiso.
SELECT column_name AS dato, data_type AS valor
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'accidentes'
  AND column_name IN ('fotos', 'croquis_path', 'croquis_json', 'croquis_omitido_motivo', 'ipat_croquis')
UNION ALL
SELECT 'user_types con reporte_accidente', string_agg(key, ', ' ORDER BY key)
FROM user_types WHERE modulos ? 'reporte_accidente';
