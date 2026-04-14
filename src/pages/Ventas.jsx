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
  const inventoryParams = esSupervisor()
    ? { scope: 'central' }
    : usuario?.punto_venta_id
      ? { scope: 'point', puntoVentaId: usuario.punto_venta_id }
      : null
  const canOperate = esSupervisor() || !!usuario?.punto_venta_id

  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`

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
    return `${selected.marca ? `${selected.marca} ` : ''}${selected.tipo}`.trim()
  }

  const formatProductoOption = (producto) => {
    if (itemForm.producto === 'moto' || itemForm.producto === 'moto_e') return `${producto.marca} ${producto.ano ?? producto.modelo} · ${producto.chasis}`
    return `${producto.tipo}${producto.marca ? ` · ${producto.marca}` : ''}${producto.color ? ` · ${producto.color}` : ''}`
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

    toast.success('Venta registrada')
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
    toast.success('Venta consolidada')
    setDetail(null)
    setTramites({})
    load()
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
