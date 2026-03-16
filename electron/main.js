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
  ipcMain.handle('app:backup', async (_, { token } = {}) => {
    const { getDbPath } = require('./db/database')
    const { requireSupervisor } = require('./ipc/usuarios')
    requireSupervisor(token)
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `moto-system-backup-${Date.now()}.db`,
      filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }],
    })
    if (!filePath) return { ok: false }
    fs.copyFileSync(getDbPath(), filePath)
    return { ok: true, path: filePath }
  })

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:export-manual-pdf', async () => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `manual-moto-system-${Date.now()}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!filePath) return { ok: false }

    const exportWin = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    })

    const loadUrl = isDev
      ? 'http://localhost:5173/#/manual'
      : `file://${path.join(__dirname, '../dist/index.html')}#/manual`

    await exportWin.loadURL(loadUrl)

    await exportWin.webContents.executeJavaScript(
      "document.documentElement.setAttribute('data-theme','light')",
      true
    )

    const pdfData = await exportWin.webContents.printToPDF({
      printBackground: true,
      marginsType: 1,
      pageSize: 'A4',
    })

    fs.writeFileSync(filePath, pdfData)
    exportWin.close()
    return { ok: true, path: filePath }
  })

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

  mainWindow.on('close', () => {
    try {
      mainWindow.webContents.executeJavaScript(
        "localStorage.removeItem('token'); localStorage.removeItem('usuario');",
        true
      )
    } catch {
      // Si falla, no bloquea el cierre.
    }
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
