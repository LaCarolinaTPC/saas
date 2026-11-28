-- seleccion espera configurable del cierre automatico de la preseleccion
--
-- Contexto: el proceso de quien no cumple un requisito de la preselección (edad,
-- residencia, licencia, SIMIT) se cierra solo cuando lleva un rato en rojo sin
-- cambios (pedido de Gestión Humana del 17-nov-2026). Ese rato estaba fijo en el
-- código (30 minutos) y los requerimientos piden que los tiempos se puedan
-- editar (N5). Queda como ajuste, con el mismo valor: no cambia nada al aplicarla.
-- Sin esta migración el código sigue usando 30 minutos.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entera.
-- Idempotente: se puede volver a ejecutar.

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES ('preseleccion_cierre_minutos', 'tiempo', 'Minutos con un requisito en rojo antes de cerrar el proceso solo', 45,
        '30'::jsonb, '30'::jsonb, 'minutos', 'Gestión Humana, 17-nov-2026 (antes fijo en el código)', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave = 'preseleccion_cierre_minutos';
