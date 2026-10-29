-- modulo de recobros fase 1 solicitud estados gestiones y correcciones
--
-- Contexto: Tesorería pidió (28-oct-2026) seguir cada recobro de principio a
-- fin: solicitud, revisión, decisión de subgerencia cuando la cámara no tiene
-- conteo, gestión diaria de los cajeros hasta el pago y liquidación
-- definitiva si el conductor se retira. Exige además que ninguna gestión se
-- edite ni se borre: si hay un error, se registra otra.
--
-- Se amplían las tablas que ya están en producción (Revisión del día,
-- Mantenimiento, Caja y la alarma ya las leen) en vez de crear otras:
--   · tesoreria_camaras_solicitudes: tipo (cámara | cartulina), origen (abono
--     de GEMA, cartulina, Mantenimiento), toma de la revisión, conteo y valor
--     calculados, decisión de subgerencia, incobrable con quién lo autorizó en
--     subgerencia, y liquidación definitiva.
--   · tesoreria_camaras_recobro_gestiones: resultado del catálogo, fecha de
--     compromiso, valor recibido; pasa a ser de solo inserción.
--   · tesoreria_recobro_resultados: catálogo de resultados (Tesorería agrega más).
--   · tesoreria_recobro_correcciones: toda corrección la valida el director de
--     Mantenimiento; lo corregido nunca se sobrescribe.
--
-- Rescate: Mantenimiento registró 11 revisiones «camara_recobro» con conteo
-- de cámara y sin solicitud (13 al 21-oct): nunca llegaron a caja. Se les crea
-- su solicitud con el valor calculado. Las solicitudes resueltas como recobro
-- se completan con el conteo si existe un «camara_recobro» del mismo viaje.
-- Las que no tienen conteo quedan marcadas (alerta) y pasan a «sin_conteo»
-- en la migración de la fase 5, cuando subgerencia ya pueda decidir: hacerlo
-- ahora las sacaría de la pantalla actual de caja sin que nadie las resuelva.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).

BEGIN;

