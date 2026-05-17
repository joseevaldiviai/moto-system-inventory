import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'
import useAuthStore from '../store/authStore'
import ProductGridTable from '../components/ProductGridTable'
import ColumnPickerModal from '../components/ColumnPickerModal'
import { getProductGridColumns } from '../lib/productGridColumns'

const LOCATION_GRID_PREFS_KEY = 'inventory:location-grid:detail-columns'

const loadGridPrefs = () => {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(LOCATION_GRID_PREFS_KEY) || '{}')
  } catch {
    return {}
  }
}

const saveGridPrefs = (value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCATION_GRID_PREFS_KEY, JSON.stringify(value))
}

export default function UbicacionInventario() {
  const { pointId } = useParams()
  const { token } = useAuthStore()
  const [tab, setTab] = useState('motos')
  const [items, setItems] = useState([])
  const [puntos, setPuntos] = useState([])
  const [point, setPoint] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [detailedView, setDetailedView] = useState(false)
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const [detailColumnsByTab, setDetailColumnsByTab] = useState(() => loadGridPrefs())

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
  const getProductLabel = (item) => item?.producto || '-'
  const getSizeLabel = (item) => item?.talla || '-'
  const normalizeGroupValue = (value) => String(value ?? '').trim().toLocaleLowerCase('es')
  const isAccessoryRow = (item) => Object.prototype.hasOwnProperty.call(item ?? {}, 'precio') && Object.prototype.hasOwnProperty.call(item ?? {}, 'color')
  const showSizeForTab = tab === 'accesorios'
  const getItemName = (item) => `${item?.marca || ''} ${item?.producto || ''} ${getModelLabel(item)} ${isAccessoryRow(item) ? getSizeLabel(item) : ''}`.trim()
  const buildGroupKey = (item) => ([
    normalizeGroupValue(item?.marca),
    normalizeGroupValue(item?.producto),
    normalizeGroupValue(item?.tipo),
    normalizeGroupValue(item?.ano),
    normalizeGroupValue(isAccessoryRow(item) ? '' : item?.color),
    normalizeGroupValue(isAccessoryRow(item) ? item?.talla : ''),
    normalizeGroupValue(item?.cilindrada),
    normalizeGroupValue(item?.motor),
    normalizeGroupValue(item?.costo ?? item?.precio),
  ].join('||'))
  const groupedItems = (() => {
    const grouped = new Map()
    for (const row of items) {
      const key = buildGroupKey(row)
      const existing = grouped.get(key)
      if (existing) {
        if (existing.color !== row?.color) existing.color = 'Varios'
        existing.cantidad_libre += Number(row?.cantidad_libre || 0)
        existing.cantidad_reservada += Number(row?.cantidad_reservada || 0)
        existing.cantidad_vendida += Number(row?.cantidad_vendida || 0)
        existing.sourceIds.push(row.id)
        continue
      }
      grouped.set(key, {
        ...row,
        groupKey: key,
        sourceIds: [row.id],
        cantidad_libre: Number(row?.cantidad_libre || 0),
        cantidad_reservada: Number(row?.cantidad_reservada || 0),
        cantidad_vendida: Number(row?.cantidad_vendida || 0),
      })
    }
    return [...grouped.values()]
  })()
  const sortedItems = [...groupedItems].sort((a, b) => {
    if (sortField === 'qty') {
      return sortDirection === 'asc'
        ? Number(a?.cantidad_libre || 0) - Number(b?.cantidad_libre || 0)
        : Number(b?.cantidad_libre || 0) - Number(a?.cantidad_libre || 0)
    }
    const left = getItemName(a).toLocaleLowerCase('es')
    const right = getItemName(b).toLocaleLowerCase('es')
    if (left === right) return 0
    if (sortDirection === 'desc') return left < right ? 1 : -1
    return left > right ? 1 : -1
  })
  const listTotals = sortedItems.reduce((acc, row) => {
    const qty = Number(row?.cantidad_libre || 0)
    const price = Number(row?.precio_venta ?? row?.precio_final ?? 0)
    acc.unidades += qty
    acc.dinero += qty * price
    return acc
  }, { unidades: 0, dinero: 0 })
  const gridColumns = getProductGridColumns(tab, { formatBs, includeWarehouse: false })
  const defaultDetailColumnIds = gridColumns.map((column) => column.id)
  const activeDetailColumnIds = (
    detailColumnsByTab[tab]?.filter((id) => defaultDetailColumnIds.includes(id))?.length
      ? defaultDetailColumnIds.filter((id) => detailColumnsByTab[tab].includes(id))
      : defaultDetailColumnIds
  )

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

  return (
    <div className="page-shell" style={S.page}>
      <ColumnPickerModal
        open={columnPickerOpen}
        title={`Columnas de ${tabs.find((item) => item.id === tab)?.label || 'productos'}`}
        columns={gridColumns}
        selectedIds={activeDetailColumnIds}
        onToggle={(columnId) => {
          const currentIds = activeDetailColumnIds
          const nextSelected = currentIds.includes(columnId)
            ? currentIds.filter((id) => id !== columnId)
            : [...currentIds, columnId]
          if (!nextSelected.length) return
          const ordered = defaultDetailColumnIds.filter((id) => nextSelected.includes(id))
          setDetailColumnsByTab((prev) => {
            const next = { ...prev, [tab]: ordered }
            saveGridPrefs(next)
            return next
          })
        }}
        onSelectAll={() => {
          setDetailColumnsByTab((prev) => {
            const next = { ...prev, [tab]: defaultDetailColumnIds }
            saveGridPrefs(next)
            return next
          })
        }}
        onClose={() => setColumnPickerOpen(false)}
      />
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
        <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 8, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>Ordenar por</div>
            <select style={S.input} value={sortField} onChange={(e) => setSortField(e.target.value)}>
              <option value="name">Nombre</option>
              <option value="qty">Cantidad</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')}
            style={{ ...S.btn, minWidth: 48, padding: '8px 12px', fontSize: 16, lineHeight: 1 }}
            aria-label={sortDirection === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
            title={sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
          >
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
          <button type="button" onClick={() => setDetailedView((value) => !value)} style={S.btn}>
            {detailedView ? 'Vista simple' : 'Vista detallada'}
          </button>
          <button type="button" onClick={() => setColumnPickerOpen(true)} style={S.btn} disabled={!detailedView}>
            Personalizar columnas
          </button>
        </div>
        {loading ? <div style={{ color: 'var(--text-muted)' }}>Cargando...</div> : (
          detailedView ? (
            <ProductGridTable
              columns={gridColumns}
              visibleColumnIds={activeDetailColumnIds}
              rows={sortedItems}
              emptyText="Sin resultados."
            />
          ) : (
            <div className="table-wrap list-scroll">
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 4px' }}>Marca</th>
                    {(tab === 'accesorios' || tab === 'repuestos') && <th style={{ padding: '6px 4px' }}>Producto</th>}
                    <th style={{ padding: '6px 4px' }}>{tab === 'accesorios' ? 'Codigo' : tab === 'repuestos' ? 'Descripcion' : 'Modelo'}</th>
                    {tab !== 'repuestos' && <th style={{ padding: '6px 4px' }}>Color</th>}
                    {showSizeForTab && <th style={{ padding: '6px 4px' }}>Talla</th>}
                    <th style={{ padding: '6px 4px' }}>Stock</th>
                    <th style={{ padding: '6px 4px' }}>{tab === 'motos' || tab === 'motos_e' ? 'Precio venta' : 'Precio'}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((it) => (
                    <tr key={it.id} style={{ borderTop: '1px solid var(--divider)' }}>
                      <td style={{ padding: '6px 4px' }}>{it.marca || '-'}</td>
                      {(tab === 'accesorios' || tab === 'repuestos') && <td style={{ padding: '6px 4px' }}>{getProductLabel(it)}</td>}
                      <td style={{ padding: '6px 4px' }}>{getModelLabel(it)}</td>
                      {tab !== 'repuestos' && <td style={{ padding: '6px 4px' }}>{it.color || '-'}</td>}
                      {showSizeForTab && <td style={{ padding: '6px 4px' }}>{getSizeLabel(it)}</td>}
                      <td style={{ padding: '6px 4px' }}>{it.cantidad_libre}</td>
                      <td style={{ padding: '6px 4px' }}>{formatBs(it.precio_venta ?? it.precio_final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-soft)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Total unidades:</span> {listTotals.unidades}</div>
          <div><span style={{ color: 'var(--text-muted)' }}>Total (precio venta):</span> {formatBs(listTotals.dinero)}</div>
        </div>
      </div>
    </div>
  )
}
