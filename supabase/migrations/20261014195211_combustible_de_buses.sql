-- Combustible de buses (Mantenimiento)
--
-- Petromil (S.S Petromil Terminal de Transporte) manda cada día un Excel con los
-- tanqueos de ACPM de la flota: fecha y hora, factura, número interno, placa,
-- galones y valor. Hasta hoy esos archivos solo se guardaban en la carpeta
-- «Mantenimiento_Combustible - Combustible» de SharePoint (uno por día desde
-- 2023) y nadie los consultaba cruzados. Gestivo los carga desde
-- Mantenimiento → Combustible y el histórico desde 2026-01-01 con
-- scripts/cargar-combustible-historico.mts.
--
-- Una fila por tanqueo. La llave natural es factura + fecha + hora + número
-- interno, guardada en `llave` (texto, UNIQUE): la factura sola no sirve porque
-- Petromil repite números entre series, y una misma factura aparece a veces a
-- nombre de dos buses (alerta factura_compartida). Con la llave, volver a subir
-- un archivo, una copia o el del día siguiente (que trae tanqueos de la
-- madrugada) no duplica nada; si un tanqueo vuelve con otros valores se
-- actualiza.
--
-- Cada archivo subido queda en combustible_cargas. Reversar una carga borra los
-- tanqueos cuya última carga fue esa.
--
-- Permiso propio `combustible`, como `camaras`: a quien recibe el archivo del
-- proveedor se le puede dar solo esta pantalla. Lo reciben el admin y los tipos
-- que ya tienen Mantenimiento.
--
-- Se puede correr entero más de una vez.

CREATE TABLE IF NOT EXISTS combustible_cargas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archivo_nombre TEXT NOT NULL,
  -- pantalla: subido en Mantenimiento → Combustible; historico: el script.
  origen TEXT NOT NULL DEFAULT 'pantalla' CHECK (origen IN ('pantalla', 'historico')),
  usuario_email TEXT,
  -- Filas con tanqueo que traía el archivo, antes de juntar hojas repetidas.
  filas_archivo INTEGER NOT NULL DEFAULT 0,
  nuevas INTEGER NOT NULL DEFAULT 0,
  corregidas INTEGER NOT NULL DEFAULT 0,
  sin_cambio INTEGER NOT NULL DEFAULT 0,
  rechazadas INTEGER NOT NULL DEFAULT 0,
  fecha_desde DATE,
  fecha_hasta DATE,
  galones NUMERIC(12,3) NOT NULL DEFAULT 0,
  valor NUMERIC(16,2) NOT NULL DEFAULT 0,
  -- Motivos de rechazo, avisos del archivo y conteo de alertas.
  detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
  reversada_at TIMESTAMPTZ,
  reversada_por_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS combustible_cargas_created_idx ON combustible_cargas (created_at DESC);

COMMENT ON TABLE combustible_cargas IS
  'Cada archivo de combustible del proveedor subido a Gestivo, con el resumen de lo que cambió.';

CREATE TABLE IF NOT EXISTS combustible_tanqueos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- factura|fecha|hora|vehiculo_codigo; ver el encabezado.
  llave TEXT NOT NULL UNIQUE,
  fecha DATE NOT NULL,
  -- Hora de Colombia del tanqueo; nula si el archivo no la traía (alerta sin_hora).
  hora TIME,
  factura TEXT NOT NULL,
  vehiculo_codigo TEXT NOT NULL,
  -- Placa tal como la reportó el proveedor (sin espacios ni guiones, en mayúscula).
  placa TEXT,
  producto TEXT,
  galones NUMERIC(10,3) NOT NULL CHECK (galones > 0),
  valor NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  precio_galon NUMERIC(12,2) GENERATED ALWAYS AS (round(valor / galones, 2)) STORED,
  proveedor TEXT NOT NULL DEFAULT 'PETROMIL',
  alertas TEXT[] NOT NULL DEFAULT '{}',
  archivo_nombre TEXT,
  carga_id UUID REFERENCES combustible_cargas(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS combustible_tanqueos_fecha_idx ON combustible_tanqueos (fecha DESC, hora DESC);
CREATE INDEX IF NOT EXISTS combustible_tanqueos_vehiculo_idx ON combustible_tanqueos (vehiculo_codigo, fecha DESC);
CREATE INDEX IF NOT EXISTS combustible_tanqueos_carga_idx ON combustible_tanqueos (carga_id);

COMMENT ON TABLE combustible_tanqueos IS
  'Tanqueos de combustible de la flota según el archivo diario del proveedor (Petromil). Una fila por tanqueo.';
COMMENT ON COLUMN combustible_tanqueos.vehiculo_codigo IS
  'Número interno del bus como lo trae el archivo (vehiculos.codigo). Sin llave foránea: puede no estar en el maestro (alerta vehiculo_no_existe).';
COMMENT ON COLUMN combustible_tanqueos.galones IS 'Volumen tanqueado, en galones (columna Volumen o Cantidad del archivo).';
COMMENT ON COLUMN combustible_tanqueos.valor IS 'Valor cobrado, en pesos (columna Total o Total Dinero del archivo).';

ALTER TABLE combustible_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE combustible_tanqueos ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE combustible_cargas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE combustible_tanqueos TO service_role;

-- Permisos: el admin y quien ya tiene Mantenimiento reciben la clave nueva.
UPDATE user_types
SET modulos = modulos || '["combustible"]'::jsonb
WHERE (key = 'admin' OR modulos ? 'mantenimiento')
  AND NOT (modulos ? 'combustible');

-- Comprobación: tablas con RLS y privilegios, y tipos de usuario con el permiso.
SELECT c.relname AS tabla,
       c.relrowsecurity::text AS rls,
       has_table_privilege('service_role', c.oid, 'SELECT')::text AS puede_leer,
       has_table_privilege('service_role', c.oid, 'INSERT')::text AS puede_insertar
FROM pg_class c
WHERE c.relname IN ('combustible_cargas', 'combustible_tanqueos')
UNION ALL
SELECT 'user_types con combustible: ' || string_agg(key, ', ' ORDER BY key), NULL, NULL, NULL
FROM user_types WHERE modulos ? 'combustible';
