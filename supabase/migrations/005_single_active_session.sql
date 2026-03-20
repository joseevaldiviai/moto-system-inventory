alter table public.user_profiles
  add column if not exists sesion_activa_id text,
  add column if not exists sesion_activa_actualizada_en timestamptz;

create index if not exists idx_user_profiles_sesion_activa_id
  on public.user_profiles (sesion_activa_id)
  where sesion_activa_id is not null;
