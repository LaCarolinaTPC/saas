-- seleccion rnmc respaldo del portal y conductas que se toleran
--
-- Contexto (27-nov-2026, caso Pedro Luis): Croma devuelve del RNMC solo la tabla
-- de expedientes, sin la conducta, y entre el 26 y el 27 de noviembre no
-- respondió. El portal ciudadano de la Policía sí trae la conducta al abrir el
-- expediente (Artículo, Numeral, Relato de los hechos, Medidas) y responde por
-- cédula. Desde ahora:
--   * rnmc_respaldo_portal: si Croma no responde o está en pausa, el RNMC se
--     consulta en el portal de la Policía (Selección › Tiempos y reglas ›
--     Verificaciones con Croma). Sí por defecto.
--   * ant_rnmc_palabras_toleradas: conductas que se toleran aunque traigan una
--     palabra de revisión. Casi todas las medidas de la pandemia (tapabocas,
--     cuarentena) quedaron como Art. 35 num. 2, «impedir la orden de policía»,
--     y sin esta lista irían todas a revisión. Se siembra con la lista sugerida;
--     Gestión Humana la ajusta en Selección › Antecedentes.
-- Una medida pendiente sin la conducta (el portal no respondió) va a revisión.
-- No crea tablas. Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('rnmc_respaldo_portal', 'regla',
   'Si Croma no responde el RNMC, consultarlo en el portal de la Policía',
   246, 'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 27-nov-2026', 4),
  ('ant_rnmc_palabras_toleradas', 'regla',
   'RNMC: conductas que se toleran aunque traigan una palabra de revisión',
   308,
   '["tapabocas", "tapaboca", "mascarilla", "covid", "coronavirus", "cuarentena", "aislamiento preventivo", "aislamiento obligatorio", "toque de queda", "pico y cédula", "pico y cedula", "bioseguridad", "distanciamiento", "ley seca", "simulacro"]'::jsonb,
   '["tapabocas", "tapaboca", "mascarilla", "covid", "coronavirus", "cuarentena", "aislamiento preventivo", "aislamiento obligatorio", "toque de queda", "pico y cédula", "pico y cedula", "bioseguridad", "distanciamiento", "ley seca", "simulacro"]'::jsonb,
   'lista', 'Sugerido el 27-nov-2026: falta la confirmación de Gestión Humana', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave IN ('rnmc_respaldo_portal', 'ant_rnmc_palabras_toleradas');
