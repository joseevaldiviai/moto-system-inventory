const { ipcMain } = require('electron')
const { getDb, seedAdmin } = require('../db/database')
const crypto = require('crypto')

function hash(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

// Token simple en memoria (por sesión)
const sessions = new Map()

function createSession(usuario) {
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { ...usuario, timestamp: Date.now() })
  return token
}

function getSession(token) {
  const session = sessions.get(token)
  if (!session) return null
  // Expira en 8 horas
  if (Date.now() - session.timestamp > 8 * 60 * 60 * 1000) {
    sessions.delete(token)
    return null
  }
  return session
}

function requireAuth(token) {
  const session = getSession(token)
  if (!session) throw new Error('Sesión inválida o expirada')
  return session
}

function requireSupervisor(token) {
  const user = requireAuth(token)
  if (user.rol !== 'SUPERVISOR') throw new Error('Se requiere rol de Supervisor')
  return user
}

function registerUsuariosHandlers() {
  // Seed admin inicial
  ipcMain.handle('usuarios:seed-admin', () => {
    try { return { ok: true, data: seedAdmin() } }
    catch (e) { return { ok: false, error: e.message } }
  })

  // Login
  ipcMain.handle('usuarios:login', (_, { username, password }) => {
    try {
      const db = getDb()
      const user = db.prepare(
        "SELECT * FROM usuarios WHERE username = ? AND activo = 1"
      ).get(username)

      if (!user || user.password_hash !== hash(password)) {
        return { ok: false, error: 'Usuario o contraseña incorrectos' }
      }

      const token = createSession({
        id: user.id, nombre: user.nombre,
        username: user.username, rol: user.rol,
      })

      return {
        ok: true,
        data: {
          token,
          usuario: { id: user.id, nombre: user.nombre, username: user.username, rol: user.rol }
        }
      }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // Logout
  ipcMain.handle('usuarios:logout', (_, { token }) => {
    sessions.delete(token)
    return { ok: true }
  })

  // Listar usuarios (solo supervisor)
  ipcMain.handle('usuarios:listar', (_, { token }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const rows = db.prepare("SELECT id, nombre, username, rol, activo, creado_en FROM usuarios ORDER BY nombre").all()
      return { ok: true, data: rows }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // Crear usuario (solo supervisor)
  ipcMain.handle('usuarios:crear', (_, { token, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const existe = db.prepare("SELECT id FROM usuarios WHERE username = ?").get(data.username)
      if (existe) return { ok: false, error: 'El username ya está en uso' }
      const passHash = hash(data.password)
      const passExiste = db.prepare("SELECT id FROM usuarios WHERE password_hash = ?").get(passHash)
      if (passExiste) return { ok: false, error: 'La contraseña ya está en uso por otro usuario' }

      const result = db.prepare(`
        INSERT INTO usuarios (nombre, username, password_hash, rol)
        VALUES (?, ?, ?, ?)
      `).run(data.nombre, data.username, passHash, data.rol)

      return { ok: true, data: { id: result.lastInsertRowid } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // Actualizar usuario (solo supervisor)
  ipcMain.handle('usuarios:actualizar', (_, { token, id, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const fields = []
      const values = []

      if (data.nombre !== undefined)   { fields.push('nombre = ?');        values.push(data.nombre) }
      if (data.rol !== undefined)      { fields.push('rol = ?');           values.push(data.rol) }
      if (data.activo !== undefined)   { fields.push('activo = ?');        values.push(data.activo ? 1 : 0) }
      if (data.password !== undefined) {
        if (!data.password) return { ok: false, error: 'La contraseña no puede estar vacía' }
        const passHash = hash(data.password)
        const passExiste = db.prepare("SELECT id FROM usuarios WHERE password_hash = ? AND id <> ?").get(passHash, id)
        if (passExiste) return { ok: false, error: 'La contraseña ya está en uso por otro usuario' }
        fields.push('password_hash = ?')
        values.push(passHash)
      }

      if (fields.length === 0) return { ok: false, error: 'Nada que actualizar' }

      values.push(id)
      db.prepare(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // Cambiar contraseña (usuario autenticado)
  ipcMain.handle('usuarios:cambiar-password', (_, { token, actual, nueva }) => {
    try {
      const session = requireAuth(token)
      const db = getDb()
      const user = db.prepare("SELECT id, password_hash FROM usuarios WHERE id = ? AND activo = 1").get(session.id)
      if (!user) return { ok: false, error: 'Usuario no encontrado' }
      if (user.password_hash !== hash(actual)) return { ok: false, error: 'Contraseña actual incorrecta' }

      const nuevaHash = hash(nueva)
      const passExiste = db.prepare("SELECT id FROM usuarios WHERE password_hash = ? AND id <> ?").get(nuevaHash, user.id)
      if (passExiste) return { ok: false, error: 'La contraseña ya está en uso por otro usuario' }

      db.prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?").run(nuevaHash, user.id)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

module.exports = { registerUsuariosHandlers, requireAuth, requireSupervisor }
