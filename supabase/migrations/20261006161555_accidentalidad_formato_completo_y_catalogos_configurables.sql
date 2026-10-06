-- accidentalidad formato completo y catalogos configurables
--
-- Contexto: la revisión del módulo con el coordinador operativo pidió que el
-- reporte siga el formato de investigación de accidentes que ya usa la
-- empresa: datos del vehículo propio e IPAT, hipótesis con los códigos de
-- tránsito, datos completos del tercero (conductor, propietario y vehículo),
-- lesionados o víctimas, agente de tránsito y cierre de la investigación.
-- Las ciudades, los códigos de tránsito, los tipos de vehículo y las
-- aseguradoras deben poder configurarse desde la aplicación, porque el módulo
-- podría usarse en otras ciudades o entidades; por eso viven en un catálogo y
-- no en el código.
--
-- Los cuatro factores fijos que alimentan el puntaje de la Política de
-- Correctivos (fact_*) se conservan: ahora se derivan de los códigos marcados
-- mediante `accidente_catalogos.factor_politica` (uso de celular no tiene
-- código de tránsito y sigue como casilla aparte).
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda.

-- ── Catálogos configurables ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accidente_catalogos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ciudad | factor | tipo_vehiculo | aseguradora
  tipo TEXT NOT NULL CHECK (tipo IN ('ciudad', 'factor', 'tipo_vehiculo', 'aseguradora')),
  codigo TEXT NOT NULL,
  label TEXT NOT NULL,
  -- Solo factores: grupo del código de tránsito
  -- (ciclista | conductor | vehiculo | via | peaton | pasajero).
  categoria TEXT,
  -- Solo factores: factor de la Política de Correctivos que activa el código.
  factor_politica TEXT CHECK (factor_politica IN ('exceso_velocidad', 'no_guardar_distancia', 'fatiga_comprobada', 'uso_celular')),
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tipo, codigo)
);

CREATE INDEX IF NOT EXISTS idx_accidente_catalogos_tipo ON accidente_catalogos(tipo, orden);

DROP TRIGGER IF EXISTS trg_accidente_catalogos_updated ON accidente_catalogos;
CREATE TRIGGER trg_accidente_catalogos_updated BEFORE UPDATE ON accidente_catalogos
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO accidente_catalogos (tipo, codigo, label, orden) VALUES
  ('ciudad', 'barranquilla', 'Barranquilla', 1),
  ('ciudad', 'soledad', 'Soledad', 2),
  ('aseguradora', 'allianz', 'Allianz', 1),
  ('tipo_vehiculo', 'automovil', 'Automóvil', 1),
  ('tipo_vehiculo', 'camioneta', 'Camioneta', 2),
  ('tipo_vehiculo', 'bus', 'Bus', 3),
  ('tipo_vehiculo', 'buseta', 'Buseta', 4),
  ('tipo_vehiculo', 'campero', 'Campero', 5),
  ('tipo_vehiculo', 'furgon', 'Furgón', 6),
  ('tipo_vehiculo', 'camion', 'Camión', 7),
  ('tipo_vehiculo', 'moto', 'Moto', 8),
  ('tipo_vehiculo', 'mula', 'Mula', 9),
  ('tipo_vehiculo', 'vans', 'Vans', 10),
  ('tipo_vehiculo', 'motocarro', 'Motocarro', 11),
  ('tipo_vehiculo', 'bicicleta', 'Bicicleta', 12),
  ('tipo_vehiculo', 'ambulancia', 'Ambulancia', 13),
  ('tipo_vehiculo', 'traccion_animal', 'Tracción animal', 14)
ON CONFLICT (tipo, codigo) DO NOTHING;

