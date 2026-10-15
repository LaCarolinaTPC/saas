-- plan padrino referidos politica y bitacora
--
-- Contexto: la Política de Bonificación Plan Padrino (Control Interno,
-- versión 2, vigente desde el 01-oct-2026) paga a un colaborador operativo
-- (padrino) por cada conductor que refiere y que permanece en la empresa.
-- Hoy solo existe el documento: no hay dónde registrar quién refirió a quién,
-- validar los requisitos ni dejar rastro para Control Interno. Spec:
-- work/Plan Padrino/Spec_Gestivo_Plan_Padrino.md (fase 1: RQ-01 a RQ-04,
-- RQ-07 y RQ-08). Los hitos de pago (padrino_hitos) llegan en la fase 2.
--
-- padrino_politicas: cada versión de la política con sus esquemas y montos.
--   Cada referido queda amarrado a la versión vigente en su fecha de registro;
--   cambiar montos es crear otra versión (solo el administrador, con
--   aprobación escrita de Gerencia).
-- padrino_referidos: un referido registrado, con su padrino, el resultado de
--   la validación de requisitos congelado al registrar (validacion) y la
--   decisión de elegibilidad. Nada se borra: se anula con motivo. Un referido
--   (cédula) solo puede tener un registro no anulado.
-- padrino_eventos: bitácora de toda acción (registro, validación, esquema,
--   elegibilidad, contratación, anulación).
-- profiles.cedula: para que el padrino, si es usuario de Gestivo, no vea ni
--   edite su propio registro (RQ-07).
--
-- Bucket privado plan-padrino: certificados de experiencia, servidos con URL
-- firmada desde el servidor.
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

CREATE TABLE IF NOT EXISTS padrino_politicas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version        text NOT NULL UNIQUE,
  vigente_desde  date NOT NULL,
  vigente_hasta  date,
  -- {"A": {"nombre", "condicion", "hitos": [{"numero","meses","valor","descripcion","requiere_desempeno"}]}, "B": {...}}
  esquemas       jsonb NOT NULL,
  aprobada_por   text,
  soporte        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT padrino_politicas_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

COMMENT ON TABLE padrino_politicas IS
  'Versiones de la Política de Bonificación Plan Padrino (esquemas y montos). Cada referido usa la versión vigente en su fecha de registro.';

