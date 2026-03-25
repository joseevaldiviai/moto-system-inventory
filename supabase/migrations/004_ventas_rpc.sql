create or replace function public.reserved_to_sold_stock(p_table_name text, p_id bigint, p_cantidad integer)
returns void
language plpgsql
as $$
declare
  updated_count integer;
begin
  execute format(
    'update public.%I
       set cantidad_reservada = cantidad_reservada - $1,
           cantidad_vendida = cantidad_vendida + $1,
           actualizado_en = now()
     where id = $2 and cantidad_reservada >= $1',
    p_table_name
  )
  using p_cantidad, p_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Stock reservado insuficiente';
  end if;
end;
$$;

create or replace function public.libre_to_sold_stock(p_table_name text, p_id bigint, p_cantidad integer)
returns void
language plpgsql
as $$
declare
  updated_count integer;
begin
  execute format(
    'update public.%I
       set cantidad_libre = cantidad_libre - $1,
           cantidad_vendida = cantidad_vendida + $1,
           actualizado_en = now()
     where id = $2 and activo = true and cantidad_libre >= $1',
    p_table_name
  )
  using p_cantidad, p_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Stock libre insuficiente';
  end if;
end;
$$;

create or replace function public.sold_to_libre_stock(p_table_name text, p_id bigint, p_cantidad integer)
returns void
language plpgsql
as $$
declare
  updated_count integer;
begin
  execute format(
    'update public.%I
       set cantidad_libre = cantidad_libre + $1,
           cantidad_vendida = cantidad_vendida - $1,
           actualizado_en = now()
     where id = $2 and cantidad_vendida >= $1',
    p_table_name
  )
  using p_cantidad, p_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Stock vendido insuficiente';
  end if;
end;
$$;

create or replace function public.get_tramite_cost(p_tipo text)
returns numeric
language sql
as $$
  select coalesce((
    select value::numeric
    from public.config
    where key = case upper(p_tipo)
      when 'BSISA' then 'tramite_bsisa_costo'
      when 'PLACA' then 'tramite_placa_costo'
      else null
    end
  ), 0);
$$;

create or replace function public.create_sale_from_proforma(
  p_vendedor_id uuid,
  p_proforma_id bigint,
  p_tramites jsonb default '[]'::jsonb,
  p_notas text default null
)
returns bigint
language plpgsql
as $$
declare
  v_proforma record;
  v_item record;
  v_venta_id bigint;
  v_venta_item_id bigint;
  v_codigo text;
  v_tramite jsonb;
  v_tramites_total numeric(12,2) := 0;
  v_costo numeric(12,2);
  v_marca text;