-- Códigos de hipótesis del Código Nacional de Tránsito (formato IPAT).
INSERT INTO accidente_catalogos (tipo, codigo, label, categoria, factor_politica, orden) VALUES
  ('factor', '090', 'Transportar otra persona o cosas', 'ciclista', NULL, 1),
  ('factor', '091', 'No conducir a horcajadas', 'ciclista', NULL, 2),
  ('factor', '092', 'No sujetar los manubrios', 'ciclista', NULL, 3),
  ('factor', '093', 'Transitar distante de la acera u orilla de la calzada', 'ciclista', NULL, 4),
  ('factor', '094', 'Circular por calzadas o carriles destinados a buses y busetas', 'ciclista', NULL, 5),
  ('factor', '095', 'Transitar uno al lado del otro', 'ciclista', NULL, 6),
  ('factor', '096', 'Sujetarse a otro vehículo', 'ciclista', NULL, 7),
  ('factor', '097', 'Transitar por vías prohibidas', 'ciclista', NULL, 8),
  ('factor', '098', 'Transitar entre vehículos', 'ciclista', NULL, 9),
  ('factor', '099', 'No hacer uso de señales reflectivas o luminosas', 'ciclista', NULL, 10),
  ('factor', '101', 'Adelantar en curva o en pendientes', 'conductor', NULL, 11),
  ('factor', '102', 'Adelantar por la derecha', 'conductor', NULL, 12),
  ('factor', '103', 'Adelantar cerrando', 'conductor', NULL, 13),
  ('factor', '104', 'Adelantar invadiendo carril de sentido contrario', 'conductor', NULL, 14),
  ('factor', '105', 'Adelantar en zona prohibida', 'conductor', NULL, 15),
  ('factor', '106', 'Adelantar invadiendo carril del mismo sentido en zigzag', 'conductor', NULL, 16),
  ('factor', '107', 'Aprovisionamiento indebido', 'conductor', NULL, 17),
  ('factor', '108', 'Carga sobresaliente sin señales', 'conductor', NULL, 18),
  ('factor', '109', 'Defectos físicos y psíquicos', 'conductor', NULL, 19),
  ('factor', '110', 'Exceso en horas de conducción', 'conductor', 'fatiga_comprobada', 20),
  ('factor', '111', 'Dejar obstáculos en la vía', 'conductor', NULL, 21),
  ('factor', '112', 'Desobedecer señales o normas de tránsito', 'conductor', NULL, 22),
  ('factor', '113', 'Desobedecer al agente', 'conductor', NULL, 23),
  ('factor', '114', 'Embriaguez aparente', 'conductor', NULL, 24),
  ('factor', '115', 'Embriaguez o sustancias alucinógenas', 'conductor', NULL, 25),
  ('factor', '116', 'Exceso de velocidad', 'conductor', 'exceso_velocidad', 26),
  ('factor', '117', 'Explosivos o similares con pasajeros', 'conductor', NULL, 27),
  ('factor', '118', 'Falta de mantenimiento mecánico', 'conductor', NULL, 28),
  ('factor', '119', 'Frenar bruscamente', 'conductor', NULL, 29),
  ('factor', '120', 'Pasajeros obstruyendo el conductor o sobrecupo', 'conductor', NULL, 30),
  ('factor', '121', 'No mantener distancia de seguridad', 'conductor', 'no_guardar_distancia', 31),
  ('factor', '122', 'Girar bruscamente', 'conductor', NULL, 32),
  ('factor', '123', 'No respetar prelación de intersecciones o giros', 'conductor', NULL, 33),
  ('factor', '124', 'No cambiar luces', 'conductor', NULL, 34),
  ('factor', '125', 'Estacionar sin seguridad', 'conductor', NULL, 35),
  ('factor', '126', 'Falta de prevención ante animales en la vía', 'conductor', NULL, 36),
  ('factor', '127', 'Transitar en contravía', 'conductor', NULL, 37),
  ('factor', '128', 'Recoger o dejar pasajeros sobre la calzada', 'conductor', NULL, 38),
  ('factor', '129', 'Transportar pasajeros en la parte exterior', 'conductor', NULL, 39),
  ('factor', '130', 'Transitar sin luces', 'conductor', NULL, 40),
  ('factor', '131', 'Salirse de la calzada', 'conductor', NULL, 41),
  ('factor', '132', 'No respetar prelación', 'conductor', NULL, 42),
  ('factor', '133', 'Subirse al andén o vías peatonales', 'conductor', NULL, 43),
  ('factor', '134', 'Reverso imprudente', 'conductor', NULL, 44),
  ('factor', '135', 'Remolque sin precaución', 'conductor', NULL, 45),
  ('factor', '136', 'Incendio por reparación indebida', 'conductor', NULL, 46),
  ('factor', '137', 'Falta de señales en vehículo varado', 'conductor', NULL, 47),
  ('factor', '138', 'Falta de precaución por niebla, lluvia o humo', 'conductor', NULL, 48),
  ('factor', '139', 'Impericia en el manejo', 'conductor', NULL, 49),
  ('factor', '140', 'Transitar sin los dispositivos luminosos de detención', 'conductor', NULL, 50),
  ('factor', '141', 'Vehículo mal estacionado', 'conductor', NULL, 51),
  ('factor', '142', 'Semáforo en rojo', 'conductor', NULL, 52),
  ('factor', '143', 'Poner en marcha un vehículo sin precauciones', 'conductor', NULL, 53),
  ('factor', '144', 'Carga sobresaliente sin autorización', 'conductor', NULL, 54),
  ('factor', '145', 'Arrancar sin precaución', 'conductor', NULL, 55),
  ('factor', '146', 'Realizar giro en “U”', 'conductor', NULL, 56),
  ('factor', '147', 'Conducir vehículo sin adaptaciones', 'conductor', NULL, 57),
  ('factor', '148', 'Exceso de peso', 'conductor', NULL, 58),
  ('factor', '149', 'Reparar vehículo en vía pública', 'conductor', NULL, 59),
  ('factor', '150', 'Impartir enseñanza automovilística sin autorización', 'conductor', NULL, 60),
  ('factor', '151', 'Transporte de carga sin seguridad', 'conductor', NULL, 61),
  ('factor', '152', 'Dejar o recoger pasajeros en sitios no demarcados', 'conductor', NULL, 62),
  ('factor', '153', 'No portar espejos', 'conductor', NULL, 63),
  ('factor', '154', 'Transitar con las puertas abiertas', 'conductor', NULL, 64),
  ('factor', '155', 'Cargue o descargue en horas o sitios prohibidos', 'conductor', NULL, 65),
  ('factor', '156', 'Transportar pasajeros en vehículos de carga', 'conductor', NULL, 66),
  ('factor', '157', 'Otra', 'conductor', NULL, 67),
  ('factor', '201', 'Fallas en las llantas', 'vehiculo', NULL, 68),
  ('factor', '202', 'Fallas en los frenos', 'vehiculo', NULL, 69),
  ('factor', '203', 'Fallas en la dirección', 'vehiculo', NULL, 70),
  ('factor', '204', 'Fallas en las luces direccionales', 'vehiculo', NULL, 71),
  ('factor', '205', 'Fallas en luces de freno', 'vehiculo', NULL, 72),
  ('factor', '206', 'Fallas en luces delanteras', 'vehiculo', NULL, 73),
  ('factor', '207', 'Fallas en luces posteriores', 'vehiculo', NULL, 74),
  ('factor', '208', 'Fallas en el pito', 'vehiculo', NULL, 75),
  ('factor', '209', 'Fallas en el tubo de escape. gases en el interior del vehículo', 'vehiculo', NULL, 76),
  ('factor', '210', 'Fallas en el limpiabrisas', 'vehiculo', NULL, 77),
  ('factor', '211', 'Fallas en el sistema eléctrico', 'vehiculo', NULL, 78),
  ('factor', '212', 'Fallas en las puertas', 'vehiculo', NULL, 79),
  ('factor', '213', 'Ausencia o deficiencia de espejos retrovisores', 'vehiculo', NULL, 80),
  ('factor', '214', 'Vidrios en mal estado', 'vehiculo', NULL, 81),
  ('factor', '215', 'Fallas en ajuste capó', 'vehiculo', NULL, 82),
  ('factor', '216', 'Tanque de combustible mal ubicado', 'vehiculo', NULL, 83),
  ('factor', '217', 'Otras', 'vehiculo', NULL, 84),
  ('factor', '301', 'Ausencia total o parcial de señales', 'via', NULL, 85),
  ('factor', '302', 'Ausencia o deficiencia en demarcación', 'via', NULL, 86),
  ('factor', '303', 'Superficie lisa', 'via', NULL, 87),
  ('factor', '304', 'Superficie húmeda', 'via', NULL, 88),
  ('factor', '305', 'Obstáculos en la vía', 'via', NULL, 89),
  ('factor', '306', 'Huecos', 'via', NULL, 90),
  ('factor', '307', 'Dejar o movilizar semovientes en la vía', 'via', NULL, 91),
  ('factor', '308', 'Otras', 'via', NULL, 92),
  ('factor', '401', 'Pasar semáforo en rojo', 'peaton', NULL, 93),
  ('factor', '402', 'Salir por delante de un vehículo', 'peaton', NULL, 94),
  ('factor', '403', 'Transitar por su derecha en vías rurales', 'peaton', NULL, 95),
  ('factor', '404', 'Transitar por la calzada', 'peaton', NULL, 96),
  ('factor', '405', 'Jugar en la vía', 'peaton', NULL, 97),
  ('factor', '406', 'Cruzar en diagonal', 'peaton', NULL, 98),
  ('factor', '407', 'Pararse sobre la calzada', 'peaton', NULL, 99),
  ('factor', '408', 'Cruzar en curva', 'peaton', NULL, 100),
  ('factor', '409', 'Cruzar sin observar', 'peaton', NULL, 101),
  ('factor', '410', 'Cruzar en estado de embriaguez', 'peaton', NULL, 102),
  ('factor', '411', 'Otras', 'peaton', NULL, 103),
  ('factor', '501', 'Viajar colgado o en los estribos', 'pasajero', NULL, 104),
  ('factor', '502', 'Descender o subir del vehículo en marcha', 'pasajero', NULL, 105),
  ('factor', '503', 'Pasajero embriagado', 'pasajero', NULL, 106),
  ('factor', '504', 'Viajar a la izquierda del conductor', 'pasajero', NULL, 107),
  ('factor', '505', 'Niños en asiento delantero', 'pasajero', NULL, 108),
  ('factor', '506', 'Otra', 'pasajero', NULL, 109)
