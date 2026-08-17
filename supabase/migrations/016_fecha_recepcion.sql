-- Campo fecha de recepcion (opcional) para cada producto.

alter table public.motos add column if not exists fecha_recepcion date;
alter table public.motos_e add column if not exists fecha_recepcion date;
alter table public.accesorios add column if not exists fecha_recepcion date;
alter table public.repuestos add column if not exists fecha_recepcion date;
