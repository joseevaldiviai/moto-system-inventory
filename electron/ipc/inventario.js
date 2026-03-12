const { ipcMain, dialog } = require('electron')
const { getDb } = require('../db/database')
const { requireAuth, requireSupervisor } = require('./usuarios')
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

function validatePricing({ precio, precio_final, descuento_maximo_pct }) {
  if (precio === undefined || precio_final === undefined || descuento_maximo_pct === undefined) return
  if (precio < 0 || precio_final < 0) throw new Error('Precio inválido')
  const ganancia = precio_final - precio
  if (ganancia < 0) throw new Error('precio_final no puede ser menor a precio')
  if (descuento_maximo_pct < 0 || descuento_maximo_pct > 100) throw new Error('descuento_maximo_pct inválido')
  const descMaxMonto = (precio_final * descuento_maximo_pct) / 100
  if (descMaxMonto > ganancia) throw new Error('descuento_maximo_pct supera la ganancia unitaria')
}

function normalizeStocks(data) {
  const cantidad_libre = data.cantidad_libre ?? data.cantidad ?? 0
  const cantidad_reservada = data.cantidad_reservada ?? 0
  const cantidad_vendida = data.cantidad_vendida ?? 0
  if (cantidad_libre < 0 || cantidad_reservada < 0 || cantidad_vendida < 0) {
    throw new Error('Cantidades inválidas')
  }
  return { cantidad_libre, cantidad_reservada, cantidad_vendida }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length === 0) throw new Error('CSV vacío')
  const header = lines[0].split(',').map(h => h.trim())
  const rows = lines.slice(1).map(line => line.split(',').map(v => v.trim()))
  return { header, rows }
}

function requireColumns(header, cols) {
  const missing = cols.filter(c => !header.includes(c))
  if (missing.length) throw new Error(`CSV inválido. Faltan columnas: ${missing.join(', ')}`)
}

function rowObj(header, row) {
  const obj = {}
  for (let i = 0; i < header.length; i++) obj[header[i]] = row[i] ?? ''
  return obj
}

function num(val, field) {
  if (val === '' || val === null || val === undefined) throw new Error(`Campo requerido: ${field}`)
  const n = Number(val)
  if (Number.isNaN(n)) throw new Error(`Número inválido en ${field}`)
  return n
}

function numOrZero(val) {
  if (val === '' || val === null || val === undefined) return 0
  const n = Number(val)
  if (Number.isNaN(n)) throw new Error('Número inválido')
  return n
}

function textOrNull(val) {
  const v = (val ?? '').trim()
  return v === '' ? null : v
}

function resolveMarca(db, data, required) {
  let marcaId = data?.marca_id ?? null
  if (marcaId === '' || marcaId === 0) marcaId = null
  const marcaNombre = (data?.marca ?? '').trim()

  if (marcaId) {
    const row = db.prepare("SELECT id, nombre FROM marcas WHERE id = ? AND activo = 1").get(marcaId)
    if (!row) throw new Error('Marca no encontrada')
    return { marca_id: row.id, marca_nombre: row.nombre }
  }

  if (marcaNombre) {
    const existing = db.prepare("SELECT id, nombre FROM marcas WHERE nombre = ? COLLATE NOCASE").get(marcaNombre)
    if (existing) return { marca_id: existing.id, marca_nombre: existing.nombre }
    const r = db.prepare("INSERT INTO marcas (nombre) VALUES (?)").run(marcaNombre)
    return { marca_id: r.lastInsertRowid, marca_nombre: marcaNombre }
  }

  if (required) throw new Error('Marca requerida')
  return { marca_id: null, marca_nombre: null }
}

function ensurePdfPath(defaultName) {
  return dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
}

function drawTable(doc, columns, rows) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const colWidth = pageWidth / columns.length
  let y = doc.y + 6

  const drawRow = (vals, isHeader) => {
    if (y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage()
      y = doc.y
    }
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
    for (let i = 0; i < columns.length; i++) {
      const x = doc.page.margins.left + (colWidth * i)
      doc.text(vals[i] ?? '', x, y, { width: colWidth - 6 })
    }
    y += 12
  }

  drawRow(columns, true)
  for (const r of rows) drawRow(r, false)
  doc.moveDown(1)
}