-- ── 1. Catálogo de resultados de la gestión ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tesoreria_recobro_resultados (
  clave TEXT PRIMARY KEY CHECK (clave ~ '^[a-z0-9_]{2,40}$'),
  nombre TEXT NOT NULL UNIQUE CHECK (length(trim(nombre)) BETWEEN 2 AND 80),
  exige_compromiso BOOLEAN NOT NULL DEFAULT false,
  exige_valor BOOLEAN NOT NULL DEFAULT false,
  exige_observacion BOOLEAN NOT NULL DEFAULT true,
  exige_autorizado_por BOOLEAN NOT NULL DEFAULT false,
  -- Cierra el recobro (Pagó completo): exige el saldo exacto y el cargue en GEMA.
  cierra BOOLEAN NOT NULL DEFAULT false,
  registra TEXT NOT NULL DEFAULT 'caja' CHECK (registra IN ('caja', 'operativo')),
  es_sistema BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tesoreria_recobro_resultados IS
  'Resultados de la gestión de cobro de un recobro (lista del requerimiento de Tesorería). Los de sistema no se renombran: las reglas de la app usan su clave.';

INSERT INTO tesoreria_recobro_resultados
  (clave, nombre, exige_compromiso, exige_valor, exige_observacion, exige_autorizado_por, cierra, registra, es_sistema, orden) VALUES
  ('notificado',            'Se le notificó el recobro',  false, false, true,  false, false, 'caja',      true, 10),
  ('no_vino',               'No vino a trabajar',         false, false, true,  false, false, 'caja',      true, 20),
  ('pidio_plazo',           'Pidió plazo de pago',        true,  false, true,  false, false, 'caja',      true, 30),
  ('no_pago_comprometido',  'No pagó lo comprometido',    false, false, true,  false, false, 'caja',      true, 40),
  ('acuerdo_operativo',     'Acuerdo con Operativo',      true,  false, true,  true,  false, 'caja',      true, 50),
  ('abono_parcial',         'Abono parcial',              false, true,  true,  false, false, 'caja',      true, 60),
  ('no_esta_de_acuerdo',    'No está de acuerdo',         false, false, true,  false, false, 'caja',      true, 70),
  ('pago_completo',         'Pagó completo',              false, true,  false, false, true,  'caja',      true, 80),
  ('otro',                  'Otro',                       false, false, true,  false, false, 'caja',      true, 90),
  ('instruccion_operativo', 'Instrucción de Operativo',   false, false, true,  false, false, 'operativo', true, 100)
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE tesoreria_recobro_resultados ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tesoreria_recobro_resultados TO service_role;

-- ── 2. La solicitud ──────────────────────────────────────────────────────────
ALTER TABLE tesoreria_camaras_solicitudes
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'camara',
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'cartulina',
  ADD COLUMN IF NOT EXISTS motivo_solicitud TEXT,
  -- Abono «REVISIÓN CÁMARA» de GEMA que originó la solicitud (fase 2).
  ADD COLUMN IF NOT EXISTS abono_id BIGINT,
  ADD COLUMN IF NOT EXISTS abono_fecha DATE,
  ADD COLUMN IF NOT EXISTS anulada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anulada_motivo TEXT,
  ADD COLUMN IF NOT EXISTS tomado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS tomado_at TIMESTAMPTZ,
  -- Instantánea del cálculo, fijada al resolver (no cambia si GEMA reprocesa).
  ADD COLUMN IF NOT EXISTS timbradas_registradora INTEGER,
  ADD COLUMN IF NOT EXISTS conteo_camara INTEGER,
  ADD COLUMN IF NOT EXISTS conteo_revision_id UUID REFERENCES camaras_revisiones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS diferencia INTEGER,
  ADD COLUMN IF NOT EXISTS pasaje NUMERIC(12, 0),
  ADD COLUMN IF NOT EXISTS pasaje_fuente TEXT,
  ADD COLUMN IF NOT EXISTS valor_recobro NUMERIC(14, 0),
  -- Suma de lo recibido en las gestiones (con correcciones aprobadas); la mantiene la acción.
  ADD COLUMN IF NOT EXISTS valor_recibido NUMERIC(14, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subgerencia_decision TEXT,
  ADD COLUMN IF NOT EXISTS subgerencia_nota TEXT,
  ADD COLUMN IF NOT EXISTS subgerencia_por_email TEXT,
  ADD COLUMN IF NOT EXISTS subgerencia_at TIMESTAMPTZ,
  -- Incobrable: lo autoriza subgerencia por fuera de Gestivo y la directora de
  -- Tesorería lo registra (incobrable_autorizado_por_email pasa a ser quién lo registró).
  ADD COLUMN IF NOT EXISTS incobrable_autoriza_nombre TEXT,
  ADD COLUMN IF NOT EXISTS incobrable_autoriza_fecha DATE,
  ADD COLUMN IF NOT EXISTS incobrable_soporte TEXT,
  ADD COLUMN IF NOT EXISTS liquidacion_marcada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS liquidacion_marcada_por_email TEXT,
  ADD COLUMN IF NOT EXISTS liquidacion_concepto TEXT,
  ADD COLUMN IF NOT EXISTS liquidacion_valor_descontado NUMERIC(14, 0),
  ADD COLUMN IF NOT EXISTS liquidacion_soporte TEXT,
  ADD COLUMN IF NOT EXISTS liquidacion_nota TEXT,
  ADD COLUMN IF NOT EXISTS liquidacion_por_email TEXT,
  ADD COLUMN IF NOT EXISTS liquidacion_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gema_cargue_confirmado_por_email TEXT,
  ADD COLUMN IF NOT EXISTS gema_cargue_confirmado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alertas TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE tesoreria_camaras_solicitudes DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_resultado_check;
ALTER TABLE tesoreria_camaras_solicitudes ADD CONSTRAINT tesoreria_camaras_solicitudes_resultado_check
  CHECK (resultado IS NULL OR resultado IN ('recobro', 'normalidad_timbradas', 'sin_conteo'));

ALTER TABLE tesoreria_camaras_solicitudes DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_recobros_check;
ALTER TABLE tesoreria_camaras_solicitudes ADD CONSTRAINT tesoreria_camaras_solicitudes_recobros_check CHECK (
  tipo IN ('camara', 'cartulina')
  AND origen IN ('abono_gema', 'cartulina', 'mantenimiento', 'migracion')
  AND (origen <> 'abono_gema' OR (abono_id IS NOT NULL AND abono_fecha IS NOT NULL))
  AND (motivo_solicitud IS NULL OR length(motivo_solicitud) <= 200)
  AND (anulada_motivo IS NULL OR length(anulada_motivo) <= 300)
  AND (conteo_camara IS NULL OR conteo_camara >= 0)
  AND (pasaje IS NULL OR pasaje > 0)
  AND (pasaje_fuente IS NULL OR pasaje_fuente IN ('gema', 'tarifa'))
  AND (valor_recobro IS NULL OR valor_recobro >= 0)
  AND valor_recibido >= 0
  AND (subgerencia_decision IS NULL OR (subgerencia_decision IN ('cobrar', 'no_cobrar') AND resultado = 'sin_conteo'
       AND length(trim(coalesce(subgerencia_nota, ''))) BETWEEN 1 AND 500
       AND subgerencia_por_email IS NOT NULL AND subgerencia_at IS NOT NULL))
  AND (incobrable_autoriza_nombre IS NULL OR length(incobrable_autoriza_nombre) <= 120)
  AND (incobrable_soporte IS NULL OR length(incobrable_soporte) <= 200)
  AND (liquidacion_concepto IS NULL OR liquidacion_concepto IN ('descontado_total', 'descontado_parcial', 'no_descontable', 'otro'))
  AND (liquidacion_valor_descontado IS NULL OR liquidacion_valor_descontado >= 0)
  AND (liquidacion_nota IS NULL OR length(liquidacion_nota) <= 500)
);

-- El cobro admite ahora el recobro sin conteo que subgerencia decidió cobrar
-- y el cierre por liquidación definitiva. Las dos ramas viejas no cambian.
ALTER TABLE tesoreria_camaras_solicitudes DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_cobro_check;
ALTER TABLE tesoreria_camaras_solicitudes ADD CONSTRAINT tesoreria_camaras_solicitudes_cobro_check CHECK (
  cobro_estado IS NULL
  OR ((resultado = 'recobro' OR (resultado = 'sin_conteo' AND subgerencia_decision = 'cobrar'))
      AND (
        (cobro_estado = 'cobrado'
          AND cobro_valor > 0
          AND cobro_fecha IS NOT NULL
          AND length(trim(coalesce(cobro_soporte, ''))) BETWEEN 1 AND 100)
        OR (cobro_estado = 'incobrable'
          AND length(trim(coalesce(incobrable_motivo, ''))) BETWEEN 1 AND 500
          AND incobrable_autorizado_por_email IS NOT NULL
          AND incobrable_autorizado_at IS NOT NULL)
        OR (cobro_estado = 'liquidacion_definitiva'
          AND liquidacion_concepto IS NOT NULL
          AND liquidacion_valor_descontado IS NOT NULL
          AND length(trim(coalesce(liquidacion_soporte, ''))) BETWEEN 1 AND 100
          AND liquidacion_por_email IS NOT NULL
          AND liquidacion_at IS NOT NULL)))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tes_cam_solic_abono
  ON tesoreria_camaras_solicitudes (abono_id) WHERE abono_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tes_cam_solic_numero ON tesoreria_camaras_solicitudes (numero);
CREATE INDEX IF NOT EXISTS idx_tes_cam_solic_conductor ON tesoreria_camaras_solicitudes (conductor_cedula);

-- ── 3. Gestiones: catálogo, compromiso, valor y solo inserción ───────────────
ALTER TABLE tesoreria_camaras_recobro_gestiones
  ADD COLUMN IF NOT EXISTS resultado TEXT REFERENCES tesoreria_recobro_resultados(clave),
  ADD COLUMN IF NOT EXISTS compromiso_fecha DATE,
  ADD COLUMN IF NOT EXISTS valor_recibido NUMERIC(14, 0),
  ADD COLUMN IF NOT EXISTS autorizado_por TEXT,
  ADD COLUMN IF NOT EXISTS observacion TEXT,
  ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL DEFAULT 'caja',
  ADD COLUMN IF NOT EXISTS gema_cargue_confirmado BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tesoreria_camaras_recobro_gestiones DROP CONSTRAINT IF EXISTS tesoreria_camaras_recobro_gestiones_recobros_check;
ALTER TABLE tesoreria_camaras_recobro_gestiones ADD CONSTRAINT tesoreria_camaras_recobro_gestiones_recobros_check CHECK (
  (compromiso_fecha IS NULL OR compromiso_fecha >= fecha)
  AND (valor_recibido IS NULL OR valor_recibido > 0)
  AND (autorizado_por IS NULL OR length(autorizado_por) <= 120)
  AND (observacion IS NULL OR length(observacion) <= 500)
  AND rol IN ('caja', 'operativo', 'directora', 'sistema')
);

-- Las gestiones viejas (texto libre) quedan como «Otro» con su texto.
-- Va antes del trigger de solo inserción; al repetir el script no toca filas.
UPDATE tesoreria_camaras_recobro_gestiones
   SET resultado = 'otro', observacion = gestion
 WHERE resultado IS NULL;

CREATE OR REPLACE FUNCTION tesoreria_recobro_gestiones_solo_insercion()
RETURNS trigger
LANGUAGE plpgsql
AS $gestiones$
BEGIN
  RAISE EXCEPTION 'Las gestiones de recobros no se editan ni se borran: registre una gestión nueva que corrija.';
END
$gestiones$;

DROP TRIGGER IF EXISTS trg_recobro_gestiones_solo_insercion ON tesoreria_camaras_recobro_gestiones;
CREATE TRIGGER trg_recobro_gestiones_solo_insercion
  BEFORE UPDATE OR DELETE ON tesoreria_camaras_recobro_gestiones
  FOR EACH ROW EXECUTE FUNCTION tesoreria_recobro_gestiones_solo_insercion();

-- Borrar una solicitud ya no se lleva por delante su historial.
ALTER TABLE tesoreria_camaras_recobro_gestiones DROP CONSTRAINT IF EXISTS tesoreria_camaras_recobro_gestiones_solicitud_id_fkey;
ALTER TABLE tesoreria_camaras_recobro_gestiones ADD CONSTRAINT tesoreria_camaras_recobro_gestiones_solicitud_id_fkey
  FOREIGN KEY (solicitud_id) REFERENCES tesoreria_camaras_solicitudes(id) ON DELETE RESTRICT;
ALTER TABLE tesoreria_camaras_solicitudes_eventos DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_eventos_solicitud_id_fkey;
ALTER TABLE tesoreria_camaras_solicitudes_eventos ADD CONSTRAINT tesoreria_camaras_solicitudes_eventos_solicitud_id_fkey
  FOREIGN KEY (solicitud_id) REFERENCES tesoreria_camaras_solicitudes(id) ON DELETE RESTRICT;

-- ── 4. Correcciones (las valida el director de Mantenimiento) ────────────────
CREATE TABLE IF NOT EXISTS tesoreria_recobro_correcciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id UUID NOT NULL REFERENCES tesoreria_camaras_solicitudes(id) ON DELETE RESTRICT,
  campo TEXT NOT NULL CHECK (campo IN ('conteo_camara', 'resultado', 'diferencia', 'valor_recibido')),
  -- La gestión cuyo valor recibido se corrige (solo campo = valor_recibido).
  gestion_id UUID REFERENCES tesoreria_camaras_recobro_gestiones(id) ON DELETE RESTRICT,
  valor_anterior TEXT,
  valor_nuevo TEXT NOT NULL,
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) BETWEEN 1 AND 500),
  solicitado_por_email TEXT NOT NULL,
  solicitado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision TEXT CHECK (decision IS NULL OR decision IN ('aprobada', 'rechazada')),
  decision_nota TEXT CHECK (decision_nota IS NULL OR length(decision_nota) <= 500),
  decidido_por_email TEXT,
  decidido_at TIMESTAMPTZ,
  CHECK ((campo = 'valor_recibido') = (gestion_id IS NOT NULL)),
  CHECK (decision IS NULL OR (decidido_por_email IS NOT NULL AND decidido_at IS NOT NULL)),
  CHECK (decision IS DISTINCT FROM 'rechazada' OR length(trim(coalesce(decision_nota, ''))) >= 1)
);

