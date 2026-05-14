alter table public.accesorios
  add column if not exists producto text;

alter table public.repuestos
  add column if not exists producto text;

update public.accesorios
set producto = coalesce(nullif(trim(producto), ''), tipo)
where coalesce(trim(producto), '') = '';

update public.repuestos
set producto = coalesce(nullif(trim(producto), ''), tipo)
where coalesce(trim(producto), '') = '';

create index if not exists idx_accesorios_producto
  on public.accesorios(producto);

create index if not exists idx_repuestos_producto
  on public.repuestos(producto);
