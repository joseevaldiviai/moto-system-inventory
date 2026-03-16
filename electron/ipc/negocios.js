const { ipcMain, dialog, BrowserWindow } = require('electron')
const { getDb } = require('../db/database')
const { requireAuth, requireSupervisor } = require('./usuarios')
const fs = require('fs')
const PDFDocument = require('pdfkit')

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const PRODUCT_TABLES = {
  moto_id: 'motos',
  accesorio_id: 'accesorios',
  repuesto_id: 'repuestos',
}

function generarCodigo(db, tabla, prefijo) {
  const year = new Date().getFullYear()
  const row = db.prepare(
    `SELECT COUNT(*) as total FROM ${tabla} WHERE codigo LIKE ?`
  ).get(`${prefijo}-${year}-%`)
  const num = String(row.total + 1).padStart(4, '0')
  return `${prefijo}-${year}-${num}`
}

function pickProductRef(item) {
  const keys = Object.keys(PRODUCT_TABLES).filter(k => item[k])
  if (keys.length !== 1) throw new Error('Debe existir exactamente un producto por ítem')
  return { key: keys[0], id: item[keys[0]] }
}

function getProduct(db, item) {
  const { key, id } = pickProductRef(item)
  const table = PRODUCT_TABLES[key]
  const row = db.prepare(`SELECT * FROM ${table} WHERE id=? AND activo=1`).get(id)
  if (!row) throw new Error('Producto no encontrado o inactivo')
  return { key, id, table, row }
}

function buildDescripcion(row, key) {
  if (key === 'moto_id') return `${row.marca} ${row.modelo}`.trim()
  if (key === 'accesorio_id') return `${row.marca ? row.marca + ' ' : ''}${row.tipo}`.trim()
  return `${row.marca ? row.marca + ' ' : ''}${row.tipo}`.trim()
}

function buildItemSnapshot(row, key, item) {
  const cantidad = item.cantidad ?? 1
  if (cantidad <= 0) throw new Error('Cantidad inválida')

  const rawDesc = item.descuento_pct
  const descuento_pct = rawDesc === '' || rawDesc === null || rawDesc === undefined ? 0 : Number(rawDesc)
  if (Number.isNaN(descuento_pct)) throw new Error('Descuento inválido')
  if (descuento_pct < 0) throw new Error('Descuento inválido')
  if (descuento_pct > row.descuento_maximo_pct) throw new Error('Descuento supera el máximo permitido')

  const ganancia = row.precio_final - row.precio
  if (ganancia < 0) throw new Error('Producto con precio_final menor a precio')

  const descuento_monto = (row.precio_final * descuento_pct) / 100
  if (descuento_monto > ganancia) throw new Error('Descuento supera la ganancia unitaria')

  const precio_unitario_final = row.precio_final - descuento_monto
  const subtotal = precio_unitario_final * cantidad

  return {
    descripcion: item.descripcion ?? buildDescripcion(row, key),
    modelo: row.modelo ?? null,
    tipo: row.tipo ?? null,
    color: row.color ?? null,
    cilindrada: row.cilindrada ?? null,
    motor: row.motor ?? null,
    precio_costo_snap: row.precio,
    precio_final_snap: row.precio_final,
    descuento_maximo_snap: row.descuento_maximo_pct,
    descuento_pct,
    descuento_monto,
    cantidad,
    precio_unitario_final,
    subtotal,
  }
}

function calcTotales(items) {
  const subtotal = items.reduce((s, i) => s + (i.precio_final_snap * i.cantidad), 0)
  const total_descuentos = items.reduce((s, i) => s + (i.descuento_monto * i.cantidad), 0)
  const total = items.reduce((s, i) => s + i.subtotal, 0)
  return { subtotal, total_descuentos, total }
}

function reserveStock(db, table, id, cantidad) {
  const r = db.prepare(`
    UPDATE ${table}
    SET cantidad_libre = cantidad_libre - ?, cantidad_reservada = cantidad_reservada + ?
    WHERE id = ? AND cantidad_libre >= ?
  `).run(cantidad, cantidad, id, cantidad)
  if (r.changes === 0) throw new Error('Stock insuficiente')
}