INSERT INTO padrino_politicas (version, vigente_desde, esquemas, aprobada_por, soporte)
VALUES (
  'v2',
  DATE '2026-10-01',
  $esq${
    "A": {
      "nombre": "Con experiencia",
      "condicion": "Experiencia certificada en transporte público urbano de Barranquilla",
      "hitos": [
        {"numero": 1, "meses": 1, "valor": 150000, "descripcion": "Mes 1 de permanencia"},
        {"numero": 2, "meses": 2, "valor": 200000, "descripcion": "Mes 2 de permanencia"},
        {"numero": 3, "meses": 3, "valor": 350000, "descripcion": "Mes 3 de permanencia"}
      ]
    },
    "B": {
      "nombre": "Sin experiencia",
      "condicion": "Sin experiencia en transporte urbano, o experiencia en otras ciudades",
      "hitos": [
        {"numero": 1, "meses": 1, "valor": 100000, "descripcion": "Cumplido mes 1"},
        {"numero": 2, "meses": 3, "valor": 100000, "descripcion": "3 meses de permanencia continua y desempeño satisfactorio", "requiere_desempeno": true}
      ]
    }
  }$esq$::jsonb,
  'Gerencia General',
  'Política de Bonificación Plan Padrino, Control Interno, versión 2'
)
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS padrino_referidos (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  politica_id                    uuid NOT NULL REFERENCES padrino_politicas(id),
  candidate_id                   uuid REFERENCES candidates(id) ON DELETE SET NULL,
  proceso_id                     uuid REFERENCES procesos_contratacion(id) ON DELETE SET NULL,
  cedula_referido                text NOT NULL,
  nombre_referido                text,
  cedula_padrino                 text NOT NULL,
  nombre_padrino                 text,
  -- conductor (tabla conductores) o empleado (tabla employees).
  padrino_tipo                   text NOT NULL,
  padrino_cargo                  text,
  esquema                        text NOT NULL DEFAULT 'B',
  experiencia_certificada        boolean NOT NULL DEFAULT false,
  certificado_ruta               text,
  certificado_nombre             text,
  certificado_mime               text,
  certificado_subido_por_email   text,
  certificado_subido_at          timestamptz,
  certificado_validado_por_email text,
  certificado_validado_at        timestamptz,
  estado                         text NOT NULL DEFAULT 'en_validacion',
  -- Fotografía de la validación de requisitos P1-P3 y R1-R5 (semáforo y dato que la sustenta).
  validacion                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  validacion_at                  timestamptz,
  elegibilidad_excepcion         boolean NOT NULL DEFAULT false,
  elegibilidad_observacion       text,
  elegibilidad_por_email         text,
  elegibilidad_at                timestamptz,
  -- Inicio del conteo de permanencia (mes calendario).
  fecha_ingreso                  date,
  cierre_observacion             text,
  created_by                     uuid,
  created_by_email               text,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  anulado_at                     timestamptz,
  anulado_por_email              text,
  motivo_anulacion               text,
  CONSTRAINT padrino_referidos_estado CHECK (estado IN (
    'registrado', 'en_validacion', 'elegible', 'no_elegible', 'contratado',
    'en_seguimiento', 'completado', 'terminado', 'no_contratado'
  )),
  CONSTRAINT padrino_referidos_esquema CHECK (esquema IN ('A', 'B')),
  CONSTRAINT padrino_referidos_tipo CHECK (padrino_tipo IN ('conductor', 'empleado')),
  CONSTRAINT padrino_referidos_no_mismo CHECK (cedula_padrino <> cedula_referido),
  CONSTRAINT padrino_referidos_obs_largo CHECK (elegibilidad_observacion IS NULL OR length(elegibilidad_observacion) <= 2000)
);

-- Un solo registro vigente por referido: evita la doble bonificación.
CREATE UNIQUE INDEX IF NOT EXISTS idx_padrino_referidos_cedula_vigente
  ON padrino_referidos (cedula_referido) WHERE anulado_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_padrino_referidos_padrino ON padrino_referidos (cedula_padrino);
CREATE INDEX IF NOT EXISTS idx_padrino_referidos_proceso ON padrino_referidos (proceso_id);
CREATE INDEX IF NOT EXISTS idx_padrino_referidos_estado ON padrino_referidos (estado) WHERE anulado_at IS NULL;

COMMENT ON TABLE padrino_referidos IS
  'Referidos del Plan Padrino: candidato, proceso de contratación, padrino, esquema, validación congelada y elegibilidad. Se anula, nunca se borra.';

CREATE TABLE IF NOT EXISTS padrino_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referido_id   uuid NOT NULL REFERENCES padrino_referidos(id),
  hito_id       uuid,
  accion        text NOT NULL,
  detalle       jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_id       uuid,
  usuario_email text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_padrino_eventos_referido ON padrino_eventos (referido_id, created_at);

COMMENT ON TABLE padrino_eventos IS
  'Bitácora del Plan Padrino: quién registró, validó, cambió el esquema, aprobó, anuló y cuándo (UTC).';

ALTER TABLE padrino_politicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE padrino_referidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE padrino_eventos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON padrino_politicas TO service_role;
GRANT ALL ON padrino_referidos TO service_role;
GRANT ALL ON padrino_eventos TO service_role;

-- Cédula del usuario de Gestivo (opcional): el padrino no ve su propio registro.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cedula text;

-- Certificados de experiencia: bucket privado.
INSERT INTO storage.buckets (id, name, public)
VALUES ('plan-padrino', 'plan-padrino', false)
ON CONFLICT (id) DO NOTHING;

-- Verificación.
SELECT
  (SELECT count(*) FROM padrino_politicas)                        AS politicas,
  (SELECT count(*) FROM padrino_referidos)                        AS referidos,
  (SELECT count(*) FROM storage.buckets WHERE id = 'plan-padrino') AS bucket;
