-- plan padrino hitos de pago
--
-- Contexto: fase 2 del Plan Padrino (spec RQ-05 y RQ-06). Cada referido
-- contratado tiene los hitos de su esquema (A: 3, B: 2) y cada uno se causa
-- por separado, solo si a su fecha (ingreso + N meses calendario) el
-- referido sigue activo y el padrino mantiene contrato vigente. Sin una
-- tabla de hitos no hay forma de saber qué se debe, qué se aprobó y qué ya
-- pagó nómina, ni de evitar pagos indebidos u omitidos.
--
-- Ciclo de un hito:
--   pendiente   → aún no llega su fecha, o llegó pero GEMA no tiene el dato.
--   por_aprobar → se cumplió; espera a la coordinadora.
--   aprobado    → la coordinadora lo aprobó; espera el pago de nómina.
--   pagado      → nómina lo pagó (fecha y referencia). No se edita más.
--   rechazado   → la coordinadora no lo aprobó (con observación).
--   no_causado  → a su fecha el referido no seguía activo o el padrino no
--                 tenía contrato vigente (motivo).
--   cancelado   → el referido se retiró antes y ya no se causará.
--
-- Depende de la migración 20261015183219 (padrino_referidos). Requiere la
-- nueva sub-función padrino_pago (nómina), definida en la aplicación.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

CREATE TABLE IF NOT EXISTS padrino_hitos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referido_id              uuid NOT NULL REFERENCES padrino_referidos(id),
  numero                   int NOT NULL,
  descripcion              text NOT NULL,
  meses                    int NOT NULL,
  valor                    numeric(14, 2) NOT NULL,
  requiere_desempeno       boolean NOT NULL DEFAULT false,
  fecha_causacion          date NOT NULL,
  estado                   text NOT NULL DEFAULT 'pendiente',
  -- Por qué quedó no causado o cancelado, o qué dato falta mientras sigue pendiente.
  motivo                   text,
  -- Los hechos con que se evaluó (estado del referido y del padrino a la fecha).
  evaluacion               jsonb,
  evaluado_at              timestamptz,
  desempeno_satisfactorio  boolean,
  aprobado_por_email       text,
  aprobado_at              timestamptz,
  observacion_aprobacion   text,
  pagado_por_email         text,
  pagado_at                timestamptz,
  fecha_pago               date,
  referencia_pago          text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT padrino_hitos_estado CHECK (estado IN (
    'pendiente', 'por_aprobar', 'aprobado', 'pagado', 'rechazado', 'no_causado', 'cancelado'
  )),
  CONSTRAINT padrino_hitos_valor CHECK (valor >= 0),
  CONSTRAINT padrino_hitos_pago CHECK (estado <> 'pagado' OR (fecha_pago IS NOT NULL AND referencia_pago IS NOT NULL)),
  CONSTRAINT padrino_hitos_unico UNIQUE (referido_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_padrino_hitos_estado_fecha ON padrino_hitos (estado, fecha_causacion);

COMMENT ON TABLE padrino_hitos IS
  'Hitos de pago del Plan Padrino: uno por hito del esquema del referido, con fecha de causación, evaluación, aprobación y pago.';

ALTER TABLE padrino_hitos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON padrino_hitos TO service_role;

-- La bitácora ya tiene hito_id; ahora apunta a la tabla.
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'padrino_eventos_hito_fk') THEN
    ALTER TABLE padrino_eventos
      ADD CONSTRAINT padrino_eventos_hito_fk FOREIGN KEY (hito_id) REFERENCES padrino_hitos(id);
  END IF;
END
$fk$;

-- Verificación.
SELECT count(*) AS hitos FROM padrino_hitos;