COMMENT ON TABLE tesoreria_recobro_correcciones IS
  'Correcciones de un recobro (conteo, resultado, diferencia o valor recibido). Las aprueba o rechaza el director de Mantenimiento; una decidida no se edita y ninguna se borra.';

-- Una sola corrección pendiente por recobro y campo (y gestión).
CREATE UNIQUE INDEX IF NOT EXISTS uq_recobro_correccion_pendiente
  ON tesoreria_recobro_correcciones (solicitud_id, campo, coalesce(gestion_id::text, ''))
  WHERE decision IS NULL;
CREATE INDEX IF NOT EXISTS idx_recobro_correcciones_solicitud
  ON tesoreria_recobro_correcciones (solicitud_id, solicitado_at);

CREATE OR REPLACE FUNCTION tesoreria_recobro_correcciones_inmutable()
RETURNS trigger
LANGUAGE plpgsql
AS $correcciones$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las correcciones de recobros no se borran.';
  END IF;
  IF OLD.decision IS NOT NULL THEN
    RAISE EXCEPTION 'La corrección ya fue decidida y no se edita.';
  END IF;
  IF (NEW.solicitud_id, NEW.campo, NEW.gestion_id, NEW.valor_anterior, NEW.valor_nuevo, NEW.motivo,
      NEW.solicitado_por_email, NEW.solicitado_at)
     IS DISTINCT FROM
     (OLD.solicitud_id, OLD.campo, OLD.gestion_id, OLD.valor_anterior, OLD.valor_nuevo, OLD.motivo,
      OLD.solicitado_por_email, OLD.solicitado_at) THEN
    RAISE EXCEPTION 'De una corrección solo se registra la decisión.';
  END IF;
  RETURN NEW;
