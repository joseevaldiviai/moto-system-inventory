import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'
import { openCombinedSalePrintWindow } from '../lib/salePrintDocuments'

const INITIAL_ITEM_FORM = {
  producto: 'moto',
  marca: '',
  producto_id: '',
  cantidad: 1,
  descuento_pct: 0,
}

const buildTramiteState = (enabled = false, costoTotal = 0) => ({
  enabled,
  costo_total: Number(costoTotal || 0),
})

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
  const [ventas, setVentas] = useState([])
  const [ventasLoading, setVentasLoading] = useState(false)
  const [puntosVenta, setPuntosVenta] = useState([])
  const [filterPointId, setFilterPointId] = useState('')
  const [printingSaleId, setPrintingSaleId] = useState(null)
  const isSup = esSupervisor()
  const inventoryParams = isSup
    ? { scope: 'central' }
    : usuario?.punto_venta_id
      ? { scope: 'point', puntoVentaId: usuario.punto_venta_id }
      : null
  const canOperate = isSup || !!usuario?.punto_venta_id
  const isCentralSaleContext = isSup || usuario?.punto_venta_tipo === 'CENTRAL'

  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
  const getDefaultTramiteCost = (tipo) => Number(tipo === 'bsisa' ? costos.bsisa : costos.placa) || 0
  const createEmptyTramites = () => ({
    bsisa: buildTramiteState(false, getDefaultTramiteCost('bsisa')),
    placa: buildTramiteState(false, getDefaultTramiteCost('placa')),
  })
  const supportsTramites = (item) => !!(item?.moto_id || item?.moto_e_id)
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

  const loadVentas = async () => {
    if (!token) return
    setVentasLoading(true)
    try {
      const params = isSup && filterPointId ? { puntoVentaId: filterPointId } : {}
      const res = await api.listarVentas({ token, ...params })
      if (!res?.ok) {
        setVentas([])
        return toast.error(res?.error || 'No se pudo cargar el listado de ventas')
      }
      setVentas(res.data || [])
    } finally {
      setVentasLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadVentas() }, [token, filterPointId, isSup])

  useEffect(() => {
    if (!isSup || !token) return
    api.listarPuntosVenta({ token }).then((res) => {
      if (res?.ok) setPuntosVenta(res.data || [])
    })
  }, [token, isSup])

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

  const marcasDisponibles = [...new Set(catalogoActual.map((producto) => producto.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b))
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
      _tramites: createEmptyTramites(),
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
        ? {
            ...item,
            _tramites: {
              ...item._tramites,
              [tipo]: buildTramiteState(
                !item._tramites?.[tipo]?.enabled,
                Math.max(Number(item._tramites?.[tipo]?.costo_total ?? 0), getDefaultTramiteCost(tipo))
              ),
            },
          }
        : item
    )))
  }

  const updateDirectSaleTramiteCost = (idx, tipo, value) => {
    setItems((prev) => prev.map((item, index) => (
      index === idx
        ? {
            ...item,
            _tramites: {
              ...item._tramites,
              [tipo]: buildTramiteState(
                !!item._tramites?.[tipo]?.enabled,
                value
              ),
            },
          }
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
    + (item._tramites?.bsisa?.enabled ? Number(item._tramites.bsisa.costo_total || 0) : 0)
    + (item._tramites?.placa?.enabled ? Number(item._tramites.placa.costo_total || 0) : 0)
  ), 0)

  const validateTramites = (tramiteState) => {
    for (const tipo of ['bsisa', 'placa']) {
      if (!tramiteState?.[tipo]?.enabled) continue
      const costo = Number(tramiteState?.[tipo]?.costo_total || 0)
      const minimo = getDefaultTramiteCost(tipo)
      if (costo < minimo) {
        throw new Error(`El costo de ${tipo.toUpperCase()} no puede ser menor a ${formatBs(minimo)}`)
      }
    }
  }

  const crearVentaDirecta = async () => {
    if (!canOperate) return toast.error('Asigna un punto de venta al vendedor antes de vender')
    if (!cliente.nombre || !cliente.ci_nit || !cliente.celular) return toast.error('Completa datos del cliente')
    if (!items.length) return toast.error('Agrega al menos un item')
    try {
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
        if (supportsTramites(item)) {
          validateTramites(item._tramites)
          const tramites = []
          if (item._tramites?.bsisa?.enabled) tramites.push({ tipo: 'BSISA', costo_total: Number(item._tramites.bsisa.costo_total || 0) })
          if (item._tramites?.placa?.enabled) tramites.push({ tipo: 'PLACA', costo_total: Number(item._tramites.placa.costo_total || 0) })
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
      loadVentas()
    } catch (error) {
      toast.error(error.message || 'Error al validar los trámites')
    }
  }

  const openDetail = async (id) => {
    const res = await api.obtenerProforma({ token, id })
    if (!res.ok) return toast.error(res.error || 'Error')
    setDetail(res.data)
  }

  const toggleTramite = (piId, tipo) => {
    setTramites(prev => {
      const current = prev[piId] || createEmptyTramites()
      return {
        ...prev,
        [piId]: {
          ...current,
          [tipo]: buildTramiteState(
            !current[tipo]?.enabled,
            Math.max(Number(current[tipo]?.costo_total ?? 0), getDefaultTramiteCost(tipo))
          ),
        },
      }
    })
  }

  const updateTramiteCost = (piId, tipo, value) => {
    setTramites((prev) => {
      const current = prev[piId] || createEmptyTramites()
      return {
        ...prev,
        [piId]: {
          ...current,
          [tipo]: buildTramiteState(!!current[tipo]?.enabled, value),
        },
      }
    })
  }

  const consolidar = async (id) => {
    if (!canOperate) return toast.error('Asigna un punto de venta al vendedor antes de vender')
    try {
      const tramitesPayload = []
      for (const [piId, flags] of Object.entries(tramites)) {
        validateTramites(flags)
        if (flags.bsisa?.enabled) tramitesPayload.push({ proforma_item_id: Number(piId), tipo: 'BSISA', costo_total: Number(flags.bsisa.costo_total || 0) })
        if (flags.placa?.enabled) tramitesPayload.push({ proforma_item_id: Number(piId), tipo: 'PLACA', costo_total: Number(flags.placa.costo_total || 0) })
      }

      const res = await api.crearVenta({ token, data: { proforma_id: id, tramites: tramitesPayload } })
      if (!res.ok) return toast.error(res.error || 'Error')
      setLastSale({ id: res.data.id })
      toast.success('Venta consolidada')
      await printSaleDocuments(res.data.id)
      setDetail(null)
      setTramites({})
      load()
      loadVentas()
    } catch (error) {
      toast.error(error.message || 'Error al validar los trámites')
    }
  }

  const formatSaleDate = (value) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString('es-BO')
  }

  const printSaleDocuments = async (saleId) => {
    if (!saleId) return
    setPrintingSaleId(saleId)
    try {
      const res = await api.obtenerVenta({ token, id: saleId })
      if (!res?.ok) {
        toast.error(res?.error || 'No se pudo preparar la impresión')
        return
      }

      const sale = res.data
      setLastSale({ id: sale.id, codigo: sale.codigo })
      const isCentralSale = sale.punto_venta_tipo === 'CENTRAL'
      const printResult = openCombinedSalePrintWindow(sale, { usuario, isCentralSale })
      if (!printResult.ok) {
        toast.error(printResult.error || 'No se pudo imprimir')
        return
      }
      toast.success(`Documentos listos (${printResult.documents}) · usa Imprimir / Guardar como PDF`)
    } finally {
      setPrintingSaleId(null)
    }
  }

  const tramitesTotal = () => {
    let total = 0
    for (const flags of Object.values(tramites)) {
      if (flags.bsisa?.enabled) total += Number(flags.bsisa.costo_total || 0)
      if (flags.placa?.enabled) total += Number(flags.placa.costo_total || 0)
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
            <button onClick={() => printSaleDocuments(lastSale.id)} style={S.btn} disabled={printingSaleId === lastSale.id}>
              {printingSaleId === lastSale.id ? 'Preparando...' : 'Imprimir venta'}
            </button>
          </div>
        </div>
      )}

      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>Historial de ventas</div>
            <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
              {isSup
                ? 'Ventas por punto de venta o almacén central'
                : usuario?.punto_venta_nombre
                  ? `Ventas de ${usuario.punto_venta_tipo === 'CENTRAL' ? 'almacén central' : usuario.punto_venta_nombre}`
                  : 'Sin punto de venta asignado'}
            </div>
          </div>
          <div className="button-row" style={{ gap: 8 }}>
            {isSup && (
              <select
                style={{ ...S.input, width: 220 }}
                value={filterPointId}
                onChange={(e) => setFilterPointId(e.target.value)}
              >
                <option value="">Todas las ubicaciones</option>
                {puntosVenta.filter((point) => point.activo).map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.tipo === 'CENTRAL' ? 'Almacén Central' : point.nombre}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={loadVentas} style={S.btn} disabled={ventasLoading}>
              {ventasLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        <div className="table-wrap list-scroll" style={{ maxHeight: 420 }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                <th style={{ padding: '6px 4px' }}>Fecha</th>
                <th style={{ padding: '6px 4px' }}>Código</th>
                {isSup && <th style={{ padding: '6px 4px' }}>Ubicación</th>}
                <th style={{ padding: '6px 4px' }}>Vendedor</th>
                <th style={{ padding: '6px 4px' }}>Cliente</th>
                <th style={{ padding: '6px 4px' }}>Total</th>
                <th style={{ padding: '6px 4px' }}>Estado</th>
                <th style={{ padding: '6px 4px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((venta) => (
                <tr key={venta.id} style={{ borderTop: '1px solid var(--divider)' }}>
                  <td style={{ padding: '6px 4px', color: 'var(--text-muted)' }}>{formatSaleDate(venta.fecha_venta)}</td>
                  <td style={{ padding: '6px 4px', fontFamily: 'monospace', color: 'var(--text-strong)' }}>{venta.codigo}</td>
                  {isSup && <td style={{ padding: '6px 4px' }}>{venta.punto_venta_nombre || '-'}</td>}
                  <td style={{ padding: '6px 4px' }}>{venta.vendedor_nombre || '-'}</td>
                  <td style={{ padding: '6px 4px' }}>{venta.cliente_nombre}</td>
                  <td style={{ padding: '6px 4px' }}>{formatBs(venta.total)}</td>
                  <td style={{ padding: '6px 4px' }}>{venta.estado}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <button
                      type="button"
                      onClick={() => printSaleDocuments(venta.id)}
                      style={S.btn}
                      disabled={printingSaleId === venta.id}
                    >
                      {printingSaleId === venta.id ? 'Imprimiendo...' : 'Imprimir PDF'}
                    </button>
                  </td>
                </tr>
              ))}
              {!ventasLoading && ventas.length === 0 && (
                <tr>
                  <td colSpan={isSup ? 8 : 7} style={{ padding: '12px 4px', color: 'var(--text-muted)' }}>
                    No hay ventas registradas para esta ubicación.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                    {supportsTramites(item) ? (
                      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                        {['bsisa', 'placa'].map((tipo) => (
                          <div key={tipo} className="button-row" style={{ gap: 10, alignItems: 'center', fontSize: 12 }}>
                            <label>
                              <input type="checkbox" checked={!!item._tramites?.[tipo]?.enabled} onChange={() => toggleDirectSaleTramite(idx, tipo)} /> {tipo.toUpperCase()} (mínimo {formatBs(getDefaultTramiteCost(tipo))})
                            </label>
                            {item._tramites?.[tipo]?.enabled && (
                              <input
                                style={{ ...S.input, maxWidth: 160 }}
                                inputMode="decimal"
                                value={item._tramites?.[tipo]?.costo_total ?? getDefaultTramiteCost(tipo)}
                                onChange={(e) => updateDirectSaleTramiteCost(idx, tipo, e.target.value)}
                              />
                            )}
                          </div>
                        ))}
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
                {(it.moto_id || it.moto_e_id) ? (
                  <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                    {['bsisa', 'placa'].map((tipo) => (
                      <div key={tipo} className="button-row" style={{ gap: 10, alignItems: 'center', fontSize: 12 }}>
                        <label>
                          <input type="checkbox" checked={!!tramites[it.id]?.[tipo]?.enabled} onChange={() => toggleTramite(it.id, tipo)} /> {tipo.toUpperCase()} (mínimo {formatBs(getDefaultTramiteCost(tipo))})
                        </label>
                        {tramites[it.id]?.[tipo]?.enabled && (
                          <input
                            style={{ ...S.input, maxWidth: 160 }}
                            inputMode="decimal"
                            value={tramites[it.id]?.[tipo]?.costo_total ?? getDefaultTramiteCost(tipo)}
                            onChange={(e) => updateTramiteCost(it.id, tipo, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>No aplica (no es moto o moto-e)</div>
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
