-- Flujo de aprobacion de asignaciones (ordenes de cambio de almacen)
-- Agrega estados AUTORIZADA/RECHAZADA y campos de auditoria al modulo de asignaciones.

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where con.conrelid = 'public.asignaciones_inventario'::regclass
    and con.contype = 'c'
    and att.attname = 'estado';
  if v_name is not null then
    execute format('alter table public.asignaciones_inventario drop constraint %I', v_name);
  end if;
end $$;

alter table public.asignaciones_inventario
  add constraint asignaciones_inventario_estado_check
  check (estado in ('PENDIENTE','AUTORIZADA','RECHAZADA','APLICADA','ANULADA'));

alter table public.asignaciones_inventario
  add column if not exists autorizada_por uuid references auth.users(id),
  add column if not exists autorizada_en timestamptz,
  add column if not exists rechazada_por uuid references auth.users(id),
  add column if not exists motivo_rechazo text;
