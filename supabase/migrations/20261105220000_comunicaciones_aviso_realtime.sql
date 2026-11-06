-- Bandeja de Comunicaciones en tiempo real.
--
-- Antes la bandeja releía la página entera cada 7 s "por si acaso" llegaba un
-- WhatsApp: miles de peticiones al día por pestaña abierta (en Vercel agotó el
-- cupo de invocaciones y pausó la cuenta). Ahora la base avisa cuando algo
-- cambia y la bandeja relee solo entonces.
--
-- El aviso va por Supabase Realtime (broadcast) al canal privado
-- 'comunicaciones' y solo lleva el id de la conversación: nunca el contenido.
-- Lo escuchan únicamente usuarios con sesión (policy sobre realtime.messages).
--
-- Cubre todos los caminos que escriben: webhook (entrantes y estados de
-- entrega), agente de IA, envíos desde la bandeja y marcar leído/no leído.

create or replace function public.wa_avisar_bandeja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object(
        'tabla', tg_table_name,
        'conversacion_id',
        -- to_jsonb: plpgsql resuelve new.campo aunque la rama del case no
        -- corra, y wa_conversaciones no tiene conversacion_id.
        case when tg_table_name = 'wa_mensajes'
          then to_jsonb(new) ->> 'conversacion_id'
          else to_jsonb(new) ->> 'id'
        end
      ),
      'cambio',
      'comunicaciones',
      true
    );
  exception when others then
    -- Si Realtime falla, el mensaje igual se guarda: la bandeja tiene respaldo.
    raise warning 'wa_avisar_bandeja: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists wa_mensajes_aviso_bandeja on public.wa_mensajes;
create trigger wa_mensajes_aviso_bandeja
  after insert or update on public.wa_mensajes
  for each row execute function public.wa_avisar_bandeja();

drop trigger if exists wa_conversaciones_aviso_bandeja on public.wa_conversaciones;
create trigger wa_conversaciones_aviso_bandeja
  after insert or update on public.wa_conversaciones
  for each row execute function public.wa_avisar_bandeja();

-- Solo usuarios autenticados pueden suscribirse al canal privado.
drop policy if exists "comunicaciones_escuchar_autenticados" on realtime.messages;
create policy "comunicaciones_escuchar_autenticados"
  on realtime.messages
  for select
  to authenticated
  using (realtime.topic() = 'comunicaciones' and extension = 'broadcast');
