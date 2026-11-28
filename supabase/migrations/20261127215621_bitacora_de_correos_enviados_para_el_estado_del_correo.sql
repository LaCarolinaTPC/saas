-- bitacora de correos enviados para el estado del correo
--
-- Contexto (27-nov-2026): el 27-nov Brevo rechazó dos alertas de antecedentes
-- con «535 Authentication failed» y la barra de estado decía que el correo
-- funcionaba, porque solo miraba las órdenes a laboratorios. Cada correo que
-- Gestivo intenta enviar (órdenes, alertas a GH, reporte diario, correos de la
-- psicosensotécnica, «Listo para contratar») queda aquí con su resultado, y la
-- barra de servicios lo usa para avisar cuando el correo falla.
--
-- Solo la usa el servidor (service_role). No guarda direcciones (el correo de
-- la psicosensotécnica va al aspirante): el asunto, cuántos destinatarios y el error.

create table if not exists public.correo_envios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  resultado text not null check (resultado in ('enviado', 'fallido')),
  asunto text,
  destinatarios integer not null default 0,
  error text
);

create index if not exists correo_envios_created_at_idx on public.correo_envios (created_at desc);

alter table public.correo_envios enable row level security;

grant select, insert, delete on public.correo_envios to service_role;
