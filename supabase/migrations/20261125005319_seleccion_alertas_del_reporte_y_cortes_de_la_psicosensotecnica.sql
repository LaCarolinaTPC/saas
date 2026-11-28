-- seleccion alertas del reporte y cortes de la psicosensotecnica
--
-- Contexto (24-nov-2026), dos pedidos de Gestión Humana:
-- 1. Umbrales para el reporte diario de selección: si un indicador los cruza
--    (pocos aspirantes, pocos responden, pocos pasan la preselección, muchos
--    cierres por perfil, baja asistencia, pocos contratados, un canal sin
--    contratos, ningún mensaje ayer…), sale como alerta arriba del correo y en
--    Candidatos › Indicadores, con una sugerencia para anuncios y promociones
--    (src/lib/seleccion/alertas-indicadores.ts). 0 apaga una alerta de mínimo;
--    100, una de máximo.
-- 2. Los cortes del porcentaje de los informes de PsicoAlianza cuando no traen
--    el concepto escrito (Ethikos lo trae como imagen), y los días para
--    presentar la prueba antes de resaltarlo.
--
-- Solo agrega ajustes editables en Selección › Tiempos y reglas. Idempotente.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('alerta_aspirantes_ayer_min', 'regla', 'Alerta: Aspirantes nuevos ayer (mínimo)', 263,
   '2'::jsonb, '2'::jsonb, 'numero', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_aspirantes_dia_min', 'regla', 'Alerta: Aspirantes nuevos por día (promedio del periodo) (mínimo)', 264,
   '5'::jsonb, '5'::jsonb, 'numero', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_registro_min', 'regla', 'Alerta: Conversaciones de aspirantes que quedan como candidato (mínimo)', 265,
   '30'::jsonb, '30'::jsonb, 'porcentaje', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_respuesta_min', 'regla', 'Alerta: Aspirantes que responden (mínimo)', 266,
   '50'::jsonb, '50'::jsonb, 'porcentaje', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_preseleccion_min', 'regla', 'Alerta: Pasan la preselección (llegan a «Citado») (mínimo)', 267,
   '25'::jsonb, '25'::jsonb, 'porcentaje', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_cierre_perfil_max', 'regla', 'Alerta: Cierres por no cumplir el perfil (máximo)', 268,
   '40'::jsonb, '40'::jsonb, 'porcentaje', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_asistencia_min', 'regla', 'Alerta: Asistencia a la prueba de manejo (mínimo)', 269,
   '60'::jsonb, '60'::jsonb, 'porcentaje', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_contratados_min', 'regla', 'Alerta: Contratados en el periodo (mínimo)', 270,
   '4'::jsonb, '4'::jsonb, 'numero', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_canal_sin_contratos_min', 'regla', 'Alerta: Canal con al menos estos aspirantes y ningún contratado (mínimo)', 271,
   '20'::jsonb, '20'::jsonb, 'numero', 'Gestión Humana, 24-nov-2026', 4),
  ('alerta_mensajes_ayer_min', 'regla', 'Alerta: Mensajes de WhatsApp recibidos ayer (mínimo)', 272,
   '1'::jsonb, '1'::jsonb, 'numero', 'Gestión Humana, 24-nov-2026', 4),
  ('psico_corte_no_recomendado', 'regla', 'Psicosensotécnica: no recomendado hasta este porcentaje', 133,
   '50'::jsonb, '50'::jsonb, 'porcentaje', 'Gestión Humana, 24-nov-2026', 4),
  ('psico_corte_con_sugerencias', 'regla', 'Psicosensotécnica: recomendado con sugerencias hasta este porcentaje', 134,
   '75'::jsonb, '75'::jsonb, 'porcentaje', 'Gestión Humana, 24-nov-2026', 4),
  ('psico_dias_para_presentar', 'tiempo', 'Psicosensotécnica: días para presentarla antes de resaltarlo', 135,
   '3'::jsonb, '3'::jsonb, 'dias', 'Gestión Humana, 24-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

-- Verificación: 13 ajustes.
SELECT count(*) AS ajustes FROM seleccion_ajustes WHERE clave IN ('alerta_aspirantes_ayer_min', 'alerta_aspirantes_dia_min', 'alerta_registro_min', 'alerta_respuesta_min', 'alerta_preseleccion_min', 'alerta_cierre_perfil_max', 'alerta_asistencia_min', 'alerta_contratados_min', 'alerta_canal_sin_contratos_min', 'alerta_mensajes_ayer_min', 'psico_corte_no_recomendado', 'psico_corte_con_sugerencias', 'psico_dias_para_presentar');
