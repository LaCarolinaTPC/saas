-- causa y nota de retiro de conductores
--
-- Contexto: RRHH necesita registrar por qué se retiró cada conductor (una
-- causa de un catálogo y una nota libre) para analizar la rotación. GEMA solo
-- entrega el estado RETIRADO y la fecha_retiro, y la tabla `conductores` se
-- reescribe en cada sincronización, así que la causa vive en una tabla
-- aparte que la sincronización no toca.
--
-- Una fila por retiro: un conductor que reingresa y se vuelve a retirar tiene
-- otra fecha_retiro y por lo tanto otra fila. Al corregir la causa se
-- actualiza la misma fila; el cambio queda en tesoreria_audit_log (módulo
-- "conductores").
--
-- El catálogo de causas está en la aplicación
-- (src/lib/conductores/retiro.ts); aquí se guarda la clave.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

CREATE TABLE IF NOT EXISTS conductores_retiro (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula                text NOT NULL,
  -- fecha_retiro de `conductores` al momento de registrar; null si GEMA no la tenía.
  fecha_retiro          date,
  causa                 text NOT NULL,
  nota                  text,
  registrado_por_email  text,
  registrado_at         timestamptz NOT NULL DEFAULT now(),
  actualizado_por_email text,
  actualizado_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conductores_retiro_nota_largo CHECK (nota IS NULL OR length(nota) <= 2000)
);

-- Un registro por conductor y retiro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conductores_retiro_unico
  ON conductores_retiro (cedula, COALESCE(fecha_retiro, DATE '1900-01-01'));
CREATE INDEX IF NOT EXISTS idx_conductores_retiro_causa ON conductores_retiro (causa);

COMMENT ON TABLE conductores_retiro IS
  'Causa (clave del catálogo de la aplicación) y nota del retiro de cada conductor, registradas por RRHH. Una fila por cédula y fecha_retiro.';

ALTER TABLE conductores_retiro ENABLE ROW LEVEL SECURITY;
GRANT ALL ON conductores_retiro TO service_role;
