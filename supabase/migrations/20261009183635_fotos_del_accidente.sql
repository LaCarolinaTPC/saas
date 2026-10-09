-- fotos del accidente
--
-- Contexto: el formato de investigación solo preguntaba «¿Hay fotos? Sí/No»;
-- las fotos quedaban en el celular del conductor o en WhatsApp y el revisor no
-- las veía en el reporte. Ahora se suben al bucket privado `accidentes`
-- (carpeta fotos/, igual que firmas/ y audio/) y aquí se guardan sus rutas, en
-- el orden en que se subieron. Se leen con enlaces firmados de una hora.
--
-- `tiene_fotos` se conserva: el histórico de la matriz GO-R-22 lo trae sin
-- archivos, y el reporte nuevo lo marca solo cuando sube al menos una foto.
--
-- Idempotente: se puede correr más de una vez.

ALTER TABLE public.accidentes
  ADD COLUMN IF NOT EXISTS fotos TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.accidentes.fotos IS
  'Rutas de las fotos del accidente en el bucket privado accidentes (fotos/<uuid>.jpg).';
