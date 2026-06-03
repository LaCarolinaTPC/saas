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
