-- modulo accidentabilidad analisis
--
-- Contexto: explique por qué hace falta este cambio, no lo que hace el SQL.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio, así que el script debe poder ejecutarse
-- entero de una sola vez y ser idempotente donde se pueda (IF EXISTS,
-- IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- Recuerde que en esta instalación las tablas nuevas no conceden privilegios a
-- service_role por defecto: si crea una tabla que la aplicación consulta desde
-- Server Components o Server Actions, añada su GRANT aquí mismo.

-- Módulo "accidentabilidad_analisis": panel de análisis (descriptivo,
-- prescriptivo y KPIs) de accidentabilidad. Va en módulo aparte del de
-- consulta/reporte porque expone costos, rankings y KPIs sensibles: así se
-- concede solo a quien debe ver la lectura gerencial, sin tocar el acceso
-- operativo de "accidentabilidad".
--
-- No crea tablas: lee de `accidentes`, `accidente_evaluaciones` y catálogos,
-- que ya conceden privilegios a service_role. Solo registra el módulo.

-- Visible para administración.
UPDATE user_types
  SET modulos = modulos || '["accidentabilidad_analisis"]'::jsonb
  WHERE key = 'admin' AND NOT (modulos ? 'accidentabilidad_analisis');