ON CONFLICT (tipo, codigo) DO NOTHING;

-- ── Accidente: vehículo propio, IPAT, hipótesis, agente y cierre ────────────
ALTER TABLE accidentes
  ADD COLUMN IF NOT EXISTS conductor_codigo TEXT,
  ADD COLUMN IF NOT EXISTS vehiculo_codigo TEXT,          -- N.º interno (vehiculos.codigo)
  ADD COLUMN IF NOT EXISTS vehiculo_placa TEXT,
  ADD COLUMN IF NOT EXISTS vehiculo_ruta TEXT,
  ADD COLUMN IF NOT EXISTS vehiculo_empresa BOOLEAN,
  ADD COLUMN IF NOT EXISTS vehiculo_afiliado BOOLEAN,
  ADD COLUMN IF NOT EXISTS inmovilizacion BOOLEAN,
  ADD COLUMN IF NOT EXISTS transaccion BOOLEAN,
  ADD COLUMN IF NOT EXISTS huella_frenado TEXT,
  ADD COLUMN IF NOT EXISTS huella_arrastre TEXT,
  ADD COLUMN IF NOT EXISTS tiene_fotos BOOLEAN,
  ADD COLUMN IF NOT EXISTS tiene_ipat BOOLEAN,
  ADD COLUMN IF NOT EXISTS ipat_numero TEXT,
  ADD COLUMN IF NOT EXISTS velocidad_kmh NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS clase_accidente TEXT CHECK (clase_accidente IN ('simple', 'lesionado', 'muerto')),
  ADD COLUMN IF NOT EXISTS factores_codigos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS agente_nombre TEXT,
  ADD COLUMN IF NOT EXISTS agente_placa TEXT,
  ADD COLUMN IF NOT EXISTS agente_celular TEXT,
  ADD COLUMN IF NOT EXISTS funcionario_cierre TEXT;

