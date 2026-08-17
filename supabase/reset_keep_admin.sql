begin;

do $$
declare
  v_admin_id uuid;
  v_central_point_id bigint;
begin
  select up.id
  into v_admin_id
  from public.user_profiles up
  where up.username = 'admin'
     or up.email = 'admin@motosystem.local'
  order by case when up.username = 'admin' then 0 else 1 end, up.creado_en
  limit 1;

  if v_admin_id is null then
    raise exception 'No se encontro el usuario admin';
  end if;

  select pv.id
  into v_central_point_id
  from public.puntos_venta pv
  where pv.tipo = 'CENTRAL'
  order by pv.id
  limit 1;

  if v_central_point_id is null then
    raise exception 'No existe el almacen central';
  end if;

  delete from public.tramites;
  delete from public.venta_items;
  delete from public.ventas;
  delete from public.proforma_items;
  delete from public.proformas;
  delete from public.asignacion_inventario_items;
  delete from public.asignaciones_inventario;
  delete from public.inventario_puntos_venta;

  delete from public.motos;
  delete from public.motos_e;
  delete from public.accesorios;
  delete from public.repuestos;
  delete from public.marcas;

  delete from public.user_profiles
  where id <> v_admin_id;

  delete from auth.users
  where id <> v_admin_id;

  delete from public.puntos_venta
  where id <> v_central_point_id;

  update public.user_profiles
  set email = 'admin@motosystem.local',
      username = 'admin',
      nombre = 'Administrador',
      rol = 'SUPERVISOR',
      activo = true,
      punto_venta_id = null,
      sesion_activa_id = null,
      sesion_activa_actualizada_en = null
  where id = v_admin_id;

  insert into public.config (key, value)
  values
    ('tramite_bsisa_costo', '0'),
    ('tramite_placa_costo', '0')
  on conflict (key) do update
  set value = excluded.value;

  delete from public.config
  where key not in ('tramite_bsisa_costo', 'tramite_placa_costo');

  update public.puntos_venta
  set nombre = 'Almacen Central',
      codigo = 'CENTRAL',
      tipo = 'CENTRAL',
      activo = true
  where id = v_central_point_id;
end $$;

commit;