function releaseReserved(db, table, id, cantidad) {
  const r = db.prepare(`
    UPDATE ${table}
    SET cantidad_libre = cantidad_libre + ?, cantidad_reservada = cantidad_reservada - ?
    WHERE id = ? AND cantidad_reservada >= ?
  `).run(cantidad, cantidad, id, cantidad)
  if (r.changes === 0) throw new Error('Stock reservado insuficiente')
}

function reservedToSold(db, table, id, cantidad) {
  const r = db.prepare(`
    UPDATE ${table}
    SET cantidad_reservada = cantidad_reservada - ?, cantidad_vendida = cantidad_vendida + ?
    WHERE id = ? AND cantidad_reservada >= ?
  `).run(cantidad, cantidad, id, cantidad)
  if (r.changes === 0) throw new Error('Stock reservado insuficiente')
}

function libreToSold(db, table, id, cantidad) {
  const r = db.prepare(`
    UPDATE ${table}
    SET cantidad_libre = cantidad_libre - ?, cantidad_vendida = cantidad_vendida + ?
    WHERE id = ? AND cantidad_libre >= ?
  `).run(cantidad, cantidad, id, cantidad)
  if (r.changes === 0) throw new Error('Stock libre insuficiente')
}

function soldToLibre(db, table, id, cantidad) {
  const r = db.prepare(`
    UPDATE ${table}
    SET cantidad_libre = cantidad_libre + ?, cantidad_vendida = cantidad_vendida - ?
    WHERE id = ? AND cantidad_vendida >= ?
  `).run(cantidad, cantidad, id, cantidad)
  if (r.changes === 0) throw new Error('Stock vendido insuficiente')
}

function expireProformas(db) {
  const rows = db.prepare(`
    SELECT id FROM proformas
    WHERE estado = 'ACTIVA' AND fecha_expiracion < datetime('now','localtime')
  `).all()
  for (const row of rows) {
    const tx = db.transaction(() => {
      const items = db.prepare("SELECT * FROM proforma_items WHERE proforma_id = ?").all(row.id)
      for (const it of items) {
        if (it.moto_id) reserveRollback(db, 'motos', it.moto_id, it.cantidad)
        if (it.accesorio_id) reserveRollback(db, 'accesorios', it.accesorio_id, it.cantidad)
        if (it.repuesto_id) reserveRollback(db, 'repuestos', it.repuesto_id, it.cantidad)
      }
      db.prepare("UPDATE proformas SET estado='VENCIDA' WHERE id=?").run(row.id)
    })
    tx()
  }
}

function reserveRollback(db, table, id, cantidad) {
  // Libera stock reservado al expirar o cancelar proformas
  releaseReserved(db, table, id, cantidad)
}

