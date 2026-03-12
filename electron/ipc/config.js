const { ipcMain } = require('electron')
const { getDb } = require('../db/database')
const { requireAuth, requireSupervisor } = require('./usuarios')

function registerConfigHandlers() {
  ipcMain.handle('config:get', (_, { token }) => {
    try {
      requireAuth(token)
      const db = getDb()
      const rows = db.prepare("SELECT key, value FROM config").all()
      const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
      return { ok: true, data: map }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('config:set', (_, { token, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const entries = Object.entries(data || {})
      const stmt = db.prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      const tx = db.transaction(() => {
        for (const [k, v] of entries) {
          stmt.run(k, String(v))
        }
      })
      tx()
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

module.exports = { registerConfigHandlers }
