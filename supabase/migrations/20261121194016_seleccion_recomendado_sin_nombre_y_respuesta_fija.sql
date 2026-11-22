-- Selección: «¿vienes recomendado?» sin preguntar el nombre, y respuesta fija
--
-- Contexto: en la llamada del 21-nov-2026 Salud Ocupacional pidió:
--   * No preguntar quién lo recomendó: basta el indicador sí o no; el padrino
--     lo asigna Gestión Humana en el Plan Padrino.
--   * Si responde que no, ya no se le puede poner padrino, salvo que un
--     administrador lo corrija a «sí» (con motivo, en el historial).
--   * La fecha que cuenta para la regla R13 es la de la respuesta en el chat,
--     también si después se corrige.
-- Por eso recomendado_at pasa a guardar la hora de la respuesta, sea sí o no.
-- La lógica está en el código; aquí solo cambian el comentario de la columna y
-- la lista de preguntas sugeridas (si sigue como la dejó la 20261121190711).
-- Idempotente.

COMMENT ON COLUMN procesos_contratacion.recomendado_at IS
  'Cuándo respondió en el chat si viene recomendado (sí o no). Cuenta como fecha de registro en el Plan Padrino (R13), también si un administrador corrige después un «no» a «sí».';
COMMENT ON COLUMN procesos_contratacion.recomendado IS
  'Viene recomendado por alguien de la empresa (apadrinado). Lo responde el candidato en el chat; un «no» solo lo corrige quien tiene Plan Padrino · aprobación (queda en el historial). NULL = no ha respondido.';
COMMENT ON COLUMN procesos_contratacion.recomendado_por IS
  'Quién lo recomendó, solo si el candidato lo dijo por su cuenta o lo anotó Gestión Humana (ya no se pregunta). Pista sin validar.';

UPDATE wa_agente
SET preguntas_requisitos = replace(
      replace(preguntas_requisitos, E'\r', ''),
      $t$Si viene recomendado por alguien que trabaja en la empresa (sí o no; si dice que sí, más adelante el nombre de quien lo recomendó)$t$,
      $t$Si viene recomendado por alguien que trabaja en la empresa (sí o no)$t$
    )
WHERE position($t$Si viene recomendado por alguien que trabaja en la empresa (sí o no; si dice que sí, más adelante el nombre de quien lo recomendó)$t$ IN replace(preguntas_requisitos, E'\r', '')) > 0;
