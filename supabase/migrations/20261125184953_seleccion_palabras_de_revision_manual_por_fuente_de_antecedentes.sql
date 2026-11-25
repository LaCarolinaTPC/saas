-- seleccion palabras de revision manual por fuente de antecedentes
--
-- Contexto: Gestión Humana pidió (25-nov-2026) que la Policía, la Procuraduría y
-- la Contraloría tengan, como el RNMC, una lista de palabras que mandan el caso a
-- revisión manual, con una lista amplia de entrada para ir afinándola al revisar
-- candidatos. Las palabras se buscan en el veredicto (la frase corta del
-- certificado) y en el detalle de los registros que traiga la fuente, sin tildes
-- ni mayúsculas y por fragmento. Si alguna aparece, el caso no pasa solo aunque
-- la regla de la fuente diga «Pasa solo» y aunque la fuente no lo marque como
-- hallazgo (por ejemplo, el certificado de la Policía «actualmente no es
-- requerido por autoridad judicial alguna», que es de quien ya cumplió).
--
-- Son propuestas de Gestivo: falta que Gestión Humana las confirme. Se editan en
-- Candidatos › Selección › Antecedentes. Las mismas listas están en el código
-- (src/lib/seleccion/antecedentes.ts › PALABRAS_SUGERIDAS).
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entera.
-- Idempotente: se puede volver a ejecutar (no pisa lo que ya se haya cambiado).

-- ── 1. Policía, Procuraduría y Contraloría ─────────────────────────────────
INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('ant_policia_palabras_revision', 'regla', 'Policía: palabras que siempre van a revisión manual', 317,
   '["actualmente no es requerido", "requerido por autoridad", "es requerido", "orden de captura", "captura vigente", "circular", "medida de aseguramiento", "detención", "prisión", "privación de la libertad", "libertad condicional", "condenado", "sentencia condenatoria", "proceso penal", "investigación penal", "imputación", "sindicado", "prófugo", "fuga", "homicidio", "feminicidio", "tentativa", "lesiones personales", "violencia intrafamiliar", "acceso carnal", "abuso sexual", "acto sexual", "pornografía", "trata de personas", "secuestro", "extorsión", "amenazas", "hurto", "receptación", "estafa", "falsedad", "fraude", "concierto para delinquir", "porte ilegal", "fabricación, tráfico", "tráfico de estupefacientes", "estupefacientes", "contrabando", "lavado de activos", "terrorismo", "rebelión", "inasistencia alimentaria", "daño en bien ajeno", "embriaguez", "omisión de socorro"]'::jsonb,
   '["actualmente no es requerido", "requerido por autoridad", "es requerido", "orden de captura", "captura vigente", "circular", "medida de aseguramiento", "detención", "prisión", "privación de la libertad", "libertad condicional", "condenado", "sentencia condenatoria", "proceso penal", "investigación penal", "imputación", "sindicado", "prófugo", "fuga", "homicidio", "feminicidio", "tentativa", "lesiones personales", "violencia intrafamiliar", "acceso carnal", "abuso sexual", "acto sexual", "pornografía", "trata de personas", "secuestro", "extorsión", "amenazas", "hurto", "receptación", "estafa", "falsedad", "fraude", "concierto para delinquir", "porte ilegal", "fabricación, tráfico", "tráfico de estupefacientes", "estupefacientes", "contrabando", "lavado de activos", "terrorismo", "rebelión", "inasistencia alimentaria", "daño en bien ajeno", "embriaguez", "omisión de socorro"]'::jsonb,
   'lista', 'Propuesta de Gestivo, 25-nov-2026: falta la confirmación de Gestión Humana', 4),
  ('ant_procuraduria_palabras_revision', 'regla', 'Procuraduría: palabras que siempre van a revisión manual', 318,
   '["destitución", "destituido", "inhabilidad general", "inhabilidad especial", "inhabilidad permanente", "suspensión en el ejercicio", "suspendido", "pérdida de investidura", "exclusión de la profesión", "terminación del contrato", "caducidad", "falta gravísima", "falta grave", "dolo", "dolosa", "culpa gravísima", "sanción penal", "condena", "prisión", "arresto", "interdicción", "pena accesoria", "responsabilidad fiscal", "pérdida del empleo", "multa", "peculado", "cohecho", "concusión", "prevaricato", "falsedad", "fraude", "celebración indebida", "acoso", "violencia", "lesiones", "homicidio", "hurto", "estupefacientes", "embriaguez", "abandono del cargo", "tránsito", "transporte", "conductor"]'::jsonb,
   '["destitución", "destituido", "inhabilidad general", "inhabilidad especial", "inhabilidad permanente", "suspensión en el ejercicio", "suspendido", "pérdida de investidura", "exclusión de la profesión", "terminación del contrato", "caducidad", "falta gravísima", "falta grave", "dolo", "dolosa", "culpa gravísima", "sanción penal", "condena", "prisión", "arresto", "interdicción", "pena accesoria", "responsabilidad fiscal", "pérdida del empleo", "multa", "peculado", "cohecho", "concusión", "prevaricato", "falsedad", "fraude", "celebración indebida", "acoso", "violencia", "lesiones", "homicidio", "hurto", "estupefacientes", "embriaguez", "abandono del cargo", "tránsito", "transporte", "conductor"]'::jsonb,
   'lista', 'Propuesta de Gestivo, 25-nov-2026: falta la confirmación de Gestión Humana', 4),
  ('ant_contraloria_palabras_revision', 'regla', 'Contraloría: palabras que siempre van a revisión manual', 319,
   '["dolo", "dolosa", "culpa grave", "solidaria", "solidario", "ejecutoriado", "cobro coactivo", "embargo", "transporte", "tránsito", "movilidad", "terminal de transporte", "combustible", "vehículo", "parque automotor", "peaje", "nómina", "caja menor", "tesorería", "anticipo", "contrato", "peculado", "apropiación", "hurto", "pérdida de bienes", "faltante", "sobrecosto"]'::jsonb,
   '["dolo", "dolosa", "culpa grave", "solidaria", "solidario", "ejecutoriado", "cobro coactivo", "embargo", "transporte", "tránsito", "movilidad", "terminal de transporte", "combustible", "vehículo", "parque automotor", "peaje", "nómina", "caja menor", "tesorería", "anticipo", "contrato", "peculado", "apropiación", "hurto", "pérdida de bienes", "faltante", "sobrecosto"]'::jsonb,
   'lista', 'Propuesta de Gestivo, 25-nov-2026: falta la confirmación de Gestión Humana', 4)
