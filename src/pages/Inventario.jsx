import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'

export default function Inventario() {
  const { token, esSupervisor, usuario } = useAuthStore()
  const [tab, setTab] = useState('motos')
  const [items, setItems] = useState([])
  const [pointItems, setPointItems] = useState([])
  const [marcas, setMarcas] = useState([])
  const [puntos, setPuntos] = useState([])
  const [selectedPointId, setSelectedPointId] = useState('')
  const [transferForm, setTransferForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [pointSortField, setPointSortField] = useState('name')
  const [pointSortDirection, setPointSortDirection] = useState('asc')
  const [csvText, setCsvText] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [form, setForm] = useState({})
  const [marcaForm, setMarcaForm] = useState({ nombre: '' })
  const [config, setConfig] = useState({ bsisa: '', placa: '' })
  const [assignmentCode, setAssignmentCode] = useState('')
  const [assignmentInfo, setAssignmentInfo] = useState(null)
  const [assignmentLoading, setAssignmentLoading] = useState(false)

  const isSup = esSupervisor()
  const selectedPoint = puntos.find((point) => String(point.id) === String(selectedPointId))
  const inventoryParams = isSup
    ? { scope: 'all' }
    : usuario?.punto_venta_id
      ? { scope: 'point', puntoVentaId: usuario.punto_venta_id }
      : null
  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
  const getModelLabel = (item) => item?.tipo || item?.ano || '-'
  const getCylinderLabel = (item) => item?.cilindrada || '-'
  const getSizeLabel = (item) => item?.talla || '-'
  const getItemName = (item) => `${item?.marca || ''} ${getModelLabel(item)} ${getCylinderLabel(item)}`.trim()
  const normalizeGroupValue = (value) => String(value ?? '').trim().toLocaleLowerCase('es')
  const isAccessoryRow = (item) => Object.prototype.hasOwnProperty.call(item ?? {}, 'precio') && Object.prototype.hasOwnProperty.call(item ?? {}, 'color')
  const buildGroupKey = (item, includeWarehouse = false) => ([
    normalizeGroupValue(item?.marca),
    normalizeGroupValue(item?.tipo),
    normalizeGroupValue(item?.ano),
    normalizeGroupValue(isAccessoryRow(item) ? '' : item?.color),
    normalizeGroupValue(item?.talla),
    normalizeGroupValue(item?.cilindrada),
    normalizeGroupValue(item?.motor),
    normalizeGroupValue(item?.costo ?? item?.precio),
    includeWarehouse ? normalizeGroupValue(item?.punto_venta_id ?? item?.punto_venta_nombre) : '',
  ].join('||'))
  const groupInventoryRows = (rows, includeWarehouse = false) => {
    const grouped = new Map()
    for (const row of rows) {
      const key = buildGroupKey(row, includeWarehouse)
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
  }
  const sortInventoryRows = (rows, field, direction) => {
    const list = [...rows]
    list.sort((a, b) => {
      if (field === 'qty') {
        return direction === 'asc'
          ? Number(a?.cantidad_libre || 0) - Number(b?.cantidad_libre || 0)
          : Number(b?.cantidad_libre || 0) - Number(a?.cantidad_libre || 0)
      }
      const left = getItemName(a).toLocaleLowerCase('es')
      const right = getItemName(b).toLocaleLowerCase('es')
      if (left === right) return 0
      if (direction === 'desc') return left < right ? 1 : -1
      return left > right ? 1 : -1
    })
    return list
  }
  const getWarehouseLabel = (item) =>
    item?.punto_venta_tipo === 'CENTRAL'
      ? 'Almacen central'
      : (item?.punto_venta_nombre || 'Sin asignar')
  const tabs = [
    { id: 'motos', label: 'Motos' },
    { id: 'motos_e', label: 'Motos-E' },
    { id: 'accesorios', label: 'Accesorios' },
    { id: 'repuestos', label: 'Repuestos' },
    ...(isSup ? [{ id: 'marcas', label: 'Marcas' }] : []),
  ]
  const activeDestinationPoints = puntos.filter((point) => point.tipo !== 'CENTRAL' && point.activo)
  const defaultTransferPointId = activeDestinationPoints[0] ? String(activeDestinationPoints[0].id) : ''

  const fetchByTab = async (currentTab, params = {}) => {
    if (currentTab === 'motos') return api.listarMotos({ token, ...params })
    if (currentTab === 'motos_e') return api.listarMotosE({ token, ...params })
    if (currentTab === 'accesorios') return api.listarAccesorios({ token, ...params })
    if (currentTab === 'repuestos') return api.listarRepuestos({ token, ...params })
    if (currentTab === 'marcas') return api.listarMarcas({ token })
    return { ok: false, error: 'Tab no soportada' }
  }

  const load = async () => {
    setLoading(true)
    try {
      const searchValue = search.trim()
      const res = await fetchByTab(tab, {
        ...(inventoryParams || {}),
        ...(tab === 'marcas' || !searchValue ? {} : { buscar: searchValue }),
      })
      if (res?.ok) {
        setItems(res.data)
        if (tab === 'marcas') setMarcas(res.data)
      }
      if (isSup && selectedPointId && tab !== 'marcas') {
        const pointRes = await fetchByTab(tab, {
          ...(searchValue ? { buscar: searchValue } : {}),
          scope: selectedPoint?.tipo === 'CENTRAL' ? 'central' : 'point',
          puntoVentaId: selectedPoint?.tipo === 'CENTRAL' ? undefined : selectedPointId,
        })
        setPointItems(pointRes.ok ? pointRes.data : [])
      } else {
        setPointItems([])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab, token, selectedPointId, usuario?.punto_venta_id, search])
  useEffect(() => {
    if (!isSup) return
    api.configGet({ token }).then(r => {
      if (!r.ok) return
      setConfig({
        bsisa: r.data?.tramite_bsisa_costo ?? '0',
        placa: r.data?.tramite_placa_costo ?? '0',
      })
    })
  }, [token])
  useEffect(() => {
    if (!token) return
    api.listarMarcas({ token }).then(r => {
      if (r.ok) setMarcas(r.data)
    })
  }, [token])
  useEffect(() => {
    if (!isSup || !token) return
    api.listarPuntosVenta({ token }).then(r => {
      if (!r.ok) return
      setPuntos(r.data)
      const firstPoint = r.data.find(point => point.tipo === 'CENTRAL') || r.data.find(point => point.activo)
      if (!selectedPointId && firstPoint) setSelectedPointId(String(firstPoint.id))
    })
  }, [token])

  const handleCreate = async () => {
    try {
      let res
      if (tab === 'motos') res = await api.crearMoto({ token, data: form })
      if (tab === 'motos_e') res = await api.crearMotoE({ token, data: form })
      if (tab === 'accesorios') res = await api.crearAccesorio({ token, data: form })
      if (tab === 'repuestos') res = await api.crearRepuesto({ token, data: form })
      if (!res?.ok) return toast.error(res?.error || 'Error al crear')
      toast.success('Producto creado')
      setForm({})
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleCrearMarca = async () => {
    const nombre = marcaForm.nombre?.trim()
    if (!nombre) return toast.error('Ingresa un nombre')
    const res = await api.crearMarca({ token, data: { nombre } })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Marca creada')
    setMarcaForm({ nombre: '' })
    const r = await api.listarMarcas({ token })
    if (r.ok) {
      setMarcas(r.data)
      if (tab === 'marcas') setItems(r.data)
    }
  }

  const handleImport = async () => {
    try {
      let res
      if (tab === 'motos') res = await api.importarMotosCsv({ token, csvText })
      if (tab === 'motos_e') res = await api.importarMotosECsv({ token, csvText })
      if (tab === 'accesorios') res = await api.importarAccesoriosCsv({ token, csvText })
      if (tab === 'repuestos') res = await api.importarRepuestosCsv({ token, csvText })
      if (!res?.ok) return toast.error(res?.error || 'Error al importar')
      toast.success(`Importado. Insertados: ${res.data.inserted}, Actualizados: ${res.data.updated}`)
      setCsvText('')
      setCsvFileName('')
      load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const handleExport = async () => {
    let res
    if (tab === 'motos') res = await api.exportarMotosArchivo({ token })
    if (tab === 'motos_e') res = await api.exportarMotosEArchivo({ token })
    if (tab === 'accesorios') res = await api.exportarAccesoriosArchivo({ token })
    if (tab === 'repuestos') res = await api.exportarRepuestosArchivo({ token })
    if (!res?.ok) return
    toast.success('PDF generado')
  }

  const handleExportAll = async () => {
    const res = await api.exportarProductosArchivo({ token })
    if (!res?.ok) return
    toast.success('PDF generado')
  }

  const guardarConfig = async () => {
    const res = await api.configSet({
      token,
      data: {
        tramite_bsisa_costo: config.bsisa,
        tramite_placa_costo: config.placa,
      }
    })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Costos actualizados')
  }

  const fetchAssignment = async () => {
    const code = assignmentCode.trim()
    if (!code) return toast.error('Ingresa un código')
    setAssignmentLoading(true)
    try {
      const res = await api.obtenerAsignacionProductos({ token, codigo: code })
      if (!res?.ok) {
        setAssignmentInfo(null)
        return toast.error(res?.error || 'Código inválido')
      }
      setAssignmentInfo(res.data)
      toast.success('Código válido')
    } catch (e) {
      setAssignmentInfo(null)
      toast.error(e.message)
    } finally {
      setAssignmentLoading(false)
    }
  }

  const applyAssignment = async () => {
    const code = assignmentCode.trim()
    if (!code) return toast.error('Ingresa un código')
    setAssignmentLoading(true)
    try {
      const res = await api.aplicarAsignacionProductos({ token, codigo: code })
      if (!res?.ok) return toast.error(res?.error || 'No se pudo aplicar')
      toast.success('Asignación aplicada')
      setAssignmentInfo(null)
      setAssignmentCode('')
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setAssignmentLoading(false)
    }
  }

  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }

  const fieldsByTab = {
    motos: [
      ['marca_id','Marca','marca'],['ano','Año'],['tipo','Modelo'],['color','Color'],['chasis','Chasis'],
      ['cilindrada','Cilindrada'],['motor','Motor'],['costo','Costo'],['precio_venta','Precio de venta'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
    motos_e: [
      ['marca_id','Marca','marca'],['ano','Año'],['tipo','Modelo'],['color','Color'],['chasis','Chasis'],
      ['potencia','Potencia'],['motor','Motor'],['costo','Costo'],['precio_venta','Precio de venta'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
    accesorios: [
      ['marca_id','Marca','marca'],['tipo','Tipo'],['color','Color'],['talla','Talla'],['precio','Costo'],['precio_final','Precio Final'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
    repuestos: [
      ['marca_id','Marca','marca'],['tipo','Tipo'],['precio','Precio'],['precio_final','Precio Final'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
  }

  const sampleCsvByTab = {
    motos: [
      'marca,ano,tipo,color,chasis,cilindrada,motor,costo,precio_venta,descuento_maximo_pct,cantidad_libre',
      'Honda,2025,Deportiva,Rojo,CHS-0001,500,4T,5000,6200,10,3'
    ].join('\n'),
    motos_e: [
      'marca,ano,tipo,color,chasis,potencia,motor,costo,precio_venta,descuento_maximo_pct,cantidad_libre',
      'Super Soco,2026,Urbana,Negro,EV-0001,3900W,Electrico,4200,5100,8,2'
    ].join('\n'),
    accesorios: [
      'marca,tipo,color,talla,precio,precio_final,descuento_maximo_pct,cantidad_libre',
      'Givi,Parabrisas,Transparente,M,120,150,10,5'
    ].join('\n'),
    repuestos: [
      'marca,tipo,precio,precio_final,descuento_maximo_pct,cantidad_libre',
      'NGK,Bujía,15,20,10,20'
    ].join('\n'),
  }

  const downloadSample = () => {
    const content = sampleCsvByTab[tab]
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    return url
  }

  const handleCsvFile = async (file) => {
    if (!file) return
    const text = await file.text()
    setCsvText(text)
    setCsvFileName(file.name)
  }

  const displayedItems = tab === 'marcas' && search.trim()
    ? items.filter((item) => item.nombre?.toLowerCase().includes(search.trim().toLowerCase()))
    : items
  const groupedDisplayedItems = tab === 'marcas' ? displayedItems : groupInventoryRows(displayedItems, true)
  const groupedPointItems = groupInventoryRows(pointItems, false)
  const sortedDisplayedItems = tab === 'marcas' ? displayedItems : sortInventoryRows(groupedDisplayedItems, sortField, sortDirection)
  const sortedPointItems = sortInventoryRows(groupedPointItems, pointSortField, pointSortDirection)
  const listTotals = tab === 'marcas'
    ? { unidades: 0, dinero: 0 }
    : sortedDisplayedItems.reduce((acc, row) => {
        const qty = Number(row?.cantidad_libre || 0)
        const price = Number(row?.precio_venta ?? row?.precio_final ?? 0)
        acc.unidades += qty
        acc.dinero += qty * price
        return acc
      }, { unidades: 0, dinero: 0 })

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>INVENTARIO</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Productos</h1>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          {isSup
            ? 'Registro y control del inventario general por ubicacion'
            : usuario?.punto_venta_nombre
              ? `Stock asignado a ${usuario.punto_venta_nombre}`
              : 'Este vendedor no tiene punto de venta asignado'}
        </div>
      </div>

      {!isSup && !inventoryParams && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}>
          Un administrador debe asignar un punto de venta al vendedor para consultar su inventario.
        </div>
      )}

      <div className="button-row" style={{ marginBottom: 16 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...S.btn,
            background: tab === t.id ? 'var(--accent)' : 'transparent',
            color: tab === t.id ? 'var(--accent-contrast)' : 'var(--text-dim)',
            borderColor: tab === t.id ? 'var(--accent)' : 'var(--border)'
          }}>{t.label}</button>
        ))}
      </div>

      <div className="grid-main-two">
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Listado</div>

          {token && (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                Código de asignación de productos
              </div>
              <div className="button-row" style={{ gap: 8, alignItems: 'end' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <input
                    style={S.input}
                    placeholder="Ej: CON-2026-0001"
                    value={assignmentCode}
                    onChange={(e) => setAssignmentCode(e.target.value)}
                    disabled={assignmentLoading}
                  />
                </div>
                <button type="button" onClick={fetchAssignment} style={S.btn} disabled={assignmentLoading}>
                  Validar
                </button>
                {isSup && (
                  <button
                    type="button"
                    onClick={applyAssignment}
                    style={{ ...S.btn, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    disabled={assignmentLoading || !assignmentInfo || assignmentInfo?.estado !== 'PENDIENTE'}
                    title={!assignmentInfo ? 'Valida el código primero' : assignmentInfo?.estado !== 'PENDIENTE' ? 'Esta asignación ya fue aplicada o anulada' : 'Aplicar asignación'}
                  >
                    Aplicar
                  </button>
                )}
              </div>
              {assignmentInfo && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-soft)' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Código:</span> <span style={{ fontFamily: 'monospace', color: 'var(--text-strong)' }}>{assignmentInfo.codigo}</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Estado:</span> {assignmentInfo.estado}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Origen:</span> {assignmentInfo.origen_nombre}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Destino:</span> {assignmentInfo.destino_nombre}</div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Items:</span> {assignmentInfo.total_items} · <span style={{ color: 'var(--text-muted)' }}>Unidades:</span> {assignmentInfo.total_unidades ?? '-'} · <span style={{ color: 'var(--text-muted)' }}>Total venta:</span> {formatBs(assignmentInfo.total_venta)}</div>
                  </div>

                  {(assignmentInfo.items || []).length > 0 && (
                    <div style={{ marginTop: 10 }} className="table-wrap">
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                            <th style={{ padding: '6px 4px' }}>Tipo</th>
                            <th style={{ padding: '6px 4px' }}>Marca</th>
                            <th style={{ padding: '6px 4px' }}>Modelo/Tipo</th>
                            <th style={{ padding: '6px 4px' }}>Año</th>
                            <th style={{ padding: '6px 4px' }}>Color</th>
                            <th style={{ padding: '6px 4px' }}>Cant.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignmentInfo.items.map((it) => (
                            <tr key={it.id} style={{ borderTop: '1px solid var(--divider)' }}>
                              <td style={{ padding: '6px 4px' }}>{it.producto_tipo}</td>
                              <td style={{ padding: '6px 4px' }}>{it.marca || '-'}</td>
                              <td style={{ padding: '6px 4px' }}>{it.tipo || '-'}</td>
                              <td style={{ padding: '6px 4px' }}>{it.ano || '-'}</td>
                              <td style={{ padding: '6px 4px' }}>{it.color || '-'}</td>
                              <td style={{ padding: '6px 4px' }}>{it.cantidad}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <input
              style={S.input}
              placeholder={tab === 'marcas' ? 'Buscar marca' : 'Buscar producto'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {tab !== 'marcas' && (
            <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}>
              <div>
                <div style={S.label}>Ordenar por</div>
                <select style={S.input} value={sortField} onChange={e => setSortField(e.target.value)}>
                  <option value="name">Nombre</option>
                  <option value="qty">Cantidad</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setSortDirection(value => value === 'asc' ? 'desc' : 'asc')}
                style={{ ...S.btn, minWidth: 48, padding: '8px 12px', fontSize: 16, lineHeight: 1 }}
                aria-label={sortDirection === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
                title={sortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}
          {loading ? <div style={{ color: 'var(--text-muted)' }}>Cargando...</div> : (
            <div className="table-wrap list-scroll">
              {tab === 'marcas' ? (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 4px' }}>Marca</th>
                      <th style={{ padding: '6px 4px' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map(m => (
                      <tr key={m.id} style={{ borderTop: '1px solid var(--divider)' }}>
                        <td style={{ padding: '6px 4px' }}>{m.nombre}</td>
                        <td style={{ padding: '6px 4px', color: m.activo ? 'var(--text-soft)' : 'var(--text-muted)' }}>
                          {m.activo ? 'Activa' : 'Inactiva'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 4px' }}>Marca</th>
                      <th style={{ padding: '6px 4px' }}>Modelo</th>
                      <th style={{ padding: '6px 4px' }}>Año</th>
                      <th style={{ padding: '6px 4px' }}>Color</th>
                      <th style={{ padding: '6px 4px' }}>Talla</th>
                      <th style={{ padding: '6px 4px' }}>Cilindrada</th>
                      <th style={{ padding: '6px 4px' }}>Almacen</th>
                      <th style={{ padding: '6px 4px' }}>Stock</th>
                      <th style={{ padding: '6px 4px' }}>Costo</th>
                      <th style={{ padding: '6px 4px' }}>{tab === 'motos' || tab === 'motos_e' ? 'Precio venta' : 'Precio'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDisplayedItems.map(it => (
                      <tr key={it.id} style={{ borderTop: '1px solid var(--divider)' }}>
                        <td style={{ padding: '6px 4px' }}>{it.marca || '-'}</td>
                        <td style={{ padding: '6px 4px' }}>{getModelLabel(it)}</td>
                        <td style={{ padding: '6px 4px' }}>{it.ano || '-'}</td>
                        <td style={{ padding: '6px 4px' }}>{it.color || '-'}</td>
                        <td style={{ padding: '6px 4px' }}>{getSizeLabel(it)}</td>
                        <td style={{ padding: '6px 4px' }}>{getCylinderLabel(it)}</td>
                        <td style={{ padding: '6px 4px' }}>{getWarehouseLabel(it)}</td>
                        <td style={{ padding: '6px 4px' }}>{it.cantidad_libre}</td>
                        <td style={{ padding: '6px 4px' }}>{formatBs(it.costo ?? it.precio)}</td>
                        <td style={{ padding: '6px 4px' }}>{formatBs(it.precio_venta ?? it.precio_final)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab !== 'marcas' && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-soft)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Total unidades:</span> {listTotals.unidades}</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Total (precio venta):</span> {formatBs(listTotals.dinero)}</div>
            </div>
          )}

          {isSup && tab !== 'marcas' && (
            <div className="button-row" style={{ marginTop: 12 }}>
              <button onClick={handleExport} style={S.btn}>Exportar archivo</button>
              <button onClick={handleExportAll} style={S.btn}>Exportar Todo</button>
            </div>
          )}
        </div>

        {isSup && (
          <div className="stack-md">
            <div style={S.card}>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>
                {tab === 'marcas' ? 'Nueva marca' : `Nuevo ${tab}`}
              </div>
              {tab === 'marcas' ? (
                <div className="button-row">
                  <input
                    style={S.input}
                    placeholder="Nombre de marca"
                    value={marcaForm.nombre}
                    onChange={e => setMarcaForm({ nombre: e.target.value })}
                  />
                  <button onClick={handleCrearMarca} style={S.btn}>Agregar</button>
                </div>
              ) : (
                <>
                  <div className="grid-two-tight">
                    {fieldsByTab[tab].map(([key, label, type]) => (
                      <div key={key}>
                        <div style={S.label}>{label}</div>
                        {type === 'marca' ? (
                          <select
                            style={S.input}
                            value={form[key] ?? ''}
                            onChange={e => setForm(f => ({
                              ...f,
                              [key]: e.target.value === '0' ? 0 : e.target.value,
                            }))}
                          >
                            <option value="">Elegir marca</option>
                            {tab !== 'motos' && tab !== 'motos_e' && <option value="0">— Sin marca —</option>}
                            {marcas.filter(m => m.activo).map(m => (
                              <option key={m.id} value={m.id}>{m.nombre}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            style={S.input}
                            value={form[key] ?? ''}
                            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={handleCreate} style={{ ...S.btn, marginTop: 10 }}>Guardar</button>
                </>
              )}
            </div>

            {tab !== 'marcas' && (
              <div style={S.card}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Stock por ubicacion</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={S.label}>Ubicacion</div>
                  <select style={S.input} value={selectedPointId} onChange={e => setSelectedPointId(e.target.value)}>
                    <option value="">Selecciona una ubicacion</option>
                    {puntos.map(point => (
                      <option key={point.id} value={point.id}>
                        {point.tipo === 'CENTRAL' ? 'Almacen Central' : point.nombre} {point.activo ? '' : '(Inactivo)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: 10, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'end' }}>
                  <div>
                    <div style={S.label}>Ordenar por</div>
                    <select style={S.input} value={pointSortField} onChange={e => setPointSortField(e.target.value)}>
                      <option value="name">Nombre</option>
                      <option value="qty">Cantidad</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPointSortDirection(value => value === 'asc' ? 'desc' : 'asc')}
                    style={{ ...S.btn, minWidth: 48, padding: '8px 12px', fontSize: 16, lineHeight: 1 }}
                    aria-label={pointSortDirection === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
                    title={pointSortDirection === 'asc' ? 'Ascendente' : 'Descendente'}
                  >
                    {pointSortDirection === 'asc' ? '↑' : '↓'}
                  </button>
                </div>
                {!selectedPointId ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Selecciona una ubicacion para revisar el stock.</div>
                ) : pointItems.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin stock asignado en esta categoría.</div>
                ) : (
                  <div className="list-scroll" style={{ maxHeight: 240 }}>
                    {sortedPointItems.map((item) => (
                      <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)', fontSize: 12 }}>
                        <div style={{ color: 'var(--text-strong)' }}>
                          {`${item.marca || '-'} · ${getModelLabel(item)} · ${item.color || '-'} · ${getSizeLabel(item)}`}
                        </div>
                        <div style={{ color: 'var(--text-soft)' }}>
                          Libre: {item.cantidad_libre} · Reservado: {item.cantidad_reservada} · Vendido: {item.cantidad_vendida} · Precio: {formatBs(item.precio_venta ?? item.precio_final)}
                        </div>
                        {(item.sourceIds?.length || 1) > 1 && (
                          <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                            Grupo consolidado de {item.sourceIds.length} registros.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab !== 'marcas' && (
              <div style={S.card}>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Importar CSV</div>
                <div className="button-row" style={{ alignItems: 'center', marginBottom: 8 }}>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={e => handleCsvFile(e.target.files?.[0])}
                    style={{ color: 'var(--text-dim)', fontSize: 12 }}
                  />
                  <a
                    href={downloadSample()}
                    download={`ejemplo-${tab}.csv`}
                    style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    Descargar CSV de ejemplo
                  </a>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {csvFileName ? `Archivo cargado: ${csvFileName}` : 'Ningún archivo cargado'}
                </div>
                <textarea
                  style={{ ...S.input, height: 140, fontFamily: 'monospace', fontSize: 11 }}
                  placeholder="Contenido del CSV"
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                />
                <div className="button-row" style={{ marginTop: 10 }}>
                  <button onClick={handleImport} style={S.btn}>Importar</button>
                </div>
              </div>
            )}

            <div style={S.card}>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Costos de trámites</div>
              <div className="grid-three" style={{ alignItems: 'end' }}>
                <div>
                  <div style={S.label}>BSISA</div>
                  <input
                    style={S.input}
                    value={config.bsisa}
                    onChange={e => setConfig(c => ({ ...c, bsisa: e.target.value }))}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{formatBs(config.bsisa)}</div>
                </div>
                <div>
                  <div style={S.label}>PLACA</div>
                  <input
                    style={S.input}
                    value={config.placa}
                    onChange={e => setConfig(c => ({ ...c, placa: e.target.value }))}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{formatBs(config.placa)}</div>
                </div>
                <button onClick={guardarConfig} style={S.btn}>Guardar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
