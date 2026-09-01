-- ============================================================================
-- Importación del sistema origen Da-o_Busetas
--
-- Origen:  proyecto Supabase lqeddrpbwunzcyjxuiei (nube), que sigue en
--          producción mientras se hace el corte.
-- Destino: la instancia autoalojada de Gestivo.
-- Corte:   los datos son los que había al 2026-09-01. Lo que se reporte en el
--          legado después de la extracción hay que traerlo como delta.
--
-- Requiere las migraciones 20260901202556 (frenos) y 20260901211004 (source_id).
--
-- Es idempotente: cada fila viaja con la llave que tenía en el origen y los
-- INSERT llevan ON CONFLICT (source_id) DO NOTHING. Se puede correr un ensayo,
-- volver a correrlo tras el corte y no se duplica nada.
--
-- La homologación se hace aquí, con JOIN contra los maestros del destino:
--   placa    -> vehiculos.codigo
--   concepto -> mantenimiento_conceptos.id (los nombres coinciden literalmente)
--   cédula   -> conductores.cedula (verificado: las 35 existen)
--
-- Los JOIN son INNER a propósito, y al final hay una reconciliación que aborta
-- si el número de filas cargadas no es el esperado: así una placa o un concepto
-- que no homologue no se pierde en silencio.
-- ============================================================================

-- ── 1. El trigger de recurrencia estorba en una carga histórica ─────────────
-- Crearía alertas nuevas fechadas hoy, en vez de respetar las del origen.
ALTER TABLE mantenimiento_reportes DISABLE TRIGGER trg_mantenimiento_recurrencia;

-- ── 2. Alertas, con su fecha y su cierre originales ─────────────────────────
-- `cerrada_por` queda nulo: los usuarios del legado no son los de Gestivo.
WITH origen (source_id, placa, concepto, cantidad, estado, orden, notas, cerrada_at, created_at) AS (
  VALUES
  ('0aed2ae2-79b6-4c5c-b8de-0c4a01a75b4f'::uuid, 'TZM643', 'LUCES DIRECCIONALES', 2, 'cerrada', 'OTD-PRUEBA CONTROL', 'Esta alerta se generó por prueba de auditoria', '2026-06-04 17:03:11.304+00'::timestamptz, '2026-06-04 17:01:30.181731+00'::timestamptz),
  ('3aa1c864-019d-4272-915b-f26991f62613'::uuid, 'WPW127', 'ELECTRICO (Otros)', 2, 'cerrada', '1', 'SE REPITIO EL REPORTE DEBIDO A FALLA EN INTERNET, SE PENSO QUE NO HABIA GUARDADO EL REPORTE Y SE VOLVIO A HACER', '2026-06-30 16:19:10.631+00'::timestamptz, '2026-06-09 15:46:32.146713+00'::timestamptz),
  ('71300c39-21e4-46ea-a8f2-a76413bb2fb2'::uuid, 'TDU373', 'FRENOS', 2, 'cerrada', 'OTD-2026060081', 'No es reproceso, una intervención es por graduación de frenos y otra por fuga de aire.', '2026-06-30 16:24:01.233+00'::timestamptz, '2026-06-23 19:19:12.10025+00'::timestamptz),
  ('c8dcf20b-7a6c-480f-a801-0bc2062bf53f'::uuid, 'TDU372', 'FRENOS', 2, 'cerrada', 'OTD-2026060305', 'El primer ingreso por fuga de aire fue por diafragma chillon corregido con la OTD-2026060021, el segundo registro es por fuga de aire por una bombona, se cambia diafragma t24, no es reproceso', '2026-06-30 16:22:05.296+00'::timestamptz, '2026-06-25 14:00:59.765139+00'::timestamptz),
  ('af3c59d1-d977-4156-8904-bc4e68da6fe5'::uuid, 'TDV340', 'FRENOS', 2, 'abierta', NULL, NULL, NULL::timestamptz, '2026-09-01 13:07:14.813012+00'::timestamptz)
)
INSERT INTO mantenimiento_alertas
  (source_id, codigo_vehiculo, concepto_id, cantidad, estado, orden_taller, notas_cierre, cerrada_at, created_at)
