-- Fix: Supabase bloquea DELETE sin WHERE ("DELETE requires a WHERE clause").
-- create_sale_from_proforma usaba `delete from tmp_proforma_to_venta_item;`
-- al consolidar una proforma en venta, lo que hacia fallar el cierre de ventas.
-- Se reemplaza por TRUNCATE (disenado para vaciar tablas, no requiere WHERE).

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
  v_costo_minimo numeric(12,2);
  v_marca text;
  v_punto_venta_id bigint;
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

  v_punto_venta_id := coalesce(v_proforma.punto_venta_id, public.resolve_sales_point_id(p_vendedor_id));
  v_codigo := public.next_document_code('ventas', 'VEN');

  insert into public.ventas (
    codigo, proforma_id, vendedor_id, punto_venta_id, cliente_nombre, cliente_ci_nit,
    cliente_celular, subtotal, total_descuentos, total, notas
  ) values (
    v_codigo, v_proforma.id, v_proforma.vendedor_id, v_punto_venta_id, v_proforma.cliente_nombre, v_proforma.cliente_ci_nit,
    v_proforma.cliente_celular, v_proforma.subtotal, v_proforma.total_descuentos, v_proforma.total,
    coalesce(p_notas, v_proforma.notas)
  )
  returning id into v_venta_id;

  create temporary table if not exists tmp_proforma_to_venta_item (
    proforma_item_id bigint primary key,
    venta_item_id bigint not null
  ) on commit drop;

  truncate table tmp_proforma_to_venta_item;

  for v_item in
    select * from public.proforma_items where proforma_id = p_proforma_id order by id
  loop
    insert into public.venta_items (
      venta_id, moto_id, moto_e_id, accesorio_id, repuesto_id, descripcion,
      precio_costo_snap, precio_final_snap, descuento_maximo_snap,
      descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal
    ) values (
      v_venta_id, v_item.moto_id, v_item.moto_e_id, v_item.accesorio_id, v_item.repuesto_id, v_item.descripcion,
      v_item.precio_costo_snap, v_item.precio_final_snap, v_item.descuento_maximo_snap,
      v_item.descuento_pct, v_item.descuento_monto, v_item.cantidad, v_item.precio_unitario_final, v_item.subtotal
    )
    returning id into v_venta_item_id;

    insert into tmp_proforma_to_venta_item(proforma_item_id, venta_item_id)
    values (v_item.id, v_venta_item_id);

    if v_item.moto_id is not null then
      perform public.reserved_to_sold_stock_location(v_punto_venta_id, 'motos', v_item.moto_id, v_item.cantidad);
    elsif v_item.moto_e_id is not null then
      perform public.reserved_to_sold_stock_location(v_punto_venta_id, 'motos_e', v_item.moto_e_id, v_item.cantidad);
    elsif v_item.accesorio_id is not null then
      perform public.reserved_to_sold_stock_location(v_punto_venta_id, 'accesorios', v_item.accesorio_id, v_item.cantidad);
    elsif v_item.repuesto_id is not null then
      perform public.reserved_to_sold_stock_location(v_punto_venta_id, 'repuestos', v_item.repuesto_id, v_item.cantidad);
    end if;
  end loop;

  for v_tramite in
    select value from jsonb_array_elements(coalesce(p_tramites, '[]'::jsonb))
  loop
    if upper(coalesce(v_tramite->>'tipo', '')) not in ('BSISA', 'PLACA') then
      continue;
    end if;

    select t.venta_item_id, coalesce(m.marca, me.marca)
      into v_venta_item_id, v_marca
    from tmp_proforma_to_venta_item t
    join public.proforma_items pi on pi.id = t.proforma_item_id
    left join public.motos m on m.id = pi.moto_id
    left join public.motos_e me on me.id = pi.moto_e_id
    where t.proforma_item_id = (v_tramite->>'proforma_item_id')::bigint
      and (pi.moto_id is not null or pi.moto_e_id is not null);

    if v_venta_item_id is null then
      continue;
    end if;

    v_costo_minimo := public.get_tramite_cost(upper(v_tramite->>'tipo'));
    v_costo := coalesce((v_tramite->>'costo_total')::numeric, v_costo_minimo);

    if v_costo < v_costo_minimo then
      raise exception 'El costo del tramite % no puede ser menor al configurado', upper(v_tramite->>'tipo');
    end if;

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