END
$correcciones$;

DROP TRIGGER IF EXISTS trg_recobro_correcciones_inmutable ON tesoreria_recobro_correcciones;
CREATE TRIGGER trg_recobro_correcciones_inmutable
  BEFORE UPDATE OR DELETE ON tesoreria_recobro_correcciones
  FOR EACH ROW EXECUTE FUNCTION tesoreria_recobro_correcciones_inmutable();

ALTER TABLE tesoreria_recobro_correcciones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tesoreria_recobro_correcciones TO service_role;

-- ── 5. Línea de tiempo: acciones nuevas ──────────────────────────────────────
ALTER TABLE tesoreria_camaras_solicitudes_eventos
  DROP CONSTRAINT IF EXISTS tesoreria_camaras_solicitudes_eventos_accion_check;
ALTER TABLE tesoreria_camaras_solicitudes_eventos
  ADD CONSTRAINT tesoreria_camaras_solicitudes_eventos_accion_check CHECK (accion IN (
    'visto', 'cobro_registrado', 'cobro_corregido', 'migrado_a_seguimiento',
    'incobrable_solicitado', 'incobrable_autorizado', 'incobrable_rechazado', 'incobrable_reabierto',
    'solicitud_creada', 'solicitud_anulada', 'revision_tomada', 'revision_resuelta',
    'subgerencia_decidio', 'correccion_solicitada', 'correccion_aprobada', 'correccion_rechazada',
    'liquidacion_marcada', 'liquidacion_cerrada', 'pago_registrado', 'rescate_migracion'
  ));

