do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'motos' and column_name = 'modelo'
  ) then
    alter table public.motos rename column modelo to ano;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'motos' and column_name = 'precio'
  ) then
    alter table public.motos rename column precio to costo;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'motos' and column_name = 'precio_final'
  ) then
    alter table public.motos rename column precio_final to precio_venta;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'motos_e' and column_name = 'modelo'
  ) then
    alter table public.motos_e rename column modelo to ano;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'motos_e' and column_name = 'precio'
  ) then
    alter table public.motos_e rename column precio to costo;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'motos_e' and column_name = 'precio_final'
  ) then
    alter table public.motos_e rename column precio_final to precio_venta;
  end if;
end $$;

drop index if exists public.idx_motos_busqueda;
create index if not exists idx_motos_busqueda on public.motos(marca, ano, chasis);

drop index if exists public.idx_motos_e_busqueda;
create index if not exists idx_motos_e_busqueda on public.motos_e(marca, ano, chasis);

alter table public.motos drop constraint if exists chk_motos_precio_valido;
alter table public.motos
  add constraint chk_motos_precio_valido check (costo >= 0 and precio_venta >= 0 and precio_venta >= costo);

alter table public.motos_e drop constraint if exists chk_motos_e_precio_valido;
alter table public.motos_e
  add constraint chk_motos_e_precio_valido check (costo >= 0 and precio_venta >= 0 and precio_venta >= costo);
