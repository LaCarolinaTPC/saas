-- Mensaje de reconocimiento de ruta (21-nov-2026)
--
-- Contexto: al registrar la fase 2 de exámenes como apta, el proceso pasaba a
-- «Reconocimiento de ruta» sin avisarle nada al aspirante. Gestión Humana pidió
-- que en ese momento le llegue un mensaje: que sus exámenes salieron aptos y
-- que sigue el reconocimiento de ruta. {rutas} es cuántas debe aprender (el
-- ajuste rutas_minimas o, si son más, el número de obligatorias).
--
-- Sale automático. Como puede llegar fuera de la ventana de 24 horas,
-- necesita la plantilla de Meta «sel_reconocimiento_ruta»: se envía a
-- aprobación desde Selección › Mensajes. A los reingresos no se les envía
-- (no hacen el reconocimiento).
--
-- Idempotente: no pisa el mensaje si ya existe.

INSERT INTO seleccion_mensajes (clave, nombre, cuando, orden, texto, texto_sugerido, modo, variables, plantilla_nombre, plantilla_variables, plantilla_categoria, plantilla_estado)
VALUES (
  'reconocimiento_ruta', 'Reconocimiento de ruta', 'Se registra la fase 2 de exámenes como apta', 107,
  $t$¡Felicitaciones, {nombre}! 🎉 Tus exámenes médicos salieron aptos. El siguiente paso es el reconocimiento de ruta: vas a salir con nuestro profesor a aprender {rutas} rutas. Acércate a {direccion} y pregunta por {contacto}.$t$,
  $t$¡Felicitaciones, {nombre}! 🎉 Tus exámenes médicos salieron aptos. El siguiente paso es el reconocimiento de ruta: vas a salir con nuestro profesor a aprender {rutas} rutas. Acércate a {direccion} y pregunta por {contacto}.$t$,
  'automatico', ARRAY['nombre', 'rutas', 'direccion', 'contacto'],
  'sel_reconocimiento_ruta', ARRAY['nombre', 'rutas', 'direccion', 'contacto'], 'UTILITY', NULL
)
ON CONFLICT (clave) DO NOTHING;
