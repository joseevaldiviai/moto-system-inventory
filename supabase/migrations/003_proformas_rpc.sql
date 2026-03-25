create or replace function public.next_document_code(p_table_name text, p_prefix text)
returns text
language plpgsql
as $$
declare
  current_year text := to_char(now(), 'YYYY');
  total bigint;
begin
  execute format(
    'select count(*) from public.%I where codigo like $1',
    p_table_name
  )
  into total
  using p_prefix || '-' || current_year || '-%';

  return p_prefix || '-' || current_year || '-' || lpad((total + 1)::text, 4, '0');
end;
$$;

create or replace function public.reserve_stock(p_table_name text, p_id bigint, p_cantidad integer)
returns void
language plpgsql
as $$
declare
  updated_count integer;
begin
  execute format(
    'update public.%I
       set cantidad_libre = cantidad_libre - $1,
           cantidad_reservada = cantidad_reservada + $1,
           actualizado_en = now()
     where id = $2 and activo = true and cantidad_libre >= $1',
    p_table_name
  )
  using p_cantidad, p_id;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Stock insuficiente';
  end if;
end;
$$;

create or replace function public.release_reserved_stock(p_table_name text, p_id bigint, p_cantidad integer)
returns void
language plpgsql
as $$
declare
  updated_count integer;
begin
  execute format(
    'update public.%I
       set cantidad_libre = cantidad_libre + $1,
           cantidad_reservada = cantidad_reservada - $1,
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
        perform public.release_reserved_stock('motos', it.moto_id, it.cantidad);
      elsif it.accesorio_id is not null then
        perform public.release_reserved_stock('accesorios', it.accesorio_id, it.cantidad);
      elsif it.repuesto_id is not null then
        perform public.release_reserved_stock('repuestos', it.repuesto_id, it.cantidad);
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

  v_codigo := public.next_document_code('proformas', 'PRO');

  insert into public.proformas (
    codigo,
    vendedor_id,
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

    if v_table_name = 'motos' then
      v_costo := v_product.costo;
      v_precio_venta := v_product.precio_venta;
    else
      v_costo := v_product.precio;
      v_precio_venta := v_product.precio_final;
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
      insert into public.proforma_items (
        proforma_id, moto_id, descripcion, modelo, tipo, color, cilindrada, motor,
        precio_costo_snap, precio_final_snap, descuento_maximo_snap, descuento_pct,
        descuento_monto, cantidad, precio_unitario_final, subtotal
      ) values (
        v_proforma_id, v_producto_id, v_descripcion, v_product.ano, v_product.tipo, v_product.color, v_product.cilindrada, v_product.motor,
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

    perform public.reserve_stock(v_table_name, v_producto_id, v_cantidad);

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

  for v_item in
    select * from public.proforma_items where proforma_id = p_id
  loop
    if v_item.moto_id is not null then
      perform public.release_reserved_stock('motos', v_item.moto_id, v_item.cantidad);
    elsif v_item.accesorio_id is not null then
      perform public.release_reserved_stock('accesorios', v_item.accesorio_id, v_item.cantidad);
    elsif v_item.repuesto_id is not null then
      perform public.release_reserved_stock('repuestos', v_item.repuesto_id, v_item.cantidad);
    end if;
  end loop;

  update public.proformas
  set estado = 'CANCELADA',
      actualizado_en = now()
  where id = p_id;
end;
$$;