SELECT o.source_id, v.codigo, c.id, o.cantidad, o.estado, o.orden, o.notas, o.cerrada_at, o.created_at
FROM origen o
JOIN vehiculos v ON v.placa = o.placa
JOIN mantenimiento_conceptos c ON c.nombre = o.concepto
ON CONFLICT (source_id) DO NOTHING;

-- ── 3. Reportes ─────────────────────────────────────────────────────────────
-- `alerta_id` se resuelve por el source_id de la alerta que ya se cargó.
-- `created_by` queda nulo: no hay un usuario de Gestivo detrás.
WITH origen (source_id, placa, cedula, concepto, descripcion, fecha, alerta_source) AS (
  VALUES
  ('0d7fc318-4133-47f0-9bf9-ab08fcd9e68b'::uuid, 'TZL821', '72171747', 'FRENOS', 'Graduación de freno no carga el aire', '2026-06-02 12:35:47.3+00'::timestamptz, NULL::uuid),
  ('565cee7e-f97e-40c4-883b-8cbdb53c81bc'::uuid, 'WPV312', '1004358901', 'FUGA DE AIRE', 'Fuga de aire y aguantado', '2026-06-02 14:54:08.132+00'::timestamptz, NULL::uuid),
  ('8da183bb-09b7-48c9-baa7-e57ec94bad4b'::uuid, 'TDW240', '8525981', 'EMBRAGUE', 'Deslizando clutch

Aguantado', '2026-06-02 15:01:30.558+00'::timestamptz, NULL::uuid),
  ('e2ac6767-86e1-4cfb-b0d9-8f6b3c66b8e7'::uuid, 'WPV991', '1002073425', 'FUGA DE AIRE', 'Válvula puerta duras y ajustar suichera', '2026-06-02 15:40:16.608+00'::timestamptz, NULL::uuid),
  ('852aada9-10e0-4ba2-b934-3a920b94e7b2'::uuid, 'TDV341', '72162708', 'FRENOS', 'Graduación freno - luces - ajustar defensa delantera', '2026-06-02 16:05:27.341+00'::timestamptz, NULL::uuid),
  ('3a8e4be6-7970-4762-bfd6-3006a881eb69'::uuid, 'TZM643', '8507694', 'LUCES DIRECCIONALES', 'Timbre - luces.parqueo', '2026-06-02 18:37:59.215+00'::timestamptz, '0aed2ae2-79b6-4c5c-b8de-0c4a01a75b4f'::uuid),
  ('548e3b21-e369-48c9-bd83-fc3507efd402'::uuid, 'TDU372', '1048325540', 'FRENOS', 'Se descarga  aire y frenos', '2026-06-03 14:17:04.65+00'::timestamptz, 'c8dcf20b-7a6c-480f-a801-0bc2062bf53f'::uuid),
  ('a3bf6426-855c-4154-99b2-c841a12a3bbd'::uuid, 'TZK542', '1143146361', 'FRENOS', 'Se descarga el aire revisar frenos', '2026-06-03 14:22:03.471+00'::timestamptz, NULL::uuid),
  ('a36686c8-e3bd-49b7-8ccb-ef1c69683b15'::uuid, 'TZL844', '1001938658', 'LUCES TRASERAS', 'Stop caído y encendido', '2026-06-03 15:41:16.492+00'::timestamptz, NULL::uuid),
  ('811ade02-36ba-42db-b93d-7e87062d2147'::uuid, 'TDW237', '1004486040', 'LLANTAS', 'Espichado p6', '2026-06-03 15:49:50.941+00'::timestamptz, NULL::uuid),
  ('f0d8bc26-2003-444e-905e-607a16b4dac2'::uuid, 'WGB552', '1140874840', 'SUSPENSION', 'Barra estabilizadora golpe en partes trasera', '2026-06-03 16:56:50.859+00'::timestamptz, NULL::uuid),
  ('93b590fb-fb59-4db9-a8d2-c15cb6326fee'::uuid, 'WPV312', '1004358901', 'SUSPENSION', 'Terminales amortiguadores splinders', '2026-06-04 14:52:20.873+00'::timestamptz, NULL::uuid),
  ('ed85bd9b-003c-4a2b-a27a-a655d8e47716'::uuid, 'TDU373', '1001938658', 'FUGA DE AIRE', 'No carga el aire', '2026-06-04 15:35:19.551+00'::timestamptz, NULL::uuid),
  ('5b7282f6-f94e-470d-b548-55fc501fc62a'::uuid, 'TDU368', '1030698751', 'FRENOS', 'Graduación de freno', '2026-06-04 15:53:15.556+00'::timestamptz, NULL::uuid),
  ('278b9fba-91db-4b1f-be7c-a278c9e8c70b'::uuid, 'TZM643', '72160829', 'LUCES DIRECCIONALES', 'direccionales no funcionan (PRUEBA DE AUDITORIA)', '2026-06-04 17:00:38.942+00'::timestamptz, '0aed2ae2-79b6-4c5c-b8de-0c4a01a75b4f'::uuid),
  ('44da2495-792f-4f61-871e-4fdceebebd41'::uuid, 'TZL844', '1004227022', 'DIRECCION', 'Zumbido en la dirección', '2026-06-04 18:12:32.422+00'::timestamptz, NULL::uuid),
  ('d1715b56-100c-4f79-b065-7816a46d1d5e'::uuid, 'TZK543', '1005583195', 'FRENOS', 'Graduación de freno', '2026-06-04 19:32:26.558+00'::timestamptz, NULL::uuid),
  ('b151c3d9-71b9-42f1-8f5e-c299b9ebb3bf'::uuid, 'TZL845', '1004358901', 'FRENOS', 'Bomba del pedal de frenos', '2026-06-04 20:20:56.327+00'::timestamptz, NULL::uuid),
  ('dc53e959-0114-4849-90ed-85f65556b6c2'::uuid, 'TZL820', '72245229', 'ELECTRICO (Otros)', 'Luces frontales no funcionan ,plumilla no sirven, ruido o vibración al andar espatillado llanta delantera lado derecho, arranque molesta, graduar embrague', '2026-06-04 23:21:26.432+00'::timestamptz, NULL::uuid),
  ('2e7a715f-1b64-4691-b17d-d9347a6fa97e'::uuid, 'WPX903', '72178689', 'FRENOS', 'Graduación de frenos', '2026-06-05 11:22:39.419+00'::timestamptz, NULL::uuid),
  ('5d06093a-21c3-478d-b7cb-d50c98b752d7'::uuid, 'WPV992', '1002073425', 'FRENOS', 'Graduación de freno', '2026-06-05 17:46:37.315+00'::timestamptz, NULL::uuid),
  ('41138b0f-a550-4b15-83db-179f4f9d4fb3'::uuid, 'WPW127', '1007116181', 'ELECTRICO (Otros)', 'Aguantado', '2026-06-09 15:41:12.955+00'::timestamptz, '3aa1c864-019d-4272-915b-f26991f62613'::uuid),
  ('90759a3e-edda-4d06-b339-2664868cf740'::uuid, 'TZL844', '1143447668', 'ELECTRICO (Otros)', 'Aguantado', '2026-06-09 15:43:51.213+00'::timestamptz, NULL::uuid),
  ('456b4e49-79b3-499b-a88b-5dccfd2c80e6'::uuid, 'TZK543', '1005583195', 'MOTOR', 'Temperatura', '2026-06-09 15:44:32.217+00'::timestamptz, NULL::uuid),
  ('ede2288e-ac81-4717-92b2-0728d2eb5bb6'::uuid, 'TDU375', '5165259', 'ELECTRICO (Otros)', 'Aguantado', '2026-06-09 15:45:13.734+00'::timestamptz, NULL::uuid),
  ('97608325-c195-4451-bf2f-1e15f1146a5d'::uuid, 'WPW127', '1007116181', 'ELECTRICO (Otros)', 'Aguantado', '2026-06-09 15:46:31.009+00'::timestamptz, '3aa1c864-019d-4272-915b-f26991f62613'::uuid),
  ('8e33e617-b54a-439b-80df-3d7f89edda04'::uuid, 'TDU373', '9102504', 'FRENOS', 'Vehículo no tiene frenos', '2026-06-09 16:30:28.905+00'::timestamptz, '71300c39-21e4-46ea-a8f2-a76413bb2fb2'::uuid),
  ('9d533896-dc35-485f-86a2-002e06fc95a4'::uuid, 'TDV340', '1048205409', 'FRENOS', 'Luces traseras', '2026-06-09 18:23:12.226+00'::timestamptz, NULL::uuid),
  ('fb0c7a98-8388-4829-81fc-e66e7ee0ef6c'::uuid, 'WPX904', '72432641', 'ELECTRICO (Otros)', 'Pito direccionales', '2026-06-10 19:28:57.44+00'::timestamptz, NULL::uuid),
  ('27ffd8f3-e3b4-403c-8699-9212319e69b6'::uuid, 'WGD223', '72051469', 'FRENOS', 'Frenos revisar', '2026-06-11 18:22:56.444+00'::timestamptz, NULL::uuid),
  ('bfb5a556-bdb6-4576-a8c4-5a26e79c7c9c'::uuid, 'TDV338', '1001938658', 'FRENOS', 'Fuga de aire y no frena', '2026-06-16 20:15:21.468+00'::timestamptz, NULL::uuid),
  ('8d45d17d-fba6-42ea-a0ec-846e6d8726a8'::uuid, 'WPW127', '1129572039', 'FRENOS', 'Graduación de freno', '2026-06-23 18:26:56.29+00'::timestamptz, NULL::uuid),
  ('0d71bc00-62d4-4e47-8a6a-c1b6345b1f5d'::uuid, 'WPV990', '72162708', 'FRENOS', 'Graduación freno', '2026-06-23 19:15:43.996+00'::timestamptz, NULL::uuid),
  ('73403a4a-fd0c-4cf2-b66f-a2d3b9490a2f'::uuid, 'TDU373', '72141742', 'FRENOS', 'Graduación de freno', '2026-06-23 19:19:11.951+00'::timestamptz, '71300c39-21e4-46ea-a8f2-a76413bb2fb2'::uuid),
  ('d0b8f760-7ca3-40eb-867a-a785afa09f98'::uuid, 'TDV118', '1192904645', 'FRENOS', 'Graduación freno', '2026-06-25 13:48:20.18+00'::timestamptz, NULL::uuid),
  ('688bcd5e-3c57-4234-b1db-063ee18120cb'::uuid, 'TDU372', '1048325540', 'FRENOS', 'No carga aire
Graduación freno', '2026-06-25 14:00:59.256+00'::timestamptz, 'c8dcf20b-7a6c-480f-a801-0bc2062bf53f'::uuid),
  ('28a33ccf-d8fb-4c1e-8e63-26d143e6bb3f'::uuid, 'TZK543', '1005583195', 'EMBRAGUE', 'Graduación de embrague', '2026-07-11 13:48:58.594+00'::timestamptz, NULL::uuid),
  ('5ed98b12-6465-4015-a65b-31f6fc9107de'::uuid, 'WPW128', '1045703216', 'FRENOS', 'Graduación freno', '2026-07-15 14:49:06.766+00'::timestamptz, NULL::uuid),
  ('2d5b60ad-c1a7-4756-8e13-778456951442'::uuid, 'WGD221', '72232075', 'LUCES INTERNAS', 'Colocar luces internas', '2026-08-04 18:56:48.004+00'::timestamptz, NULL::uuid),
  ('6703a417-7381-4ba0-943d-8f8f0098084b'::uuid, 'TDU372', '1048325540', 'FUGA DE AIRE', 'Fuga en una manguera se aplicó una union', '2026-08-05 20:59:04.63+00'::timestamptz, NULL::uuid),
  ('50537c55-8d6e-4f41-9307-c17dc21ab1f5'::uuid, 'WPX903', '72178689', 'SUSPENSION', 'Pasador partido', '2026-08-06 11:05:29.356+00'::timestamptz, NULL::uuid),
  ('5bf3dc16-234d-4ad2-a250-cddcf441e79a'::uuid, 'WPV989', '1042444895', 'FRENOS', 'Graduación frenos', '2026-08-06 13:46:43.887+00'::timestamptz, NULL::uuid),
  ('6e48c7db-fbb4-424c-9a51-9c28718f2195'::uuid, 'WPV990', '1090390266', 'FRENOS', 'Graduación de freno', '2026-08-06 18:52:28.516+00'::timestamptz, NULL::uuid),
  ('88bb5af4-383a-4673-887f-b4251ea9825e'::uuid, 'WGD224', '72130881', 'EMBRAGUE', 'Graduación clutch', '2026-08-07 15:26:38.332+00'::timestamptz, NULL::uuid),
  ('c38e0562-4646-437f-912b-ab025bee8e3d'::uuid, 'WPX903', '72178689', 'TRANSMISION', 'Cardan revisar', '2026-08-07 15:29:17.884+00'::timestamptz, NULL::uuid),
  ('814e27c6-64fe-4751-9d90-65a1ebce9018'::uuid, 'WPX906', '1129572039', 'ELECTRICO (Otros)', 'Arreglo del sistema de abanico', '2026-08-11 18:18:02.154+00'::timestamptz, NULL::uuid),
  ('da504e88-9eb3-417a-be58-0a42f482318c'::uuid, 'WPV991', '1004358901', 'FRENOS', 'Graduación de freno', '2026-08-13 18:48:19.367+00'::timestamptz, NULL::uuid),
  ('a6d64582-0c26-4336-bb36-f05ff6f0553b'::uuid, 'TDV333', '1047234767', 'FUGA DE AIRE', 'Fuga de aire por la manguera de la bombona', '2026-08-21 18:12:28.366+00'::timestamptz, NULL::uuid),
  ('015d1e7a-81a5-473e-b515-53921c093c1b'::uuid, 'TDU372', '1048325540', 'FRENOS', 'Graduación de freno', '2026-08-21 20:08:36.452+00'::timestamptz, NULL::uuid),
  ('7bbc1f75-1e8c-43f8-911b-a9d68c8c8c20'::uuid, 'WPX906', '1129572039', 'FRENOS', 'Graduación de freno', '2026-08-21 20:09:25.817+00'::timestamptz, NULL::uuid),
  ('5f303931-166f-4f5a-98d2-3780464310cd'::uuid, 'TDV340', '1005583195', 'FRENOS', 'Graduación freno', '2026-08-21 22:06:33.796+00'::timestamptz, 'af3c59d1-d977-4156-8904-bc4e68da6fe5'::uuid),
  ('a20eea98-3b5e-47f1-a344-785a5dcf39a3'::uuid, 'WPV992', '1143447668', 'FUGA DE AIRE', 'Fuga de aire', '2026-08-31 11:47:15.947+00'::timestamptz, NULL::uuid),
  ('29bc79d3-5459-40e0-b792-1da7efdf3ba3'::uuid, 'WPV992', '1143447668', 'FRENOS', 'Frenos revisar', '2026-09-01 12:29:23.833+00'::timestamptz, NULL::uuid),
  ('4814758c-8577-49ef-92b8-2816a938d379'::uuid, 'TDU375', '1045749328', 'ELECTRICO (Otros)', 'Perdida de potencia', '2026-09-01 12:30:28.678+00'::timestamptz, NULL::uuid),
  ('9fe49b06-4277-4e9d-ae1e-d0b7c6c7890e'::uuid, 'TDV340', '1094044682', 'FRENOS', 'Graduación de frenos', '2026-09-01 13:07:14.466+00'::timestamptz, 'af3c59d1-d977-4156-8904-bc4e68da6fe5'::uuid)
)
INSERT INTO mantenimiento_reportes
  (source_id, codigo_vehiculo, cedula_conductor, concepto_id, descripcion, fecha_reporte, alerta_id)
SELECT o.source_id, v.codigo, o.cedula, c.id, o.descripcion, o.fecha, a.id
FROM origen o
JOIN vehiculos v ON v.placa = o.placa
JOIN mantenimiento_conceptos c ON c.nombre = o.concepto
LEFT JOIN mantenimiento_alertas a ON a.source_id = o.alerta_source
ON CONFLICT (source_id) DO NOTHING;

-- ── 4. Graduaciones de frenos ───────────────────────────────────────────────
WITH origen (source_id, fecha, placa, graduacion, observacion) AS (
  VALUES
  ('d43748ec-2d5e-4196-959c-dd29960ce28f'::uuid, '2026-09-01'::date, 'WPX903', true, 'Graduación frenos')
)
INSERT INTO mantenimiento_frenos (source_id, fecha, codigo_vehiculo, graduacion, observacion)
SELECT o.source_id, o.fecha, v.codigo, o.graduacion, o.observacion
FROM origen o
JOIN vehiculos v ON v.placa = o.placa
ON CONFLICT (source_id) DO NOTHING;

-- ── 5. Volver a activar el trigger ──────────────────────────────────────────
ALTER TABLE mantenimiento_reportes ENABLE TRIGGER trg_mantenimiento_recurrencia;

-- ── 6. Auditoría de la importación ──────────────────────────────────────────
-- Cada reporte traído deja su rastro, con el origen en el detalle. Solo para
-- los que aún no lo tengan, para que repetir la carga no duplique auditoría.
INSERT INTO mantenimiento_auditoria (reporte_id, accion, detalle)
SELECT r.id, 'reporte_creado',
       jsonb_build_object('origen', 'importacion_da_o_busetas',
                          'source_id', r.source_id,
                          'codigo_vehiculo', r.codigo_vehiculo)
FROM mantenimiento_reportes r
WHERE r.source_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM mantenimiento_auditoria a
    WHERE a.reporte_id = r.id AND a.accion = 'reporte_creado'
  );

-- ── 7. Reconciliación ───────────────────────────────────────────────────────
-- Aborta si algo no homologó: sin esto un INNER JOIN perdería filas en
-- silencio y la carga parecería correcta.
DO $$
DECLARE
  n_alertas  BIGINT;
  n_reportes BIGINT;
  n_frenos   BIGINT;
  n_huerfanos BIGINT;
BEGIN
  SELECT count(*) INTO n_alertas  FROM mantenimiento_alertas  WHERE source_id IS NOT NULL;
  SELECT count(*) INTO n_reportes FROM mantenimiento_reportes WHERE source_id IS NOT NULL;
  SELECT count(*) INTO n_frenos   FROM mantenimiento_frenos   WHERE source_id IS NOT NULL;

  IF n_alertas <> 5 THEN
    RAISE EXCEPTION 'Se esperaban 5 alertas importadas y hay %. Alguna placa o concepto no homologó.', n_alertas;
  END IF;
  IF n_reportes <> 55 THEN
    RAISE EXCEPTION 'Se esperaban 55 reportes importados y hay %. Alguna placa o concepto no homologó.', n_reportes;
  END IF;
  IF n_frenos <> 1 THEN
    RAISE EXCEPTION 'Se esperaba 1 graduación importada y hay %.', n_frenos;
  END IF;

  -- Los 10 reportes que en el origen colgaban de una alerta deben seguir
  -- colgando de la suya aquí.
  SELECT count(*) INTO n_huerfanos
  FROM mantenimiento_reportes
  WHERE source_id IS NOT NULL AND alerta_id IS NULL
    AND source_id IN (
      '3a8e4be6-7970-4762-bfd6-3006a881eb69','548e3b21-e369-48c9-bd83-fc3507efd402',
      '278b9fba-91db-4b1f-be7c-a278c9e8c70b','41138b0f-a550-4b15-83db-179f4f9d4fb3',
      '97608325-c195-4451-bf2f-1e15f1146a5d','8e33e617-b54a-439b-80df-3d7f89edda04',
      '73403a4a-fd0c-4cf2-b66f-a2d3b9490a2f','688bcd5e-3c57-4234-b1db-063ee18120cb',
      '5f303931-166f-4f5a-98d2-3780464310cd','9fe49b06-4277-4e9d-ae1e-d0b7c6c7890e'
    );
  IF n_huerfanos > 0 THEN
    RAISE EXCEPTION '% reportes perdieron su alerta al importarse.', n_huerfanos;
  END IF;

  RAISE NOTICE 'Importación conciliada: % alertas, % reportes, % graduaciones.',
    n_alertas, n_reportes, n_frenos;
END $$;