ON CONFLICT (clave) DO NOTHING;

-- ── 2. RNMC: la lista amplia ───────────────────────────────────────────────
-- El valor sugerido se actualiza siempre. El valor, solo si seguía vacío o con
-- la primera propuesta (la de la migración 20261125180228): si Gestión Humana ya
-- lo cambió, se respeta.
UPDATE seleccion_ajustes
SET valor_sugerido = '["riña", "reñir", "pelea", "confrontación", "confrontaciones", "agresión", "agredir", "golpear", "lesiones", "lesionar", "amenaza", "amenazar", "intimidar", "violencia", "violenta", "maltrato", "arma", "cortopunzante", "cortante", "punzante", "cuchillo", "navaja", "machete", "explosivo", "pólvora", "autoridad", "irrespeto", "irrespetar", "desacato", "desobedecer", "incumplir orden", "resistirse", "impedir", "obstruir", "huir", "evadir", "alcohol", "embriaguez", "embriagantes", "licor", "estupefacientes", "psicoactivas", "drogas", "marihuana", "cocaína", "bazuco", "sustancias prohibidas", "hurto", "hurtar", "robo", "receptación", "daño en bien ajeno", "dañar", "acoso", "exhibicionismo", "obsceno", "actos sexuales", "prostitución", "niños", "adolescentes", "menores de edad", "transporte público", "tarifa", "vehículo", "conducir", "tránsito", "piques"]'::jsonb,
    origen = 'Propuesta de Gestivo, 25-nov-2026: falta la confirmación de Gestión Humana'
WHERE clave = 'ant_rnmc_palabras_revision';

UPDATE seleccion_ajustes
SET valor = valor_sugerido, updated_at = now()
WHERE clave = 'ant_rnmc_palabras_revision'
  AND (valor = '[]'::jsonb OR valor = '["riña", "reñir", "arma", "agresión", "agredir", "lesiones", "lesionar", "amenaza", "violencia", "violenta", "estupefacientes", "psicoactivas", "drogas", "alcohol", "embriaguez", "embriagantes", "hurto", "hurtar", "autoridad", "acoso", "transporte público"]'::jsonb)
  AND NOT EXISTS (SELECT 1 FROM seleccion_cambios c WHERE c.tipo = 'ajuste' AND c.clave = 'ant_rnmc_palabras_revision');

SELECT clave, jsonb_array_length(valor) AS palabras FROM seleccion_ajustes
WHERE clave LIKE 'ant\_%palabras\_revision' ORDER BY orden;