function ensurePdfPath(defaultName) {
  const win = BrowserWindow.getFocusedWindow()
  return dialog.showSaveDialog(win ?? undefined, {
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

function drawInvoiceTable(doc, columns, rows) {
  const pageLeft = doc.page.margins.left
  const pageRight = doc.page.width - doc.page.margins.right
  const pageWidth = pageRight - pageLeft
  const baseWidths = columns.length === 10
    ? [0.22, 0.12, 0.10, 0.08, 0.09, 0.09, 0.06, 0.08, 0.07, 0.09]
    : [0.46, 0.14, 0.12, 0.12, 0.16]
  const colWidths = baseWidths.map(p => p * pageWidth)
  let y = doc.y + 8

  const drawRow = (vals, isHeader) => {
    const rowHeight = 16
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage()
      y = doc.y
    }
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
    let x = pageLeft
    for (let i = 0; i < columns.length; i++) {
      const w = colWidths[i] ?? (pageWidth / columns.length)
      const text = vals[i] ?? ''
      const align = i === 0 ? 'left' : 'right'
      doc.text(text, x + 4, y + 4, { width: w - 8, align })
      doc.rect(x, y, w, rowHeight).strokeColor('#d9d9d9').stroke()
      x += w
    }
    y += rowHeight
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

function formatMoney(n) {
  const num = Number(n ?? 0)
  return num.toFixed(2)
}

async function exportProformaPdf({ proforma, items }) {
  const { filePath } = await ensurePdfPath(`${proforma.codigo}.pdf`)
  if (!filePath) return { ok: false }

  const doc = new PDFDocument({ margin: 36 })
  const stream = fs.createWriteStream(filePath)
  doc.pipe(stream)

  doc.font('Helvetica-Bold').fontSize(18).text('PROFORMA')
  doc.font('Helvetica').fontSize(9).fillColor('#444')
  doc.text(`N° ${proforma.codigo}`)
  doc.text(`Estado: ${proforma.estado}`)
  doc.text(`Fecha: ${proforma.fecha_creacion}`)
  doc.text(`Vigente hasta: ${proforma.fecha_expiracion}`)
  doc.text(`Vendedor: ${proforma.vendedor_nombre}`)
  doc.fillColor('#000')
  doc.moveDown(1)

  doc.font('Helvetica-Bold').fontSize(10).text('CLIENTE')
  doc.font('Helvetica').fontSize(9).fillColor('#333')
  doc.text(proforma.cliente_nombre)
  doc.text(`${proforma.cliente_ci_nit} · ${proforma.cliente_celular}`)
  doc.fillColor('#000')
  doc.moveDown(1.2)

  const columns = ['Descripcion', 'Modelo', 'Tipo', 'Color', 'Cilindrada', 'Motor', 'Cant', 'P.Unit', 'Desc %', 'Subtotal']
  const rows = items.map(it => ([
    it.descripcion,
    it.modelo ?? '',
    it.tipo ?? '',
    it.color ?? '',
    it.cilindrada ?? '',
    it.motor ?? '',
    String(it.cantidad),
    formatMoney(it.precio_unitario_final),
    formatMoney(it.descuento_pct),
    formatMoney(it.subtotal),
  ]))

  drawInvoiceTable(doc, columns, rows)

  doc.moveDown(0.5)
  doc.font('Helvetica-Bold').fontSize(10).text('Totales')
  doc.font('Helvetica').fontSize(9)
  doc.text(`Subtotal: ${formatMoney(proforma.subtotal)}`)
  doc.text(`Descuentos: ${formatMoney(proforma.total_descuentos)}`)
  doc.text(`Total: ${formatMoney(proforma.total)}`)

  doc.end()

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return { ok: true, path: filePath }
}

function filtroTipoProducto(alias) {
  if (alias === 'moto') return 'moto_id IS NOT NULL'
  if (alias === 'accesorio') return 'accesorio_id IS NOT NULL'
  if (alias === 'repuesto') return 'repuesto_id IS NOT NULL'
  return null
}

function getTramiteCost(db, tipo) {
  const key = tipo === 'BSISA' ? 'tramite_bsisa_costo' : 'tramite_placa_costo'
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key)
  const n = Number(row?.value ?? 0)
  return Number.isNaN(n) ? 0 : n
}

// ─── PROFORMAS ────────────────────────────────────────────────────────────────

function registerProformasHandlers() {
  ipcMain.handle('proformas:listar', (_, { token, estado }) => {
    try {
      requireAuth(token)
      const db = getDb()
      expireProformas(db)
      let sql = `
        SELECT p.*, u.nombre as vendedor_nombre
        FROM proformas p
        JOIN usuarios u ON p.vendedor_id = u.id
      `
      const params = []
      if (estado) { sql += " WHERE p.estado = ?"; params.push(estado) }
      sql += " ORDER BY p.fecha_creacion DESC"
      return { ok: true, data: db.prepare(sql).all(...params) }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('proformas:obtener', (_, { token, id }) => {
    try {
      requireAuth(token)
      const db = getDb()
      expireProformas(db)
      const proforma = db.prepare(`
        SELECT p.*, u.nombre as vendedor_nombre
        FROM proformas p JOIN usuarios u ON p.vendedor_id = u.id
        WHERE p.id = ?
      `).get(id)
      if (!proforma) return { ok: false, error: 'Proforma no encontrada' }

      const items = db.prepare("SELECT * FROM proforma_items WHERE proforma_id = ?").all(id)
      return { ok: true, data: { ...proforma, items } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('proformas:crear', (_, { token, data }) => {
    try {
      const user = requireAuth(token)
      const db = getDb()

      if (!data.cliente_nombre || !data.cliente_ci_nit || !data.cliente_celular) {
        return { ok: false, error: 'Datos del cliente incompletos' }
      }
      if (!Array.isArray(data.items) || data.items.length === 0) {
        return { ok: false, error: 'Debe incluir al menos un ítem' }
      }

      const resolved = data.items.map(it => {
        const { key, id, table, row } = getProduct(db, it)
        if (row.cantidad_libre < (it.cantidad ?? 1)) throw new Error('Stock insuficiente')
        return { key, id, table, snapshot: buildItemSnapshot(row, key, it) }
      })

      const totals = calcTotales(resolved.map(r => r.snapshot))

      // Fecha expiración
      let fechaExp
      if (data.fecha_limite) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data.fecha_limite)
        if (!m) return { ok: false, error: 'Fecha limite invalida' }
        const year = Number(m[1])
        const month = Number(m[2]) - 1
        const day = Number(m[3])
        const expiracion = new Date(year, month, day, 23, 59, 59)
        if (Number.isNaN(expiracion.getTime())) return { ok: false, error: 'Fecha limite invalida' }
        if (expiracion < new Date()) return { ok: false, error: 'La fecha limite no puede ser pasada' }
        fechaExp = expiracion.toISOString().slice(0, 19).replace('T', ' ')
      } else {
        const dias = data.dias_vigencia ?? 7
        const expiracion = new Date()
        expiracion.setDate(expiracion.getDate() + dias)
        fechaExp = expiracion.toISOString().slice(0, 19).replace('T', ' ')
      }

      const insertProforma = db.transaction(() => {
        const r = db.prepare(`
          INSERT INTO proformas (codigo, vendedor_id, cliente_nombre, cliente_ci_nit, cliente_celular,
            fecha_expiracion, subtotal, total_descuentos, total, notas)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          generarCodigo(db, 'proformas', 'PRO'),
          user.id, data.cliente_nombre, data.cliente_ci_nit, data.cliente_celular,
          fechaExp, totals.subtotal, totals.total_descuentos, totals.total, data.notas ?? null
        )

        const proformaId = r.lastInsertRowid
        const insertItem = db.prepare(`
          INSERT INTO proforma_items
            (proforma_id, moto_id, accesorio_id, repuesto_id, descripcion,
             modelo, tipo, color, cilindrada, motor,
             precio_costo_snap, precio_final_snap, descuento_maximo_snap,
             descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        for (const item of resolved) {
          insertItem.run(
            proformaId,
            item.key === 'moto_id' ? item.id : null,
            item.key === 'accesorio_id' ? item.id : null,
            item.key === 'repuesto_id' ? item.id : null,
            item.snapshot.descripcion,
            item.snapshot.modelo,
            item.snapshot.tipo,
            item.snapshot.color,
            item.snapshot.cilindrada,
            item.snapshot.motor,
            item.snapshot.precio_costo_snap,
            item.snapshot.precio_final_snap,
            item.snapshot.descuento_maximo_snap,
            item.snapshot.descuento_pct,
            item.snapshot.descuento_monto,
            item.snapshot.cantidad,
            item.snapshot.precio_unitario_final,
            item.snapshot.subtotal
          )

          reserveStock(db, item.table, item.id, item.snapshot.cantidad)
        }
        return proformaId
      })

      const id = insertProforma()
      return { ok: true, data: { id } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('proformas:exportar-pdf', async (_, { token, id }) => {
    try {
      requireAuth(token)
      const db = getDb()
      const proforma = db.prepare(`
        SELECT p.*, u.nombre as vendedor_nombre
        FROM proformas p JOIN usuarios u ON p.vendedor_id = u.id
        WHERE p.id = ?
      `).get(id)
      if (!proforma) return { ok: false, error: 'Proforma no encontrada' }
      const items = db.prepare("SELECT * FROM proforma_items WHERE proforma_id = ?").all(id)
      return await exportProformaPdf({ proforma, items })
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('proformas:cancelar', (_, { token, id }) => {
    try {
      requireAuth(token)
      const db = getDb()
      const proforma = db.prepare("SELECT * FROM proformas WHERE id=?").get(id)
      if (!proforma) return { ok: false, error: 'Proforma no encontrada' }
      if (proforma.estado !== 'ACTIVA') return { ok: false, error: 'Solo se pueden cancelar proformas activas' }

      const tx = db.transaction(() => {
        const items = db.prepare("SELECT * FROM proforma_items WHERE proforma_id = ?").all(id)
        for (const it of items) {
          if (it.moto_id) releaseReserved(db, 'motos', it.moto_id, it.cantidad)
          if (it.accesorio_id) releaseReserved(db, 'accesorios', it.accesorio_id, it.cantidad)
          if (it.repuesto_id) releaseReserved(db, 'repuestos', it.repuesto_id, it.cantidad)
        }
        db.prepare("UPDATE proformas SET estado='CANCELADA' WHERE id=?").run(id)
      })

      tx()
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

// ─── VENTAS ───────────────────────────────────────────────────────────────────

function registerVentasHandlers() {
  ipcMain.handle('ventas:listar', (_, { token }) => {
    try {
      requireAuth(token)
      const rows = getDb().prepare(`
        SELECT v.*, u.nombre as vendedor_nombre
        FROM ventas v JOIN usuarios u ON v.vendedor_id = u.id
        ORDER BY v.fecha_venta DESC
      `).all()
      return { ok: true, data: rows }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ventas:obtener', (_, { token, id }) => {
    try {
      requireAuth(token)
      const db = getDb()
      const venta = db.prepare(`
        SELECT v.*, u.nombre as vendedor_nombre
        FROM ventas v JOIN usuarios u ON v.vendedor_id = u.id
        WHERE v.id = ?
      `).get(id)
      if (!venta) return { ok: false, error: 'Venta no encontrada' }
      const items = db.prepare("SELECT * FROM venta_items WHERE venta_id = ?").all(id)
      const tramites = db.prepare(`
        SELECT t.* FROM tramites t
        JOIN venta_items vi ON t.venta_item_id = vi.id
        WHERE vi.venta_id = ?
      `).all(id)
      return { ok: true, data: { ...venta, items, tramites } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ventas:crear', (_, { token, data }) => {
    try {
      const user = requireAuth(token)
      const db = getDb()

      if (!data.proforma_id) {
        if (user.rol === 'CAJERO') {
          return { ok: false, error: 'El cajero solo puede consolidar ventas desde proformas' }
        }
        if (!data.cliente_nombre || !data.cliente_ci_nit || !data.cliente_celular) {
          return { ok: false, error: 'Datos del cliente incompletos' }
        }
        if (!Array.isArray(data.items) || data.items.length === 0) {
          return { ok: false, error: 'Debe incluir al menos un ítem' }
        }

        const resolved = data.items.map(it => {
          const { key, id, table, row } = getProduct(db, it)
          if (row.cantidad_libre < (it.cantidad ?? 1)) throw new Error('Stock insuficiente')
          return { key, id, table, snapshot: buildItemSnapshot(row, key, it) }
        })

        const totals = calcTotales(resolved.map(r => r.snapshot))

        const crearVenta = db.transaction(() => {
          const r = db.prepare(`
            INSERT INTO ventas (codigo, proforma_id, vendedor_id, cliente_nombre, cliente_ci_nit,
              cliente_celular, subtotal, total_descuentos, total, notas)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            generarCodigo(db, 'ventas', 'VEN'),
            null, user.id,
            data.cliente_nombre, data.cliente_ci_nit, data.cliente_celular,
            totals.subtotal, totals.total_descuentos, totals.total,
            data.notas ?? null
          )
          const ventaId = r.lastInsertRowid

          const insertItem = db.prepare(`
            INSERT INTO venta_items
              (venta_id, moto_id, accesorio_id, repuesto_id, descripcion,
               precio_costo_snap, precio_final_snap, descuento_maximo_snap,
               descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)

          for (const item of resolved) {
            insertItem.run(
              ventaId,
              item.key === 'moto_id' ? item.id : null,
              item.key === 'accesorio_id' ? item.id : null,
              item.key === 'repuesto_id' ? item.id : null,
              item.snapshot.descripcion,
              item.snapshot.precio_costo_snap,
              item.snapshot.precio_final_snap,
              item.snapshot.descuento_maximo_snap,
              item.snapshot.descuento_pct,
              item.snapshot.descuento_monto,
              item.snapshot.cantidad,
              item.snapshot.precio_unitario_final,
              item.snapshot.subtotal
            )

            libreToSold(db, item.table, item.id, item.snapshot.cantidad)
          }

          return ventaId
        })

        const id = crearVenta()
        return { ok: true, data: { id } }
      }

      // Venta desde proforma
      expireProformas(db)
      const proforma = db.prepare("SELECT * FROM proformas WHERE id=?").get(data.proforma_id)
      if (!proforma) return { ok: false, error: 'Proforma no encontrada' }
      if (proforma.estado !== 'ACTIVA') return { ok: false, error: 'La proforma no está activa' }

      const items = db.prepare("SELECT * FROM proforma_items WHERE proforma_id = ?").all(data.proforma_id)
      if (items.length === 0) return { ok: false, error: 'Proforma sin ítems' }

      const totals = calcTotales(items)

      const crearVenta = db.transaction(() => {
        const r = db.prepare(`
          INSERT INTO ventas (codigo, proforma_id, vendedor_id, cliente_nombre, cliente_ci_nit,
            cliente_celular, subtotal, total_descuentos, total, notas)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          generarCodigo(db, 'ventas', 'VEN'),
          proforma.id, user.id,
          proforma.cliente_nombre, proforma.cliente_ci_nit, proforma.cliente_celular,
          totals.subtotal, totals.total_descuentos, totals.total,
          data.notas ?? proforma.notas ?? null
        )
        const ventaId = r.lastInsertRowid

        const insertItem = db.prepare(`
          INSERT INTO venta_items
            (venta_id, moto_id, accesorio_id, repuesto_id, descripcion,
             precio_costo_snap, precio_final_snap, descuento_maximo_snap,
             descuento_pct, descuento_monto, cantidad, precio_unitario_final, subtotal)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const proformaToVentaItem = new Map()

        for (const it of items) {
          const info = insertItem.run(
            ventaId,
            it.moto_id, it.accesorio_id, it.repuesto_id,
            it.descripcion,
            it.precio_costo_snap,
            it.precio_final_snap,
            it.descuento_maximo_snap,
            it.descuento_pct,
            it.descuento_monto,
            it.cantidad,
            it.precio_unitario_final,
            it.subtotal
          )
          proformaToVentaItem.set(it.id, info.lastInsertRowid)

          if (it.moto_id) reservedToSold(db, 'motos', it.moto_id, it.cantidad)
          if (it.accesorio_id) reservedToSold(db, 'accesorios', it.accesorio_id, it.cantidad)
          if (it.repuesto_id) reservedToSold(db, 'repuestos', it.repuesto_id, it.cantidad)
        }

        let tramitesTotal = 0
        const tramites = Array.isArray(data.tramites) ? data.tramites : []
        const insertTramite = db.prepare(`
          INSERT INTO tramites (venta_item_id, tipo, nombre, marca, costo_total, cobro_en_venta, a_cuenta, saldo, estado)
          VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, 'PENDIENTE')
        `)

        for (const t of tramites) {
          const ventaItemId = proformaToVentaItem.get(t.proforma_item_id)
          if (!ventaItemId) continue
          const pi = items.find(i => i.id === t.proforma_item_id)
          if (!pi || !pi.moto_id) continue

          const tipo = (t.tipo || '').toUpperCase()
          if (tipo !== 'BSISA' && tipo !== 'PLACA') continue

          const costo = getTramiteCost(db, tipo)
          const moto = db.prepare('SELECT marca FROM motos WHERE id=?').get(pi.moto_id)

          insertTramite.run(
            ventaItemId,
            tipo,
            proforma.cliente_nombre,
            moto?.marca ?? null,
            costo
          )
          tramitesTotal += costo
        }

        if (tramitesTotal > 0) {
          db.prepare('UPDATE ventas SET total = total + ? WHERE id = ?').run(tramitesTotal, ventaId)
        }

        db.prepare("UPDATE proformas SET estado='CONVERTIDA' WHERE id=?").run(proforma.id)
        return ventaId
      })

      const id = crearVenta()
      return { ok: true, data: { id } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('ventas:anular', (_, { token, id }) => {
    try {
      requireSupervisor(token)
      const db = getDb()
      const venta = db.prepare("SELECT * FROM ventas WHERE id=?").get(id)
      if (!venta) return { ok: false, error: 'Venta no encontrada' }
      if (venta.estado !== 'COMPLETADA') return { ok: false, error: 'La venta ya está anulada' }

      const items = db.prepare("SELECT * FROM venta_items WHERE venta_id = ?").all(id)

      const tx = db.transaction(() => {
        for (const it of items) {
          if (it.moto_id) soldToLibre(db, 'motos', it.moto_id, it.cantidad)
          if (it.accesorio_id) soldToLibre(db, 'accesorios', it.accesorio_id, it.cantidad)
          if (it.repuesto_id) soldToLibre(db, 'repuestos', it.repuesto_id, it.cantidad)
        }
        db.prepare("UPDATE ventas SET estado='ANULADA' WHERE id=?").run(id)
        if (venta.proforma_id) {
          db.prepare("UPDATE proformas SET estado='CANCELADA' WHERE id=?").run(venta.proforma_id)
        }
      })

      tx()
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })
}

// ─── REPORTES ─────────────────────────────────────────────────────────────────

function buildProformasReport(db, { fechaInicio, fechaFin, usuario_id, tipo_producto }) {
  let sql = `
    SELECT p.*, u.nombre as vendedor_nombre
    FROM proformas p
    JOIN usuarios u ON p.vendedor_id = u.id
    WHERE 1=1
  `
  const params = []
  if (fechaInicio) { sql += " AND p.fecha_creacion >= ?"; params.push(fechaInicio) }
  if (fechaFin)    { sql += " AND p.fecha_creacion <= ?"; params.push(fechaFin + ' 23:59:59') }
  if (usuario_id)  { sql += " AND p.vendedor_id = ?"; params.push(usuario_id) }

  const tipoFilter = filtroTipoProducto(tipo_producto)
  if (tipoFilter) {
    sql += ` AND EXISTS (SELECT 1 FROM proforma_items pi WHERE pi.proforma_id = p.id AND ${tipoFilter})`
  }

  sql += " ORDER BY p.fecha_creacion DESC"
  const rows = db.prepare(sql).all(...params)

  const totals = rows.reduce((acc, r) => {
    acc.subtotal += r.subtotal
    acc.descuentos += r.total_descuentos
    acc.total += r.total
    return acc
  }, { subtotal: 0, descuentos: 0, total: 0 })

  return { rows, totals }
}

function buildVentasReport(db, { fechaInicio, fechaFin, usuario_id, tipo_producto }) {
  let sql = `
    SELECT v.*, u.nombre as vendedor_nombre
    FROM ventas v
    JOIN usuarios u ON v.vendedor_id = u.id
    WHERE 1=1
  `
  const params = []
  if (fechaInicio) { sql += " AND v.fecha_venta >= ?"; params.push(fechaInicio) }
  if (fechaFin)    { sql += " AND v.fecha_venta <= ?"; params.push(fechaFin + ' 23:59:59') }
  if (usuario_id)  { sql += " AND v.vendedor_id = ?"; params.push(usuario_id) }

  const tipoFilter = filtroTipoProducto(tipo_producto)
  if (tipoFilter) {
    sql += ` AND EXISTS (SELECT 1 FROM venta_items vi WHERE vi.venta_id = v.id AND ${tipoFilter})`
  }

  sql += " ORDER BY v.fecha_venta DESC"
  const rows = db.prepare(sql).all(...params)

  const totals = rows.reduce((acc, r) => {
    acc.subtotal += r.subtotal
    acc.descuentos += r.total_descuentos
    acc.total += r.total
    return acc
  }, { subtotal: 0, descuentos: 0, total: 0 })

  return { rows, totals }
}

function reportFiltersText({ fechaInicio, fechaFin, usuario_id, tipo_producto }) {
  const parts = []
  if (fechaInicio) parts.push(`Desde ${fechaInicio}`)
  if (fechaFin) parts.push(`Hasta ${fechaFin}`)
  if (usuario_id) parts.push(`Usuario ID ${usuario_id}`)
  if (tipo_producto) parts.push(`Tipo ${tipo_producto}`)
  return parts.join(' | ')
}

function registerReportesHandlers() {
  ipcMain.handle('reportes:ventas', (_, { token, fechaInicio, fechaFin, usuario_id, tipo_producto }) => {
    try {
      const user = requireAuth(token)
      const usuarioId = user.rol === 'CAJERO' ? user.id : usuario_id
      const db = getDb()
      const { rows, totals } = buildVentasReport(db, { fechaInicio, fechaFin, usuario_id: usuarioId, tipo_producto })
      return {
        ok: true,
        data: {
          ventas: rows,
          total_ventas: rows.length,
          subtotal: totals.subtotal,
          total_descuentos: totals.descuentos,
          ingresos_totales: totals.total,
        }
      }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('reportes:proformas', (_, { token, fechaInicio, fechaFin, usuario_id, tipo_producto }) => {
    try {
      const user = requireAuth(token)
      const usuarioId = user.rol === 'CAJERO' ? user.id : usuario_id
      const db = getDb()
      const { rows, totals } = buildProformasReport(db, { fechaInicio, fechaFin, usuario_id: usuarioId, tipo_producto })
      return {
        ok: true,
        data: {
          proformas: rows,
          total_proformas: rows.length,
          subtotal: totals.subtotal,
          total_descuentos: totals.descuentos,
          total: totals.total,
        }
      }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('reportes:inventario', (_, { token }) => {
    try {
      requireAuth(token)
      const db = getDb()
      const motos      = db.prepare("SELECT * FROM motos WHERE activo=1").all()
      const accesorios = db.prepare("SELECT * FROM accesorios WHERE activo=1").all()
      const repuestos  = db.prepare("SELECT * FROM repuestos WHERE activo=1").all()

      const agg = (items) => ({
        items,
        total_unidades: items.reduce((s, i) => s + i.cantidad_libre, 0),
        total_reservadas: items.reduce((s, i) => s + i.cantidad_reservada, 0),
        total_vendidas: items.reduce((s, i) => s + i.cantidad_vendida, 0),
        valor_total: items.reduce((s, i) => s + (i.precio_final * i.cantidad_libre), 0),
      })

      return { ok: true, data: { motos: agg(motos), accesorios: agg(accesorios), repuestos: agg(repuestos) } }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('reportes:tramites', (_, { token, estado }) => {
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
      const tramites = db.prepare(sql).all(...params)
      return {
        ok: true, data: {
          tramites,
          total: tramites.length,
          saldo_pendiente: tramites.filter(t => t.estado !== 'COMPLETADO').reduce((s, t) => s + (t.saldo ?? 0), 0),
        }
      }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('reportes:ventas:exportar-pdf', async (_, { token, fechaInicio, fechaFin, usuario_id, tipo_producto }) => {
    try {
      const user = requireAuth(token)
      const usuarioId = user.rol === 'CAJERO' ? user.id : usuario_id
      const db = getDb()
      const { rows, totals } = buildVentasReport(db, { fechaInicio, fechaFin, usuario_id: usuarioId, tipo_producto })
      const tableRows = rows.map(r => [
        r.fecha_venta, r.codigo, r.vendedor_nombre, r.cliente_nombre,
        String(r.subtotal), String(r.total_descuentos), String(r.total), r.estado
      ])
      return await exportPdf({
        title: 'Reporte de Ventas',
        subtitle: reportFiltersText({ fechaInicio, fechaFin, usuario_id: usuarioId, tipo_producto }),
        columns: ['Fecha', 'Codigo', 'Vendedor', 'Cliente', 'Subtotal', 'Desc.', 'Total', 'Estado'],
        rows: tableRows,
        totals: [
          `Ventas: ${rows.length}`,
          `Subtotal: ${totals.subtotal}`,
          `Descuentos: ${totals.descuentos}`,
          `Total: ${totals.total}`,
        ],
        defaultName: `reporte-ventas-${Date.now()}.pdf`
      })
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('reportes:proformas:exportar-pdf', async (_, { token, fechaInicio, fechaFin, usuario_id, tipo_producto }) => {
    try {
      const user = requireAuth(token)
      const usuarioId = user.rol === 'CAJERO' ? user.id : usuario_id
      const db = getDb()
      const { rows, totals } = buildProformasReport(db, { fechaInicio, fechaFin, usuario_id: usuarioId, tipo_producto })
      const tableRows = rows.map(r => [
        r.fecha_creacion, r.codigo, r.vendedor_nombre, r.cliente_nombre,
        String(r.subtotal), String(r.total_descuentos), String(r.total), r.estado
      ])
      return await exportPdf({
        title: 'Reporte de Proformas',
        subtitle: reportFiltersText({ fechaInicio, fechaFin, usuario_id: usuarioId, tipo_producto }),
        columns: ['Fecha', 'Codigo', 'Vendedor', 'Cliente', 'Subtotal', 'Desc.', 'Total', 'Estado'],
        rows: tableRows,
        totals: [
          `Proformas: ${rows.length}`,
          `Subtotal: ${totals.subtotal}`,
          `Descuentos: ${totals.descuentos}`,
          `Total: ${totals.total}`,
        ],
        defaultName: `reporte-proformas-${Date.now()}.pdf`
      })
    } catch (e) { return { ok: false, error: e.message } }
  })
}

module.exports = { registerProformasHandlers, registerVentasHandlers, registerReportesHandlers }
