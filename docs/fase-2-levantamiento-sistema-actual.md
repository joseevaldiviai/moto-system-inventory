# Fase 2: Levantamiento del Sistema Actual

## Objetivo

Mapear el sistema actual para preparar la migracion desde `Electron + IPC + SQLite` hacia `Cloudflare Pages + Cloudflare Workers + Supabase`.

Esta fase identifica:

- pantallas y rutas actuales
- contratos `window.api.*`
- handlers IPC actuales
- tablas de base de datos actuales
- componentes que no migran 1:1 a web

## Resumen del sistema actual

La aplicacion actual esta compuesta por:

- `Electron` como shell de escritorio
- `React + Vite` como interfaz
- `better-sqlite3` como acceso local a SQLite
- logica de negocio centralizada en handlers IPC

La UI ya tiene modulos funcionales. No es un proyecto vacio.

## Rutas y pantallas actuales

Pantallas detectadas:

- `/login`
- `/`
- `/inventario`
- `/proformas`
- `/ventas`
- `/reportes`
- `/manual`
- `/perfil`
- `/usuarios`

### Modulos funcionales actuales

- `Login`
- `Dashboard`
- `Inventario`
- `Proformas`
- `Ventas`
- `Reportes`
- `Manual`
- `Perfil`
- `Usuarios`

## Modulos backend actuales

La logica de negocio del sistema esta repartida en estos modulos IPC:

- `usuarios`
- `config`
- `inventario`
- `proformas`
- `ventas`
- `reportes`
- `app`

## Tablas actuales en SQLite

Tablas detectadas:

- `marcas`
- `usuarios`
- `config`
- `motos`
- `accesorios`
- `repuestos`
- `proformas`
- `proforma_items`
- `ventas`
- `venta_items`
- `tramites`

## Relacion funcional entre tablas

- `usuarios` administra acceso y vendedores
- `marcas` se relaciona con `motos`, `accesorios` y `repuestos`
- `proformas` depende de `usuarios`
- `proforma_items` depende de `proformas` y referencia productos
- `ventas` depende de `usuarios` y opcionalmente de `proformas`
- `venta_items` depende de `ventas` y referencia productos
- `tramites` depende de `venta_items`
- `config` guarda configuraciones simples, hoy enfocadas en costos de tramites

## Contratos actuales expuestos al frontend

El frontend hoy depende de `window.api.*`. Ese contrato debe desaparecer y convertirse en HTTP.

### App

- `backup`
- `version`
- `exportManualPdf`

### Config

- `configGet`
- `configSet`

### Usuarios y Auth

- `seedAdmin`
- `login`
- `logout`
- `listarUsuarios`
- `crearUsuario`
- `actualizarUsuario`
- `cambiarPassword`

### Inventario

- `listarMotos`
- `crearMoto`
- `actualizarMoto`
- `eliminarMoto`
- `importarMotosCsv`
- `exportarMotosPdf`
- `listarMarcas`
- `crearMarca`
- `actualizarMarca`
- `eliminarMarca`
- `listarAccesorios`
- `crearAccesorio`
- `actualizarAccesorio`
- `eliminarAccesorio`
- `importarAccesoriosCsv`
- `exportarAccesoriosPdf`
- `listarRepuestos`
- `crearRepuesto`
- `actualizarRepuesto`
- `eliminarRepuesto`
- `importarRepuestosCsv`
- `exportarRepuestosPdf`
- `exportarProductosPdf`
- `listarTramites`
- `crearTramite`
- `actualizarTramite`

### Negocio

- `listarProformas`
- `obtenerProforma`
- `crearProforma`
- `cancelarProforma`
- `exportarProformaPdf`
- `listarVentas`
- `obtenerVenta`
- `crearVenta`
- `anularVenta`

### Reportes

- `reporteVentas`
- `reporteProformas`
- `reporteInventario`
- `reporteTramites`
- `exportarReporteVentasPdf`
- `exportarReporteProformasPdf`

## Mapeo recomendado de IPC a API HTTP

Este mapeo sirve como base para el backend en `Cloudflare Workers`.

### Auth

- `usuarios:login` -> `POST /auth/login`
- `usuarios:logout` -> `POST /auth/logout`
- `usuarios:seed-admin` -> `POST /auth/seed-admin`
- `usuarios:cambiar-password` -> `POST /auth/change-password`

Nota:

- Si se adopta `Supabase Auth`, `seed-admin`, `login`, `logout` y manejo de sesion se resolveran con Supabase.
- En ese caso el backend solo conserva validaciones y perfiles internos.

### Usuarios

- `usuarios:listar` -> `GET /users`
- `usuarios:crear` -> `POST /users`
- `usuarios:actualizar` -> `PATCH /users/:id`

### Config

- `config:get` -> `GET /config`
- `config:set` -> `PUT /config`

### Marcas

- `marcas:listar` -> `GET /brands`
- `marcas:crear` -> `POST /brands`
- `marcas:actualizar` -> `PATCH /brands/:id`
- `marcas:eliminar` -> `DELETE /brands/:id`

