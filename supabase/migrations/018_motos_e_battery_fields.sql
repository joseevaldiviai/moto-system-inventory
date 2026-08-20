-- Agregar campos de batería a la tabla de motos eléctricas
alter table public.motos_e add column if not exists tipo_bateria text;
alter table public.motos_e add column if not exists bateria text;
