alter table public.proforma_items
  add column if not exists moto_e_id bigint references public.motos_e(id);

alter table public.venta_items
  add column if not exists moto_e_id bigint references public.motos_e(id);

create or replace function public.expire_proformas()
returns void
language plpgsql
as $$
declare
  pf record;
  it record;
begin
  for pf in
    select id
    from public.proformas
    where estado = 'ACTIVA'
      and fecha_expiracion < now()
  loop
    for it in
      select *
      from public.proforma_items
      where proforma_id = pf.id
    loop
      if it.moto_id is not null then
        perform public.release_reserved_stock_location(coalesce(pf.punto_venta_id, public.get_central_point_id()), 'motos', it.moto_id, it.cantidad);
      elsif it.moto_e_id is not null then
        perform public.release_reserved_stock_location(coalesce(pf.punto_venta_id, public.get_central_point_id()), 'motos_e', it.moto_e_id, it.cantidad);
      elsif it.accesorio_id is not null then
        perform public.release_reserved_stock_location(coalesce(pf.punto_venta_id, public.get_central_point_id()), 'accesorios', it.accesorio_id, it.cantidad);
      elsif it.repuesto_id is not null then
        perform public.release_reserved_stock_location(coalesce(pf.punto_venta_id, public.get_central_point_id()), 'repuestos', it.repuesto_id, it.cantidad);
      end if;
    end loop;

    update public.proformas
    set estado = 'VENCIDA',
        actualizado_en = now()
    where id = pf.id;
  end loop;
end;
$$;

create or replace function public.create_proforma(
  p_vendedor_id uuid,
  p_cliente_nombre text,
  p_cliente_ci_nit text,
  p_cliente_celular text,
  p_items jsonb,
  p_fecha_limite timestamptz default null,
  p_dias_vigencia integer default 7,
  p_notas text default null
)
returns bigint
language plpgsql
as $$
declare
  v_proforma_id bigint;
  v_codigo text;
  v_fecha_expiracion timestamptz;
  v_item jsonb;
  v_producto_id bigint;
  v_table_name text;
  v_product record;
  v_cantidad integer;
  v_descuento_pct numeric(5,2);
  v_descuento_monto numeric(12,2);
  v_precio_unitario_final numeric(12,2);
  v_subtotal numeric(12,2);
  v_subtotal_total numeric(12,2) := 0;
  v_total_descuentos numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_descripcion text;
  v_costo numeric(12,2);
  v_precio_venta numeric(12,2);
  v_punto_venta_id bigint;
