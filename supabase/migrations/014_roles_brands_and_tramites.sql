alter table public.user_profiles
  drop constraint if exists user_profiles_rol_check;

update public.user_profiles
set rol = 'VENDEDOR'
where rol = 'CAJERO';

alter table public.user_profiles
  add constraint user_profiles_rol_check
  check (rol in ('SUPERVISOR', 'VENDEDOR', 'CAJERO'));

alter table public.marcas
  drop constraint if exists marcas_nombre_key;

alter table public.marcas
  add column if not exists grupo_tipo text;

do $$
declare
  r record;
  v_brand_name text;
  v_brand_id bigint;
begin
  for r in
    select 'motos'::text as grupo_tipo, id as product_id, coalesce(nullif(upper(trim(marca)), ''), nullif((select upper(trim(nombre)) from public.marcas where id = motos.marca_id), '')) as marca_nombre
    from public.motos
    union all
    select 'motos_e'::text as grupo_tipo, id as product_id, coalesce(nullif(upper(trim(marca)), ''), nullif((select upper(trim(nombre)) from public.marcas where id = motos_e.marca_id), '')) as marca_nombre
    from public.motos_e
    union all
    select 'accesorios'::text as grupo_tipo, id as product_id, coalesce(nullif(upper(trim(marca)), ''), nullif((select upper(trim(nombre)) from public.marcas where id = accesorios.marca_id), '')) as marca_nombre
    from public.accesorios
    union all
    select 'repuestos'::text as grupo_tipo, id as product_id, coalesce(nullif(upper(trim(marca)), ''), nullif((select upper(trim(nombre)) from public.marcas where id = repuestos.marca_id), '')) as marca_nombre
    from public.repuestos
  loop
    v_brand_name := r.marca_nombre;
    if v_brand_name is null or v_brand_name = '' then
      continue;
    end if;

    select id into v_brand_id
    from public.marcas
    where upper(trim(nombre)) = v_brand_name
      and grupo_tipo = r.grupo_tipo
    order by id
    limit 1;

    if v_brand_id is null then
      select id into v_brand_id
      from public.marcas
      where upper(trim(nombre)) = v_brand_name
        and grupo_tipo is null
      order by id
      limit 1;

      if v_brand_id is not null then
        update public.marcas
        set nombre = v_brand_name,
            grupo_tipo = r.grupo_tipo
        where id = v_brand_id;
      else
        insert into public.marcas (nombre, grupo_tipo, activo)
        values (v_brand_name, r.grupo_tipo, true)
        returning id into v_brand_id;
      end if;
    end if;

    if r.grupo_tipo = 'motos' then
      update public.motos
      set marca_id = v_brand_id,
          marca = v_brand_name
      where id = r.product_id;
    elsif r.grupo_tipo = 'motos_e' then
      update public.motos_e
      set marca_id = v_brand_id,
          marca = v_brand_name
      where id = r.product_id;
    elsif r.grupo_tipo = 'accesorios' then
      update public.accesorios
      set marca_id = v_brand_id,
          marca = v_brand_name
      where id = r.product_id;
    else
      update public.repuestos
      set marca_id = v_brand_id,
          marca = v_brand_name
      where id = r.product_id;
    end if;
  end loop;

  delete from public.marcas m
  where m.grupo_tipo is null
    and not exists (select 1 from public.motos where marca_id = m.id)
    and not exists (select 1 from public.motos_e where marca_id = m.id)
    and not exists (select 1 from public.accesorios where marca_id = m.id)
    and not exists (select 1 from public.repuestos where marca_id = m.id);

  update public.marcas
  set grupo_tipo = 'motos'
  where grupo_tipo is null;
end $$;

alter table public.marcas
  alter column grupo_tipo set not null;

alter table public.marcas
  drop constraint if exists marcas_grupo_tipo_check;

alter table public.marcas
  add constraint marcas_grupo_tipo_check
  check (grupo_tipo in ('motos', 'motos_e', 'accesorios', 'repuestos'));

drop index if exists idx_marcas_activo;
create index if not exists idx_marcas_activo on public.marcas(activo);

create unique index if not exists uq_marcas_nombre_grupo
  on public.marcas(nombre, grupo_tipo);

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
  v_tramite jsonb;
  v_tramite_tipo text;
  v_tramite_cost numeric(12,2);
  v_tramite_minimo numeric(12,2);
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

    if v_table_name in ('motos', 'motos_e') and jsonb_typeof(coalesce(v_item->'tramites', '[]'::jsonb)) = 'array' then
      for v_tramite in
        select value from jsonb_array_elements(coalesce(v_item->'tramites', '[]'::jsonb))
      loop
        if jsonb_typeof(v_tramite) = 'string' then
          v_tramite_tipo := upper(v_tramite #>> '{}');
          v_tramite_minimo := public.get_tramite_cost(v_tramite_tipo);
          v_tramite_cost := v_tramite_minimo;
        else
          v_tramite_tipo := upper(coalesce(v_tramite->>'tipo', ''));
          if v_tramite_tipo not in ('BSISA', 'PLACA') then
            continue;
          end if;
          v_tramite_minimo := public.get_tramite_cost(v_tramite_tipo);
          v_tramite_cost := coalesce((v_tramite->>'costo_total')::numeric, v_tramite_minimo);
        end if;

        if v_tramite_tipo not in ('BSISA', 'PLACA') then
          continue;
        end if;

        if v_tramite_cost < v_tramite_minimo then
          raise exception 'El costo del tramite % no puede ser menor al configurado', v_tramite_tipo;
        end if;

        insert into public.tramites (
          venta_item_id, tipo, nombre, marca, costo_total, cobro_en_venta,
          a_cuenta, saldo, estado
        ) values (
          v_venta_item_id, v_tramite_tipo, p_cliente_nombre, v_product.marca, v_tramite_cost, true,
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
