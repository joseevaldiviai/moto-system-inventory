import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'

const INITIAL_ITEM_FORM = {
  producto: 'moto',
  marca: '',
  producto_id: '',
  cantidad: 1,
  descuento_pct: 0,
}

export default function Ventas() {
  const { token, usuario, esSupervisor } = useAuthStore()
  const [proformas, setProformas] = useState([])
  const [motos, setMotos] = useState([])
  const [motosE, setMotosE] = useState([])
  const [accesorios, setAccesorios] = useState([])
  const [repuestos, setRepuestos] = useState([])
  const [marcas, setMarcas] = useState([])
  const [items, setItems] = useState([])
  const [cliente, setCliente] = useState({ nombre: '', ci_nit: '', celular: '' })
  const [itemForm, setItemForm] = useState(INITIAL_ITEM_FORM)
  const [detail, setDetail] = useState(null)
  const [tramites, setTramites] = useState({})
  const [costos, setCostos] = useState({ bsisa: 0, placa: 0 })
  const [lastSale, setLastSale] = useState(null)
  const inventoryParams = esSupervisor()
    ? { scope: 'central' }
    : usuario?.punto_venta_id
      ? { scope: 'point', puntoVentaId: usuario.punto_venta_id }
      : null
  const canOperate = esSupervisor() || !!usuario?.punto_venta_id
  const isCentralSaleContext = esSupervisor() || usuario?.punto_venta_tipo === 'CENTRAL'

  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
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
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  const load = async () => {
    const [p, m, me, a, r, marcasRes] = await Promise.all([
      api.listarProformas({ token, estado: 'ACTIVA' }),
      inventoryParams ? api.listarMotos({ token, soloStock: true, ...inventoryParams }) : Promise.resolve({ ok: true, data: [] }),
      inventoryParams ? api.listarMotosE({ token, soloStock: true, ...inventoryParams }) : Promise.resolve({ ok: true, data: [] }),
      inventoryParams ? api.listarAccesorios({ token, soloStock: true, ...inventoryParams }) : Promise.resolve({ ok: true, data: [] }),
      inventoryParams ? api.listarRepuestos({ token, soloStock: true, ...inventoryParams }) : Promise.resolve({ ok: true, data: [] }),
      api.listarMarcas({ token }),
    ])
    if (p.ok) setProformas(p.data)
    if (m.ok) setMotos(m.data)
    if (me.ok) setMotosE(me.data)
    if (a.ok) setAccesorios(a.data)
    if (r.ok) setRepuestos(r.data)
    if (marcasRes.ok) setMarcas(marcasRes.data.filter((marca) => marca.activo))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    api.configGet({ token }).then(r => {
      if (!r.ok) return
      setCostos({
        bsisa: Number(r.data?.tramite_bsisa_costo ?? 0),
        placa: Number(r.data?.tramite_placa_costo ?? 0),
      })
    })
  }, [token])

  const catalogoActual = itemForm.producto === 'moto'
    ? motos
    : itemForm.producto === 'moto_e'
      ? motosE
    : itemForm.producto === 'accesorio'
      ? accesorios
      : repuestos

  const marcasDisponibles = marcas.map((marca) => marca.nombre).sort((a, b) => a.localeCompare(b))
  const productosFiltrados = itemForm.marca
    ? catalogoActual.filter((p) => p.marca === itemForm.marca)
    : []

  const getProducto = (producto, id) => {
    if (!id) return null
    if (producto === 'moto') return motos.find(m => m.id === id) || null
    if (producto === 'moto_e') return motosE.find(m => m.id === id) || null
    if (producto === 'accesorio') return accesorios.find(a => a.id === id) || null
    return repuestos.find(r => r.id === id) || null
  }

  const productoLabel = (producto, id) => {
    const selected = getProducto(producto, id)
    if (!selected) return ''
    if (producto === 'moto' || producto === 'moto_e') return `${selected.marca} ${selected.ano ?? selected.modelo}`.trim()
    return `${selected.producto ? `${selected.producto} ` : ''}${selected.marca ? `${selected.marca} ` : ''}${selected.tipo}`.trim()
  }

  const formatProductoOption = (producto) => {
    if (itemForm.producto === 'moto' || itemForm.producto === 'moto_e') return `${producto.marca} ${producto.ano ?? producto.modelo} · ${producto.chasis}`
    return `${producto.producto ? `${producto.producto} · ` : ''}${producto.tipo}${producto.marca ? ` · ${producto.marca}` : ''}${producto.color ? ` · ${producto.color}` : ''}`
  }

  const addItem = () => {
    if (!itemForm.producto_id) return toast.error('Selecciona un producto')
    const productoId = Number(itemForm.producto_id)
    const producto = getProducto(itemForm.producto, productoId)
    const payload = {
      cantidad: Number(itemForm.cantidad || 1),
      descuento_pct: Number(itemForm.descuento_pct || 0),
      descripcion: productoLabel(itemForm.producto, productoId),
      _descuento_maximo: producto?.descuento_maximo_pct ?? null,
      _tipo_producto: itemForm.producto,
      _tramites: { bsisa: false, placa: false },
    }
    if (itemForm.producto === 'moto') payload.moto_id = productoId
    if (itemForm.producto === 'moto_e') payload.moto_e_id = productoId
    if (itemForm.producto === 'accesorio') payload.accesorio_id = productoId
    if (itemForm.producto === 'repuesto') payload.repuesto_id = productoId

    setItems(prev => [...prev, payload])
    setItemForm(current => ({ ...current, producto_id: '', cantidad: 1, descuento_pct: 0 }))
  }

  const updateItem = (idx, patch) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const toggleDirectSaleTramite = (idx, tipo) => {
    setItems(prev => prev.map((item, index) => (
      index === idx
        ? { ...item, _tramites: { ...item._tramites, [tipo]: !item._tramites?.[tipo] } }
        : item
    )))
  }

  const getUnitSalePrice = (item) => {
    const productId = item.moto_id || item.moto_e_id || item.accesorio_id || item.repuesto_id
    const producto = getProducto(item._tipo_producto, productId)
    if (!producto) return 0
    const baseSalePrice = producto.precio_venta ?? producto.precio_final ?? 0
    const descuento = (Number(baseSalePrice) * Number(item.descuento_pct || 0)) / 100
    return Number(baseSalePrice) - descuento
  }

  const totalDirecto = () => items.reduce((sum, item) => sum + (getUnitSalePrice(item) * Number(item.cantidad || 1)), 0)
  const totalTramitesDirecto = () => items.reduce((sum, item) => (
    sum
    + (item._tramites?.bsisa ? costos.bsisa : 0)
    + (item._tramites?.placa ? costos.placa : 0)
  ), 0)

  const crearVentaDirecta = async () => {
    if (!canOperate) return toast.error('Asigna un punto de venta al vendedor antes de vender')
    if (!cliente.nombre || !cliente.ci_nit || !cliente.celular) return toast.error('Completa datos del cliente')
    if (!items.length) return toast.error('Agrega al menos un item')

    const payloadItems = items.map((item) => {
      const payload = {
        cantidad: Number(item.cantidad || 1),
        descuento_pct: Number(item.descuento_pct || 0),
        descripcion: item.descripcion,
      }
      if (item.moto_id) payload.moto_id = item.moto_id
      if (item.moto_e_id) payload.moto_e_id = item.moto_e_id
      if (item.accesorio_id) payload.accesorio_id = item.accesorio_id
      if (item.repuesto_id) payload.repuesto_id = item.repuesto_id
      if (item.moto_id) {
        const tramites = []
        if (item._tramites?.bsisa) tramites.push('BSISA')
        if (item._tramites?.placa) tramites.push('PLACA')
        payload.tramites = tramites
      }
      return payload
    })

    const res = await api.crearVenta({
      token,
      data: {
        cliente_nombre: cliente.nombre,
        cliente_ci_nit: cliente.ci_nit,
        cliente_celular: cliente.celular,
        items: payloadItems,
      },
    })
    if (!res.ok) return toast.error(res.error || 'Error')

    setLastSale({ id: res.data.id })
    toast.success('Venta registrada')
    await printSaleDocuments(res.data.id)
    setItems([])
    setCliente({ nombre: '', ci_nit: '', celular: '' })
    load()
  }

  const openDetail = async (id) => {
    const res = await api.obtenerProforma({ token, id })
    if (!res.ok) return toast.error(res.error || 'Error')
    setDetail(res.data)
  }

  const toggleTramite = (piId, tipo) => {
    setTramites(prev => {
      const current = prev[piId] || { bsisa: false, placa: false }
      return { ...prev, [piId]: { ...current, [tipo]: !current[tipo] } }
    })
  }

  const consolidar = async (id) => {
    if (!canOperate) return toast.error('Asigna un punto de venta al vendedor antes de vender')
    const tramitesPayload = []
    for (const [piId, flags] of Object.entries(tramites)) {
      if (flags.bsisa) tramitesPayload.push({ proforma_item_id: Number(piId), tipo: 'BSISA' })
      if (flags.placa) tramitesPayload.push({ proforma_item_id: Number(piId), tipo: 'PLACA' })
    }

    const res = await api.crearVenta({ token, data: { proforma_id: id, tramites: tramitesPayload } })
    if (!res.ok) return toast.error(res.error || 'Error')
    setLastSale({ id: res.data.id })
    toast.success('Venta consolidada')
    await printSaleDocuments(res.data.id)
    setDetail(null)
    setTramites({})
    load()
  }

  const openPrintableHtml = (title, bodyHtml) => {
    const w = window.open('', '_blank')
    if (!w) {
      toast.error('Permite ventanas emergentes para imprimir')
      return
    }
    w.document.open()
    w.document.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #000; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #000; padding: 6px; font-size: 12px; text-align: left; vertical-align: top; }
    h2 { margin: 0 0 12px; font-size: 22px; }
    .sheet { width: 500px; border: 1px solid #000; padding: 20px; margin: 0 auto; box-sizing: border-box; }
    .print-btn { margin-bottom: 12px; }
    @media print {
      body { margin: 0; }
      .print-btn { display: none; }
      .sheet { border: 1px solid #000; margin: 0 auto; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Imprimir / Guardar como PDF</button>
  ${bodyHtml}
</body>
</html>`)
    w.document.close()
    setTimeout(() => w.focus(), 50)
  }

  const printSaleDocuments = async (saleId) => {
    if (!saleId) return
    const res = await api.obtenerVenta({ token, id: saleId })
    if (!res?.ok) {
      toast.error(res?.error || 'No se pudo preparar la impresión')
      return
    }

    const sale = res.data
    setLastSale({ id: sale.id, codigo: sale.codigo })
    const saleCode = sale.codigo || '________'
    const printDate = formatPrintDate(sale.fecha_venta)
    const longPrintDate = formatLongPrintDate(sale.fecha_venta)
    const tramitesRows = (sale.tramites || []).map((tramite) => {
      const item = (sale.items || []).find((entry) => Number(entry.id) === Number(tramite.venta_item_id))
      return `
        <tr>
          <td>${escapeHtml(tramite.tipo || tramite.nombre || '')}</td>
          <td>${escapeHtml(sale.cliente_celular || sale.cliente_nombre || '')}</td>
          <td>${escapeHtml(item?.referencia_moto || item?.descripcion || '')}</td>
          <td>${Number(tramite.a_cuenta ?? 0).toFixed(2)}</td>
          <td>${Number(tramite.saldo ?? 0).toFixed(2)}</td>
          <td>${Number(tramite.costo_total ?? 0).toFixed(2)}</td>
        </tr>
      `
    })

    const tramitesTotal = (sale.tramites || []).reduce((sum, item) => sum + Number(item.costo_total || 0), 0)
    if (tramitesRows.length) {
      const blankRows = Array.from({ length: Math.max(0, 2 - tramitesRows.length) }, () => (
        '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'
      )).join('')
      openPrintableHtml(
        `tramites-${saleCode}`,
        `<div class="sheet">
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
                <td>${tramitesTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <p><strong>Observaciones:</strong> ${escapeHtml((sale.tramites || []).map((item) => item.observaciones).filter(Boolean).join(' | ')) || '__________________________________________'}</p>
          <div style="margin-top: 50px; display: flex; justify-content: space-between; text-align: center;">
            <div style="width: 45%; border-top: 1px solid #000;">Firma Cliente</div>
            <div style="width: 45%; border-top: 1px solid #000;">Firma Vendedor</div>
          </div>
          <p style="text-align: center; font-size: 10px; margin-top: 20px;">PARA TRAMITES</p>
        </div>`
      )
    }

    const deliveredItems = (sale.items || []).filter((item) => item.accesorio_id || item.repuesto_id)
    const deliveryRows = deliveredItems.map((item) => `
      <tr>
        <td>${escapeHtml(item.tipo || '')}</td>
        <td>${escapeHtml(item.producto || '')}</td>
        <td>${escapeHtml(item.marca || '')}</td>
        <td>${escapeHtml([item.descripcion, item.talla ? `Talla ${item.talla}` : ''].filter(Boolean).join(' / '))}</td>
        <td>${Number(item.precio_unitario_final ?? 0).toFixed(2)}</td>
        <td>${Number(item.cantidad ?? 0)}</td>
        <td>${Number(item.subtotal ?? 0).toFixed(2)}</td>
      </tr>
    `)
    const deliveryTotal = deliveredItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
    if (deliveryRows.length) {
      const blankRows = Array.from({ length: Math.max(0, 2 - deliveryRows.length) }, () => (
        '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'
      )).join('')
      openPrintableHtml(
        `entrega-${saleCode}`,
        `<div class="sheet">
          <div style="text-align: right;">N° ${escapeHtml(saleCode)}</div>
          <h2 style="text-align: center;">CONSTANCIA DE ENTREGA</h2>
          <p>Fecha: ${escapeHtml(printDate)}</p>
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Marca</th>
                <th>Descripción/Talla</th>
                <th>P. Unitario</th>
                <th>Cant.</th>
                <th>Monto Bs.</th>
              </tr>
            </thead>
            <tbody>${deliveryRows.join('')}${blankRows}</tbody>
            <tfoot>
              <tr>
                <td colspan="6" style="text-align: right;"><strong>TOTAL</strong></td>
                <td>${deliveryTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          <p><strong>Observaciones:</strong> __________________________________________</p>
          <div style="margin-top: 50px; display: flex; justify-content: space-between; text-align: center;">
            <div style="width: 45%; border-top: 1px solid #000;">Firma Cliente</div>
            <div style="width: 45%; border-top: 1px solid #000;">Firma Vendedor</div>
          </div>
        </div>`
      )
    }

    const motoItems = (sale.items || []).filter((item) => item.moto_id || item.moto_e_id)
    motoItems.forEach((item, index) => {
      openPrintableHtml(
        `moto-${saleCode}-${index + 1}`,
        `<div class="sheet" style="font-size: 12px;">
          <h2 style="text-align: center;">ENTREGA DE MOTOCICLETA</h2>
          <p style="text-align: right;">Cochabamba, ${escapeHtml(longPrintDate)}</p>
          <p>Venta a: ${escapeHtml(sale.cliente_nombre || '_________________________')} [ ] Crédito [ ] Contado</p>
          <fieldset style="margin-bottom: 15px;">
              <legend><strong>CARACTERÍSTICAS DE LA MOTO</strong></legend>
              <p>Marca: ${escapeHtml(item.marca || '____________________')} Modelo: ${escapeHtml(item.modelo || '____________________')}</p>
              <p>N° Motor: ${escapeHtml(item.motor || '__________________')} N° Chasis: ${escapeHtml(item.chasis || '_________________')}</p>
              <p>Color: ${escapeHtml(item.color || '____________________')}</p>
          </fieldset>
          <div style="border: 1px solid #000; padding: 10px; margin-bottom: 15px;">
              <p><strong>OBSERVACIONES:</strong> EL TIEMPO DE GARANTÍA ES DE 1 AÑO O 12000 KM.</p>
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
        </div>`
      )
    })

    if (!tramitesRows.length && !deliveryRows.length && !motoItems.length) {
      toast('La venta no tiene trámites, repuestos ni accesorios para imprimir')
    }
  }

  const printCentralMotoSaleNote = async (saleId) => {
    if (!saleId) return
    if (!isCentralSaleContext) {
      toast.error('Esta impresión solo está disponible para ventas desde almacén central')
      return
    }

    const res = await api.obtenerVenta({ token, id: saleId })
    if (!res?.ok) {
      toast.error(res?.error || 'No se pudo preparar la impresión')
      return
    }

    const sale = res.data
    setLastSale({ id: sale.id, codigo: sale.codigo })
    const motoItems = (sale.items || []).filter((item) => item.moto_id || item.moto_e_id)
    if (!motoItems.length) {
      toast('La venta no tiene motos para esta impresión')
      return
    }

    const longPrintDate = formatLongPrintDate(sale.fecha_venta)
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

    openPrintableHtml(
      `nota-motos-${sale.codigo || sale.id}`,
      `<div class="sheet" style="width: 700px; font-size: 12px;">
        <h2 style="text-align: center;">ENTREGA DE MOTOCICLETAS</h2>
        <p style="text-align: right;">Cochabamba, ${escapeHtml(longPrintDate)}</p>
        <p>Venta a: ${escapeHtml(sale.cliente_nombre || '_________________________')} [ ] Crédito [ ] Contado</p>
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
            <p><strong>OBSERVACIONES:</strong> EL TIEMPO DE GARANTÍA ES DE 1 AÑO O 12000 KM.</p>
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
      </div>`
    )
  }

  const tramitesTotal = () => {
    let total = 0
    for (const flags of Object.values(tramites)) {
      if (flags.bsisa) total += costos.bsisa
      if (flags.placa) total += costos.placa
    }
    return total
  }

  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>VENTAS</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Venta directa y desde proformas</h1>
        {usuario?.punto_venta_nombre && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
            Stock de trabajo: {usuario.punto_venta_tipo === 'CENTRAL' ? 'Almacen central' : usuario.punto_venta_nombre}
          </div>
        )}
      </div>

      {!canOperate && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}>
          Este vendedor no tiene punto de venta asignado. Un administrador debe asignarlo antes de registrar ventas.
        </div>
      )}

      {lastSale?.id && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
            Última venta generada {lastSale.codigo ? `· ${lastSale.codigo}` : ''}
          </div>
          <div className="button-row" style={{ marginTop: 8 }}>
            <button onClick={() => printSaleDocuments(lastSale.id)} style={S.btn}>Imprimir venta</button>
            {isCentralSaleContext && (
              <button onClick={() => printCentralMotoSaleNote(lastSale.id)} style={S.btn}>Imprimir nota motos</button>
            )}
          </div>
        </div>
      )}

      <div className="grid-main-two">
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Venta directa</div>
          <div className="grid-three">
            <div>
              <div style={S.label}>Cliente</div>
              <input style={S.input} value={cliente.nombre} onChange={e => setCliente(c => ({ ...c, nombre: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>CI / NIT</div>
              <input style={S.input} value={cliente.ci_nit} onChange={e => setCliente(c => ({ ...c, ci_nit: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Celular</div>
              <input style={S.input} value={cliente.celular} onChange={e => setCliente(c => ({ ...c, celular: e.target.value }))} />
            </div>
          </div>

          <div className="grid-four" style={{ marginTop: 12 }}>
            <div>
              <div style={S.label}>Tipo producto</div>
              <select
                style={S.input}
                value={itemForm.producto}
                onChange={e => setItemForm({ ...INITIAL_ITEM_FORM, producto: e.target.value })}
              >
                <option value="moto">Moto</option>
                <option value="moto_e">Moto-E</option>
                <option value="accesorio">Accesorio</option>
                <option value="repuesto">Repuesto</option>
              </select>
            </div>
            <div>
              <div style={S.label}>Marca</div>
              <select
                style={S.input}
                value={itemForm.marca}
                onChange={e => setItemForm(f => ({ ...f, marca: e.target.value, producto_id: '' }))}
              >
                <option value="">Elegir marca</option>
                {marcasDisponibles.map((marca) => (
                  <option key={marca} value={marca}>{marca}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={S.label}>Producto</div>
              <select
                style={S.input}
                disabled={!itemForm.marca}
                value={itemForm.producto_id}
                onChange={e => setItemForm(f => ({ ...f, producto_id: e.target.value }))}
              >
                <option value="">{itemForm.marca ? 'Selecciona producto' : 'Primero elige marca'}</option>
                {productosFiltrados.map((producto) => (
                  <option key={producto.id} value={producto.id}>{formatProductoOption(producto)}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={S.label}>Cantidad</div>
              <input style={S.input} type="number" value={itemForm.cantidad} onChange={e => setItemForm(f => ({ ...f, cantidad: e.target.value }))} />
            </div>
            <div>
              <div style={S.label}>Desc %</div>
              <input
                style={S.input}
                type="number"
                min="0"
                max={getProducto(itemForm.producto, Number(itemForm.producto_id))?.descuento_maximo_pct ?? undefined}
                value={itemForm.descuento_pct}
                onChange={e => setItemForm(f => ({ ...f, descuento_pct: e.target.value }))}
              />
            </div>
          </div>

          <div className="button-row" style={{ marginTop: 10 }}>
            <button onClick={addItem} style={S.btn}>Agregar item</button>
            <button onClick={crearVentaDirecta} style={S.btn}>Registrar venta</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>Items de la venta</div>
            {items.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>Sin items</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map((item, idx) => (
                  <div key={idx} style={{ border: '1px solid var(--divider)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-strong)' }}>{item.descripcion}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                      Cantidad {item.cantidad} · Desc {item.descuento_pct}% · Subtotal {formatBs(getUnitSalePrice(item) * Number(item.cantidad || 1))}
                    </div>
                    {item.moto_id ? (
                      <div className="button-row" style={{ gap: 12, marginTop: 8, fontSize: 12 }}>
                        <label>
                          <input type="checkbox" checked={!!item._tramites?.bsisa} onChange={() => toggleDirectSaleTramite(idx, 'bsisa')} /> BSISA (+{formatBs(costos.bsisa)})
                        </label>
                        <label>
                          <input type="checkbox" checked={!!item._tramites?.placa} onChange={() => toggleDirectSaleTramite(idx, 'placa')} /> PLACA (+{formatBs(costos.placa)})
                        </label>
                      </div>
                    ) : null}
                    <div className="button-row" style={{ marginTop: 8 }}>
                      <button onClick={() => removeItem(idx)} style={S.btn}>Quitar</button>
                      <button onClick={() => updateItem(idx, { descripcion: item.descripcion })} style={{ ...S.btn, opacity: 0.6 }} disabled>Item listo</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-faint)' }}>
            Subtotal venta: {formatBs(totalDirecto())} · Trámites: {formatBs(totalTramitesDirecto())} · Total final: {formatBs(totalDirecto() + totalTramitesDirecto())}
          </div>
        </div>

        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Proformas activas</div>
          {proformas.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No hay proformas activas</div>
          ) : proformas.map(p => (
            <div key={p.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
              <div style={{ fontSize: 12 }}>{p.codigo} · {p.cliente_nombre}</div>
              <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>Total {p.total} · {p.fecha_creacion}</div>
              <div className="button-row" style={{ marginTop: 6 }}>
                <button onClick={() => openDetail(p.id)} style={S.btn}>Ver items</button>
                <button onClick={() => consolidar(p.id)} style={S.btn}>Consolidar venta</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {detail && (
        <div style={{ ...S.card, marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Trámites para {detail.codigo}</div>
          <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 10 }}>BSISA: {formatBs(costos.bsisa)} · PLACA: {formatBs(costos.placa)}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.items.map(it => (
              <div key={it.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)' }}>
                <div style={{ fontSize: 12 }}>{it.descripcion} · Cant {it.cantidad}</div>
                {it.moto_id ? (
                  <div className="button-row" style={{ gap: 12, marginTop: 6, fontSize: 12 }}>
                    <label>
                      <input type="checkbox" checked={!!tramites[it.id]?.bsisa} onChange={() => toggleTramite(it.id, 'bsisa')} /> BSISA
                    </label>
                    <label>
                      <input type="checkbox" checked={!!tramites[it.id]?.placa} onChange={() => toggleTramite(it.id, 'placa')} /> PLACA
                    </label>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>No aplica (no es moto)</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)' }}>
            Total proforma: {formatBs(detail.total)} · Trámites: {formatBs(tramitesTotal())} · Total final: {formatBs(Number(detail.total) + tramitesTotal())}
          </div>
          <div className="button-row" style={{ marginTop: 10 }}>
            <button onClick={() => setDetail(null)} style={S.btn}>Cerrar</button>
            <button onClick={() => consolidar(detail.id)} style={S.btn}>Consolidar con trámites</button>
          </div>
        </div>
      )}
    </div>
  )
}
