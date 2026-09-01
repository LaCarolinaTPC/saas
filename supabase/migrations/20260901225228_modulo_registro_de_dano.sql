-- Módulo "registro_dano": registrar el daño, separado del área de Mantenimiento
--
-- Registrar un daño deja de vivir en el tablero del módulo y pasa a
-- `/mantenimiento/registrar`, con clave de permiso propia. Así se le puede dar
-- esa pantalla a quien solo captura daños, sin abrirle el historial, las
-- alertas ni la bitácora de frenos.
--
-- Es el mismo patrón del módulo `rendimiento`, la vista restringida que ya
-- existe para que un conductor consulte su rendimiento del día.
--
-- Los conductores NO usan esta pantalla. Se decidió que reporten sin cuenta
-- desde el formulario público `/reportar-dano`, entre otras cosas porque el
-- tipo `conductor` es de solo lectura y volverlo editable le abriría la
-- escritura en todo lo demás que tenga.
--
-- El tipo `admin` y el tipo `mantenimiento` reciben la clave nueva: quien ya
-- gestionaba el área sigue pudiendo registrar. Además, la página y la Server
-- Action aceptan `registro_dano` **o** `mantenimiento`, de modo que un tipo que
-- solo tenga el área completa tampoco se queda sin registrar.

UPDATE user_types
SET modulos = modulos || '["registro_dano"]'::jsonb
WHERE key IN ('admin', 'mantenimiento')
  AND NOT (modulos ? 'registro_dano');

-- Tipo pensado para el personal de patio o taller que solo captura daños:
-- entra directo a la pantalla de registro y no ve nada más. No se crea ningún
-- usuario; el administrador asigna el tipo desde Configuración cuando lo
-- necesite.
INSERT INTO user_types (key, nombre, descripcion, modulos, alcance, puede_editar, es_sistema)
VALUES (
  'registro_dano',
  'Registro de daños',
  'Solo registra daños de vehículos; no ve historial, alertas ni frenos',
  '["registro_dano"]'::jsonb,
  'all',
  true,
  false
)
ON CONFLICT (key) DO NOTHING;