### Motos

- `motos:listar` -> `GET /products/motos`
- `motos:crear` -> `POST /products/motos`
- `motos:actualizar` -> `PATCH /products/motos/:id`
- `motos:eliminar` -> `DELETE /products/motos/:id`
- `motos:importar-csv` -> `POST /products/motos/import`
- `motos:exportar-pdf` -> `GET /products/motos/export/pdf`

### Accesorios

- `accesorios:listar` -> `GET /products/accesorios`
- `accesorios:crear` -> `POST /products/accesorios`
- `accesorios:actualizar` -> `PATCH /products/accesorios/:id`
- `accesorios:eliminar` -> `DELETE /products/accesorios/:id`
- `accesorios:importar-csv` -> `POST /products/accesorios/import`
- `accesorios:exportar-pdf` -> `GET /products/accesorios/export/pdf`

### Repuestos

- `repuestos:listar` -> `GET /products/repuestos`
- `repuestos:crear` -> `POST /products/repuestos`
- `repuestos:actualizar` -> `PATCH /products/repuestos/:id`
- `repuestos:eliminar` -> `DELETE /products/repuestos/:id`
- `repuestos:importar-csv` -> `POST /products/repuestos/import`
- `repuestos:exportar-pdf` -> `GET /products/repuestos/export/pdf`
- `productos:exportar-pdf` -> `GET /products/export/pdf`

### Tramites

- `tramites:listar` -> `GET /tramites`
- `tramites:crear` -> `POST /tramites`
- `tramites:actualizar` -> `PATCH /tramites/:id`

### Proformas

- `proformas:listar` -> `GET /quotes`
- `proformas:obtener` -> `GET /quotes/:id`
- `proformas:crear` -> `POST /quotes`
- `proformas:cancelar` -> `POST /quotes/:id/cancel`
- `proformas:exportar-pdf` -> `GET /quotes/:id/export/pdf`

### Ventas

- `ventas:listar` -> `GET /sales`
- `ventas:obtener` -> `GET /sales/:id`
- `ventas:crear` -> `POST /sales`
- `ventas:anular` -> `POST /sales/:id/cancel`

### Reportes

- `reportes:ventas` -> `GET /reports/sales`
- `reportes:proformas` -> `GET /reports/quotes`
- `reportes:inventario` -> `GET /reports/inventory`
- `reportes:tramites` -> `GET /reports/tramites`
- `reportes:ventas:exportar-pdf` -> `GET /reports/sales/export/pdf`
- `reportes:proformas:exportar-pdf` -> `GET /reports/quotes/export/pdf`

## Logica de negocio critica detectada

La migracion no es solo transporte de datos. Hay reglas importantes que deben conservarse en backend:

- validacion de precios y descuentos
- control de stock libre, reservado y vendido
- reserva de stock al crear proformas
- liberacion de stock al cancelar o vencer proformas
- conversion de stock reservado a vendido al crear ventas
- anulacion de ventas y rollback de stock
- generacion de codigos de proformas y ventas
- configuracion de costos de tramites
- filtros de reportes

## Componentes que no migran 1:1

### Backup local de base de datos

Hoy existe `app:backup` que copia el archivo `.db` local.

En web esto no aplica igual.

Opciones futuras:

- exportacion administrativa de datos
- backups gestionados por Supabase
- dump SQL o CSV desde backend

### Exportacion PDF

Hoy los PDFs se generan con `pdfkit` y ventanas invisibles de Electron.

En la version web esto debe redefinirse como:

- generacion PDF desde backend
- o generacion desde frontend para casos simples

### Version de la app

`app:version` es una operacion propia del binario Electron.

En web puede cambiarse por:

- version de frontend desde build metadata
- version de API desde endpoint `/health` o `/version`

### Manual

El manual hoy se imprime/exporta desde pantalla interna.

En web puede mantenerse como:

- pagina publica o privada
- exportacion PDF opcional

## Dependencias del frontend a eliminar

Para migrar el frontend, hay que reemplazar estas dependencias:

- `window.api.*`
- token local asociado a sesion en memoria del proceso principal
- `logout` via IPC
- backup de archivo local

## Prioridad de migracion por modulo

Orden recomendado:

1. `Auth y usuarios`
2. `Config`
3. `Marcas e inventario`
4. `Proformas`
5. `Ventas`
6. `Tramites`
7. `Reportes`
8. `PDFs y exportaciones`
9. `Manual`

## Resultado de la Fase 2

Con esta fase queda identificado:

- que modulos existen realmente
- que contratos usa hoy el frontend
- que entidades deben pasar a Postgres
- que logica debe moverse a API
- que componentes requieren rediseño web

## Siguiente fase

La siguiente fase es:

`Fase 3: modelo de datos`

En esa fase se debe diseñar el esquema inicial de `Supabase/Postgres` y definir migraciones SQL.

