-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access on documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');

-- Allow service role to upload
CREATE POLICY "Service role upload on documents" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents');

-- Allow service role to delete
CREATE POLICY "Service role delete on documents" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents');
