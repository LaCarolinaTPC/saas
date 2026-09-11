-- vista conductores_con_grupo con fecha_reingreso
--
-- Contexto: la vista se creó en la migración 005 y fecha_reingreso llegó a la
-- tabla conductores en la 006 sin recrearla. Como la definición guardada lista
-- las columnas una por una, la vista nunca expuso fecha_reingreso (verificado
-- en producción el 2026-09-11). La ficha del conductor
-- (src/lib/rotacion/data/conductor.ts y /api/rotacion/conductor/[cedula]) la
-- lee de esta vista para cortar el histórico de un conductor que reingresó:
-- siempre llegaba nula y el corte nunca se aplicaba, mezclando cierres, viajes
-- perdidos, ausentismo e incentivos de la vinculación anterior.
--
-- CREATE OR REPLACE VIEW solo permite agregar columnas al final, así que la
-- definición es idéntica a la de producción más fecha_reingreso como última
-- columna. Se conservan los permisos y los objetos que dependan de la vista.
-- Idempotente: repetirla deja la misma definición.

CREATE OR REPLACE VIEW conductores_con_grupo AS
SELECT c.id,
    c.cedula,
    c.nombre,
    c.codigo,
    c.correo,
    c.direccion,
    c.celular,
    c.telefono,
    c.tipo_conductor,
    c.licencia,
    c.venc_licencia,
    c.venc_contrato,
    c.fecha_ingreso,
    c.fecha_retiro,
    c.experiencia,
    c.fecha_nacimiento,
    c.observacion,
    c.eps,
    c.arl,
    c.pension,
    c.compensacion,
    c.tipo_sangre,
    c.nivel_educativo,
    c.num_hijos,
    c.estado_civil,
    c.reubicado,
    c.estado,
    c.created_at,
    c.updated_at,
    get_grupo_antiguedad(c.fecha_ingreso) AS grupo_antiguedad,
    EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone, c.fecha_ingreso::timestamp with time zone)) * 12::numeric
      + EXTRACT(month FROM age(CURRENT_DATE::timestamp with time zone, c.fecha_ingreso::timestamp with time zone)) AS meses_antiguedad,
    c.fecha_reingreso
FROM conductores c;

GRANT SELECT ON conductores_con_grupo TO service_role;
