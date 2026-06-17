-- ============================================================
-- Módulo Campañas — Embudo de reclutamiento (Meta Ads + WhatsApp)
-- Réplica del dashboard de reclutamiento de La Carolina.
-- ============================================================

-- 1. MÉTRICAS DIARIAS DEL EMBUDO (por día y canal)
-- Canales: WhatsApp, Referido, Computrabajo, ManyChat, Varylo, Otros
CREATE TABLE IF NOT EXISTS recruitment_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  canal TEXT NOT NULL DEFAULT 'WhatsApp',
  conversaciones INTEGER DEFAULT 0,   -- conversaciones / contactos iniciales
  postulantes INTEGER DEFAULT 0,      -- Post. (CV registrado)
  pasan INTEGER DEFAULT 0,            -- Pasan filtro inicial
  continuan INTEGER DEFAULT 0,        -- Continúan en proceso
  evaluaciones INTEGER DEFAULT 0,     -- Eval. médicas
  aptos INTEGER DEFAULT 0,            -- Aptos (examen médico)
  contratados INTEGER DEFAULT 0,      -- Contr.
  motivo_fuga TEXT,                   -- Fuga (motivo principal del día)
  source TEXT DEFAULT 'manual',       -- manual | whatsapp | meta | excel
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fecha, canal)
);
CREATE INDEX IF NOT EXISTS idx_rdm_fecha ON recruitment_daily_metrics(fecha);
CREATE INDEX IF NOT EXISTS idx_rdm_canal ON recruitment_daily_metrics(canal);

-- 2. CAMPAÑAS META ADS (gasto/resultados por campaña)
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_campaign_id TEXT UNIQUE,
  nombre TEXT NOT NULL,
  estado TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  gasto NUMERIC(14,2) DEFAULT 0,      -- spend (COP)
  impresiones BIGINT DEFAULT 0,
  clics BIGINT DEFAULT 0,
  leads BIGINT DEFAULT 0,             -- mensajes / conversaciones generadas
  moneda TEXT DEFAULT 'COP',
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_fecha ON meta_campaigns(fecha_inicio);

-- 3. GASTO META DIARIO (para el costo por contratación por periodo)
CREATE TABLE IF NOT EXISTS meta_spend_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  meta_campaign_id TEXT,
  gasto NUMERIC(14,2) DEFAULT 0,
  impresiones BIGINT DEFAULT 0,
  clics BIGINT DEFAULT 0,
  leads BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fecha, meta_campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_meta_spend_fecha ON meta_spend_daily(fecha);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_rdm_updated ON recruitment_daily_metrics;
CREATE TRIGGER trg_rdm_updated BEFORE UPDATE ON recruitment_daily_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_meta_campaigns_updated ON meta_campaigns;
CREATE TRIGGER trg_meta_campaigns_updated BEFORE UPDATE ON meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