async function exportPdf({ title, subtitle, columns, rows, totals, defaultName }) {
  const { filePath } = await ensurePdfPath(defaultName)
  if (!filePath) return { ok: false }

  const doc = new PDFDocument({ margin: 36 })
  const stream = fs.createWriteStream(filePath)
  doc.pipe(stream)

  doc.font('Helvetica-Bold').fontSize(16).text(title)
  if (subtitle) {
    doc.font('Helvetica').fontSize(9).fillColor('#444').text(subtitle)
    doc.fillColor('#000')
  }
  doc.moveDown(1)

  drawTable(doc, columns, rows)

  if (totals) {
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(10).text('Totales')
    doc.font('Helvetica').fontSize(9)
    for (const line of totals) doc.text(line)
  }

  doc.end()

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return { ok: true, path: filePath }
}

function registerInventarioHandlers() {

  // ─── MARCAS ────────────────────────────────────────────────────

  ipcMain.handle('marcas:listar', (_, { token }) => {
    try {
      requireAuth(token)
      const db = getDb()
      const rows = db.prepare("SELECT id, nombre, activo, creado_en FROM marcas ORDER BY nombre").all()
      return { ok: true, data: rows }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('marcas:crear', (_, { token, data }) => {
    try {
      requireSupervisor(token)
      const nombre = (data?.nombre ?? '').trim()
      if (!nombre) return { ok: false, error: 'Nombre requerido' }
      const db = getDb()
      const existe = db.prepare("SELECT id FROM marcas WHERE nombre = ? COLLATE NOCASE").get(nombre)
      if (existe) return { ok: false, error: 'La marca ya existe' }
      const r = db.prepare("INSERT INTO marcas (nombre) VALUES (?)").run(nombre)
      return { ok: true, data: { id: r.lastInsertRowid } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('marcas:actualizar', (_, { token, id, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const fields = []
      const values = []
      if (data.nombre !== undefined) {
        const nombre = (data.nombre ?? '').trim()
        if (!nombre) return { ok: false, error: 'Nombre requerido' }
        const existe = db.prepare("SELECT id FROM marcas WHERE nombre = ? COLLATE NOCASE AND id <> ?").get(nombre, id)
        if (existe) return { ok: false, error: 'La marca ya existe' }
        fields.push('nombre = ?'); values.push(nombre)
      }
      if (data.activo !== undefined) { fields.push('activo = ?'); values.push(data.activo ? 1 : 0) }
      if (fields.length === 0) return { ok: false, error: 'Nada que actualizar' }
      values.push(id)
      db.prepare(`UPDATE marcas SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('marcas:eliminar', (_, { token, id }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      db.prepare("UPDATE marcas SET activo = 0 WHERE id = ?").run(id)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  // ─── MOTOS ──────────────────────────────────────────────────────

  ipcMain.handle('motos:listar', (_, { token, buscar, soloStock }) => {
    try {
      requireAuth(token)
      const db = getDb()
      let sql = `
        SELECT m.*, COALESCE(ma.nombre, m.marca) AS marca
        FROM motos m
        LEFT JOIN marcas ma ON ma.id = m.marca_id
        WHERE m.activo = 1
      `
      const params = []
      if (buscar) {
        sql += " AND (COALESCE(ma.nombre, m.marca) LIKE ? OR m.modelo LIKE ? OR m.chasis LIKE ?)"
        params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`)
      }
      if (soloStock) { sql += " AND cantidad_libre > 0" }
      sql += " ORDER BY COALESCE(ma.nombre, m.marca), m.modelo"
      return { ok: true, data: db.prepare(sql).all(...params) }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('motos:crear', (_, { token, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const existe = db.prepare("SELECT id FROM motos WHERE chasis = ?").get(data.chasis)
      if (existe) return { ok: false, error: 'Ya existe una moto con ese número de chasis' }

      const { marca_id, marca_nombre } = resolveMarca(db, data, true)
      const { cantidad_libre, cantidad_reservada, cantidad_vendida } = normalizeStocks(data)
      validatePricing({ precio: data.precio, precio_final: data.precio_final, descuento_maximo_pct: data.descuento_maximo_pct })

      const r = db.prepare(`
        INSERT INTO motos (marca_id, marca, modelo, tipo, color, chasis, cilindrada, motor,
          precio, precio_final, descuento_maximo_pct,
          cantidad_libre, cantidad_reservada, cantidad_vendida)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        marca_id, marca_nombre, data.modelo, data.tipo ?? null, data.color ?? null,
        data.chasis, data.cilindrada ?? null, data.motor ?? null,
        data.precio, data.precio_final, data.descuento_maximo_pct,
        cantidad_libre, cantidad_reservada, cantidad_vendida
      )

      return { ok: true, data: { id: r.lastInsertRowid } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('motos:actualizar', (_, { token, id, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const current = db.prepare("SELECT * FROM motos WHERE id = ?").get(id)
      if (!current) return { ok: false, error: 'Moto no encontrada' }

      const merged = {
        precio: data.precio ?? current.precio,
        precio_final: data.precio_final ?? current.precio_final,
        descuento_maximo_pct: data.descuento_maximo_pct ?? current.descuento_maximo_pct,
      }
      validatePricing(merged)

      const fields = []
      const values = []

      if (data.marca !== undefined || data.marca_id !== undefined) {
        const { marca_id, marca_nombre } = resolveMarca(db, data, true)
        fields.push('marca_id = ?'); values.push(marca_id)
        fields.push('marca = ?'); values.push(marca_nombre)
      }
      if (data.modelo !== undefined)       { fields.push('modelo = ?'); values.push(data.modelo) }
      if (data.tipo !== undefined)         { fields.push('tipo = ?'); values.push(data.tipo ?? null) }
      if (data.color !== undefined)        { fields.push('color = ?'); values.push(data.color ?? null) }
      if (data.chasis !== undefined)       { fields.push('chasis = ?'); values.push(data.chasis) }
      if (data.cilindrada !== undefined)   { fields.push('cilindrada = ?'); values.push(data.cilindrada ?? null) }
      if (data.motor !== undefined)        { fields.push('motor = ?'); values.push(data.motor ?? null) }
      if (data.precio !== undefined)       { fields.push('precio = ?'); values.push(data.precio) }
      if (data.precio_final !== undefined) { fields.push('precio_final = ?'); values.push(data.precio_final) }
      if (data.descuento_maximo_pct !== undefined) { fields.push('descuento_maximo_pct = ?'); values.push(data.descuento_maximo_pct) }

      if (data.cantidad !== undefined && data.cantidad_libre === undefined) {
        fields.push('cantidad_libre = ?')
        values.push(data.cantidad)
      }
      if (data.cantidad_libre !== undefined)     { fields.push('cantidad_libre = ?'); values.push(data.cantidad_libre) }
      if (data.cantidad_reservada !== undefined) { fields.push('cantidad_reservada = ?'); values.push(data.cantidad_reservada) }
      if (data.cantidad_vendida !== undefined)   { fields.push('cantidad_vendida = ?'); values.push(data.cantidad_vendida) }
      if (data.activo !== undefined)             { fields.push('activo = ?'); values.push(data.activo ? 1 : 0) }

      if (fields.length === 0) return { ok: false, error: 'Nada que actualizar' }

      values.push(id)
      db.prepare(`UPDATE motos SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('motos:eliminar', (_, { token, id }) => {
    try {
      requireSupervisor(token)
      getDb().prepare("UPDATE motos SET activo=0 WHERE id=?").run(id)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('motos:importar-csv', (_, { token, csvText }) => {
    try {
      requireSupervisor(token)
      const { header, rows } = parseCsv(csvText)
      requireColumns(header, ['marca','modelo','tipo','color','chasis','cilindrada','motor','precio','precio_final','descuento_maximo_pct','cantidad_libre'])

      const db = getDb()
      const tx = db.transaction(() => {
        let inserted = 0
        let updated = 0
        for (let i = 0; i < rows.length; i++) {
          const o = rowObj(header, rows[i])
          const marcaData = { marca: o.marca }
          const { marca_id, marca_nombre } = resolveMarca(db, marcaData, true)
          const data = {
            marca_id,
            marca: marca_nombre,
            modelo: o.modelo,
            tipo: textOrNull(o.tipo),
            color: textOrNull(o.color),
            chasis: o.chasis,
            cilindrada: textOrNull(o.cilindrada),
            motor: textOrNull(o.motor),
            precio: num(o.precio, 'precio'),
            precio_final: num(o.precio_final, 'precio_final'),
            descuento_maximo_pct: num(o.descuento_maximo_pct, 'descuento_maximo_pct'),
            cantidad_libre: numOrZero(o.cantidad_libre),
          }
          if (!data.marca || !data.modelo || !data.chasis) throw new Error(`Fila ${i + 2}: campos requeridos faltantes`)
          validatePricing(data)

          const existing = db.prepare("SELECT id FROM motos WHERE chasis = ?").get(data.chasis)
          if (existing) {
            db.prepare(`
              UPDATE motos SET marca_id=?, marca=?, modelo=?, tipo=?, color=?, cilindrada=?, motor=?,
                precio=?, precio_final=?, descuento_maximo_pct=?, cantidad_libre=?, activo=1
              WHERE id=?
            `).run(
              data.marca_id, data.marca, data.modelo, data.tipo, data.color, data.cilindrada, data.motor,
              data.precio, data.precio_final, data.descuento_maximo_pct, data.cantidad_libre, existing.id
            )
            updated++
          } else {
            db.prepare(`
              INSERT INTO motos (marca_id, marca, modelo, tipo, color, chasis, cilindrada, motor,
                precio, precio_final, descuento_maximo_pct, cantidad_libre, cantidad_reservada, cantidad_vendida)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
            `).run(
              data.marca_id, data.marca, data.modelo, data.tipo, data.color, data.chasis, data.cilindrada, data.motor,
              data.precio, data.precio_final, data.descuento_maximo_pct, data.cantidad_libre
            )
            inserted++
          }
        }
        return { inserted, updated }
      })
      const result = tx()
      return { ok: true, data: result }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('motos:exportar-pdf', async (_, { token }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const rows = db.prepare(`
        SELECT m.*, COALESCE(ma.nombre, m.marca) AS marca
        FROM motos m
        LEFT JOIN marcas ma ON ma.id = m.marca_id
        WHERE m.activo=1
        ORDER BY COALESCE(ma.nombre, m.marca), m.modelo
      `).all()
      const tableRows = rows.map(r => [
        r.marca, r.modelo, r.chasis, String(r.cantidad_libre), String(r.precio_final)
      ])
      return await exportPdf({
        title: 'Inventario de Motos',
        subtitle: `Total items: ${rows.length}`,
        columns: ['Marca', 'Modelo', 'Chasis', 'Stock', 'Precio Final'],
        rows: tableRows,
        totals: [
          `Unidades libres: ${rows.reduce((s, i) => s + i.cantidad_libre, 0)}`,
        ],
        defaultName: `motos-${Date.now()}.pdf`
      })
    } catch (e) { return { ok: false, error: e.message } }
  })


  // ─── ACCESORIOS ─────────────────────────────────────────────────

  ipcMain.handle('accesorios:listar', (_, { token, buscar }) => {
    try {
      requireAuth(token)
      const db = getDb()
      let sql = `
        SELECT a.*, COALESCE(ma.nombre, a.marca) AS marca
        FROM accesorios a
        LEFT JOIN marcas ma ON ma.id = a.marca_id
        WHERE a.activo = 1
      `
      const params = []
      if (buscar) { sql += " AND (a.tipo LIKE ? OR COALESCE(ma.nombre, a.marca) LIKE ?)"; params.push(`%${buscar}%`, `%${buscar}%`) }
      sql += " ORDER BY a.tipo, COALESCE(ma.nombre, a.marca)"
      return { ok: true, data: db.prepare(sql).all(...params) }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('accesorios:crear', (_, { token, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const { marca_id, marca_nombre } = resolveMarca(db, data, false)
      const { cantidad_libre, cantidad_reservada, cantidad_vendida } = normalizeStocks(data)
      validatePricing({ precio: data.precio, precio_final: data.precio_final, descuento_maximo_pct: data.descuento_maximo_pct })

      const r = db.prepare(`
        INSERT INTO accesorios (marca_id, marca, tipo, color,
          precio, precio_final, descuento_maximo_pct,
          cantidad_libre, cantidad_reservada, cantidad_vendida)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        marca_id, marca_nombre, data.tipo, data.color ?? null,
        data.precio, data.precio_final, data.descuento_maximo_pct,
        cantidad_libre, cantidad_reservada, cantidad_vendida
      )
      return { ok: true, data: { id: r.lastInsertRowid } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('accesorios:actualizar', (_, { token, id, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const current = db.prepare("SELECT * FROM accesorios WHERE id = ?").get(id)
      if (!current) return { ok: false, error: 'Accesorio no encontrado' }

      const merged = {
        precio: data.precio ?? current.precio,
        precio_final: data.precio_final ?? current.precio_final,
        descuento_maximo_pct: data.descuento_maximo_pct ?? current.descuento_maximo_pct,
      }
      validatePricing(merged)

      const fields = []
      const values = []

      if (data.marca !== undefined || data.marca_id !== undefined) {
        const { marca_id, marca_nombre } = resolveMarca(db, data, false)
        fields.push('marca_id = ?'); values.push(marca_id)
        fields.push('marca = ?'); values.push(marca_nombre)
      }
      if (data.tipo !== undefined)         { fields.push('tipo = ?'); values.push(data.tipo) }
      if (data.color !== undefined)        { fields.push('color = ?'); values.push(data.color ?? null) }
      if (data.precio !== undefined)       { fields.push('precio = ?'); values.push(data.precio) }
      if (data.precio_final !== undefined) { fields.push('precio_final = ?'); values.push(data.precio_final) }
      if (data.descuento_maximo_pct !== undefined) { fields.push('descuento_maximo_pct = ?'); values.push(data.descuento_maximo_pct) }

      if (data.cantidad !== undefined && data.cantidad_libre === undefined) {
        fields.push('cantidad_libre = ?')
        values.push(data.cantidad)
      }
      if (data.cantidad_libre !== undefined)     { fields.push('cantidad_libre = ?'); values.push(data.cantidad_libre) }
      if (data.cantidad_reservada !== undefined) { fields.push('cantidad_reservada = ?'); values.push(data.cantidad_reservada) }
      if (data.cantidad_vendida !== undefined)   { fields.push('cantidad_vendida = ?'); values.push(data.cantidad_vendida) }
      if (data.activo !== undefined)             { fields.push('activo = ?'); values.push(data.activo ? 1 : 0) }

      if (fields.length === 0) return { ok: false, error: 'Nada que actualizar' }

      values.push(id)
      db.prepare(`UPDATE accesorios SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('accesorios:eliminar', (_, { token, id }) => {
    try {
      requireSupervisor(token)
      getDb().prepare("UPDATE accesorios SET activo=0 WHERE id=?").run(id)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('accesorios:importar-csv', (_, { token, csvText }) => {
    try {
      requireSupervisor(token)
      const { header, rows } = parseCsv(csvText)
      requireColumns(header, ['marca','tipo','color','precio','precio_final','descuento_maximo_pct','cantidad_libre'])

      const db = getDb()
      const tx = db.transaction(() => {
        let inserted = 0
        let updated = 0
        for (let i = 0; i < rows.length; i++) {
          const o = rowObj(header, rows[i])
          const marcaData = { marca: o.marca }
          const { marca_id, marca_nombre } = resolveMarca(db, marcaData, false)
          const data = {
            marca_id,
            marca: marca_nombre,
            tipo: o.tipo,
            color: textOrNull(o.color),
            precio: num(o.precio, 'precio'),
            precio_final: num(o.precio_final, 'precio_final'),
            descuento_maximo_pct: num(o.descuento_maximo_pct, 'descuento_maximo_pct'),
            cantidad_libre: numOrZero(o.cantidad_libre),
          }
          if (!data.tipo) throw new Error(`Fila ${i + 2}: tipo requerido`)
          validatePricing(data)

          const where = []
          const params = []
          if (data.marca === null) { where.push('marca IS NULL') } else { where.push('marca = ?'); params.push(data.marca) }
          where.push('tipo = ?'); params.push(data.tipo)
          if (data.color === null) { where.push('color IS NULL') } else { where.push('color = ?'); params.push(data.color) }

          const existing = db.prepare(`SELECT id FROM accesorios WHERE ${where.join(' AND ')}`).get(...params)
          if (existing) {
            db.prepare(`
              UPDATE accesorios SET marca_id=?, marca=?, tipo=?, color=?,
                precio=?, precio_final=?, descuento_maximo_pct=?, cantidad_libre=?, activo=1
              WHERE id=?
            `).run(
              data.marca_id, data.marca, data.tipo, data.color,
              data.precio, data.precio_final, data.descuento_maximo_pct, data.cantidad_libre, existing.id
            )
            updated++
          } else {
            db.prepare(`
              INSERT INTO accesorios (marca_id, marca, tipo, color, precio, precio_final, descuento_maximo_pct,
                cantidad_libre, cantidad_reservada, cantidad_vendida)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
            `).run(
              data.marca_id, data.marca, data.tipo, data.color, data.precio, data.precio_final, data.descuento_maximo_pct, data.cantidad_libre
            )
            inserted++
          }
        }
        return { inserted, updated }
      })
      const result = tx()
      return { ok: true, data: result }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('accesorios:exportar-pdf', async (_, { token }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const rows = db.prepare(`
        SELECT a.*, COALESCE(ma.nombre, a.marca) AS marca
        FROM accesorios a
        LEFT JOIN marcas ma ON ma.id = a.marca_id
        WHERE a.activo=1
        ORDER BY a.tipo, COALESCE(ma.nombre, a.marca)
      `).all()
      const tableRows = rows.map(r => [
        r.tipo, r.marca ?? '', r.color ?? '', String(r.cantidad_libre), String(r.precio_final)
      ])
      return await exportPdf({
        title: 'Inventario de Accesorios',
        subtitle: `Total items: ${rows.length}`,
        columns: ['Tipo', 'Marca', 'Color', 'Stock', 'Precio Final'],
        rows: tableRows,
        totals: [
          `Unidades libres: ${rows.reduce((s, i) => s + i.cantidad_libre, 0)}`,
        ],
        defaultName: `accesorios-${Date.now()}.pdf`
      })
    } catch (e) { return { ok: false, error: e.message } }
  })


  // ─── REPUESTOS ──────────────────────────────────────────────────

  ipcMain.handle('repuestos:listar', (_, { token, buscar }) => {
    try {
      requireAuth(token)
      const db = getDb()
      let sql = `
        SELECT r.*, COALESCE(ma.nombre, r.marca) AS marca
        FROM repuestos r
        LEFT JOIN marcas ma ON ma.id = r.marca_id
        WHERE r.activo = 1
      `
      const params = []
      if (buscar) { sql += " AND (r.tipo LIKE ? OR COALESCE(ma.nombre, r.marca) LIKE ?)"; params.push(`%${buscar}%`, `%${buscar}%`) }
      sql += " ORDER BY r.tipo, COALESCE(ma.nombre, r.marca)"
      return { ok: true, data: db.prepare(sql).all(...params) }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('repuestos:crear', (_, { token, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const { marca_id, marca_nombre } = resolveMarca(db, data, false)
      const { cantidad_libre, cantidad_reservada, cantidad_vendida } = normalizeStocks(data)
      validatePricing({ precio: data.precio, precio_final: data.precio_final, descuento_maximo_pct: data.descuento_maximo_pct })

      const r = db.prepare(`
        INSERT INTO repuestos (marca_id, marca, tipo,
          precio, precio_final, descuento_maximo_pct,
          cantidad_libre, cantidad_reservada, cantidad_vendida)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        marca_id, marca_nombre, data.tipo,
        data.precio, data.precio_final, data.descuento_maximo_pct,
        cantidad_libre, cantidad_reservada, cantidad_vendida
      )
      return { ok: true, data: { id: r.lastInsertRowid } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('repuestos:actualizar', (_, { token, id, data }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const current = db.prepare("SELECT * FROM repuestos WHERE id = ?").get(id)
      if (!current) return { ok: false, error: 'Repuesto no encontrado' }

      const merged = {
        precio: data.precio ?? current.precio,
        precio_final: data.precio_final ?? current.precio_final,
        descuento_maximo_pct: data.descuento_maximo_pct ?? current.descuento_maximo_pct,
      }
      validatePricing(merged)

      const fields = []
      const values = []

      if (data.marca !== undefined || data.marca_id !== undefined) {
        const { marca_id, marca_nombre } = resolveMarca(db, data, false)
        fields.push('marca_id = ?'); values.push(marca_id)
        fields.push('marca = ?'); values.push(marca_nombre)
      }
      if (data.tipo !== undefined)         { fields.push('tipo = ?'); values.push(data.tipo) }
      if (data.precio !== undefined)       { fields.push('precio = ?'); values.push(data.precio) }
      if (data.precio_final !== undefined) { fields.push('precio_final = ?'); values.push(data.precio_final) }
      if (data.descuento_maximo_pct !== undefined) { fields.push('descuento_maximo_pct = ?'); values.push(data.descuento_maximo_pct) }

      if (data.cantidad !== undefined && data.cantidad_libre === undefined) {
        fields.push('cantidad_libre = ?')
        values.push(data.cantidad)
      }
      if (data.cantidad_libre !== undefined)     { fields.push('cantidad_libre = ?'); values.push(data.cantidad_libre) }
      if (data.cantidad_reservada !== undefined) { fields.push('cantidad_reservada = ?'); values.push(data.cantidad_reservada) }
      if (data.cantidad_vendida !== undefined)   { fields.push('cantidad_vendida = ?'); values.push(data.cantidad_vendida) }
      if (data.activo !== undefined)             { fields.push('activo = ?'); values.push(data.activo ? 1 : 0) }

      if (fields.length === 0) return { ok: false, error: 'Nada que actualizar' }

      values.push(id)
      db.prepare(`UPDATE repuestos SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('repuestos:eliminar', (_, { token, id }) => {
    try {
      requireSupervisor(token)
      getDb().prepare("UPDATE repuestos SET activo=0 WHERE id=?").run(id)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('repuestos:importar-csv', (_, { token, csvText }) => {
    try {
      requireSupervisor(token)
      const { header, rows } = parseCsv(csvText)
      requireColumns(header, ['marca','tipo','precio','precio_final','descuento_maximo_pct','cantidad_libre'])

      const db = getDb()
      const tx = db.transaction(() => {
        let inserted = 0
        let updated = 0
        for (let i = 0; i < rows.length; i++) {
          const o = rowObj(header, rows[i])
          const marcaData = { marca: o.marca }
          const { marca_id, marca_nombre } = resolveMarca(db, marcaData, false)
          const data = {
            marca_id,
            marca: marca_nombre,
            tipo: o.tipo,
            precio: num(o.precio, 'precio'),
            precio_final: num(o.precio_final, 'precio_final'),
            descuento_maximo_pct: num(o.descuento_maximo_pct, 'descuento_maximo_pct'),
            cantidad_libre: numOrZero(o.cantidad_libre),
          }
          if (!data.tipo) throw new Error(`Fila ${i + 2}: tipo requerido`)
          validatePricing(data)

          const where = []
          const params = []
          if (data.marca === null) { where.push('marca IS NULL') } else { where.push('marca = ?'); params.push(data.marca) }
          where.push('tipo = ?'); params.push(data.tipo)

          const existing = db.prepare(`SELECT id FROM repuestos WHERE ${where.join(' AND ')}`).get(...params)
          if (existing) {
            db.prepare(`
              UPDATE repuestos SET marca_id=?, marca=?, tipo=?, precio=?, precio_final=?,
                descuento_maximo_pct=?, cantidad_libre=?, activo=1
              WHERE id=?
            `).run(
              data.marca_id, data.marca, data.tipo, data.precio, data.precio_final,
              data.descuento_maximo_pct, data.cantidad_libre, existing.id
            )
            updated++
          } else {
            db.prepare(`
              INSERT INTO repuestos (marca_id, marca, tipo, precio, precio_final, descuento_maximo_pct,
                cantidad_libre, cantidad_reservada, cantidad_vendida)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
            `).run(
              data.marca_id, data.marca, data.tipo, data.precio, data.precio_final, data.descuento_maximo_pct, data.cantidad_libre
            )
            inserted++
          }
        }
        return { inserted, updated }
      })
      const result = tx()
      return { ok: true, data: result }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('repuestos:exportar-pdf', async (_, { token }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const rows = db.prepare(`
        SELECT r.*, COALESCE(ma.nombre, r.marca) AS marca
        FROM repuestos r
        LEFT JOIN marcas ma ON ma.id = r.marca_id
        WHERE r.activo=1
        ORDER BY r.tipo, COALESCE(ma.nombre, r.marca)
      `).all()
      const tableRows = rows.map(r => [
        r.tipo, r.marca ?? '', String(r.cantidad_libre), String(r.precio_final)
      ])
      return await exportPdf({
        title: 'Inventario de Repuestos',
        subtitle: `Total items: ${rows.length}`,
        columns: ['Tipo', 'Marca', 'Stock', 'Precio Final'],
        rows: tableRows,
        totals: [
          `Unidades libres: ${rows.reduce((s, i) => s + i.cantidad_libre, 0)}`,
        ],
        defaultName: `repuestos-${Date.now()}.pdf`
      })
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('productos:exportar-pdf', async (_, { token }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const motos = db.prepare(`
        SELECT m.*, COALESCE(ma.nombre, m.marca) AS marca
        FROM motos m
        LEFT JOIN marcas ma ON ma.id = m.marca_id
        WHERE m.activo=1
        ORDER BY COALESCE(ma.nombre, m.marca), m.modelo
      `).all()
      const accesorios = db.prepare(`
        SELECT a.*, COALESCE(ma.nombre, a.marca) AS marca
        FROM accesorios a
        LEFT JOIN marcas ma ON ma.id = a.marca_id
        WHERE a.activo=1
        ORDER BY a.tipo, COALESCE(ma.nombre, a.marca)
      `).all()
      const repuestos = db.prepare(`
        SELECT r.*, COALESCE(ma.nombre, r.marca) AS marca
        FROM repuestos r
        LEFT JOIN marcas ma ON ma.id = r.marca_id
        WHERE r.activo=1
        ORDER BY r.tipo, COALESCE(ma.nombre, r.marca)
      `).all()

      const { filePath } = await ensurePdfPath(`productos-${Date.now()}.pdf`)
      if (!filePath) return { ok: false }

      const doc = new PDFDocument({ margin: 36 })
      const stream = fs.createWriteStream(filePath)
      doc.pipe(stream)

      doc.font('Helvetica-Bold').fontSize(16).text('Inventario de Productos')
      doc.moveDown(1)

      doc.font('Helvetica-Bold').fontSize(12).text('Motos')
      drawTable(doc, ['Marca', 'Modelo', 'Chasis', 'Stock', 'Precio Final'],
        motos.map(r => [r.marca, r.modelo, r.chasis, String(r.cantidad_libre), String(r.precio_final)])
      )

      doc.font('Helvetica-Bold').fontSize(12).text('Accesorios')
      drawTable(doc, ['Tipo', 'Marca', 'Color', 'Stock', 'Precio Final'],
        accesorios.map(r => [r.tipo, r.marca ?? '', r.color ?? '', String(r.cantidad_libre), String(r.precio_final)])
      )

      doc.font('Helvetica-Bold').fontSize(12).text('Repuestos')
      drawTable(doc, ['Tipo', 'Marca', 'Stock', 'Precio Final'],
        repuestos.map(r => [r.tipo, r.marca ?? '', String(r.cantidad_libre), String(r.precio_final)])
      )

      doc.end()

      await new Promise((resolve, reject) => {
        stream.on('finish', resolve)
        stream.on('error', reject)
      })

      return { ok: true, path: filePath }
    } catch (e) { return { ok: false, error: e.message } }
  })


  // ─── TRÁMITES ───────────────────────────────────────────────────

  ipcMain.handle('tramites:listar', (_, { token, estado }) => {
    try {
      requireAuth(token)
      const db = getDb()
      let sql = `
        SELECT t.*, m.marca as moto_marca, m.modelo as moto_modelo
        FROM tramites t
        JOIN venta_items vi ON t.venta_item_id = vi.id
        LEFT JOIN motos m ON vi.moto_id = m.id
      `
      const params = []
      if (estado) { sql += " WHERE t.estado = ?"; params.push(estado) }
      sql += " ORDER BY t.creado_en DESC"
      return { ok: true, data: db.prepare(sql).all(...params) }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('tramites:crear', (_, { token, data }) => {
    try {
      requireAuth(token)
      const db = getDb()
      const ventaItem = db.prepare("SELECT * FROM venta_items WHERE id=?").get(data.venta_item_id)
      if (!ventaItem) return { ok: false, error: 'Venta ítem no encontrado' }
      if (!ventaItem.moto_id) return { ok: false, error: 'Los trámites solo aplican a ítems de moto' }

      const cobroEnVenta = data.cobro_en_venta ? 1 : 0
      const aCuenta = cobroEnVenta ? null : (data.a_cuenta ?? 0)
      const saldo = cobroEnVenta ? null : (data.costo_total - aCuenta)

      const r = db.prepare(`
        INSERT INTO tramites (venta_item_id, tipo, nombre, marca, costo_total, cobro_en_venta, a_cuenta, saldo, estado, observaciones)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.venta_item_id, data.tipo, data.nombre, data.marca ?? null,
        data.costo_total, cobroEnVenta, aCuenta, saldo,
        data.estado ?? 'PENDIENTE', data.observaciones ?? null
      )
      return { ok: true, data: { id: r.lastInsertRowid } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('tramites:actualizar', (_, { token, id, data }) => {
    try {
      requireAuth(token)
      const db = getDb()
      const current = db.prepare("SELECT * FROM tramites WHERE id=?").get(id)
      if (!current) return { ok: false, error: 'Trámite no encontrado' }

      const fields = []
      const values = []

      if (data.estado !== undefined)        { fields.push('estado = ?'); values.push(data.estado) }
      if (data.observaciones !== undefined) { fields.push('observaciones = ?'); values.push(data.observaciones ?? null) }

      const cobroEnVenta = data.cobro_en_venta !== undefined ? (data.cobro_en_venta ? 1 : 0) : current.cobro_en_venta
      const costoTotal = data.costo_total !== undefined ? data.costo_total : current.costo_total
      const aCuenta = cobroEnVenta ? null : (data.a_cuenta !== undefined ? data.a_cuenta : (current.a_cuenta ?? 0))
      const saldo = cobroEnVenta ? null : (costoTotal - aCuenta)

      if (data.cobro_en_venta !== undefined) { fields.push('cobro_en_venta = ?'); values.push(cobroEnVenta) }
      if (data.costo_total !== undefined)    { fields.push('costo_total = ?'); values.push(costoTotal) }
      if (!cobroEnVenta) {
        fields.push('a_cuenta = ?'); values.push(aCuenta)
        fields.push('saldo = ?'); values.push(saldo)
      } else {
        fields.push('a_cuenta = ?'); values.push(null)
        fields.push('saldo = ?'); values.push(null)
      }

      if (fields.length === 0) return { ok: false, error: 'Nada que actualizar' }

      fields.push("actualizado_en = datetime('now','localtime')")
      values.push(id)
      db.prepare(`UPDATE tramites SET ${fields.join(', ')} WHERE id = ?`).run(...values)
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

module.exports = { registerInventarioHandlers }
