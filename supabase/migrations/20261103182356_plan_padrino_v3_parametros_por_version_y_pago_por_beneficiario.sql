-- plan padrino v3 parametros por version y pago por beneficiario
--
-- Contexto: Gerencia actualizó la Política Plan Padrino (documento del
-- 2026-11-03). Cambian los esquemas (aparece C, reintegro), se paga también
-- al referido, cambian quién puede ser padrino, las ventanas de sanciones y de
-- hoja de vida, y los requisitos del referido. Casi todo eso estaba fijo en el
-- código; desde aquí cada versión de la política guarda sus PARÁMETROS
-- (`padrino_politicas.parametros`) y el código solo tiene el catálogo de
-- reglas que los lee (src/lib/padrino/politica.ts y reglas.ts).
--
--  · padrino_politicas: parámetros por versión, estado borrador/publicada y
--    quién la publicó. Una versión publicada no se edita (trigger): cambiar
--    es crear otra. La v2 recibe sus parámetros, equivalentes a lo que hacía
--    el código; la v3 entra como BORRADOR (sin fecha), así que nada cambia
--    para los usuarios hasta publicarla (ver docs/plan-padrino.md).
--  · padrino_referidos: admite el esquema C y guarda el tipo de ingreso
--    (nuevo / reintegro), los meses fuera y por qué no tiene bonificación.
--  · padrino_hitos: una fila por BENEFICIARIO (padrino o referido). Los 8
--    hitos de hoy quedan como del padrino.
--  · padrino_pagos_historicos: cédulas por las que ya se pagó Plan Padrino
--    antes de Gestivo (solo una bonificación por cédula). Los datos se cargan
--    aparte, nunca en una migración: el repositorio es público.
--
-- Los valores JSON de v2 y v3 son los de PARAMETROS_V2 / PARAMETROS_V3 en
-- src/lib/padrino/politica.ts (generados desde ahí, no a mano).
--
-- Se aplica a mano en el SQL Editor, entero y de una sola vez. Es idempotente.

-- ── 1. padrino_politicas ────────────────────────────────────────────────────

