-- ============================================================
-- Comunicaciones (Fase 2): medios y plantillas de WhatsApp
--
-- 1. Los medios que llegan por webhook (fotos, audios, documentos)
--    se descargan de Meta y se guardan en el bucket privado
--    "whatsapp" de Storage; en wa_mensajes queda la ruta. Antes
--    solo se guardaba el media_id de Meta, que caduca a los 30 días.
-- 2. Los mensajes salientes pueden ser adjuntos (misma ruta) o
--    plantillas aprobadas de Meta (fuera de la ventana de 24 h);
--    se registra el nombre de la plantilla enviada.
-- ============================================================

ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS media_path TEXT;   -- ruta en el bucket "whatsapp"
ALTER TABLE wa_mensajes ADD COLUMN IF NOT EXISTS plantilla TEXT;    -- nombre de la plantilla de Meta (salientes)

-- Bucket privado: los archivos se sirven con URL firmada desde el servidor.
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp', 'whatsapp', false)
ON CONFLICT (id) DO NOTHING;

-- service_role ignora RLS, pero dejamos las políticas explícitas por
-- claridad y para que ningún otro rol pueda leer o escribir el bucket.
DROP POLICY IF EXISTS "service_role lee whatsapp" ON storage.objects;
CREATE POLICY "service_role lee whatsapp" ON storage.objects
  FOR SELECT TO service_role USING (bucket_id = 'whatsapp');

DROP POLICY IF EXISTS "service_role sube whatsapp" ON storage.objects;
CREATE POLICY "service_role sube whatsapp" ON storage.objects
  FOR INSERT TO service_role WITH CHECK (bucket_id = 'whatsapp');

DROP POLICY IF EXISTS "service_role borra whatsapp" ON storage.objects;
CREATE POLICY "service_role borra whatsapp" ON storage.objects
  FOR DELETE TO service_role USING (bucket_id = 'whatsapp');
