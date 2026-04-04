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
begin
  if coalesce(trim(p_cliente_nombre), '') = '' or coalesce(trim(p_cliente_ci_nit), '') = '' or coalesce(trim(p_cliente_celular), '') = '' then
    raise exception 'Datos del cliente incompletos';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe incluir al menos un item';
  end if;

  v_codigo := public.next_document_code('ventas', 'VEN');

  insert into public.ventas (
    codigo, proforma_id, vendedor_id, cliente_nombre, cliente_ci_nit,
    cliente_celular, subtotal, total_descuentos, total, notas
  ) values (
    v_codigo, null, p_vendedor_id, p_cliente_nombre, p_cliente_ci_nit,
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

    if v_table_name = 'motos' then
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

    if v_product.cantidad_libre < v_cantidad then
      raise exception 'Stock insuficiente';
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

    perform public.libre_to_sold_stock(v_table_name, v_producto_id, v_cantidad);

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
