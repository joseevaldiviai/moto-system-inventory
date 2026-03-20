# Despliegue real: Supabase + Cloudflare

## Objetivo

Levantar `Moto System` en:

- `Supabase` para base de datos y auth
- `Cloudflare Workers` para la API
- `Cloudflare Pages` para el frontend

## Requisitos previos

- Node.js `20+`
- cuenta en `Supabase`
- cuenta en `Cloudflare`
- `npm install` ejecutado

## 1. Crear proyecto en Supabase

1. Crear un proyecto nuevo en Supabase.
2. Ir a `Project Settings -> API`.
3. Copiar:
   - `Project URL`
   - `anon` o `publishable key`
   - `service_role` o `secret key`

Referencia oficial:

- Supabase explica que las claves se encuentran en `Project Settings -> API`, y que `service_role` solo debe usarse en componentes seguros del servidor.

## 2. Cargar migraciones SQL

En Supabase:

1. Ir a `SQL Editor`.
2. Ejecutar en este orden:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_constraints_rls_and_triggers.sql`
   - `supabase/migrations/003_proformas_rpc.sql`
   - `supabase/migrations/004_ventas_rpc.sql`
3. Verificar que las tablas y funciones queden creadas.

## 3. Configurar variables locales

### Frontend

Crear `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

Valor esperado:

```env
VITE_API_BASE_URL=http://127.0.0.1:8787
```

### Worker

Crear `.dev.vars` a partir de `.dev.vars.example`:

```bash
cp .dev.vars.example .dev.vars
```

Completar:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Nota:

- `.dev.vars` es el formato recomendado por Cloudflare para secretos en desarrollo local.

## 4. Probar localmente

En una terminal:

```bash
npm run dev:worker
```

En otra terminal:

```bash
npm run dev
```

Luego:

1. abrir el frontend de Vite
2. usar `Crear admin inicial`
3. iniciar sesion con:
   - usuario: `admin`
   - contrasena: `admin123`

## 5. Configurar secretos del Worker en Cloudflare

Autenticar Wrangler si hace falta:

```bash
npx wrangler login
```

Subir secretos:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Cada comando pedira el valor por stdin.

## 6. Desplegar el Worker

```bash
npm run deploy:worker
```

Anotar la URL resultante del Worker, por ejemplo:

```text
https://moto-system-api.<tu-subdominio>.workers.dev
```

## 7. Configurar frontend para produccion

En Cloudflare Pages, el frontend necesita `VITE_API_BASE_URL`.

Valor recomendado:

```env
VITE_API_BASE_URL=https://moto-system-api.<tu-subdominio>.workers.dev
```

## 8. Crear proyecto en Cloudflare Pages

1. Ir a `Workers & Pages`.
2. Crear un proyecto `Pages`.
3. Conectar el repositorio Git.
4. Configurar:

- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `20`

## 9. Configurar variable del frontend en Pages

En `Pages -> Settings -> Variables and Secrets`:

- agregar `VITE_API_BASE_URL`

Debe configurarse al menos para:

- `Production`
- `Preview`

## 10. Desplegar Pages

Cloudflare Pages desplegara automaticamente al conectar el repo.

Si el proyecto ya existe, volver a desplegar tras guardar variables.

## 11. Configurar dominio propio

Cuando tengas dominio:

- `app.tudominio.com` -> Pages
- `api.tudominio.com` -> Worker

Mientras tanto, puedes usar:

- URL temporal de Pages
- URL `workers.dev`

## 12. Verificacion minima

Probar este flujo:

1. abrir frontend publicado
2. crear admin inicial
3. iniciar sesion
4. crear marca
5. importar o crear inventario
6. crear proforma
7. consolidar venta
8. abrir reportes
9. descargar respaldo

## 13. Variables finales del proyecto

### Local

- `.env.local`
- `.dev.vars`

### Cloudflare Workers

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Cloudflare Pages

- `VITE_API_BASE_URL`

## 14. Observaciones importantes

- `SUPABASE_SERVICE_ROLE_KEY` nunca debe ir al frontend.
- `VITE_API_BASE_URL` si puede ir al frontend porque solo apunta a la API.
- Si algo falla por autenticacion, revisar primero:
  - migraciones cargadas
  - secretos del Worker
  - URL del Worker usada por Pages

## Referencias oficiales

- Cloudflare Workers secrets: `wrangler secret put`
- Cloudflare Pages variables y secrets
- Cloudflare Pages build configuration
- Cloudflare Pages build image / `NODE_VERSION`
- Supabase API keys y ubicacion de claves