begin
  if coalesce(trim(p_cliente_nombre), '') = '' or coalesce(trim(p_cliente_ci_nit), '') = '' or coalesce(trim(p_cliente_celular), '') = '' then
    raise exception 'Datos del cliente incompletos';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe incluir al menos un item';
  end if;

  if p_fecha_limite is not null then
    if p_fecha_limite < now() then
      raise exception 'La fecha limite no puede ser pasada';
    end if;
    v_fecha_expiracion := p_fecha_limite;
  else
    v_fecha_expiracion := now() + make_interval(days => greatest(coalesce(p_dias_vigencia, 7), 1));
  end if;

  v_punto_venta_id := public.resolve_sales_point_id(p_vendedor_id);
  v_codigo := public.next_document_code('proformas', 'PRO');

  insert into public.proformas (
    codigo,
    vendedor_id,
    punto_venta_id,
    cliente_nombre,
    cliente_ci_nit,
    cliente_celular,
    fecha_expiracion,
    subtotal,
    total_descuentos,
    total,
    notas
  ) values (
    v_codigo,
    p_vendedor_id,
    v_punto_venta_id,
    p_cliente_nombre,
    p_cliente_ci_nit,
    p_cliente_celular,
    v_fecha_expiracion,
    0,
    0,
    0,
    p_notas
  )
  returning id into v_proforma_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_cantidad := greatest(coalesce((v_item->>'cantidad')::integer, 1), 1);
    v_descuento_pct := coalesce((v_item->>'descuento_pct')::numeric, 0);

    if (v_item ? 'moto_id') then
      v_producto_id := (v_item->>'moto_id')::bigint;
      v_table_name := 'motos';
      select * into v_product from public.motos where id = v_producto_id and activo = true for update;
    elsif (v_item ? 'moto_e_id') then
      v_producto_id := (v_item->>'moto_e_id')::bigint;
      v_table_name := 'motos_e';
      select * into v_product from public.motos_e where id = v_producto_id and activo = true for update;
    elsif (v_item ? 'accesorio_id') then
      v_producto_id := (v_item->>'accesorio_id')::bigint;
      v_table_name := 'accesorios';
      select * into v_product from public.accesorios where id = v_producto_id and activo = true for update;
    elsif (v_item ? 'repuesto_id') then
      v_producto_id := (v_item->>'repuesto_id')::bigint;
      v_table_name := 'repuestos';
      select * into v_product from public.repuestos where id = v_producto_id and activo = true for update;
    else
      raise exception 'Debe existir exactamente un producto por item';
    end if;

    if not found then
      raise exception 'Producto no encontrado o inactivo';
    end if;

    if v_descuento_pct < 0 or v_descuento_pct > v_product.descuento_maximo_pct then
      raise exception 'Descuento supera el maximo permitido';
    end if;

    if v_table_name in ('motos', 'motos_e') then
      v_costo := v_product.costo;
      v_precio_venta := v_product.precio_venta;
    else
      v_costo := v_product.precio;
      v_precio_venta := v_product.precio_final;
    end if;

    if v_precio_venta < v_costo then
      raise exception 'Producto con precio de venta menor a costo';
    end if;

    v_descuento_monto := (v_precio_venta * v_descuento_pct) / 100;
    if v_descuento_monto > (v_precio_venta - v_costo) then
      raise exception 'Descuento supera la ganancia unitaria';
    end if;

    v_precio_unitario_final := v_precio_venta - v_descuento_monto;
    v_subtotal := v_precio_unitario_final * v_cantidad;

    if v_table_name = 'motos' then
      v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), trim(v_product.marca || ' ' || v_product.ano));
      insert into public.proforma_items (
        proforma_id, moto_id, descripcion, modelo, tipo, color, cilindrada, motor,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap, descuento_pct,
        descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_proforma_id, v_producto_id, v_descripcion, v_product.ano, v_product.tipo, v_product.color, v_product.cilindrada, v_product.motor,
        v_costo, v_precio_venta, v_product.descuento_maximo_pct, v_descuento_pct,
        v_descuento_monto, v_cantidad, v_precio_unitario_final, v_subtotal
      );
    elsif v_table_name = 'motos_e' then
      v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), trim(v_product.marca || ' ' || v_product.ano));
      insert into public.proforma_items (
        proforma_id, moto_e_id, descripcion, modelo, tipo, color, cilindrada, motor,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap, descuento_pct,
        descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_proforma_id, v_producto_id, v_descripcion, v_product.ano, v_product.tipo, v_product.color, v_product.potencia, v_product.motor,
        v_costo, v_precio_venta, v_product.descuento_maximo_pct, v_descuento_pct,
        v_descuento_monto, v_cantidad, v_precio_unitario_final, v_subtotal
      );
    elsif v_table_name = 'accesorios' then
      v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), trim(coalesce(v_product.marca || ' ', '') || v_product.tipo));
      insert into public.proforma_items (
        proforma_id, accesorio_id, descripcion, modelo, tipo, color, cilindrada, motor,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap, descuento_pct,
        descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_proforma_id, v_producto_id, v_descripcion, null, v_product.tipo, v_product.color, null, null,
        v_costo, v_precio_venta, v_product.descuento_maximo_pct, v_descuento_pct,
        v_descuento_monto, v_cantidad, v_precio_unitario_final, v_subtotal
      );
    else
      v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), trim(coalesce(v_product.marca || ' ', '') || v_product.tipo));
      insert into public.proforma_items (
        proforma_id, repuesto_id, descripcion, modelo, tipo, color, cilindrada, motor,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap, descuento_pct,
        descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_proforma_id, v_producto_id, v_descripcion, null, v_product.tipo, null, null, null,
        v_costo, v_precio_venta, v_product.descuento_maximo_pct, v_descuento_pct,
        v_descuento_monto, v_cantidad, v_precio_unitario_final, v_subtotal
      );
    end if;

    perform public.reserve_stock_location(v_punto_venta_id, v_table_name, v_producto_id, v_cantidad);

    v_subtotal_total := v_subtotal_total + (v_precio_venta * v_cantidad);
    v_total_descuentos := v_total_descuentos + (v_descuento_monto * v_cantidad);
    v_total := v_total + v_subtotal;
  end loop;

  update public.proformas
  set subtotal = v_subtotal_total,
      total_descuentos = v_total_descuentos,
      total = v_total,
      actualizado_en = now()
  where id = v_proforma_id;

  return v_proforma_id;
end;
$$;

create or replace function public.cancel_proforma(p_id bigint)
returns void
language plpgsql
as $$
declare
  v_proforma record;
  v_item record;
  v_punto_venta_id bigint;
