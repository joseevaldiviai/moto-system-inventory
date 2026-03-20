create extension if not exists citext;

alter table public.user_profiles
  alter column email type citext using email::citext,
  alter column username type citext using username::citext;

alter table public.user_profiles
  add column if not exists actualizado_en timestamptz not null default now();

alter table public.marcas
  add column if not exists actualizado_en timestamptz not null default now();

alter table public.motos
  add column if not exists actualizado_en timestamptz not null default now();

alter table public.accesorios
  add column if not exists actualizado_en timestamptz not null default now();

alter table public.repuestos
  add column if not exists actualizado_en timestamptz not null default now();

alter table public.proformas
  add column if not exists actualizado_en timestamptz not null default now();

alter table public.ventas
  add column if not exists actualizado_en timestamptz not null default now();

alter table public.config
  add column if not exists actualizado_en timestamptz not null default now();

create or replace function public.set_updated_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated on public.user_profiles;
create trigger trg_user_profiles_updated
before update on public.user_profiles
for each row execute function public.set_updated_timestamp();

drop trigger if exists trg_marcas_updated on public.marcas;
create trigger trg_marcas_updated
before update on public.marcas
for each row execute function public.set_updated_timestamp();

drop trigger if exists trg_motos_updated on public.motos;
create trigger trg_motos_updated
before update on public.motos
for each row execute function public.set_updated_timestamp();

drop trigger if exists trg_accesorios_updated on public.accesorios;
create trigger trg_accesorios_updated
before update on public.accesorios
for each row execute function public.set_updated_timestamp();

drop trigger if exists trg_repuestos_updated on public.repuestos;
create trigger trg_repuestos_updated
before update on public.repuestos
for each row execute function public.set_updated_timestamp();

drop trigger if exists trg_proformas_updated on public.proformas;
create trigger trg_proformas_updated
before update on public.proformas
for each row execute function public.set_updated_timestamp();

drop trigger if exists trg_ventas_updated on public.ventas;
create trigger trg_ventas_updated
before update on public.ventas
for each row execute function public.set_updated_timestamp();

drop trigger if exists trg_tramites_updated on public.tramites;
create trigger trg_tramites_updated
before update on public.tramites
for each row execute function public.set_updated_timestamp();

drop trigger if exists trg_config_updated on public.config;
create trigger trg_config_updated
before update on public.config
for each row execute function public.set_updated_timestamp();

alter table public.motos
  add constraint chk_motos_precio_valido check (precio >= 0 and precio_final >= 0 and precio_final >= precio),
  add constraint chk_motos_descuento_pct check (descuento_maximo_pct >= 0 and descuento_maximo_pct <= 100),
  add constraint chk_motos_stock_nonnegative check (
    cantidad_libre >= 0 and cantidad_reservada >= 0 and cantidad_vendida >= 0
  );

alter table public.accesorios
  add constraint chk_accesorios_precio_valido check (precio >= 0 and precio_final >= 0 and precio_final >= precio),
  add constraint chk_accesorios_descuento_pct check (descuento_maximo_pct >= 0 and descuento_maximo_pct <= 100),
  add constraint chk_accesorios_stock_nonnegative check (
    cantidad_libre >= 0 and cantidad_reservada >= 0 and cantidad_vendida >= 0
  );

alter table public.repuestos
  add constraint chk_repuestos_precio_valido check (precio >= 0 and precio_final >= 0 and precio_final >= precio),
  add constraint chk_repuestos_descuento_pct check (descuento_maximo_pct >= 0 and descuento_maximo_pct <= 100),
  add constraint chk_repuestos_stock_nonnegative check (
    cantidad_libre >= 0 and cantidad_reservada >= 0 and cantidad_vendida >= 0
  );

alter table public.proformas
  add constraint chk_proformas_totales_nonnegative check (
    subtotal >= 0 and total_descuentos >= 0 and total >= 0
  ),
  add constraint chk_proformas_fechas check (fecha_expiracion >= fecha_creacion);

alter table public.proforma_items
  add constraint chk_proforma_items_producto_unico check (
    ((moto_id is not null)::int + (accesorio_id is not null)::int + (repuesto_id is not null)::int) = 1
  ),
  add constraint chk_proforma_items_cantidad check (cantidad > 0),
  add constraint chk_proforma_items_montos_nonnegative check (
    precio_costo_snap >= 0 and
    precio_final_snap >= 0 and
    descuento_maximo_snap >= 0 and
    descuento_maximo_snap <= 100 and
    descuento_pct >= 0 and
    descuento_monto >= 0 and
    precio_unitario_final >= 0 and
    subtotal >= 0
  );

alter table public.ventas
  add constraint chk_ventas_totales_nonnegative check (
    subtotal >= 0 and total_descuentos >= 0 and total >= 0
  );

alter table public.venta_items
  add constraint chk_venta_items_producto_unico check (
    ((moto_id is not null)::int + (accesorio_id is not null)::int + (repuesto_id is not null)::int) = 1
  ),
  add constraint chk_venta_items_cantidad check (cantidad > 0),
  add constraint chk_venta_items_montos_nonnegative check (
    precio_costo_snap >= 0 and
    precio_final_snap >= 0 and
    descuento_maximo_snap >= 0 and
    descuento_maximo_snap <= 100 and
    descuento_pct >= 0 and
    descuento_monto >= 0 and
    precio_unitario_final >= 0 and
    subtotal >= 0
  );

alter table public.tramites
  add constraint chk_tramites_montos_nonnegative check (
    costo_total >= 0 and
    coalesce(a_cuenta, 0) >= 0 and
    coalesce(saldo, 0) >= 0
  );

create index if not exists idx_user_profiles_username on public.user_profiles(username);
create index if not exists idx_user_profiles_rol on public.user_profiles(rol);
create index if not exists idx_motos_busqueda on public.motos(marca, modelo, chasis);
create index if not exists idx_accesorios_busqueda on public.accesorios(marca, tipo);
create index if not exists idx_repuestos_busqueda on public.repuestos(marca, tipo);

alter table public.user_profiles enable row level security;
alter table public.config enable row level security;
alter table public.marcas enable row level security;
alter table public.motos enable row level security;
alter table public.accesorios enable row level security;
alter table public.repuestos enable row level security;
alter table public.proformas enable row level security;
alter table public.proforma_items enable row level security;
alter table public.ventas enable row level security;
alter table public.venta_items enable row level security;
alter table public.tramites enable row level security;

drop policy if exists user_profiles_select_self on public.user_profiles;
create policy user_profiles_select_self
on public.user_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self
on public.user_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
