const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development'

let mainWindow

async function createWindow() {
  // Inicializar BD antes de crear la ventana
  const { initDb } = require('./db/database')
  initDb()

  // Registrar todos los handlers IPC
  const { registerUsuariosHandlers } = require('./ipc/usuarios')
  const { registerInventarioHandlers } = require('./ipc/inventario')
  const { registerProformasHandlers, registerVentasHandlers, registerReportesHandlers } = require('./ipc/negocios')
  const { registerConfigHandlers } = require('./ipc/config')

  registerUsuariosHandlers()
  registerInventarioHandlers()
  registerProformasHandlers()
  registerVentasHandlers()
  registerReportesHandlers()
  registerConfigHandlers()

  // Backup de BD
  ipcMain.handle('app:backup', async () => {
    const { getDbPath } = require('./db/database')
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `moto-system-backup-${Date.now()}.db`,
      filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }],
    })
    if (!filePath) return { ok: false }
    fs.copyFileSync(getDbPath(), filePath)
    return { ok: true, path: filePath }
  })

  ipcMain.handle('app:version', () => app.getVersion())

  // Crear ventana
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'Moto System',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
