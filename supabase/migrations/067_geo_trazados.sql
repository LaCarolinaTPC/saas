-- ============================================================
-- Caché de trazados ajustados a calles (map matching OSRM)
--
-- El rastro GPS crudo une reportes en línea recta y "salta" sobre
-- las manzanas. El servidor ajusta el trazado a la malla vial con
-- OSRM una sola vez por despacho y lo cachea aquí.
-- ============================================================

CREATE TABLE IF NOT EXISTS geo_trazados (
  despacho BIGINT PRIMARY KEY,
  puntos JSONB NOT NULL,          -- [[lat, lng], ...] siguiendo las calles
  fuente TEXT NOT NULL DEFAULT 'osrm',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE geo_trazados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON geo_trazados FROM anon, public;
GRANT SELECT ON geo_trazados TO authenticated;
GRANT ALL ON geo_trazados TO service_role;
