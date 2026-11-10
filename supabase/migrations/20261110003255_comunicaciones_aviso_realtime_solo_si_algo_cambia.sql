-- comunicaciones aviso realtime solo si algo cambia
--
-- Contexto. Los triggers de 20261105220000 avisan a todas las bandejas
-- abiertas en CADA update de wa_mensajes y wa_conversaciones, aunque no cambie
-- nada. La página de Comunicaciones marcaba el chat abierto como leído
-- (update no_leidos = 0) en cada lectura, ya estuviera leído o no: el update
-- avisaba, el aviso hacía releer la página, la lectura volvía a hacer el
-- update… un ciclo sin fin. Con varias personas con un chat abierto, todas
-- las bandejas se releían cada pocos segundos, las lecturas se encimaban y al
-- abrir un chat se quedaba «pensando» (medido el 2026-11-09: 5 relecturas en
-- 20 s sin tocar nada, de 10 a 17 s cada una).
--
-- El código ya solo marca leído si había no leídos; este cambio corta el ciclo
-- también en la base: un update que no cambia la fila no avisa.
--
-- Instancia autoalojada: se aplica a mano en el SQL Editor, entero, y es
-- idempotente. No crea tablas.

-- wa_mensajes: los inserts siempre avisan; los updates solo si cambió algo.
drop trigger if exists wa_mensajes_aviso_bandeja on public.wa_mensajes;
drop trigger if exists wa_mensajes_aviso_bandeja_insert on public.wa_mensajes;
drop trigger if exists wa_mensajes_aviso_bandeja_update on public.wa_mensajes;
create trigger wa_mensajes_aviso_bandeja_insert
  after insert on public.wa_mensajes
  for each row execute function public.wa_avisar_bandeja();
create trigger wa_mensajes_aviso_bandeja_update
  after update on public.wa_mensajes
  for each row
  when (old.* is distinct from new.*)
  execute function public.wa_avisar_bandeja();

-- wa_conversaciones: igual.
drop trigger if exists wa_conversaciones_aviso_bandeja on public.wa_conversaciones;
drop trigger if exists wa_conversaciones_aviso_bandeja_insert on public.wa_conversaciones;
drop trigger if exists wa_conversaciones_aviso_bandeja_update on public.wa_conversaciones;
create trigger wa_conversaciones_aviso_bandeja_insert
  after insert on public.wa_conversaciones
  for each row execute function public.wa_avisar_bandeja();
create trigger wa_conversaciones_aviso_bandeja_update
  after update on public.wa_conversaciones
  for each row
  when (old.* is distinct from new.*)
  execute function public.wa_avisar_bandeja();