ALTER TABLE padrino_politicas ADD COLUMN IF NOT EXISTS parametros jsonb;
ALTER TABLE padrino_politicas ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'publicada';
ALTER TABLE padrino_politicas ADD COLUMN IF NOT EXISTS publicada_por_email text;
ALTER TABLE padrino_politicas ADD COLUMN IF NOT EXISTS publicada_at timestamptz;
ALTER TABLE padrino_politicas ADD COLUMN IF NOT EXISTS soporte_ruta text;
ALTER TABLE padrino_politicas ALTER COLUMN vigente_desde DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'padrino_politicas_estado') THEN
    ALTER TABLE padrino_politicas ADD CONSTRAINT padrino_politicas_estado CHECK (estado IN ('borrador', 'publicada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'padrino_politicas_publicada_con_fecha') THEN
    ALTER TABLE padrino_politicas ADD CONSTRAINT padrino_politicas_publicada_con_fecha CHECK (estado = 'borrador' OR vigente_desde IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN padrino_politicas.parametros IS
  'Parámetros de la versión (esquemas y pagos por beneficiario, ventanas, listas, requisitos activos/bloqueantes). Los valida src/lib/padrino/politica.ts.';
COMMENT ON COLUMN padrino_politicas.estado IS
  'borrador (se edita, nunca rige) o publicada (rige entre vigente_desde y vigente_hasta; no se edita).';

-- v2: sus parámetros, equivalentes a lo que hacía el código. Antes del
-- trigger, que después impide tocar una versión publicada.
UPDATE padrino_politicas
SET parametros = $v2${
  "esquemas": {
    "A": {
      "nombre": "Con experiencia",
      "condicion": "Experiencia certificada en transporte público urbano de Barranquilla",
      "aplica_a": "nuevo_con_experiencia",
      "requiere_certificado": true,
      "hitos": [
        {
          "numero": 1,
          "meses": 1,
          "descripcion": "Mes 1 de permanencia",
          "pagos": {
            "padrino": 150000,
            "referido": 0
          },
          "requiere_desempeno": false
        },
        {
          "numero": 2,
          "meses": 2,
          "descripcion": "Mes 2 de permanencia",
          "pagos": {
            "padrino": 200000,
            "referido": 0
          },
          "requiere_desempeno": false
        },
        {
          "numero": 3,
          "meses": 3,
          "descripcion": "Mes 3 de permanencia",
          "pagos": {
            "padrino": 350000,
            "referido": 0
          },
          "requiere_desempeno": false
        }
      ]
    },
    "B": {
      "nombre": "Sin experiencia",
      "condicion": "Sin experiencia en transporte urbano, o experiencia en otras ciudades",
      "aplica_a": "nuevo_sin_experiencia",
      "requiere_certificado": false,
      "hitos": [
        {
          "numero": 1,
          "meses": 1,
          "descripcion": "Cumplido mes 1",
          "pagos": {
            "padrino": 100000,
            "referido": 0
          },
          "requiere_desempeno": false
        },
        {
          "numero": 2,
          "meses": 3,
          "descripcion": "3 meses de permanencia continua y desempeño satisfactorio",
          "pagos": {
            "padrino": 100000,
            "referido": 0
          },
          "requiere_desempeno": true
        }
      ]
    }
  },
  "padrino": {
    "modo_empleados": "lista_blanca",
    "antiguedad_minima_meses": 0,
    "ventana_sanciones_meses": 6,
    "ventana_faltas_graves_meses": 6,
    "accidente_grave": {
      "responsabilidad": [
        "directo"
      ],
      "niveles": [
        "III",
        "IV"
      ]
    },
    "revisar_faltas_sin_fuente": false,
    "excluidos": {
      "areas": [],
      "cargos": []
    },
    "debe_seguir_activo_para_cobrar": true,
    "referido_conserva_si_padrino_se_retira": true
  },
  "referido": {
    "categorias_licencia": [
      "C2",
      "C3"
    ],
    "ventana_hoja_vida_meses": 12,
    "reintegro": {
      "activo": false,
      "meses_minimos_fuera": 0,
      "tipos_causa_permitidos": [
        "voluntario",
        "empresa",
        "otro"
      ],
      "causas_que_excluyen": [],
      "nunca_esquema": []
    }
  },
  "requisitos": {
    "P1": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "P2": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "P3": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "P4": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "P5": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "P6": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R1": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R2": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R3": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R4": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R5": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R6": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R7": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R8": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R9": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R10": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R11": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R12": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    }
  }
}$v2$::jsonb
WHERE version = 'v2' AND parametros IS NULL;

-- v3: borrador, sin fecha de vigencia. `esquemas` (la columna vieja) lleva
-- el total de cada hito (padrino + referido) solo como referencia: manda
-- `parametros`.
INSERT INTO padrino_politicas (version, vigente_desde, esquemas, parametros, estado, aprobada_por, soporte)
VALUES (
  'v3',
  NULL,
  $esq${
    "A": {"nombre": "Con experiencia (nuevo)", "condicion": "Nunca ha trabajado en la empresa y tiene experiencia certificada en transporte público urbano de Barranquilla",
          "hitos": [{"numero": 1, "meses": 1, "valor": 100000, "descripcion": "Cumplido mes 1"},
                    {"numero": 2, "meses": 2, "valor": 300000, "descripcion": "Cumplido mes 2"},
                    {"numero": 3, "meses": 3, "valor": 300000, "descripcion": "Cumplido mes 3"}]},
    "B": {"nombre": "Sin experiencia", "condicion": "Sin experiencia en transporte público urbano, o con experiencia solo en otras ciudades",
          "hitos": [{"numero": 1, "meses": 1, "valor": 100000, "descripcion": "Cumplido mes 1"},
                    {"numero": 2, "meses": 3, "valor": 100000, "descripcion": "Cumplido mes 3"}]},
    "C": {"nombre": "Reintegro", "condicion": "Extrabajador con 6 meses o más por fuera, retiro voluntario y sin pago previo de padrino",
          "hitos": [{"numero": 1, "meses": 1, "valor": 200000, "descripcion": "Cumplido mes 1"},
                    {"numero": 2, "meses": 3, "valor": 200000, "descripcion": "Cumplido mes 3"}]}
  }$esq$::jsonb,
  $v3${
  "esquemas": {
    "A": {
      "nombre": "Con experiencia (nuevo)",
      "condicion": "Nunca ha trabajado en la empresa y tiene experiencia certificada en transporte público urbano de Barranquilla",
      "aplica_a": "nuevo_con_experiencia",
      "requiere_certificado": true,
      "hitos": [
        {
          "numero": 1,
          "meses": 1,
          "descripcion": "Cumplido mes 1",
          "pagos": {
            "padrino": 100000,
            "referido": 0
          },
          "requiere_desempeno": false
        },
        {
          "numero": 2,
          "meses": 2,
          "descripcion": "Cumplido mes 2",
          "pagos": {
            "padrino": 200000,
            "referido": 100000
          },
          "requiere_desempeno": false
        },
        {
          "numero": 3,
          "meses": 3,
          "descripcion": "Cumplido mes 3",
          "pagos": {
            "padrino": 200000,
            "referido": 100000
          },
          "requiere_desempeno": false
        }
      ]
    },
    "B": {
      "nombre": "Sin experiencia",
      "condicion": "Sin experiencia en transporte público urbano, o con experiencia solo en otras ciudades",
      "aplica_a": "nuevo_sin_experiencia",
      "requiere_certificado": false,
      "hitos": [
        {
          "numero": 1,
          "meses": 1,
          "descripcion": "Cumplido mes 1",
          "pagos": {
            "padrino": 100000,
            "referido": 0
          },
          "requiere_desempeno": false
        },
        {
          "numero": 2,
          "meses": 3,
          "descripcion": "Cumplido mes 3",
          "pagos": {
            "padrino": 100000,
            "referido": 0
          },
          "requiere_desempeno": false
        }
      ]
    },
    "C": {
      "nombre": "Reintegro",
      "condicion": "Extrabajador con 6 meses o más por fuera, retiro voluntario y sin pago previo de padrino",
      "aplica_a": "reintegro",
      "requiere_certificado": false,
      "hitos": [
        {
          "numero": 1,
          "meses": 1,
          "descripcion": "Cumplido mes 1",
          "pagos": {
            "padrino": 100000,
            "referido": 100000
          },
          "requiere_desempeno": false
        },
        {
          "numero": 2,
          "meses": 3,
          "descripcion": "Cumplido mes 3",
          "pagos": {
            "padrino": 100000,
            "referido": 100000
          },
          "requiere_desempeno": false
        }
      ]
    }
  },
  "padrino": {
    "modo_empleados": "excluidos",
    "antiguedad_minima_meses": 3,
    "ventana_sanciones_meses": 12,
    "ventana_faltas_graves_meses": 12,
    "accidente_grave": {
      "responsabilidad": [
        "directo"
      ],
      "niveles": [
        "III",
        "IV"
      ]
    },
    "revisar_faltas_sin_fuente": true,
    "excluidos": {
      "areas": [
        "RECURSOS HUMANOS",
        "RRHH"
      ],
      "cargos": []
    },
    "debe_seguir_activo_para_cobrar": true,
    "referido_conserva_si_padrino_se_retira": true
  },
  "referido": {
    "categorias_licencia": [
      "C2",
      "C3"
    ],
    "ventana_hoja_vida_meses": 6,
    "reintegro": {
      "activo": true,
      "meses_minimos_fuera": 6,
      "tipos_causa_permitidos": [
        "voluntario"
      ],
      "causas_que_excluyen": [
        "JUSTA_CAUSA"
      ],
      "nunca_esquema": [
        "A"
      ]
    }
  },
  "requisitos": {
    "P1": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "P2": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "P3": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "P4": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "P5": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "P6": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R1": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R2": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R3": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R4": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R5": {
      "activo": false,
      "bloquea": true,
      "momento": "registro"
    },
    "R6": {
      "activo": true,
      "bloquea": false,
      "momento": "contratacion"
    },
    "R7": {
      "activo": true,
      "bloquea": false,
      "momento": "contratacion"
    },
    "R8": {
      "activo": true,
      "bloquea": false,
      "momento": "contratacion"
    },
    "R9": {
      "activo": true,
      "bloquea": false,
      "momento": "contratacion"
    },
    "R10": {
      "activo": true,
      "bloquea": false,
      "momento": "registro"
    },
    "R11": {
      "activo": true,
      "bloquea": true,
      "momento": "registro"
    },
    "R12": {
      "activo": true,
      "bloquea": false,
      "momento": "registro"
    }
  }
}$v3$::jsonb,
  'borrador',
  NULL,
  'Política Plan Padrino - ACTUALIZADO (2026-11-03). Pendiente: fecha de vigencia, aprobación de Gerencia y lista de excluidos de Gestión Humana.'
)
ON CONFLICT (version) DO NOTHING;

-- Una versión publicada no se edita ni se borra. Solo se permite:
--  · publicar un borrador (borrador → publicada), y
--  · cerrar su vigencia una vez (vigente_hasta de NULL a una fecha), que es lo
--    que hace la publicación de la siguiente versión.
CREATE OR REPLACE FUNCTION padrino_politicas_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado = 'publicada' THEN
      RAISE EXCEPTION 'La versión % de la política Plan Padrino está publicada y no se puede borrar.', OLD.version;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.estado = 'publicada' THEN
    IF NEW.estado IS DISTINCT FROM OLD.estado
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.vigente_desde IS DISTINCT FROM OLD.vigente_desde
       OR NEW.esquemas IS DISTINCT FROM OLD.esquemas
       OR NEW.parametros IS DISTINCT FROM OLD.parametros
       OR NEW.aprobada_por IS DISTINCT FROM OLD.aprobada_por
       OR NEW.soporte IS DISTINCT FROM OLD.soporte
       OR NEW.soporte_ruta IS DISTINCT FROM OLD.soporte_ruta
       OR NEW.publicada_por_email IS DISTINCT FROM OLD.publicada_por_email
       OR NEW.publicada_at IS DISTINCT FROM OLD.publicada_at
       OR (NEW.vigente_hasta IS DISTINCT FROM OLD.vigente_hasta AND OLD.vigente_hasta IS NOT NULL) THEN
      RAISE EXCEPTION 'La versión % de la política Plan Padrino está publicada: para cambiarla cree una versión nueva. Solo se puede cerrar su vigencia.', OLD.version;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_padrino_politicas_inmutable ON padrino_politicas;
CREATE TRIGGER trg_padrino_politicas_inmutable
  BEFORE UPDATE OR DELETE ON padrino_politicas
  FOR EACH ROW EXECUTE FUNCTION padrino_politicas_inmutable();

-- ── 2. padrino_referidos ────────────────────────────────────────────────────

ALTER TABLE padrino_referidos DROP CONSTRAINT IF EXISTS padrino_referidos_esquema;
ALTER TABLE padrino_referidos ADD CONSTRAINT padrino_referidos_esquema CHECK (esquema IN ('A', 'B', 'C'));

ALTER TABLE padrino_referidos ADD COLUMN IF NOT EXISTS tipo_ingreso text;
ALTER TABLE padrino_referidos ADD COLUMN IF NOT EXISTS meses_fuera int;
ALTER TABLE padrino_referidos ADD COLUMN IF NOT EXISTS sin_bonificacion_motivo text;
-- Al contratar se reevalúan los requisitos que se verifican en ese momento.
ALTER TABLE padrino_referidos ADD COLUMN IF NOT EXISTS validacion_contratacion jsonb;
-- Si un requisito bloqueante no se cumple al contratar, no se crean hitos y aquí queda por qué.
ALTER TABLE padrino_referidos ADD COLUMN IF NOT EXISTS hitos_bloqueados_motivo text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'padrino_referidos_tipo_ingreso') THEN
    ALTER TABLE padrino_referidos ADD CONSTRAINT padrino_referidos_tipo_ingreso CHECK (tipo_ingreso IS NULL OR tipo_ingreso IN ('nuevo', 'reintegro'));
  END IF;
