-- seleccion notificaciones de revisiones manuales
--
-- Contexto (27-nov-2026): cuando algo necesita una revisión manual (un examen
-- no apto o aplazado, una respuesta del laboratorio que Gestivo no pudo
-- confirmar, un documento que contradice los datos del aspirante, un chat que
-- el asistente pasó a una persona, antecedentes por revisar) nadie se enteraba
-- si no entraba a mirar. Desde ahora:
--   * Selección › Notificaciones: a qué correos va cada aviso (con copia, un
--     interruptor y unos correos por defecto para los que no tengan lista).
--   * seleccion_notificaciones: la bitácora de cada novedad (salga el correo o
--     no). No se repite el mismo aviso, y Candidatos muestra las del día.
-- Los avisos que ya existían (reporte diario, antecedentes, listo para
-- contratar, servicios caídos) siguen con sus ajustes; la pestaña los reúne.
-- Idempotente: se puede volver a ejecutar.

CREATE TABLE IF NOT EXISTS public.seleccion_notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tipo text NOT NULL,
  -- Lo que no se repite: un aviso por tipo y clave (p. ej. «proceso:fase:día»).
  clave text NOT NULL,
  proceso_id uuid REFERENCES public.procesos_contratacion(id) ON DELETE CASCADE,
  conversacion_id uuid,
  titulo text NOT NULL,
  detalle text,
  enlace text,
  prueba boolean NOT NULL DEFAULT false,
  -- enviado · fallido · apagado · sin_destinatarios
  resultado text NOT NULL DEFAULT 'pendiente',
  error text,
  destinatarios integer NOT NULL DEFAULT 0,
  UNIQUE (tipo, clave)
);

CREATE INDEX IF NOT EXISTS seleccion_notificaciones_created_at_idx ON public.seleccion_notificaciones (created_at DESC);
CREATE INDEX IF NOT EXISTS seleccion_notificaciones_proceso_idx ON public.seleccion_notificaciones (proceso_id);

ALTER TABLE public.seleccion_notificaciones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seleccion_notificaciones TO service_role;

INSERT INTO seleccion_ajustes (clave, grupo, nombre, orden, valor, valor_sugerido, unidad, origen, entrega)
VALUES
  ('notif_defecto_correos', 'dato', 'Correos por defecto para los avisos que no tengan su propia lista', 280, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_defecto_copia', 'dato', 'Con copia a (avisos sin lista propia)', 281, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_examenes_activo', 'regla', 'Avisar los exámenes no aptos o aplazados por decidir', 282, 'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_examenes_correos', 'dato', 'Correos: exámenes por decidir', 283, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_examenes_copia', 'dato', 'Con copia a: exámenes por decidir', 284, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_laboratorio_activo', 'regla', 'Avisar las respuestas del laboratorio por confirmar', 285, 'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_laboratorio_correos', 'dato', 'Correos: respuestas del laboratorio por confirmar', 286, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_laboratorio_copia', 'dato', 'Con copia a: respuestas del laboratorio por confirmar', 287, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_documentos_activo', 'regla', 'Avisar los documentos que contradicen los datos del aspirante', 288, 'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_documentos_correos', 'dato', 'Correos: documentos por revisar', 289, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_documentos_copia', 'dato', 'Con copia a: documentos por revisar', 290, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_chats_activo', 'regla', 'Avisar los chats que requieren una persona', 291, 'true'::jsonb, 'true'::jsonb, 'si_no', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_chats_correos', 'dato', 'Correos: chats que requieren una persona', 292, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_chats_copia', 'dato', 'Con copia a: chats que requieren una persona', 293, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4),
  ('notif_listo_copia', 'dato', 'Con copia a: listo para contratar', 294, '[]'::jsonb, '[]'::jsonb, 'lista', 'Gestión Humana, 27-nov-2026', 4)
ON CONFLICT (clave) DO NOTHING;

SELECT clave, valor FROM seleccion_ajustes WHERE clave LIKE 'notif\_%' ORDER BY orden;
