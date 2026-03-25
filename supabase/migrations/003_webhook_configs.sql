-- Webhook configurations for dynamic integrations
CREATE TABLE IF NOT EXISTS webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  field_mappings JSONB NOT NULL DEFAULT '{}',
  auth_secret TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_webhook_configs_updated BEFORE UPDATE ON webhook_configs
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Pre-seed Varylo config
INSERT INTO webhook_configs (name, slug, is_active, field_mappings) VALUES (
  'Varylo',
  'varylo',
  true,
  '{
    "candidate_name": "contact.name",
    "candidate_phone": "contact.phone",
    "candidate_email": "contact.email",
    "candidate_document": "capturedData.cedula",
    "candidate_position": "capturedData.cargo_aplicado",
    "documents_array": "documents",
    "document_url": "url",
    "document_name": "fileName",
    "document_mime": "mimeType"
  }'
) ON CONFLICT (slug) DO NOTHING;
