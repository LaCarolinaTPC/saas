-- Configuración de la aplicación (clave-valor)
-- Usado, entre otros, para la API key de transcripción (OpenAI), editable desde Configuración.
-- Acceso solo vía service role (server-side); nunca exponer 'value' al cliente.

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES profiles(id)
);
