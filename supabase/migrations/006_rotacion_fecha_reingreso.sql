-- Add fecha_reingreso to conductores table
-- Populated automatically when a previously retired conductor is re-hired.
-- Used as the data cutoff date for profile queries (cierres, viajes_perdidos, ausentismo).
-- NULL means the conductor has never been re-hired (no cutoff applied).
ALTER TABLE conductores ADD COLUMN fecha_reingreso DATE NULL;
