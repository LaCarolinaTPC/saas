-- Selección: fuentes de Croma opcionales y caché configurable
--
-- Contexto: pedido de Gestión Humana del 18-nov-2026. Las fuentes de Croma
-- fallan por días (RNMC el 17 y 18, SIMIT el 18) y cada caída dejaba detenidos
-- a los aspirantes. Además, al probar se repetían consultas ya hechas.
--
--   * Policía, Procuraduría y Contraloría pasan a tener su ajuste «es
--     obligatoria», como ya lo tenían el RNMC (20261118190946) y el SIMIT
--     (20261118221044). En «no», si la fuente no responde (error o en curso)
--     no frena al aspirante: queda «Listo para citar» con la observación de
--     qué falta, para revisarlo a mano, y no se cita solo. Si la fuente sí
--     responde, su resultado cuenta igual (un hallazgo sigue siendo hallazgo).
--   * croma_cache_dias: días que se reutiliza una respuesta buena de Croma para
--     la misma cédula (RUNT, SIMIT, Policía, RNMC, Procuraduría, Contraloría),
--     en vez de consultar otra vez. Las que dieron error nunca se reutilizan.
--     0 = sin caché.
--
-- El RUNT no necesita ajuste: sin su respuesta el semáforo usa la licencia que
-- dijo el aspirante, y queda la observación de que falta verificarla.
--
-- Lo sugerido es que las fuentes sean obligatorias: vuelva a «sí» cuando Croma
-- esté estable. Requiere 20261118190946 (unidad si_no). Idempotente: se puede
-- volver a ejecutar. Esta instancia de Supabase es autoalojada y las
-- migraciones se aplican a mano en el SQL Editor: ejecute el script entero.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('policia_obligatorio', 'regla',
   'Los antecedentes de la Policía son obligatorios para «Listo para citar» (no: sin respuesta queda con la observación de que faltan)',
   241, 'false'::jsonb, 'true'::jsonb, 'si_no', 'Por si Croma no responde (18-nov-2026); lo sugerido es que sea obligatorio', 2),
  ('procuraduria_obligatorio', 'regla',
   'La Procuraduría es obligatoria para «Listo para citar» (no: sin respuesta queda con la observación de que falta)',
   242, 'false'::jsonb, 'true'::jsonb, 'si_no', 'Por si Croma no responde (18-nov-2026); lo sugerido es que sea obligatorio', 2),
  ('contraloria_obligatorio', 'regla',
   'La Contraloría es obligatoria para «Listo para citar» (no: sin respuesta queda con la observación de que falta)',
   243, 'false'::jsonb, 'true'::jsonb, 'si_no', 'Por si Croma no responde (18-nov-2026); lo sugerido es que sea obligatorio', 2),
  ('croma_cache_dias', 'regla',
   'Días que se reutiliza una consulta buena de Croma para la misma cédula (0: consultar siempre)',
   249, '3'::jsonb, '3'::jsonb, 'numero', 'Pedido de Gestión Humana del 18-nov-2026', 2)
ON CONFLICT (clave) DO NOTHING;
