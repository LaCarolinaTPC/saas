-- seleccion datos de la empresa para la politica de tratamiento de datos
--
-- Contexto: la autorización de datos que pide el asistente (A4, Ley 1581 de
-- 2012) enlaza a la política de tratamiento de datos, pero la empresa no tenía
-- una publicada. Gestivo la publica en /politica-de-datos (página pública) y
-- los datos del responsable (razón social, NIT, domicilio, correo y teléfono
-- para consultas y reclamos, fecha de vigencia) quedan como ajustes que
-- Gestión Humana edita en Selección › Tiempos y reglas, sin despliegue.
--
-- Requiere la migración 20261113205625 (tabla seleccion_ajustes).
-- Idempotente: ON CONFLICT DO NOTHING y el enlace solo se llena si está vacío.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
SELECT v.clave, v.grupo, v.nombre, v.orden, v.valor, v.valor, v.unidad, v.origen, v.entrega
FROM (VALUES
  ('empresa_razon_social', 'dato', 'Política de datos: razón social de la empresa', 330, '"Metropolitana de Transportes La Carolina"'::jsonb, 'texto', 'Como aparece en los mensajes de GH; confirmar la razón social completa', 1),
  ('empresa_nit', 'dato', 'Política de datos: NIT', 340, '""'::jsonb, 'texto', 'Por confirmar con GH', 1),
  ('empresa_domicilio', 'dato', 'Política de datos: domicilio principal', 350, '""'::jsonb, 'texto', 'Por confirmar con GH', 1),
  ('empresa_correo_datos', 'dato', 'Política de datos: correo para consultas y reclamos', 360, '""'::jsonb, 'texto', 'Por confirmar con GH', 1),
  ('empresa_telefono_datos', 'dato', 'Política de datos: teléfono para consultas y reclamos', 370, '""'::jsonb, 'texto', 'Por confirmar con GH', 1),
  ('politica_vigencia', 'dato', 'Política de datos: fecha de vigencia', 380, '""'::jsonb, 'texto', 'Por confirmar con GH (por ejemplo, 17 de noviembre de 2026)', 1)
) AS v(clave, grupo, nombre, orden, valor, unidad, origen, entrega)
ON CONFLICT (clave) DO NOTHING;

-- El enlace de la autorización apunta a la página de Gestivo si nadie puso otro.
UPDATE seleccion_ajustes
SET valor = '"https://gestivo.lacarolina.com.co/politica-de-datos"'::jsonb,
    valor_sugerido = '"https://gestivo.lacarolina.com.co/politica-de-datos"'::jsonb,
    origen = 'Página pública de Gestivo',
    updated_at = now()
WHERE clave = 'enlace_politica'
  AND valor = '""'::jsonb;
