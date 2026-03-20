# Fase 1: Diseno Objetivo

## Objetivo

Definir la arquitectura base de la migracion de `Moto System` desde `Electron + SQLite local` hacia una aplicacion web desplegada con servicios gratuitos.

## Arquitectura final aprobada

La arquitectura objetivo del sistema sera:

- `Cloudflare Pages` para el frontend `React + Vite`
- `Cloudflare Workers` para la API HTTP
- `Supabase` para `PostgreSQL`
- `Supabase Auth` para autenticacion y sesiones

## Decision de autenticacion

Se aprueba usar `Supabase Auth` como opcion principal.

### Motivos

- Evita implementar login, refresh tokens y recuperacion de sesiones manualmente en Workers.
- Permite manejo de sesiones web real, en lugar del modelo actual en memoria.
- Reduce riesgo de seguridad frente a la implementacion actual basada en `sha256` simple y sesiones en memoria.
- Encaja bien con `PostgreSQL` y el resto del stack gratuito.

### Alternativa descartada por ahora

`JWT propio en Workers`

Esta opcion queda descartada en la fase inicial porque:

- agrega trabajo de seguridad innecesario
- obliga a manejar rotacion, expiracion y recuperacion de sesion manualmente
- no aporta una ventaja clara en esta etapa

## Dominios objetivo

Cuando exista dominio propio, la aplicacion se publicara asi:

- `app.tudominio.com` -> frontend en Cloudflare Pages
- `api.tudominio.com` -> backend en Cloudflare Workers

Mientras no exista dominio comprado, se usaran los subdominios temporales del proveedor:

- frontend: dominio generado por `Cloudflare Pages`
- backend: dominio generado por `Cloudflare Workers`

## Recomendacion para conseguir dominio

No necesitas comprar dominio para empezar el desarrollo o las pruebas iniciales.

Para produccion o demo formal, la recomendacion es:

1. Comprar un dominio en un registrador externo.
2. Delegar DNS a `Cloudflare`.
3. Crear los subdominios:
   - `app`
   - `api`

### Registradores recomendados

- `Porkbun`: suele tener precios transparentes y bajos.
- `Namecheap`: popular y facil de usar.
- `Cloudflare Registrar`: buena opcion si ya manejaras DNS en Cloudflare, pero primero necesitas tener el dominio registrado o transferido.

## Decision operativa sobre dominio

Se define el siguiente criterio:

- `Fase de desarrollo`: no comprar dominio todavia.
- `Fase de pruebas externas`: evaluar compra de un dominio `.com`.
- `Fase de salida a produccion`: comprar dominio y configurar `app.` y `api.`.

## Estructura logica objetivo

### Frontend

Responsabilidades:

- interfaz de usuario
- manejo de rutas
- formularios
- consumo de API
- control de sesion del lado cliente

Tecnologias esperadas:

- `React`
- `Vite`
- `Zustand`

### Backend

Responsabilidades:

- exponer endpoints HTTP
- validar permisos
- aplicar reglas de negocio
- consultar y actualizar datos
- generar respuestas para reportes y exportaciones

Tecnologia esperada:

- `Cloudflare Workers`

### Base de datos

Responsabilidades:

- persistencia de datos
- relaciones
- consultas transaccionales
- autenticacion mediante `Supabase Auth`

Tecnologia esperada:

- `Supabase Postgres`

## Reglas de arquitectura

- El frontend no debe contener logica de negocio critica.
- El backend no debe depender de APIs de Electron ni de filesystem local.
- La base de datos no debe ser SQLite para la version web multiusuario.
- Toda operacion sensible debe validarse en backend.
- El frontend solo debe comunicarse con la API por HTTP.

## Entregables de la Fase 1

La Fase 1 se considera completada cuando existan estas definiciones:

- arquitectura final aprobada
- autenticacion definida
- estrategia de dominio definida
- stack objetivo aprobado

## Siguiente fase

La siguiente fase es:

`Fase 2: levantamiento del sistema actual`

En esa fase se debe mapear:

- `window.api.*` actual
- handlers IPC actuales
- tablas SQLite actuales
- rutas y pantallas actuales

