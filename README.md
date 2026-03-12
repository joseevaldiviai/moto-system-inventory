# 🏍️ Moto System

Sistema de gestión de escritorio para concesionario de motos.

## Stack — Todo en Node.js / Electron

```
moto-system.exe
├── Electron (Node.js integrado)   ← proceso principal
│   ├── better-sqlite3             ← BD directa, sin servidor
│   └── IPC handlers               ← toda la lógica de negocio
└── React + Vite                   ← UI empaquetada
    └── window.api.*               ← llama al proceso principal via IPC
```

**Requerimientos de la máquina cliente:** solo Windows 7/10/11 (64-bit).
Sin Python, sin Node.js, sin nada extra.

---

## Estructura del proyecto

```
moto-system/
├── electron/
│   ├── main.js           ← proceso principal, inicia BD + handlers
│   ├── preload.js        ← bridge seguro Electron ↔ React
│   ├── db/
│   │   └── database.js   ← SQLite: schema, tablas, seed
│   └── ipc/
│       ├── usuarios.js   ← auth, sesiones, CRUD usuarios
│       ├── inventario.js ← motos, accesorios, repuestos, trámites
│       └── negocios.js   ← proformas, ventas, reportes
├── src/
│   ├── App.jsx           ← rutas + protección por rol
│   ├── store/authStore.js← estado global (Zustand)
│   ├── components/layout/← sidebar + layout principal
│   └── pages/            ← Login, Dashboard (+ módulos siguientes)
├── package.json
├── vite.config.js
└── index.html
```

---

## Comandos

```bash
# Instalar dependencias
npm install

# Desarrollo (React + Electron simultáneo)
npm run electron:dev

# Build → genera instalador .exe en dist-electron/
npm run electron:build
```

## Primera vez

Al abrir la app, hacer click en **"Crear admin inicial"** en la pantalla de login.
Esto crea: `usuario: admin` / `contraseña: admin123`

Cambiar la contraseña después desde Usuarios → Editar.

## Base de datos

SQLite guardada en:
`C:\Users\<usuario>\AppData\Roaming\moto-system\moto_system.db`

Backup disponible desde el menú de la aplicación.

---

## Módulos

| Módulo | Estado |
|--------|--------|
| Infraestructura (BD + IPC + Auth) | ✅ Completo |
| Login + Layout + Dashboard | ✅ Completo |
| Inventario (UI) | 🔜 Siguiente |
| Proformas (UI) | 🔜 Siguiente |
| Ventas (UI) | 🔜 Siguiente |
| Reportes (UI) | 🔜 Siguiente |
| Usuarios (UI) | 🔜 Siguiente |
| PDF / Impresión | 🔜 Pendiente |