begin
  perform public.expire_proformas();

  select * into v_proforma
  from public.proformas
  where id = p_proforma_id
  for update;

  if not found then
    raise exception 'Proforma no encontrada';
  end if;

  if v_proforma.estado <> 'ACTIVA' then
    raise exception 'La proforma no esta activa';
  end if;

  v_codigo := public.next_document_code('ventas', 'VEN');

  insert into public.ventas (
    codigo, proforma_id, vendedor_id, cliente_nombre, cliente_ci_nit,
    cliente_celular, subtotal, total_descuentos, total, notas
  ) values (
    v_codigo, v_proforma.id, v_proforma.vendedor_id, v_proforma.cliente_nombre, v_proforma.cliente_ci_nit,
    v_proforma.cliente_celular, v_proforma.subtotal, v_proforma.total_descuentos, v_proforma.total,
    coalesce(p_notas, v_proforma.notas)
  )
  returning id into v_venta_id;

  create temporary table if not exists tmp_proforma_to_venta_item (
    proforma_item_id bigint primary key,
    venta_item_id bigint not null
  ) on commit drop;

  delete from tmp_proforma_to_venta_item;

  for v_item in
    select * from public.proforma_items where proforma_id = p_proforma_id order by id
  loop
    insert into public.venta_items (
      venta_id, moto_id, accesorio_id, repuesto_id, descripcion,
      precio_costo_snap, precio_final_snap, descuento_maximo_snap,
      descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal
    ) values (
      v_venta_id, v_item.moto_id, v_item.accesorio_id, v_item.repuesto_id, v_item.descripcion,
      v_item.precio_costo_snap, v_item.precio_final_snap, v_item.descuento_maximo_snap,
      v_item.descuento_pct, v_item.descuento_monto, v_item.cantidad, v_item.precio_unitario_final, v_item.subtotal
    )
    returning id into v_venta_item_id;

    insert into tmp_proforma_to_venta_item(proforma_item_id, venta_item_id)
    values (v_item.id, v_venta_item_id);

    if v_item.moto_id is not null then
      perform public.reserved_to_sold_stock('motos', v_item.moto_id, v_item.cantidad);
    elsif v_item.accesorio_id is not null then
      perform public.reserved_to_sold_stock('accesorios', v_item.accesorio_id, v_item.cantidad);
    elsif v_item.repuesto_id is not null then
      perform public.reserved_to_sold_stock('repuestos', v_item.repuesto_id, v_item.cantidad);
    end if;
  end loop;

  for v_tramite in
    select value from jsonb_array_elements(coalesce(p_tramites, '[]'::jsonb))
  loop
    if upper(coalesce(v_tramite->>'tipo', '')) not in ('BSISA', 'PLACA') then
      continue;
    end if;

    select t.venta_item_id, m.marca
      into v_venta_item_id, v_marca
    from tmp_proforma_to_venta_item t
    join public.proforma_items pi on pi.id = t.proforma_item_id
    left join public.motos m on m.id = pi.moto_id
    where t.proforma_item_id = (v_tramite->>'proforma_item_id')::bigint
      and pi.moto_id is not null;

    if v_venta_item_id is null then
      continue;
    end if;

    v_costo := public.get_tramite_cost(upper(v_tramite->>'tipo'));

    insert into public.tramites (
      venta_item_id, tipo, nombre, marca, costo_total, cobro_en_venta,
      a_cuenta, saldo, estado
    ) values (
      v_venta_item_id, upper(v_tramite->>'tipo'), v_proforma.cliente_nombre, v_marca, v_costo, true,
      null, null, 'PENDIENTE'
    );

    v_tramites_total := v_tramites_total + v_costo;
  end loop;

  if v_tramites_total > 0 then
    update public.ventas
    set total = total + v_tramites_total,
        actualizado_en = now()
    where id = v_venta_id;
  end if;

  update public.proformas
  set estado = 'CONVERTIDA',
      actualizado_en = now()
  where id = p_proforma_id;

  return v_venta_id;
end;
$$;

create or replace function public.cancel_sale(p_sale_id bigint)
returns void
language plpgsql
as $$
declare
  v_sale record;
  v_item record;
begin
  select * into v_sale
  from public.ventas
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;

  if v_sale.estado <> 'COMPLETADA' then
    raise exception 'La venta ya esta anulada';
  end if;

  for v_item in
    select * from public.venta_items where venta_id = p_sale_id
  loop
    if v_item.moto_id is not null then
      perform public.sold_to_libre_stock('motos', v_item.moto_id, v_item.cantidad);
    elsif v_item.accesorio_id is not null then
      perform public.sold_to_libre_stock('accesorios', v_item.accesorio_id, v_item.cantidad);
    elsif v_item.repuesto_id is not null then
      perform public.sold_to_libre_stock('repuestos', v_item.repuesto_id, v_item.cantidad);
    end if;
  end loop;

  update public.ventas
  set estado = 'ANULADA',
      actualizado_en = now()
  where id = p_sale_id;

  if v_sale.proforma_id is not null then
    update public.proformas
    set estado = 'CANCELADA',
        actualizado_en = now()
    where id = v_sale.proforma_id;
  end if;
end;
$$;