-- La clase se deriva de los lesionados en los reportes que ya existen.
UPDATE accidentes SET clase_accidente = CASE lesionados
    WHEN 'ninguno' THEN 'simple'
    WHEN 'fatal' THEN 'muerto'
    ELSE 'lesionado'
  END
WHERE clase_accidente IS NULL AND lesionados IS NOT NULL;

-- ── Vehículos del tercero: conductor, propietario y datos del vehículo ──────
ALTER TABLE accidente_vehiculos
  ADD COLUMN IF NOT EXISTS clase_vehiculo TEXT CHECK (clase_vehiculo IN ('particular', 'publico', 'oficial')),
  ADD COLUMN IF NOT EXISTS tipo_vehiculo TEXT,             -- accidente_catalogos(tipo_vehiculo).codigo
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS modelo TEXT,
  ADD COLUMN IF NOT EXISTS conductor_nombre TEXT,
  ADD COLUMN IF NOT EXISTS conductor_cedula TEXT,
  ADD COLUMN IF NOT EXISTS conductor_celular TEXT,
  ADD COLUMN IF NOT EXISTS conductor_direccion TEXT,
  ADD COLUMN IF NOT EXISTS propietario_nombre TEXT,
  ADD COLUMN IF NOT EXISTS propietario_telefono TEXT,
  ADD COLUMN IF NOT EXISTS propietario_direccion TEXT,
  ADD COLUMN IF NOT EXISTS aseguradora TEXT,
  ADD COLUMN IF NOT EXISTS afiliado_a TEXT;

-- ── Lesionados o víctimas fatales (uno o varios) ────────────────────────────
CREATE TABLE IF NOT EXISTS accidente_victimas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accidente_id UUID NOT NULL REFERENCES accidentes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cedula TEXT,
  direccion TEXT,
  municipio TEXT,
  telefono TEXT,
  condicion TEXT CHECK (condicion IN ('usuario', 'peaton', 'en_vehiculo')),
  fallecido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accidente_victimas_accidente ON accidente_victimas(accidente_id);

-- En esta instalación las tablas nuevas no heredan privilegios.
ALTER TABLE accidente_catalogos ENABLE ROW LEVEL SECURITY;
ALTER TABLE accidente_victimas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON accidente_catalogos FROM anon, public;
REVOKE ALL ON accidente_victimas FROM anon, public;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE accidente_catalogos, accidente_victimas TO service_role;
