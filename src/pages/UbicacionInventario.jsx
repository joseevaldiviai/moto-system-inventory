import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'
import useAuthStore from '../store/authStore'

export default function UbicacionInventario() {
  const { pointId } = useParams()
  const { token } = useAuthStore()
  const [tab, setTab] = useState('motos')
  const [items, setItems] = useState([])
  const [puntos, setPuntos] = useState([])
  const [point, setPoint] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name-asc')
  const [transferForm, setTransferForm] = useState({})

  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }
  const tabs = [
    { id: 'motos', label: 'Motos' },
    { id: 'motos_e', label: 'Motos-E' },
    { id: 'accesorios', label: 'Accesorios' },
    { id: 'repuestos', label: 'Repuestos' },
  ]
  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
  const getModelLabel = (item) => item?.tipo || item?.ano || '-'
  const getCylinderLabel = (item) => item?.cilindrada || '-'
  const getItemName = (item) => `${item?.marca || ''} ${getModelLabel(item)} ${getCylinderLabel(item)}`.trim()
  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === 'qty-asc') return Number(a?.cantidad_libre || 0) - Number(b?.cantidad_libre || 0)
    if (sortBy === 'qty-desc') return Number(b?.cantidad_libre || 0) - Number(a?.cantidad_libre || 0)
    const left = getItemName(a).toLocaleLowerCase('es')
    const right = getItemName(b).toLocaleLowerCase('es')
    if (left === right) return 0
    if (sortBy === 'name-desc') return left < right ? 1 : -1
    return left > right ? 1 : -1
  })

  const fetchByTab = async (currentTab, params = {}) => {
    if (currentTab === 'motos') return api.listarMotos({ token, ...params })
    if (currentTab === 'motos_e') return api.listarMotosE({ token, ...params })
    if (currentTab === 'accesorios') return api.listarAccesorios({ token, ...params })
    if (currentTab === 'repuestos') return api.listarRepuestos({ token, ...params })
    return { ok: false, error: 'Tab no soportada' }
  }

  useEffect(() => {
    if (!token) return
    api.listarPuntosVenta({ token }).then((res) => {
      if (!res.ok) return
      setPuntos(res.data)
      setPoint(res.data.find((item) => String(item.id) === String(pointId)) || null)
    })
  }, [token, pointId])

  useEffect(() => {
    if (!token || !pointId || !point) return
    setLoading(true)
    const params = {
      ...(search.trim() ? { buscar: search.trim() } : {}),
      scope: point.tipo === 'CENTRAL' ? 'central' : 'point',
      puntoVentaId: point.tipo === 'CENTRAL' ? undefined : pointId,
    }
    fetchByTab(tab, params)
      .then((res) => {
        if (!res.ok) {
          toast.error(res.error || 'No se pudo cargar el inventario')
          return
        }
        setItems(res.data)
      })
      .finally(() => setLoading(false))
  }, [token, pointId, point, tab, search])

  const handleTransfer = async (itemId) => {
    const current = transferForm[itemId] || { cantidad: '1' }
    if (!current.destination_point_id) return toast.error('Selecciona el destino')
    if (!current.cantidad || Number(current.cantidad) <= 0) return toast.error('Ingresa una cantidad valida')

    const res = await api.transferirInventario({
      token,
      data: {
        kind: tab,
        product_id: itemId,
        source_point_id: Number(pointId),
        destination_point_id: Number(current.destination_point_id),
        cantidad: Number(current.cantidad),
      },
    })
    if (!res.ok) return toast.error(res.error || 'Error al mover stock')

    toast.success('Producto movido')
    setTransferForm((state) => ({
      ...state,
      [itemId]: { destination_point_id: state[itemId]?.destination_point_id || '', cantidad: '1' },
    }))

    const params = {
      ...(search.trim() ? { buscar: search.trim() } : {}),
      scope: point.tipo === 'CENTRAL' ? 'central' : 'point',
      puntoVentaId: point.tipo === 'CENTRAL' ? undefined : pointId,
    }
    const reload = await fetchByTab(tab, params)
    if (reload.ok) setItems(reload.data)
  }

  const destinationOptions = puntos.filter((item) => item.activo && String(item.id) !== String(pointId))

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>UBICACION</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>
          {point?.tipo === 'CENTRAL' ? 'Almacen principal' : (point?.nombre || 'Ubicacion')}
        </h1>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          {point?.tipo === 'CENTRAL' ? 'Stock del almacen principal' : `Stock asignado a ${point?.nombre || ''}`}
        </div>
      </div>

      <div className="button-row" style={{ marginBottom: 16 }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              ...S.btn,
              background: tab === item.id ? 'var(--accent)' : 'transparent',
              color: tab === item.id ? 'var(--accent-contrast)' : 'var(--text-dim)',
              borderColor: tab === item.id ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={S.card}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Productos</div>
        <div style={{ marginBottom: 12 }}>
          <input
            style={S.input}
            placeholder="Buscar producto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <select style={S.input} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name-asc">Nombre ascendente</option>
            <option value="name-desc">Nombre descendente</option>
            <option value="qty-asc">Cantidad ascendente</option>
            <option value="qty-desc">Cantidad descendente</option>
          </select>
        </div>
        {loading ? <div style={{ color: 'var(--text-muted)' }}>Cargando...</div> : (
          <div className="table-wrap list-scroll">
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px' }}>Marca</th>
                  <th style={{ padding: '6px 4px' }}>Modelo</th>
                  <th style={{ padding: '6px 4px' }}>Cilindrada</th>
                  <th style={{ padding: '6px 4px' }}>Stock</th>
                  <th style={{ padding: '6px 4px' }}>{tab === 'motos' || tab === 'motos_e' ? 'Precio venta' : 'Precio'}</th>
                  <th style={{ padding: '6px 4px' }}>Mover a</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((it) => (
                  <tr key={it.id} style={{ borderTop: '1px solid var(--divider)' }}>
                    <td style={{ padding: '6px 4px' }}>{it.marca || '-'}</td>
                    <td style={{ padding: '6px 4px' }}>{getModelLabel(it)}</td>
                    <td style={{ padding: '6px 4px' }}>{getCylinderLabel(it)}</td>
                    <td style={{ padding: '6px 4px' }}>{it.cantidad_libre}</td>
                    <td style={{ padding: '6px 4px' }}>{formatBs(it.precio_venta ?? it.precio_final)}</td>
                    <td style={{ padding: '6px 4px', minWidth: 260 }}>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <select
                          style={S.input}
                          value={transferForm[it.id]?.destination_point_id ?? ''}
                          onChange={(e) => setTransferForm((state) => ({
                            ...state,
                            [it.id]: { ...(state[it.id] || {}), destination_point_id: e.target.value },
                          }))}
                        >
                          <option value="">Selecciona destino</option>
                          {destinationOptions.map((destination) => (
                            <option key={destination.id} value={destination.id}>
                              {destination.tipo === 'CENTRAL' ? 'Almacen principal' : destination.nombre}
                            </option>
                          ))}
                        </select>
                        <div className="button-row" style={{ gap: 6 }}>
                          <input
                            style={S.input}
                            type="number"
                            min="1"
                            max={it.cantidad_libre}
                            placeholder="Cantidad"
                            value={transferForm[it.id]?.cantidad ?? '1'}
                            onChange={(e) => setTransferForm((state) => ({
                              ...state,
                              [it.id]: { ...(state[it.id] || {}), cantidad: e.target.value },
                            }))}
                          />
                          <button onClick={() => handleTransfer(it.id)} style={S.btn}>Mover</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
