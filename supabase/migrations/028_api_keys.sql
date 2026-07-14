-- 028: API keys para la Data API externa (/api/external/v1).
--
-- Claves tipo "sk_live_..." emitidas desde Configuración → API. Solo se guarda
-- el hash SHA-256 de la clave (nunca el valor en claro) más un prefijo corto
-- para poder identificarla en la UI. Complementa (y eventualmente reemplaza)
-- la clave estática DATA_API_KEY de la variable de entorno.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  -- Nombre descriptivo del consumidor: "Hermes IA", "Power BI", etc.
  name text not null,
  -- Primeros caracteres de la clave ("sk_live_a1b2…") para mostrar en la UI.
  key_prefix text not null,
  -- SHA-256 (hex) de la clave completa. La clave en claro nunca se persiste.
  key_hash text not null unique,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- Búsqueda en cada request autenticado: por hash y solo claves activas.
create index if not exists idx_api_keys_hash_active
  on api_keys (key_hash)
  where is_active;

-- RLS sin políticas: solo el service role (createAdminClient) puede leer/escribir.
alter table api_keys enable row level security;