END $$;

COMMENT ON COLUMN padrino_referidos.sin_bonificacion_motivo IS
  'Si el ingreso no da derecho a bonificación (p. ej. reintegro de menos de 6 meses), por qué. No se crean hitos.';

-- ── 3. padrino_hitos: una fila por beneficiario ─────────────────────────────

ALTER TABLE padrino_hitos ADD COLUMN IF NOT EXISTS beneficiario text NOT NULL DEFAULT 'padrino';
ALTER TABLE padrino_hitos ADD COLUMN IF NOT EXISTS cedula_beneficiario text;
ALTER TABLE padrino_hitos ADD COLUMN IF NOT EXISTS nombre_beneficiario text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'padrino_hitos_beneficiario') THEN
    ALTER TABLE padrino_hitos ADD CONSTRAINT padrino_hitos_beneficiario CHECK (beneficiario IN ('padrino', 'referido'));
  END IF;
END $$;

-- Los hitos de hoy son todos del padrino.
UPDATE padrino_hitos h
SET cedula_beneficiario = r.cedula_padrino,
    nombre_beneficiario = r.nombre_padrino
FROM padrino_referidos r
WHERE r.id = h.referido_id
  AND h.beneficiario = 'padrino'
  AND h.cedula_beneficiario IS NULL;

