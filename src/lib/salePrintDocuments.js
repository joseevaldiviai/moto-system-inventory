const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const formatPrintDate = (value) => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return '__/__/____'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear())
  return `${day}/${month}/${year}`
}

const formatLongPrintDate = (value) => {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return '____ de __________ de 20__'
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${String(date.getDate()).padStart(2, '0')} de ${months[date.getMonth()]} de ${date.getFullYear()}`
}

const formatMoney = (value) => Number(value || 0).toFixed(2)

const itemDescription = (item) => {
  const parts = [
    item.descripcion,
    item.producto,
    item.marca,
    item.tipo,
    item.modelo,
    item.talla ? `Talla ${item.talla}` : null,
    item.color,
  ].filter(Boolean)
  return parts[0] || 'Producto'
}

function buildCommercialDocument(sale, saleCode, printDate, ubicacion, title) {
  const itemRows = (sale.items || []).map((item) => `
    <tr>
      <td>${escapeHtml(itemDescription(item))}</td>
      <td style="text-align:center">${Number(item.cantidad ?? 0)}</td>
      <td style="text-align:right">${formatMoney(item.precio_unitario_final)}</td>
      <td style="text-align:right">${formatMoney(item.subtotal)}</td>
    </tr>
  `).join('')

  const tramitesTotal = (sale.tramites || []).reduce((sum, t) => sum + Number(t.costo_total || 0), 0)
  const tramiteRows = (sale.tramites || []).map((tramite) => `
    <tr>
      <td>${escapeHtml(tramite.tipo || tramite.nombre || 'Tramite')}</td>
      <td style="text-align:center">1</td>
      <td style="text-align:right">${formatMoney(tramite.costo_total)}</td>
      <td style="text-align:right">${formatMoney(tramite.costo_total)}</td>
    </tr>
  `).join('')

  const subtotal = Number(sale.subtotal ?? 0)
  const descuentos = Number(sale.total_descuentos ?? 0)
  const totalProductos = Number(sale.total ?? 0)
  const totalGeneral = totalProductos + tramitesTotal

  return `
    <div class="sheet doc-page">
      <div style="text-align: right;">N° ${escapeHtml(saleCode)}</div>
      <h2 style="text-align: center;">${escapeHtml(title)}</h2>
      <p>Fecha: ${escapeHtml(printDate)}</p>
      <p><strong>Cliente:</strong> ${escapeHtml(sale.cliente_nombre || '')}</p>
      <p><strong>CI / NIT:</strong> ${escapeHtml(sale.cliente_ci_nit || '')} · <strong>Celular:</strong> ${escapeHtml(sale.cliente_celular || '')}</p>
      <p><strong>Ubicacion:</strong> ${escapeHtml(ubicacion || sale.punto_venta_nombre || '')} · <strong>Vendedor:</strong> ${escapeHtml(sale.vendedor_nombre || '')}</p>
      <table>
        <thead>
          <tr>
            <th>Detalle</th>
            <th style="text-align:center">Cant.</th>
            <th style="text-align:right">P. unit.</th>
            <th style="text-align:right">Subtotal Bs.</th>
          </tr>
        </thead>
        <tbody>${itemRows}${tramiteRows}</tbody>
      </table>
      <table style="width: 100%; margin-top: 12px; font-size: 12px;">
        <tr><td style="text-align:right">Subtotal productos:</td><td style="text-align:right; width: 120px;">${formatMoney(subtotal)}</td></tr>
        <tr><td style="text-align:right">Descuentos:</td><td style="text-align:right">${formatMoney(descuentos)}</td></tr>
        <tr><td style="text-align:right">Total productos:</td><td style="text-align:right">${formatMoney(totalProductos)}</td></tr>
        ${tramitesTotal > 0 ? `<tr><td style="text-align:right">Tramites:</td><td style="text-align:right">${formatMoney(tramitesTotal)}</td></tr>` : ''}
        <tr><td style="text-align:right"><strong>Total general:</strong></td><td style="text-align:right"><strong>${formatMoney(totalGeneral)}</strong></td></tr>
      </table>
      <div style="margin-top: 40px; display: flex; justify-content: space-between; text-align: center;">
        <div style="width: 45%; border-top: 1px solid #000;">Firma Cliente</div>
        <div style="width: 45%; border-top: 1px solid #000;">Firma Vendedor</div>
      </div>
    </div>
  `.replace(/<\/?motion\.div[^>]*>/g, (tag) => tag.replace('motion.', ''))
}

export function buildSalePrintSections(sale, { usuario, isCentralSale = false } = {}) {
  const sections = []
  const saleCode = sale.codigo || '________'
  const printDate = formatPrintDate(sale.fecha_venta)
  const longPrintDate = formatLongPrintDate(sale.fecha_venta)
  const ubicacion = sale.punto_venta_tipo === 'CENTRAL' ? 'Almacen Central' : (sale.punto_venta_nombre || '')

  if ((sale.items || []).length || (sale.tramites || []).length) {
    sections.push(buildCommercialDocument(sale, saleCode, printDate, ubicacion, 'FACTURA'))
    sections.push(buildCommercialDocument(sale, saleCode, printDate, ubicacion, 'NOTA DE VENTA'))
  }

  const tramitesRows = (sale.tramites || []).map((tramite) => {
    const item = (sale.items || []).find((entry) => Number(entry.id) === Number(tramite.venta_item_id))
    return `
      <tr>
        <td>${escapeHtml(tramite.tipo || tramite.nombre || '')}</td>
        <td>${escapeHtml(sale.cliente_celular || sale.cliente_nombre || '')}</td>
        <td>${escapeHtml(item?.referencia_moto || item?.descripcion || '')}</td>
        <td>${formatMoney(tramite.a_cuenta ?? 0)}</td>
        <td>${formatMoney(tramite.saldo ?? 0)}</td>
        <td>${formatMoney(tramite.costo_total ?? 0)}</td>
      </tr>
    `
  })

  const tramitesTotal = (sale.tramites || []).reduce((sum, t) => sum + Number(t.costo_total || 0), 0)
  if (tramitesRows.length) {
    const blankRows = Array.from({ length: Math.max(0, 2 - tramitesRows.length) }, () => (
      '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'
    )).join('')
    sections.push(`
      <div class="sheet doc-page">
        <div style="text-align: right;">N° ${escapeHtml(saleCode)}</div>
        <h2 style="text-align: center;">ORDEN DE SERVICIO</h2>
        <p>Fecha: ${escapeHtml(printDate)}</p>
        <table>
          <thead>
            <tr>
              <th>Servicio solicitado</th>
              <th>Contacto</th>
              <th>Motocicleta/Ref.</th>
              <th>Adelanto Bs.</th>
              <th>Saldo Bs.</th>
              <th>Total Bs.</th>
            </tr>
          </thead>
          <tbody>${tramitesRows.join('')}${blankRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="5" style="text-align: right;"><strong>TOTAL</strong></td>
              <td>${formatMoney(tramitesTotal)}</td>
            </tr>
          </tfoot>
        </table>
        <p><strong>Observaciones:</strong> ${escapeHtml((sale.tramites || []).map((t) => t.observaciones).filter(Boolean).join(' | ')) || '__________________________________________'}</p>
        <div style="margin-top: 50px; display: flex; justify-content: space-between; text-align: center;">
          <div style="width: 45%; border-top: 1px solid #000;">Firma Cliente</div>
          <div style="width: 45%; border-top: 1px solid #000;">Firma Vendedor</div>
        </div>
        <p style="text-align: center; font-size: 10px; margin-top: 20px;">PARA TRAMITES</p>
      </div>
    `.replace(/<\/?motion\.div[^>]*>/g, (tag) => tag.replace('motion.', '')))
  }

  const deliveredItems = (sale.items || []).filter((item) => item.accesorio_id || item.repuesto_id)
  const deliveryRows = deliveredItems.map((item) => `
    <tr>
      <td>${escapeHtml(item.tipo || '')}</td>
      <td>${escapeHtml(item.producto || '')}</td>
      <td>${escapeHtml(item.marca || '')}</td>
      <td>${escapeHtml([item.descripcion, item.talla ? `Talla ${item.talla}` : ''].filter(Boolean).join(' / '))}</td>
      <td>${formatMoney(item.precio_unitario_final ?? 0)}</td>
      <td>${Number(item.cantidad ?? 0)}</td>
      <td>${formatMoney(item.subtotal ?? 0)}</td>
    </tr>
  `)
  const deliveryTotal = deliveredItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
  if (deliveryRows.length) {
    const blankRows = Array.from({ length: Math.max(0, 2 - deliveryRows.length) }, () => (
      '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'
    )).join('')
    sections.push(`
      <div class="sheet doc-page">
        <div style="text-align: right;">N° ${escapeHtml(saleCode)}</div>
        <h2 style="text-align: center;">CONSTANCIA DE ENTREGA</h2>
        <p>Fecha: ${escapeHtml(printDate)}</p>
        <table>
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Producto</th>
              <th>Marca</th>
              <th>Descripcion/Talla</th>
              <th>P. Unitario</th>
              <th>Cant.</th>
              <th>Monto Bs.</th>
            </tr>
          </thead>
          <tbody>${deliveryRows.join('')}${blankRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="6" style="text-align: right;"><strong>TOTAL</strong></td>
              <td>${formatMoney(deliveryTotal)}</td>
            </tr>
          </tfoot>
        </table>
        <p><strong>Observaciones:</strong> __________________________________________</p>
        <div style="margin-top: 50px; display: flex; justify-content: space-between; text-align: center;">
          <div style="width: 45%; border-top: 1px solid #000;">Firma Cliente</div>
          <div style="width: 45%; border-top: 1px solid #000;">Firma Vendedor</div>
        </div>
      </div>
    `)
  }

  const motoItems = (sale.items || []).filter((item) => item.moto_id || item.moto_e_id)
  motoItems.forEach((item) => {
    sections.push(`
      <div class="sheet doc-page" style="font-size: 12px;">
        <h2 style="text-align: center;">ENTREGA DE MOTOCICLETA</h2>
        <p style="text-align: right;">Cochabamba, ${escapeHtml(longPrintDate)}</p>
        <p>Venta a: ${escapeHtml(sale.cliente_nombre || '_________________________')} [ ] Credito [ ] Contado</p>
        <fieldset style="margin-bottom: 15px;">
            <legend><strong>CARACTERISTICAS DE LA MOTO</strong></legend>
            <p>Marca: ${escapeHtml(item.marca || '____________________')} Modelo: ${escapeHtml(item.modelo || '____________________')}</p>
            <p>N° Motor: ${escapeHtml(item.motor || '__________________')} N° Chasis: ${escapeHtml(item.chasis || '_________________')}</p>
            <p>Color: ${escapeHtml(item.color || '____________________')}</p>
        </fieldset>
        <div style="border: 1px solid #000; padding: 10px; margin-bottom: 15px;">
            <p><strong>OBSERVACIONES:</strong> EL TIEMPO DE GARANTIA ES DE 1 ANO O 12000 KM.</p>
            <p><strong>IMPORTANTE:</strong> ES OBLIGATORIO REALIZAR EL PRIMER MANTENIMIENTO A LOS 300 KM EN UN TALLER AUTORIZADO.</p>
        </div>
        <table style="width: 100%; margin-top: 30px; text-align: left;">
            <tr>
                <td>Recibido por: ${escapeHtml(sale.cliente_nombre || '_________________')}</td>
                <td>Entregado por: ${escapeHtml(usuario?.nombre || '________________')}</td>
            </tr>
            <tr>
                <td>N° C.I.: ${escapeHtml(sale.cliente_ci_nit || '______________________')}</td>
                <td>N° C.I.: ______________________</td>
            </tr>
        </table>
        <p style="text-align: center; margin-top: 20px;"><i>"La moto se encuentra en perfectas condiciones de funcionamiento."</i></p>
      </div>
    `)
  })

  if (isCentralSale && motoItems.length) {
    const rows = motoItems.map((item) => `
      <tr>
        <td>${escapeHtml(item.marca || '')}</td>
        <td>${escapeHtml(item.modelo || '')}</td>
        <td>${escapeHtml(item.motor || '')}</td>
        <td>${escapeHtml(item.chasis || '')}</td>
        <td>${escapeHtml(item.color || '')}</td>
        <td>${Number(item.cantidad || 0)}</td>
      </tr>
    `).join('')
    sections.push(`
      <div class="sheet doc-page" style="width: 700px; font-size: 12px;">
        <h2 style="text-align: center;">ENTREGA DE MOTOCICLETAS</h2>
        <p style="text-align: right;">Cochabamba, ${escapeHtml(longPrintDate)}</p>
        <p>Venta a: ${escapeHtml(sale.cliente_nombre || '_________________________')} [ ] Credito [ ] Contado</p>
        <fieldset style="margin-bottom: 15px;">
            <legend><strong>DETALLE DE MOTOCICLETAS</strong></legend>
            <table>
              <thead>
                <tr>
                  <th>Marca</th>
                  <th>Modelo</th>
                  <th>N° Motor</th>
                  <th>N° Chasis</th>
                  <th>Color</th>
                  <th>Cant.</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
        </fieldset>
        <div style="border: 1px solid #000; padding: 10px; margin-bottom: 15px;">
            <p><strong>OBSERVACIONES:</strong> EL TIEMPO DE GARANTIA ES DE 1 ANO O 12000 KM.</p>
            <p><strong>IMPORTANTE:</strong> ES OBLIGATORIO REALIZAR EL PRIMER MANTENIMIENTO A LOS 300 KM EN UN TALLER AUTORIZADO.</p>
        </div>
        <table style="width: 100%; margin-top: 30px; text-align: left;">
            <tr>
                <td>Recibido por: ${escapeHtml(sale.cliente_nombre || '_________________')}</td>
                <td>Entregado por: ${escapeHtml(usuario?.nombre || '________________')}</td>
            </tr>
            <tr>
                <td>N° C.I.: ${escapeHtml(sale.cliente_ci_nit || '______________________')}</td>
                <td>N° C.I.: ______________________</td>
            </tr>
        </table>
        <p style="text-align: center; margin-top: 20px;"><i>"Las motocicletas se encuentran en perfectas condiciones de funcionamiento."</i></p>
      </div>
    `)
  }

  return sections
}

export function openCombinedSalePrintWindow(sale, context = {}) {
  const sections = buildSalePrintSections(sale, context)
  if (!sections.length) return { ok: false, error: 'La venta no tiene documentos para imprimir' }

  const w = window.open('', '_blank')
  if (!w) return { ok: false, error: 'Permite ventanas emergentes para imprimir' }

  const saleCode = sale.codigo || sale.id
  w.document.open()
  w.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Venta ${escapeHtml(saleCode)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #000; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #000; padding: 6px; font-size: 12px; text-align: left; vertical-align: top; }
    h2 { margin: 0 0 12px; font-size: 22px; }
    .sheet { width: 500px; border: 1px solid #000; padding: 20px; margin: 0 auto 24px; box-sizing: border-box; }
    .doc-page { page-break-after: always; }
    .print-btn { margin-bottom: 12px; }
    @media print {
      body { margin: 0; }
      .print-btn { display: none; }
      .sheet { border: 1px solid #000; margin: 0 auto; }
      .doc-page { page-break-after: always; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir / Guardar como PDF</button>
  ${sections.join('\n')}
</body>
</html>`)
  w.document.close()
  setTimeout(() => w.focus(), 50)
  return { ok: true, documents: sections.length }
}