-- ── 6. Rescate de los recobros con conteo que no llegaron a caja ─────────────
-- 6.1 Una solicitud por cada «camara_recobro» con conteo y sin solicitud.
INSERT INTO tesoreria_camaras_solicitudes (
  fecha_viaje, numero, placa, viaje, vehiculo_codigo, conductor_cedula, conductor_nombre, ruta,
  estado, solicitado_por_email, solicitado_at, nota_solicitud,
  resultado, nota_camaras, camaras_revision_id, resuelto_por_email, resuelto_at,
  tipo, origen
)
SELECT DISTINCT ON (r.despacho_numero)
       r.fecha_viaje, r.despacho_numero, h.placa,
       CASE WHEN r.viaje ~ '^[0-9]+$' THEN r.viaje::int END,
       r.vehiculo_codigo, coalesce(r.conductor_cedula, h.conductor_ced), coalesce(r.conductor_nombre, h.conductor),
       coalesce(nullif(trim(h.ruta_reprogramada), ''), h.ruta_programada),
       'resuelto', 'migracion 20261029184904', r.created_at,
       'Recobro registrado por Mantenimiento sin solicitud (rescate de la fase 1).',
       'recobro', r.observaciones, r.id, r.tecnico_email, r.created_at,
       'camara', 'mantenimiento'
  FROM camaras_revisiones r
  LEFT JOIN historico_despacho h ON h.numero = r.despacho_numero
 WHERE r.tipo_novedad = 'camara_recobro'
   AND r.eliminado_at IS NULL
   AND r.aforo IS NOT NULL
   AND r.despacho_numero IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM tesoreria_camaras_solicitudes s WHERE s.numero = r.despacho_numero)
 ORDER BY r.despacho_numero, r.created_at DESC
ON CONFLICT (fecha_viaje, numero) DO NOTHING;

INSERT INTO tesoreria_camaras_solicitudes_eventos (solicitud_id, accion, antes, despues, usuario_email)
SELECT s.id, 'rescate_migracion', NULL,
       jsonb_build_object('origen', 'mantenimiento', 'camaras_revision_id', s.camaras_revision_id),
       'migracion 20261029184904'
  FROM tesoreria_camaras_solicitudes s
 WHERE s.solicitado_por_email = 'migracion 20261029184904'
   AND NOT EXISTS (SELECT 1 FROM tesoreria_camaras_solicitudes_eventos e
                    WHERE e.solicitud_id = s.id AND e.accion = 'rescate_migracion');