ALTER TABLE padrino_hitos DROP CONSTRAINT IF EXISTS padrino_hitos_unico;
ALTER TABLE padrino_hitos ADD CONSTRAINT padrino_hitos_unico UNIQUE (referido_id, numero, beneficiario);

COMMENT ON COLUMN padrino_hitos.beneficiario IS
  'A quién se le paga: padrino o referido (desde la v3 de la política también se paga al referido).';

-- ── 4. padrino_pagos_historicos ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS padrino_pagos_historicos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula      text NOT NULL,
  anio        int,
  valor       numeric(14, 2),
  -- De dónde salió el dato (p. ej. «Nómina 2026-11, listado de GH»), para poder reversar una carga.
  fuente      text NOT NULL,
  cargado_por_email text,
  cargado_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_padrino_pagos_historicos_cedula ON padrino_pagos_historicos (cedula);
ALTER TABLE padrino_pagos_historicos ENABLE ROW LEVEL SECURITY;
GRANT ALL ON padrino_pagos_historicos TO service_role;

COMMENT ON TABLE padrino_pagos_historicos IS
  'Cédulas por las que ya se pagó Plan Padrino antes de Gestivo. La política solo paga una vez por cédula (R11). Datos personales: solo service_role.';

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT version, estado, vigente_desde, vigente_hasta, parametros IS NOT NULL AS con_parametros
FROM padrino_politicas ORDER BY created_at;
SELECT beneficiario, count(*) AS hitos, count(*) FILTER (WHERE cedula_beneficiario IS NULL) AS sin_cedula
FROM padrino_hitos GROUP BY beneficiario;
