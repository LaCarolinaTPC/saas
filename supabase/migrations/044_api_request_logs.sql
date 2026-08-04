-- Registro de solicitudes de la Data API externa (/api/external/v1).
-- Cada petición queda asociada a la api_key que la hizo (o NULL si usó la
-- clave legada DATA_API_KEY o si la clave fue inválida).

CREATE TABLE api_request_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  api_key_id uuid REFERENCES api_keys(id) ON DELETE CASCADE,
  method text NOT NULL,
  path text NOT NULL,
  query text,
  resultado text NOT NULL, -- 'ok' | 'ok_legacy' | 'clave_invalida' | 'sin_clave'
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_request_logs_key_fecha
  ON api_request_logs (api_key_id, created_at DESC);
CREATE INDEX idx_api_request_logs_fecha
  ON api_request_logs (created_at);

-- Solo el service_role accede (igual que api_keys).
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