-- 6.2 Conteo de cámara de todo recobro de cámara que no lo tenga: el
-- «camara_recobro» más reciente del mismo viaje.
WITH rev AS (
  SELECT DISTINCT ON (despacho_numero) despacho_numero, id, aforo
    FROM camaras_revisiones
   WHERE tipo_novedad = 'camara_recobro' AND eliminado_at IS NULL
     AND aforo IS NOT NULL AND despacho_numero IS NOT NULL
   ORDER BY despacho_numero, created_at DESC
)
UPDATE tesoreria_camaras_solicitudes s
   SET conteo_camara = rev.aforo, conteo_revision_id = rev.id
  FROM rev
 WHERE rev.despacho_numero = s.numero
   AND s.tipo = 'camara' AND s.resultado = 'recobro' AND s.conteo_camara IS NULL;

-- 6.3 Timbradas, pasaje, diferencia y valor. Pasaje de GEMA; si no lo trae,
-- la tarifa ($3.700, o $3.800 el domingo: los festivos los corrige la app).
WITH calc AS (
  SELECT s.id,
         h.timbradas,
         coalesce(nullif(v.pasaje, 0), CASE WHEN extract(isodow FROM s.fecha_viaje) = 7 THEN 3800 ELSE 3700 END) AS pasaje,
         CASE WHEN nullif(v.pasaje, 0) IS NULL THEN 'tarifa' ELSE 'gema' END AS fuente
    FROM tesoreria_camaras_solicitudes s
    LEFT JOIN historico_despacho h ON h.numero = s.numero
    LEFT JOIN viajes_recaudados v ON v.numero = s.numero
   WHERE s.tipo = 'camara' AND s.conteo_camara IS NOT NULL AND s.valor_recobro IS NULL
)
UPDATE tesoreria_camaras_solicitudes s
   SET timbradas_registradora = calc.timbradas,
       pasaje = calc.pasaje,
       pasaje_fuente = calc.fuente,
       diferencia = s.conteo_camara - calc.timbradas,
       valor_recobro = greatest(s.conteo_camara - calc.timbradas, 0) * calc.pasaje
  FROM calc
 WHERE calc.id = s.id AND calc.timbradas IS NOT NULL;

-- 6.4 Lo cobrado antes cuenta como recibido.
UPDATE tesoreria_camaras_solicitudes
   SET valor_recibido = cobro_valor
 WHERE cobro_estado = 'cobrado' AND cobro_valor IS NOT NULL AND valor_recibido = 0;

-- 6.5 Alertas para revisar a mano.
UPDATE tesoreria_camaras_solicitudes
   SET alertas = array_append(alertas, 'sin_conteo_camara')
 WHERE tipo = 'camara' AND resultado = 'recobro' AND conteo_camara IS NULL
   AND NOT ('sin_conteo_camara' = ANY (alertas));
UPDATE tesoreria_camaras_solicitudes
   SET alertas = array_append(alertas, 'diferencia_no_positiva')
 WHERE diferencia IS NOT NULL AND diferencia <= 0
   AND NOT ('diferencia_no_positiva' = ANY (alertas));
UPDATE tesoreria_camaras_solicitudes
   SET alertas = array_append(alertas, 'sin_timbradas_gema')
 WHERE conteo_camara IS NOT NULL AND timbradas_registradora IS NULL
   AND NOT ('sin_timbradas_gema' = ANY (alertas));

COMMIT;

-- Verificación:
-- SELECT origen, resultado, count(*), sum(diferencia), sum(valor_recobro)
--   FROM tesoreria_camaras_solicitudes GROUP BY 1, 2 ORDER BY 1, 2;
--   -- origen mantenimiento: 10 viajes rescatados (el 1857554 ya tenía solicitud
--   -- y solo se completó); entre los dos, 11 viajes con conteo, 94 timbradas y
--   -- $347.800 en octubre.
-- SELECT numero, fecha_viaje, conteo_camara, timbradas_registradora, diferencia, valor_recobro, alertas
--   FROM tesoreria_camaras_solicitudes WHERE resultado = 'recobro' ORDER BY fecha_viaje;
-- SELECT count(*) FROM tesoreria_camaras_recobro_gestiones WHERE resultado IS NULL;  -- 0
-- SELECT count(*) FROM tesoreria_recobro_resultados;                                 -- 10