begin
  select * into v_proforma
  from public.proformas
  where id = p_id
  for update;

  if not found then
    raise exception 'Proforma no encontrada';
  end if;

  if v_proforma.estado <> 'ACTIVA' then
    raise exception 'Solo se pueden cancelar proformas activas';
  end if;

  v_punto_venta_id := coalesce(v_proforma.punto_venta_id, public.get_central_point_id());

  for v_item in
    select * from public.proforma_items where proforma_id = p_id
  loop
    if v_item.moto_id is not null then
      perform public.release_reserved_stock_location(v_punto_venta_id, 'motos', v_item.moto_id, v_item.cantidad);
    elsif v_item.moto_e_id is not null then
      perform public.release_reserved_stock_location(v_punto_venta_id, 'motos_e', v_item.moto_e_id, v_item.cantidad);
    elsif v_item.accesorio_id is not null then
      perform public.release_reserved_stock_location(v_punto_venta_id, 'accesorios', v_item.accesorio_id, v_item.cantidad);
    elsif v_item.repuesto_id is not null then
      perform public.release_reserved_stock_location(v_punto_venta_id, 'repuestos', v_item.repuesto_id, v_item.cantidad);
    end if;
  end loop;

  update public.proformas
  set estado = 'CANCELADA',
      actualizado_en = now()
  where id = p_id;
end;
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

  delete from tmp_proforma_to_venta_item;

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
  v_punto_venta_id bigint;
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

  v_punto_venta_id := coalesce(v_sale.punto_venta_id, public.get_central_point_id());

  for v_item in
    select * from public.venta_items where venta_id = p_sale_id
  loop
    if v_item.moto_id is not null then
      perform public.sold_to_libre_stock_location(v_punto_venta_id, 'motos', v_item.moto_id, v_item.cantidad);
    elsif v_item.moto_e_id is not null then
      perform public.sold_to_libre_stock_location(v_punto_venta_id, 'motos_e', v_item.moto_e_id, v_item.cantidad);
    elsif v_item.accesorio_id is not null then
      perform public.sold_to_libre_stock_location(v_punto_venta_id, 'accesorios', v_item.accesorio_id, v_item.cantidad);
    elsif v_item.repuesto_id is not null then
      perform public.sold_to_libre_stock_location(v_punto_venta_id, 'repuestos', v_item.repuesto_id, v_item.cantidad);
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

create or replace function public.create_direct_sale(
  p_vendedor_id uuid,
  p_cliente_nombre text,
  p_cliente_ci_nit text,
  p_cliente_celular text,
  p_items jsonb,
  p_notas text default null
)
returns bigint
language plpgsql
as $$
declare
  v_venta_id bigint;
  v_venta_item_id bigint;
  v_codigo text;
  v_item jsonb;
  v_producto_id bigint;
  v_table_name text;
  v_product record;
  v_cantidad integer;
  v_descuento_pct numeric(5,2);
  v_descuento_monto numeric(12,2);
  v_precio_unitario_final numeric(12,2);
  v_subtotal numeric(12,2);
  v_subtotal_total numeric(12,2) := 0;
  v_total_descuentos numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_descripcion text;
  v_costo numeric(12,2);
  v_precio_venta numeric(12,2);
  v_tramite text;
  v_tramite_cost numeric(12,2);
  v_tramites_total numeric(12,2) := 0;
  v_punto_venta_id bigint;
