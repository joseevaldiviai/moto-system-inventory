alter table public.accesorios
  add column if not exists talla text;

create index if not exists idx_accesorios_busqueda_talla
  on public.accesorios(talla);
