# Moto System

Sistema web de gestion para concesionario de motos.

## Stack actual

```text
Cloudflare Pages   -> frontend React + Vite
Cloudflare Workers -> API HTTP
Supabase           -> PostgreSQL + Auth
```

## Estructura

```text
moto-system/
├── src/                    frontend web
├── worker/                 API para Cloudflare Workers
├── supabase/migrations/    esquema y funciones SQL
├── docs/                   documentacion de migracion
├── public/
├── package.json
├── vite.config.js
└── wrangler.toml
```

## Comandos

```bash
npm install
npm run dev
npm run dev:worker
npm run build
npm run deploy:worker
npm run deploy:pages
```

## Requisitos de desarrollo

- Node.js 20 o superior
- Cuenta/configuracion de Cloudflare
- Proyecto de Supabase

## Arranque real

Ver guia completa en:

- [docs/deploy-cloudflare-supabase.md](/home/jose/projects/moto-system-node/moto-system/docs/deploy-cloudflare-supabase.md)

## Variables necesarias

Frontend:

- `VITE_API_BASE_URL`
- En despliegue no debe apuntar a `http://127.0.0.1:8787` ni `http://localhost:8787`; debe usar la URL publica del Worker.

Worker:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Base de datos

La base de datos vive en `Supabase Postgres`.

Migraciones actuales:

- [001_initial_schema.sql](/home/jose/projects/moto-system-node/moto-system/supabase/migrations/001_initial_schema.sql)
- [002_constraints_rls_and_triggers.sql](/home/jose/projects/moto-system-node/moto-system/supabase/migrations/002_constraints_rls_and_triggers.sql)
- [003_proformas_rpc.sql](/home/jose/projects/moto-system-node/moto-system/supabase/migrations/003_proformas_rpc.sql)
- [004_ventas_rpc.sql](/home/jose/projects/moto-system-node/moto-system/supabase/migrations/004_ventas_rpc.sql)

## Estado funcional

- Auth y usuarios: migrado a web
- Inventario y CSV: migrado a web
- Proformas: migrado a web
- Ventas y tramites: migrado a web
- Reportes: migrado a web
- Exportaciones: migradas a descargas web

## Nota

El repositorio ya esta orientado a la version web. El codigo heredado de Electron fue retirado del flujo principal.