begin
  if coalesce(trim(p_cliente_nombre), '') = '' or coalesce(trim(p_cliente_ci_nit), '') = '' or coalesce(trim(p_cliente_celular), '') = '' then
    raise exception 'Datos del cliente incompletos';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe incluir al menos un item';
  end if;

  v_punto_venta_id := public.resolve_sales_point_id(p_vendedor_id);
  v_codigo := public.next_document_code('ventas', 'VEN');

  insert into public.ventas (
    codigo, proforma_id, vendedor_id, punto_venta_id, cliente_nombre, cliente_ci_nit,
    cliente_celular, subtotal, total_descuentos, total, notas
  ) values (
    v_codigo, null, p_vendedor_id, v_punto_venta_id, p_cliente_nombre, p_cliente_ci_nit,
    p_cliente_celular, 0, 0, 0, p_notas
  )
  returning id into v_venta_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_cantidad := greatest(coalesce((v_item->>'cantidad')::integer, 1), 1);
    v_descuento_pct := coalesce((v_item->>'descuento_pct')::numeric, 0);

    if (v_item ? 'moto_id') then
      v_producto_id := (v_item->>'moto_id')::bigint;
      v_table_name := 'motos';
      select * into v_product from public.motos where id = v_producto_id and activo = true for update;
    elsif (v_item ? 'moto_e_id') then
      v_producto_id := (v_item->>'moto_e_id')::bigint;
      v_table_name := 'motos_e';
      select * into v_product from public.motos_e where id = v_producto_id and activo = true for update;
    elsif (v_item ? 'accesorio_id') then
      v_producto_id := (v_item->>'accesorio_id')::bigint;
      v_table_name := 'accesorios';
      select * into v_product from public.accesorios where id = v_producto_id and activo = true for update;
    elsif (v_item ? 'repuesto_id') then
      v_producto_id := (v_item->>'repuesto_id')::bigint;
      v_table_name := 'repuestos';
      select * into v_product from public.repuestos where id = v_producto_id and activo = true for update;
    else
      raise exception 'Debe existir exactamente un producto por item';
    end if;

    if not found then
      raise exception 'Producto no encontrado o inactivo';
    end if;

    if v_table_name in ('motos', 'motos_e') then
      v_costo := v_product.costo;
      v_precio_venta := v_product.precio_venta;
    else
      v_costo := v_product.precio;
      v_precio_venta := v_product.precio_final;
    end if;

    if v_descuento_pct < 0 or v_descuento_pct > v_product.descuento_maximo_pct then
      raise exception 'Descuento supera el maximo permitido';
    end if;

    if v_precio_venta < v_costo then
      raise exception 'Producto con precio de venta menor a costo';
    end if;

    v_descuento_monto := (v_precio_venta * v_descuento_pct) / 100;
    if v_descuento_monto > (v_precio_venta - v_costo) then
      raise exception 'Descuento supera la ganancia unitaria';
    end if;

    v_precio_unitario_final := v_precio_venta - v_descuento_monto;
    v_subtotal := v_precio_unitario_final * v_cantidad;

    if v_table_name = 'motos' then
      v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), trim(v_product.marca || ' ' || v_product.ano));
      insert into public.venta_items (
        venta_id, moto_id, descripcion,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap,
        descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_venta_id, v_producto_id, v_descripcion,
        v_costo, v_precio_venta, v_product.descuento_maximo_pct,
        v_descuento_pct, v_descuento_monto, v_cantidad, v_precio_unitario_final, v_subtotal
      )
      returning id into v_venta_item_id;
    elsif v_table_name = 'motos_e' then
      v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), trim(v_product.marca || ' ' || v_product.ano));
      insert into public.venta_items (
        venta_id, moto_e_id, descripcion,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap,
        descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_venta_id, v_producto_id, v_descripcion,
        v_costo, v_precio_venta, v_product.descuento_maximo_pct,
        v_descuento_pct, v_descuento_monto, v_cantidad, v_precio_unitario_final, v_subtotal
      )
      returning id into v_venta_item_id;
    elsif v_table_name = 'accesorios' then
      v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), trim(coalesce(v_product.marca || ' ', '') || v_product.tipo));
      insert into public.venta_items (
        venta_id, accesorio_id, descripcion,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap,
        descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_venta_id, v_producto_id, v_descripcion,
        v_costo, v_precio_venta, v_product.descuento_maximo_pct,
        v_descuento_pct, v_descuento_monto, v_cantidad, v_precio_unitario_final, v_subtotal
      )
      returning id into v_venta_item_id;
    else
      v_descripcion := coalesce(nullif(v_item->>'descripcion', ''), trim(coalesce(v_product.marca || ' ', '') || v_product.tipo));
      insert into public.venta_items (
        venta_id, repuesto_id, descripcion,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap,
        descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_venta_id, v_producto_id, v_descripcion,
        v_costo, v_precio_venta, v_product.descuento_maximo_pct,
        v_descuento_pct, v_descuento_monto, v_cantidad, v_precio_unitario_final, v_subtotal
      )
      returning id into v_venta_item_id;
    end if;

    perform public.libre_to_sold_stock_location(v_punto_venta_id, v_table_name, v_producto_id, v_cantidad);

    if v_table_name = 'motos' and jsonb_typeof(coalesce(v_item->'tramites', '[]'::jsonb)) = 'array' then
      for v_tramite in
        select upper(value #>> '{}') from jsonb_array_elements(coalesce(v_item->'tramites', '[]'::jsonb))
      loop
        if v_tramite not in ('BSISA', 'PLACA') then
          continue;
        end if;

        v_tramite_cost := public.get_tramite_cost(v_tramite);

        insert into public.tramites (
          venta_item_id, tipo, nombre, marca, costo_total, cobro_en_venta,
          a_cuenta, saldo, estado
        ) values (
          v_venta_item_id, v_tramite, p_cliente_nombre, v_product.marca, v_tramite_cost, true,
          null, null, 'PENDIENTE'
        );

        v_tramites_total := v_tramites_total + v_tramite_cost;
      end loop;
    end if;

    v_subtotal_total := v_subtotal_total + (v_precio_venta * v_cantidad);
    v_total_descuentos := v_total_descuentos + (v_descuento_monto * v_cantidad);
    v_total := v_total + v_subtotal;
  end loop;

  update public.ventas
  set subtotal = v_subtotal_total,
      total_descuentos = v_total_descuentos,
      total = v_total + v_tramites_total,
      actualizado_en = now()
  where id = v_venta_id;

  return v_venta_id;
end;
$$;
