-- seleccion certificado bancario en la carpeta
--
-- Contexto (24-nov-2026): los salarios se pagan en una cuenta del Banco de
-- Bogotá. En la fase 1 se le pregunta al aspirante si la tiene: si sí, se le
-- pide el certificado bancario; si no, se le envía la carta para abrirla y
-- después el certificado. Hasta hoy nada lo recibía ni lo exigía: el lector de
-- documentos lo reconoce ahora como «Certificado bancario» (banco, titular,
-- cédula, cuenta vigente) y queda como un documento más de la carpeta, que
-- para contratar debe estar validado.
--
-- Agrega «Certificado bancario» a la lista `carpeta_items` (y a su valor
-- sugerido) si no está. Idempotente: se puede correr varias veces.

UPDATE seleccion_ajustes
SET valor = valor || '["Certificado bancario"]'::jsonb
WHERE clave = 'carpeta_items'
  AND jsonb_typeof(valor) = 'array'
  AND NOT valor @> '["Certificado bancario"]'::jsonb;

UPDATE seleccion_ajustes
SET valor_sugerido = valor_sugerido || '["Certificado bancario"]'::jsonb
WHERE clave = 'carpeta_items'
  AND jsonb_typeof(valor_sugerido) = 'array'
  AND NOT valor_sugerido @> '["Certificado bancario"]'::jsonb;


-- La lectura de documentos guarda la clase «certificado_bancario». Sin esto,
-- la aplicación lo guarda como «otro» (con el resumen y los campos leídos).
ALTER TABLE seleccion_lecturas DROP CONSTRAINT IF EXISTS seleccion_lecturas_clase_check;
ALTER TABLE seleccion_lecturas ADD CONSTRAINT seleccion_lecturas_clase_check
  CHECK (clase IN ('cedula', 'licencia', 'hoja_vida', 'carta_laboral', 'certificado_bancario', 'otro'));

-- Recordatorio del certificado bancario: si no lo envía, se le recuerda por
-- WhatsApp (cada 48 h; si no tenía cuenta, el primero a las 72 h, para que la
-- abra) hasta 3 veces, y después el chat queda para una persona. La cuenta de
-- recordatorios va en el historial del proceso: no hacen falta columnas.
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('certificado_banco_activo', 'regla', 'Recordar el certificado bancario si no lo envía', 129,
   'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 24-nov-2026', 4),
  ('certificado_banco_horas', 'tiempo', 'Horas sin enviarlo antes de recordarle el certificado bancario', 130,
   '48'::jsonb, '48'::jsonb, 'horas', 'Gestión Humana, 24-nov-2026', 4),
  ('certificado_banco_espera_apertura_horas', 'tiempo', 'Si no tenía cuenta, horas antes del primer recordatorio (para abrirla)', 131,
   '72'::jsonb, '72'::jsonb, 'horas', 'Gestión Humana, 24-nov-2026', 4),
  ('certificado_banco_recordatorios', 'regla', 'Recordatorios del certificado bancario antes de pasar el chat a una persona', 132,
   '3'::jsonb, '3'::jsonb, 'numero', 'Gestión Humana, 24-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

-- El mensaje (plantilla para cuando pasaron más de 24 horas desde que escribió).
INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables,
  plantilla_nombre, plantilla_variables, plantilla_botones, plantilla_categoria, plantilla_estado)
VALUES
  ('recordatorio_certificado_banco', 'Recordatorio: falta el certificado bancario', 'No ha enviado el certificado bancario', 103,
   $t$Hola, {nombre}. Le recordamos que necesitamos el certificado bancario de su cuenta de ahorros del Banco de Bogotá: es la cuenta donde la empresa le consignará los pagos. Puede enviarlo por este mismo medio (foto o PDF). Si todavía no ha abierto la cuenta, puede hacerlo con la carta de autorización que le enviamos.$t$,
   $t$Hola, {nombre}. Le recordamos que necesitamos el certificado bancario de su cuenta de ahorros del Banco de Bogotá: es la cuenta donde la empresa le consignará los pagos. Puede enviarlo por este mismo medio (foto o PDF). Si todavía no ha abierto la cuenta, puede hacerlo con la carta de autorización que le enviamos.$t$,
   'automatico', ARRAY['nombre'], 'sel_recordatorio_certificado_banco', ARRAY['nombre'], ARRAY[]::text[], 'UTILITY', NULL)
ON CONFLICT (clave) DO NOTHING;

-- Verificación: la carpeta termina en «Certificado bancario», 4 ajustes y 1 mensaje.
SELECT
  (SELECT valor FROM seleccion_ajustes WHERE clave = 'carpeta_items') AS carpeta,
  (SELECT count(*) FROM seleccion_ajustes WHERE clave LIKE 'certificado\_banco\_%') AS ajustes,
  (SELECT count(*) FROM seleccion_mensajes WHERE clave = 'recordatorio_certificado_banco') AS mensajes;
