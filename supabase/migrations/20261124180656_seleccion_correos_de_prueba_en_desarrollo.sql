-- Selección: correos y números de WhatsApp de prueba en el entorno de desarrollo
--
-- Contexto: la base de desarrollo es copia de producción y tiene los correos
-- reales de los laboratorios, así que en desarrollo los correos no salen
-- (src/lib/correo/enviar.ts). Para probar el envío de verdad, Gestión Humana
-- pone un correo de prueba en el laboratorio y lo agrega a esta lista: lo que
-- va a esas direcciones sí sale; las demás se quitan. Igual con WhatsApp: lo
-- que va a un número de la lista sale de verdad (lo que responda ese número
-- llega a producción, no a desarrollo: la respuesta del laboratorio se
-- escribe en el chat de prueba). Las listas se editan en Selección › Tiempos
-- y reglas › Entorno de pruebas. En producción no hacen nada.
--
-- Esta instancia de Supabase es autoalojada y las migraciones se aplican a
-- mano en el SQL Editor del Studio: ejecute el script entero de una sola vez.
-- Idempotente: se puede volver a ejecutar. No crea tablas nuevas.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES ('correos_prueba_desarrollo', 'dato', 'Correos de prueba que reciben de verdad en el entorno de pruebas', 900,
        '["soporte@lacarolina.com.co"]'::jsonb, '["soporte@lacarolina.com.co"]'::jsonb, 'lista', 'Gestión Humana, 24-nov-2026', 4),
       ('whatsapp_prueba_desarrollo', 'dato', 'Números de WhatsApp de prueba que reciben de verdad en el entorno de pruebas', 901,
        '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 24-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave IN ('correos_prueba_desarrollo', 'whatsapp_prueba_desarrollo');
