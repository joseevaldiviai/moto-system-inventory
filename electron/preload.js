const { contextBridge, ipcRenderer } = require('electron')

// Expone una API limpia y segura al renderer (React)
// React nunca toca Node.js directamente — todo pasa por aquí
contextBridge.exposeInMainWorld('api', {
  // App
  backup:     ()           => ipcRenderer.invoke('app:backup'),
  version:    ()           => ipcRenderer.invoke('app:version'),

  // Config
  configGet:          (data) => ipcRenderer.invoke('config:get', data),
  configSet:          (data) => ipcRenderer.invoke('config:set', data),

  // Usuarios & Auth
  seedAdmin:          ()           => ipcRenderer.invoke('usuarios:seed-admin'),
  login:              (data)       => ipcRenderer.invoke('usuarios:login', data),
  logout:             (data)       => ipcRenderer.invoke('usuarios:logout', data),
  listarUsuarios:     (data)       => ipcRenderer.invoke('usuarios:listar', data),
  crearUsuario:       (data)       => ipcRenderer.invoke('usuarios:crear', data),
  actualizarUsuario:  (data)       => ipcRenderer.invoke('usuarios:actualizar', data),
  cambiarPassword:    (data)       => ipcRenderer.invoke('usuarios:cambiar-password', data),

  // Motos
  listarMotos:        (data)       => ipcRenderer.invoke('motos:listar', data),
  crearMoto:          (data)       => ipcRenderer.invoke('motos:crear', data),
  actualizarMoto:     (data)       => ipcRenderer.invoke('motos:actualizar', data),
  eliminarMoto:       (data)       => ipcRenderer.invoke('motos:eliminar', data),
  importarMotosCsv:   (data)       => ipcRenderer.invoke('motos:importar-csv', data),
  exportarMotosPdf:   (data)       => ipcRenderer.invoke('motos:exportar-pdf', data),

  // Marcas
  listarMarcas:       (data)       => ipcRenderer.invoke('marcas:listar', data),
  crearMarca:         (data)       => ipcRenderer.invoke('marcas:crear', data),
  actualizarMarca:    (data)       => ipcRenderer.invoke('marcas:actualizar', data),
  eliminarMarca:      (data)       => ipcRenderer.invoke('marcas:eliminar', data),

  // Accesorios
  listarAccesorios:   (data)       => ipcRenderer.invoke('accesorios:listar', data),
  crearAccesorio:     (data)       => ipcRenderer.invoke('accesorios:crear', data),
  actualizarAccesorio:(data)       => ipcRenderer.invoke('accesorios:actualizar', data),
  eliminarAccesorio:  (data)       => ipcRenderer.invoke('accesorios:eliminar', data),
  importarAccesoriosCsv:(data)     => ipcRenderer.invoke('accesorios:importar-csv', data),
  exportarAccesoriosPdf:(data)     => ipcRenderer.invoke('accesorios:exportar-pdf', data),

  // Repuestos
  listarRepuestos:    (data)       => ipcRenderer.invoke('repuestos:listar', data),
  crearRepuesto:      (data)       => ipcRenderer.invoke('repuestos:crear', data),
  actualizarRepuesto: (data)       => ipcRenderer.invoke('repuestos:actualizar', data),
  eliminarRepuesto:   (data)       => ipcRenderer.invoke('repuestos:eliminar', data),
  importarRepuestosCsv:(data)      => ipcRenderer.invoke('repuestos:importar-csv', data),
  exportarRepuestosPdf:(data)      => ipcRenderer.invoke('repuestos:exportar-pdf', data),
  exportarProductosPdf:(data)      => ipcRenderer.invoke('productos:exportar-pdf', data),

  // Trámites
  listarTramites:     (data)       => ipcRenderer.invoke('tramites:listar', data),
  crearTramite:       (data)       => ipcRenderer.invoke('tramites:crear', data),
  actualizarTramite:  (data)       => ipcRenderer.invoke('tramites:actualizar', data),

  // Proformas
  listarProformas:    (data)       => ipcRenderer.invoke('proformas:listar', data),
  obtenerProforma:    (data)       => ipcRenderer.invoke('proformas:obtener', data),
  crearProforma:      (data)       => ipcRenderer.invoke('proformas:crear', data),
  cancelarProforma:   (data)       => ipcRenderer.invoke('proformas:cancelar', data),

  // Ventas
  listarVentas:       (data)       => ipcRenderer.invoke('ventas:listar', data),
  obtenerVenta:       (data)       => ipcRenderer.invoke('ventas:obtener', data),
  crearVenta:         (data)       => ipcRenderer.invoke('ventas:crear', data),
  anularVenta:        (data)       => ipcRenderer.invoke('ventas:anular', data),

  // Reportes
  reporteVentas:      (data)       => ipcRenderer.invoke('reportes:ventas', data),
  reporteProformas:   (data)       => ipcRenderer.invoke('reportes:proformas', data),
  reporteInventario:  (data)       => ipcRenderer.invoke('reportes:inventario', data),
  reporteTramites:    (data)       => ipcRenderer.invoke('reportes:tramites', data),
  exportarReporteVentasPdf:    (data) => ipcRenderer.invoke('reportes:ventas:exportar-pdf', data),
  exportarReporteProformasPdf: (data) => ipcRenderer.invoke('reportes:proformas:exportar-pdf', data),
})
