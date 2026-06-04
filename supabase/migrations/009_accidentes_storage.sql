-- Storage privado para el módulo de Accidentabilidad
-- Firmas y audio contienen datos personales → bucket privado, lectura por signed URLs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('accidentes', 'accidentes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service role read on accidentes" ON storage.objects
  FOR SELECT USING (bucket_id = 'accidentes');

CREATE POLICY "Service role upload on accidentes" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'accidentes');

CREATE POLICY "Service role delete on accidentes" ON storage.objects
  FOR DELETE USING (bucket_id = 'accidentes');
