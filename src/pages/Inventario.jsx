import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'
import ProductGridTable from '../components/ProductGridTable'
import ColumnPickerModal from '../components/ColumnPickerModal'
import { getProductGridColumns } from '../lib/productGridColumns'

const INVENTORY_GRID_PREFS_KEY = 'inventory:grid:detail-columns:v2'
const INVENTORY_POINT_GRID_PREFS_KEY = 'inventory:point-grid:detail-columns:v2'
const BRAND_GROUP_OPTIONS = [
  { value: 'motos', label: 'Motos' },
  { value: 'motos_e', label: 'Motos-E' },
  { value: 'accesorios', label: 'Accesorios' },
  { value: 'repuestos', label: 'Repuestos' },
]

// Mapea el id de cada columna del grid al campo del producto usado como criterio de agrupacion/filtro.
const GROUP_FIELD_BY_COLUMN = (currentTab) => {
  if (currentTab === 'motos' || currentTab === 'motos_e') {
    return {
      marca: 'marca',
      tipo: 'tipo',
      ano: 'ano',
      color: 'color',
      chasis: 'chasis',
      cilindrada: 'cilindrada',
      motor: 'motor',
      costo: 'costo',
      fecha_recepcion: 'fecha_recepcion',
      ...(currentTab === 'motos_e' ? { potencia: 'potencia', tipo_bateria: 'tipo_bateria', bateria: 'bateria' } : {}),
      punto_venta: 'punto_venta',
    }
  }
  return {
    marca: 'marca',
    producto: 'producto',
    tipo: 'tipo',
    color: 'color',
    talla: 'talla',
    precio: 'precio',
    fecha_recepcion: 'fecha_recepcion',
    punto_venta: 'punto_venta',
  }
}

// Agrupacion fija de la vista simple (sin selector de columnas), equivalente a la original.
const SIMPLE_GROUP_COLUMNS = {
  motos: ['marca', 'tipo', 'costo', 'cilindrada', 'punto_venta'],
  motos_e: ['marca', 'tipo', 'costo', 'cilindrada', 'potencia', 'tipo_bateria', 'bateria', 'punto_venta'],
  accesorios: ['marca', 'producto', 'tipo', 'talla', 'precio', 'punto_venta'],
  repuestos: ['marca', 'producto', 'tipo', 'precio', 'punto_venta'],
}

// Columnas que NO vienen marcadas por defecto en la vista detallada (identificadores unicos por unidad).
// Asi el default consolida por modelo/año/color y marcar Año, Color, Chasis o Motor tiene efecto visible.
const FILTER_DEFAULT_EXCLUDED = {
  motos: ['chasis', 'motor'],
  motos_e: ['chasis', 'motor'],
  accesorios: [],
  repuestos: [],
}

const loadGridPrefs = (key) => {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(key) || '{}')
  } catch {
    return {}
  }
}

const saveGridPrefs = (key, value) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export default function Inventario() {
  const { token, esSupervisor, usuario } = useAuthStore()
  const [tab, setTab] = useState('motos')
  const [items, setItems] = useState([])
  const [pointItems, setPointItems] = useState([])
  const [marcas, setMarcas] = useState([])
  const [puntos, setPuntos] = useState([])
  const [selectedPointId, setSelectedPointId] = useState('')
  const [locationId, setLocationId] = useState('me')
  const [transferForm, setTransferForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [pointSortField, setPointSortField] = useState('name')
  const [pointSortDirection, setPointSortDirection] = useState('asc')
  const [detailedView, setDetailedView] = useState(false)
  const [pointDetailedView, setPointDetailedView] = useState(false)
  const [mainColumnPickerOpen, setMainColumnPickerOpen] = useState(false)
  const [pointColumnPickerOpen, setPointColumnPickerOpen] = useState(false)
  const [detailColumnsByTab, setDetailColumnsByTab] = useState(() => loadGridPrefs(INVENTORY_GRID_PREFS_KEY))
  const [pointDetailColumnsByTab, setPointDetailColumnsByTab] = useState(() => loadGridPrefs(INVENTORY_POINT_GRID_PREFS_KEY))
  const [csvText, setCsvText] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [form, setForm] = useState({})
  const [marcaForm, setMarcaForm] = useState({ nombre: '', grupo_tipo: 'motos' })
  const [config, setConfig] = useState({ bsisa: '', placa: '' })
  const [assignmentCode, setAssignmentCode] = useState('')
  const [assignmentInfo, setAssignmentInfo] = useState(null)
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [availability, setAvailability] = useState(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)

  const isSup = esSupervisor()
  const selectedPoint = puntos.find((point) => String(point.id) === String(selectedPointId))
  const inventoryParams = isSup
    ? { scope: 'all' }
    : usuario?.punto_venta_id
      ? (locationId === 'central'
          ? { scope: 'central' }
          : { scope: 'point', puntoVentaId: locationId && locationId !== 'me' ? locationId : String(usuario.punto_venta_id) })
      : null
  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
  const getPrimaryLabel = (item) => item?.tipo || item?.ano || '-'
  const getProductLabel = (item) => item?.producto || '-'
  const getCylinderLabel = (item) => item?.cilindrada || '-'
  const getPowerLabel = (item) => item?.potencia || '-'
  const getSizeLabel = (item) => item?.talla || '-'
  const getItemName = (item) => `${item?.marca || ''} ${item?.producto || ''} ${getPrimaryLabel(item)} ${getCylinderLabel(item)}`.trim()
  const normalizeGroupValue = (value) => String(value ?? '').trim().toLocaleLowerCase('es')
  const showSizeForTab = tab === 'accesorios'
  const buildGroupKey = (item, groupColumns) => groupColumns
    .map((columnId) => {
      if (columnId === 'punto_venta') {
        return normalizeGroupValue(item?.punto_venta_id ?? item?.punto_venta_nombre)
      }
      return normalizeGroupValue(item?.[GROUP_FIELD_BY_COLUMN(tab)[columnId]])
    })
    .join('||')
  const groupInventoryRows = (rows, groupColumns) => {
    const grouped = new Map()
    for (const row of rows) {
      const key = buildGroupKey(row, groupColumns)
      const existing = grouped.get(key)
      if (existing) {
        for (const columnId of Object.keys(GROUP_FIELD_BY_COLUMN(tab))) {
          if (groupColumns.includes(columnId)) continue
          const field = GROUP_FIELD_BY_COLUMN(tab)[columnId]
          if (field === 'punto_venta' || existing[field] === 'Varios') continue
          if (normalizeGroupValue(existing[field]) !== normalizeGroupValue(row?.[field])) {
            existing[field] = 'Varios'
          }
        }
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
  const sortInventoryRows = (rows, field, direction, sortColumns = []) => {
    const list = [...rows]
    list.sort((a, b) => {
      if (field === 'qty') {
        return direction === 'asc'
          ? Number(a?.cantidad_libre || 0) - Number(b?.cantidad_libre || 0)
          : Number(b?.cantidad_libre || 0) - Number(a?.cantidad_libre || 0)
      }
      if (sortColumns.length) {
        const leftKey = buildGroupKey(a, sortColumns)
        const rightKey = buildGroupKey(b, sortColumns)
        if (leftKey !== rightKey) {
          return direction === 'desc' ? (leftKey < rightKey ? 1 : -1) : (leftKey > rightKey ? 1 : -1)
        }
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
  const locationLabel = !isSup
    ? (locationId === 'central'
        ? 'Almacen Central'
        : locationId === 'me'
          ? (usuario?.punto_venta_tipo === 'CENTRAL' ? 'Almacen Central' : (usuario?.punto_venta_nombre || null))
          : (puntos.find((point) => String(point.id) === locationId)?.nombre || null))
    : null
  const tabs = [
    { id: 'motos', label: 'Motos' },
    { id: 'motos_e', label: 'Motos-E' },
    { id: 'accesorios', label: 'Accesorios' },
    { id: 'repuestos', label: 'Repuestos' },
    ...(isSup ? [{ id: 'marcas', label: 'Marcas' }] : []),
  ]
  const activeDestinationPoints = puntos.filter((point) => point.tipo !== 'CENTRAL' && point.activo)
  const defaultTransferPointId = activeDestinationPoints[0] ? String(activeDestinationPoints[0].id) : ''
  const selectedBrandGroup = tab === 'marcas' ? marcaForm.grupo_tipo : tab
  const brandOptions = marcas.filter((marca) => marca.activo && marca.grupo_tipo === selectedBrandGroup)

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
      if (res?.ok) setItems(res.data)
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

  useEffect(() => { load() }, [tab, token, selectedPointId, usuario?.punto_venta_id, search, locationId])
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
    if (!token) return
    api.listarPuntosVenta({ token }).then(r => {
      if (!r.ok) return
      setPuntos(r.data)
      if (isSup) {
        const firstPoint = r.data.find(point => point.tipo === 'CENTRAL') || r.data.find(point => point.activo)
        if (!selectedPointId && firstPoint) setSelectedPointId(String(firstPoint.id))
      }
    })
  }, [token])

  const handleCreate = async () => {
    if (['motos', 'motos_e', 'accesorios'].includes(tab) && !form.color?.trim()) {
      return toast.error('El campo color es obligatorio')
    }
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
    const nombre = marcaForm.nombre?.trim().toLocaleUpperCase('es')
    if (!nombre) return toast.error('Ingresa un nombre')
    const res = await api.crearMarca({ token, data: { nombre, grupo_tipo: marcaForm.grupo_tipo } })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Marca creada')
    setMarcaForm((current) => ({ ...current, nombre: '' }))
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

  const isDestinationVendor = !isSup && !!usuario?.punto_venta_id

  const canApplyToDestination = (assignment) => {
    if (!assignment || !isDestinationVendor) return false
    return Number(usuario.punto_venta_id) === Number(assignment.destino_punto_venta_id)
  }

  const applyAssignmentByCode = async (code) => {
    const res = await api.aplicarAsignacionProductos({ token, codigo: code })
    if (!res?.ok) throw new Error(res?.error || 'No se pudo aplicar la asignación')
    return res
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

      const assignment = res.data
      setAssignmentInfo(assignment)

      if (assignment.estado === 'PENDIENTE' && canApplyToDestination(assignment)) {
        await applyAssignmentByCode(code)
        setAssignmentInfo({ ...assignment, estado: 'APLICADA', aplicado_en: new Date().toISOString() })
        toast.success('Asignación validada y stock transferido al punto de venta')
        setAssignmentCode('')
        load()
        return
      }

      if (assignment.estado === 'PENDIENTE') {
        toast.success(
          isSup
            ? 'Código válido. El vendedor del punto destino debe aplicar la asignación para mover el stock.'
            : 'Código válido. Esta asignación es para otro punto de venta; no puedes aplicarla aquí.',
        )
        return
      }

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
    if (!assignmentInfo) return toast.error('Valida el código primero')
    if (!canApplyToDestination(assignmentInfo)) {
      return toast.error('No tienes permiso para aplicar esta asignación')
    }
    setAssignmentLoading(true)
    try {
      await applyAssignmentByCode(code)
      toast.success('Asignación aplicada al punto de venta')
      setAssignmentInfo(null)
      setAssignmentCode('')
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setAssignmentLoading(false)
    }
  }

  const verDisponibilidad = async (row) => {
    const ids = row?.sourceIds?.length ? row.sourceIds : [row?.id]
    if (!ids.length) return
    setAvailabilityLoading(true)
    try {
      const res = await api.disponibilidadProducto({ token, kind: tab, ids })
      if (!res?.ok) return toast.error(res?.error || 'No se pudo consultar la disponibilidad')
      setAvailability({ rows: res.data || [], label: getItemName(row) || 'Producto' })
    } finally {
      setAvailabilityLoading(false)
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
      ['cilindrada','Cilindrada'],['motor','Motor'],['fecha_recepcion','Fecha de recepción'],['costo','Costo'],['precio_venta','Precio de venta'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
    motos_e: [
      ['marca_id','Marca','marca'],['ano','Año'],['tipo','Modelo'],['color','Color'],['chasis','Chasis'],
      ['potencia','Potencia (expresado en watts)'],['tipo_bateria','Tipo de batería (Litio - Plomo ácido)'],['bateria','Batería (expresados en voltios amp/hora)'],['motor','Motor'],['fecha_recepcion','Fecha de recepción'],['costo','Costo'],['precio_venta','Precio de venta'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
    accesorios: [
      ['marca_id','Marca','marca'],['producto','Producto'],['tipo','Codigo'],['color','Color'],['talla','Talla'],['fecha_recepcion','Fecha de recepción'],['precio','Costo'],['precio_final','Precio Final'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
    repuestos: [
      ['marca_id','Marca','marca'],['producto','Producto'],['tipo','Descripcion'],['fecha_recepcion','Fecha de recepción'],['precio','Precio'],['precio_final','Precio Final'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
  }

  const sampleCsvByTab = {
    motos: [
      'marca,ano,tipo,color,chasis,cilindrada,motor,costo,precio_venta,descuento_maximo_pct,cantidad_libre,fecha_recepcion',
      'Honda,2025,Deportiva,Rojo,CHS-0001,500,4T,5000,6200,10,3,2026-01-10'
    ].join('\n'),
    motos_e: [
      'marca,ano,tipo,color,chasis,potencia,tipo_bateria,bateria,motor,costo,precio_venta,descuento_maximo_pct,cantidad_libre,fecha_recepcion',
      'Super Soco,2026,Urbana,Negro,EV-0001,3900W,Litio,60V 20Ah,Electrico,4200,5100,8,2,2026-02-15'
    ].join('\n'),
    accesorios: [
      'marca,producto,codigo,color,talla,precio,precio_final,descuento_maximo_pct,cantidad_libre,fecha_recepcion',
      'Givi,PARABRISAS,PAR-001,TRANSPARENTE,M,120,150,10,5,2026-01-20'
    ].join('\n'),
    repuestos: [
      'marca,producto,descripcion,precio,precio_final,descuento_maximo_pct,cantidad_libre,fecha_recepcion',
      'NGK,BUJIA,Bujia,15,20,10,20,2026-03-01'
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

  const displayedItems = tab === 'marcas'
    ? items.filter((item) => (
        item.grupo_tipo === marcaForm.grupo_tipo
        && (!search.trim() || item.nombre?.toLowerCase().includes(search.trim().toLowerCase()))
      ))
    : items
  const inventoryColumns = tab === 'marcas' ? [] : getProductGridColumns(tab, {
    formatBs,
    getWarehouseLabel,
    includeWarehouse: true,
    showCost: isSup,
    renderAction: !isSup
      ? (row) => (
          <button type="button" onClick={() => verDisponibilidad(row)} style={S.btn}>
            Disponibilidad
          </button>
        )
      : undefined,
    actionLabel: 'Disponibilidad',
  })
  const pointInventoryColumns = tab === 'marcas' ? [] : getProductGridColumns(tab, { formatBs, includeWarehouse: false })
  const defaultDetailColumnIds = inventoryColumns.map((column) => column.id)
  const defaultPointDetailColumnIds = pointInventoryColumns.map((column) => column.id)
  const defaultFilterColumnIds = defaultDetailColumnIds.filter((id) => !(FILTER_DEFAULT_EXCLUDED[tab] || []).includes(id))
  const defaultPointFilterColumnIds = defaultPointDetailColumnIds.filter((id) => !(FILTER_DEFAULT_EXCLUDED[tab] || []).includes(id))
  const activeDetailColumnIds = (
    detailColumnsByTab[tab]?.filter((id) => defaultDetailColumnIds.includes(id))?.length
      ? defaultDetailColumnIds.filter((id) => detailColumnsByTab[tab].includes(id))
      : defaultFilterColumnIds
  )
  const activePointDetailColumnIds = (
    pointDetailColumnsByTab[tab]?.filter((id) => defaultPointDetailColumnIds.includes(id))?.length
      ? defaultPointDetailColumnIds.filter((id) => pointDetailColumnsByTab[tab].includes(id))
      : defaultPointFilterColumnIds
  )
  // Las columnas marcadas en el selector actuan como filtro/agrupacion: cada valor se separa en su propio item.
  const mainGroupColumns = tab === 'marcas' ? [] : activeDetailColumnIds.filter((columnId) => GROUP_FIELD_BY_COLUMN(tab)[columnId])
  const pointGroupColumns = tab === 'marcas' ? [] : activePointDetailColumnIds.filter((columnId) => GROUP_FIELD_BY_COLUMN(tab)[columnId])
  const simpleGroupColumns = tab === 'marcas' ? [] : (SIMPLE_GROUP_COLUMNS[tab] || [])
  const groupedSimpleItems = tab === 'marcas' ? displayedItems : groupInventoryRows(displayedItems, simpleGroupColumns)
  const groupedDisplayedItems = tab === 'marcas' ? displayedItems : groupInventoryRows(displayedItems, mainGroupColumns)
  const groupedPointItems = groupInventoryRows(pointItems, pointGroupColumns)
  const sortedSimpleItems = tab === 'marcas' ? displayedItems : sortInventoryRows(groupedSimpleItems, sortField, sortDirection)
  const sortedDisplayedItems = tab === 'marcas' ? displayedItems : sortInventoryRows(groupedDisplayedItems, sortField, sortDirection, mainGroupColumns)
  const sortedPointItems = sortInventoryRows(groupedPointItems, pointSortField, pointSortDirection, pointGroupColumns)
  const listTotals = tab === 'marcas'
    ? { unidades: 0, dinero: 0 }
    : sortedSimpleItems.reduce((acc, row) => {
        const qty = Number(row?.cantidad_libre || 0)
        const price = Number(row?.precio_venta ?? row?.precio_final ?? 0)
        acc.unidades += qty
        acc.dinero += qty * price
        return acc
      }, { unidades: 0, dinero: 0 })

  return (
    <div className="page-shell" style={S.page}>
      <ColumnPickerModal
        open={mainColumnPickerOpen && tab !== 'marcas'}
        title={`Columnas de ${tabs.find((item) => item.id === tab)?.label || 'productos'}`}
        hint="Filtros: las columnas marcadas separan los items por su valor; desmarcar agrupa los valores distintos en 'Varios'. Chasis y Motor vienen desmarcados: márcalos para ver cada unidad."
        columns={inventoryColumns}
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
            saveGridPrefs(INVENTORY_GRID_PREFS_KEY, next)
            return next
          })
        }}
        onSelectAll={() => {
          setDetailColumnsByTab((prev) => {
            const next = { ...prev, [tab]: defaultDetailColumnIds }
            saveGridPrefs(INVENTORY_GRID_PREFS_KEY, next)
            return next
          })
        }}
        onClose={() => setMainColumnPickerOpen(false)}
      />
      <ColumnPickerModal
        open={pointColumnPickerOpen && tab !== 'marcas'}
        title={`Columnas por ubicación de ${tabs.find((item) => item.id === tab)?.label || 'productos'}`}
        hint="Filtros: las columnas marcadas separan los items por su valor; desmarcar agrupa los valores distintos en 'Varios'. Chasis y Motor vienen desmarcados: márcalos para ver cada unidad."
        columns={pointInventoryColumns}
        selectedIds={activePointDetailColumnIds}
        onToggle={(columnId) => {
          const currentIds = activePointDetailColumnIds
          const nextSelected = currentIds.includes(columnId)
            ? currentIds.filter((id) => id !== columnId)
            : [...currentIds, columnId]
          if (!nextSelected.length) return
          const ordered = defaultPointDetailColumnIds.filter((id) => nextSelected.includes(id))
          setPointDetailColumnsByTab((prev) => {
            const next = { ...prev, [tab]: ordered }
            saveGridPrefs(INVENTORY_POINT_GRID_PREFS_KEY, next)
            return next
          })
        }}
        onSelectAll={() => {
          setPointDetailColumnsByTab((prev) => {
            const next = { ...prev, [tab]: defaultPointDetailColumnIds }
            saveGridPrefs(INVENTORY_POINT_GRID_PREFS_KEY, next)
            return next
          })
        }}
        onClose={() => setPointColumnPickerOpen(false)}
      />
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>INVENTARIO</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Productos</h1>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          {isSup
            ? 'Registro y control del inventario general por ubicacion'
            : locationLabel
              ? `Viendo stock de: ${locationLabel}`
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

      {!isSup && usuario?.punto_venta_id && (
        <div className="button-row" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            onClick={() => setLocationId('central')}
            style={{
              ...S.btn,
              background: locationId === 'central' || (locationId === 'me' && usuario?.punto_venta_tipo === 'CENTRAL') ? 'var(--accent)' : 'transparent',
              color: locationId === 'central' || (locationId === 'me' && usuario?.punto_venta_tipo === 'CENTRAL') ? 'var(--accent-contrast)' : 'var(--text-dim)',
              borderColor: locationId === 'central' || (locationId === 'me' && usuario?.punto_venta_tipo === 'CENTRAL') ? 'var(--accent)' : 'var(--border)',
            }}
          >
            Almacen Central{usuario?.punto_venta_tipo === 'CENTRAL' ? ' (actual)' : ''}
          </button>
          {puntos
            .filter((point) => point.tipo !== 'CENTRAL' && (point.activo || Number(point.id) === Number(usuario?.punto_venta_id)))
            .map((point) => {
              const esActual = Number(point.id) === Number(usuario?.punto_venta_id)
              const selected = locationId === String(point.id) || (locationId === 'me' && esActual)
              return (
                <button
                  key={point.id}
                  type="button"
                  onClick={() => setLocationId(String(point.id))}
                  style={{
                    ...S.btn,
                    background: selected ? 'var(--accent)' : 'transparent',
                    color: selected ? 'var(--accent-contrast)' : 'var(--text-dim)',
                    borderColor: selected ? 'var(--accent)' : 'var(--border)',
                  }}
                >
                  {point.nombre}{esActual ? ' (actual)' : ''}
                </button>
              )
            })}
        </div>
      )}

      <div className="grid-main-two">
        <div style={S.card}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>Listado</div>

          {token && (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-2)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
                Código de asignación de productos
              </div>
              <div style={{ marginBottom: 8, fontSize: 12, color: 'var(--text-soft)' }}>
                {isDestinationVendor
                  ? 'Validar confirma el código y transfiere el stock a tu punto de venta cuando la asignación está pendiente.'
                  : 'Validar revisa el código. Solo el vendedor del punto destino puede aplicar la asignación y recibir el stock.'}
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
                  {isDestinationVendor ? 'Validar y aplicar' : 'Validar'}
                </button>
                {isDestinationVendor && (
                  <button
                    type="button"
                    onClick={applyAssignment}
                    style={{ ...S.btn, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    disabled={assignmentLoading || !assignmentInfo || assignmentInfo?.estado !== 'PENDIENTE' || !canApplyToDestination(assignmentInfo)}
                    title={!assignmentInfo ? 'Valida el código primero' : assignmentInfo?.estado !== 'PENDIENTE' ? 'Esta asignación ya fue aplicada o anulada' : 'Aplicar sin volver a validar'}
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
                            <th style={{ padding: '6px 4px' }}>Producto</th>
                            <th style={{ padding: '6px 4px' }}>Codigo / descripcion</th>
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
                              <td style={{ padding: '6px 4px' }}>{it.producto || '-'}</td>
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
            <div style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 8, alignItems: 'end' }}>
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
              <button type="button" onClick={() => setDetailedView((value) => !value)} style={S.btn}>
                {detailedView ? 'Vista simple' : 'Vista detallada'}
              </button>
              {detailedView && (
                <button type="button" onClick={() => setMainColumnPickerOpen(true)} style={S.btn}>
                  Personalizar columnas
                </button>
              )}
            </div>
          )}
          {loading ? <div style={{ color: 'var(--text-muted)' }}>Cargando...</div> : (
            <div className="table-wrap list-scroll">
              {tab === 'marcas' ? (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 4px' }}>Marca</th>
                      <th style={{ padding: '6px 4px' }}>Grupo</th>
                      <th style={{ padding: '6px 4px' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map(m => (
                      <tr key={m.id} style={{ borderTop: '1px solid var(--divider)' }}>
                        <td style={{ padding: '6px 4px' }}>{m.nombre}</td>
                        <td style={{ padding: '6px 4px' }}>{BRAND_GROUP_OPTIONS.find((option) => option.value === m.grupo_tipo)?.label || m.grupo_tipo}</td>
                        <td style={{ padding: '6px 4px', color: m.activo ? 'var(--text-soft)' : 'var(--text-muted)' }}>
                          {m.activo ? 'Activa' : 'Inactiva'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : detailedView ? (
                <ProductGridTable
                  columns={inventoryColumns}
                  visibleColumnIds={activeDetailColumnIds}
                  rows={sortedDisplayedItems}
                  emptyText="Sin resultados."
                />
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 4px' }}>Marca</th>
                      {(tab === 'accesorios' || tab === 'repuestos') && <th style={{ padding: '6px 4px' }}>Producto</th>}
                      <th style={{ padding: '6px 4px' }}>
                        {tab === 'accesorios' ? 'Codigo' : tab === 'repuestos' ? 'Descripcion' : 'Modelo'}
                      </th>
                      {tab !== 'accesorios' && tab !== 'repuestos' && <th style={{ padding: '6px 4px' }}>Año</th>}
                      {tab !== 'repuestos' && <th style={{ padding: '6px 4px' }}>Color</th>}
                      {showSizeForTab && <th style={{ padding: '6px 4px' }}>Talla</th>}
                      {tab !== 'accesorios' && tab !== 'repuestos' && <th style={{ padding: '6px 4px' }}>{tab === 'motos_e' ? 'Potencia (expresado en watts)' : 'Cilindrada'}</th>}
                      {tab === 'motos_e' && <th style={{ padding: '6px 4px' }}>Tipo de batería (Litio - Plomo ácido)</th>}
                      {tab === 'motos_e' && <th style={{ padding: '6px 4px' }}>Batería (expresados en voltios amp/hora)</th>}
                      <th style={{ padding: '6px 4px' }}>F. Recepción</th>
                      <th style={{ padding: '6px 4px' }}>Almacen</th>
                      <th style={{ padding: '6px 4px' }}>Stock</th>
                      {isSup && <th style={{ padding: '6px 4px' }}>Costo</th>}
                      <th style={{ padding: '6px 4px' }}>{tab === 'motos' || tab === 'motos_e' ? 'Precio venta' : 'Precio'}</th>
                      {!isSup && <th style={{ padding: '6px 4px' }}>Disponibilidad</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSimpleItems.map(it => (
                      <tr key={it.id} style={{ borderTop: '1px solid var(--divider)' }}>
                        <td style={{ padding: '6px 4px' }}>{it.marca || '-'}</td>
                        {(tab === 'accesorios' || tab === 'repuestos') && <td style={{ padding: '6px 4px' }}>{getProductLabel(it)}</td>}
                        <td style={{ padding: '6px 4px' }}>{getPrimaryLabel(it)}</td>
                        {tab !== 'accesorios' && tab !== 'repuestos' && <td style={{ padding: '6px 4px' }}>{it.ano || '-'}</td>}
                        {tab !== 'repuestos' && <td style={{ padding: '6px 4px' }}>{it.color || '-'}</td>}
                        {showSizeForTab && <td style={{ padding: '6px 4px' }}>{getSizeLabel(it)}</td>}
                        {tab !== 'accesorios' && tab !== 'repuestos' && <td style={{ padding: '6px 4px' }}>{tab === 'motos_e' ? getPowerLabel(it) : getCylinderLabel(it)}</td>}
                        {tab === 'motos_e' && <td style={{ padding: '6px 4px' }}>{it.tipo_bateria || '-'}</td>}
                        {tab === 'motos_e' && <td style={{ padding: '6px 4px' }}>{it.bateria || '-'}</td>}
                        <td style={{ padding: '6px 4px' }}>{it.fecha_recepcion || '-'}</td>
                        <td style={{ padding: '6px 4px' }}>{getWarehouseLabel(it)}</td>
                        <td style={{ padding: '6px 4px' }}>{it.cantidad_libre}</td>
                        {isSup && <td style={{ padding: '6px 4px' }}>{formatBs(it.costo ?? it.precio)}</td>}
                        <td style={{ padding: '6px 4px' }}>{formatBs(it.precio_venta ?? it.precio_final)}</td>
                        {!isSup && (
                          <td style={{ padding: '6px 4px' }}>
                            <button type="button" onClick={() => verDisponibilidad(it)} style={S.btn}>
                              Disponibilidad
                            </button>
                          </td>
                        )}
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
                <>
                  <div className="grid-two-tight">
                    <div>
                      <div style={S.label}>Grupo</div>
                      <select
                        style={S.input}
                        value={marcaForm.grupo_tipo}
                        onChange={(e) => setMarcaForm((current) => ({ ...current, grupo_tipo: e.target.value }))}
                      >
                        {BRAND_GROUP_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={S.label}>Nombre de marca</div>
                      <input
                        style={S.input}
                        placeholder="Nombre de marca"
                        value={marcaForm.nombre}
                        onChange={e => setMarcaForm((current) => ({ ...current, nombre: e.target.value.toLocaleUpperCase('es') }))}
                      />
                    </div>
                  </div>
                  <button onClick={handleCrearMarca} style={{ ...S.btn, marginTop: 10 }}>Agregar</button>
                </>
              ) : (
                <>
                  <div className="grid-two-tight">
                    {fieldsByTab[tab].map(([key, label, type]) => (
                      <div key={key}>
                        <div style={S.label}>{label}{key === 'cilindrada' ? ' (expresado en Cc.)' : ''}{key === 'color' ? ' *' : ''}</div>
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
                            {brandOptions.map(m => (
                              <option key={m.id} value={m.id}>{m.nombre}</option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <input
                              style={S.input}
                              type={key === 'fecha_recepcion' ? 'date' : undefined}
                              inputMode={key === 'cilindrada' ? 'numeric' : undefined}
                              pattern={key === 'cilindrada' ? '[0-9]*' : undefined}
                              value={form[key] ?? ''}
                              onChange={e => setForm(f => ({
                                ...f,
                                [key]: key === 'color'
                                  ? e.target.value.toLocaleUpperCase('es').replace(/[^A-ZÁÉÍÓÚÜÑ\s]/g, '')
                                  : key === 'cilindrada'
                                    ? e.target.value.replace(/\D/g, '')
                                    : e.target.value,
                              }))}
                            />
                            {key === 'color' && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Obligatorio · solo letras</div>
                            )}
                          </>
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
                <div style={{ marginBottom: 10, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 8, alignItems: 'end' }}>
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
                  <button type="button" onClick={() => setPointDetailedView((value) => !value)} style={S.btn}>
                    {pointDetailedView ? 'Vista simple' : 'Vista detallada'}
                  </button>
                  {pointDetailedView && (
                    <button type="button" onClick={() => setPointColumnPickerOpen(true)} style={S.btn}>
                      Personalizar columnas
                    </button>
                  )}
                </div>
                {!selectedPointId ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Selecciona una ubicacion para revisar el stock.</div>
                ) : pointItems.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin stock asignado en esta categoría.</div>
                ) : pointDetailedView ? (
                  <ProductGridTable
                    columns={pointInventoryColumns}
                    visibleColumnIds={activePointDetailColumnIds}
                    rows={sortedPointItems}
                    emptyText="Sin stock asignado en esta categoría."
                  />
                ) : (
                  <div className="list-scroll" style={{ maxHeight: 240 }}>
                    {sortedPointItems.map((item) => (
                      <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)', fontSize: 12 }}>
                        <div style={{ color: 'var(--text-strong)' }}>
                          {[
                            item.marca || '-',
                            tab === 'accesorios' || tab === 'repuestos' ? getProductLabel(item) : null,
                            getPrimaryLabel(item),
                            tab !== 'repuestos' ? (item.color || '-') : null,
                            showSizeForTab ? getSizeLabel(item) : null,
                          ].filter(Boolean).join(' · ')}
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

      {availability && (
        <div
          onClick={() => setAvailability(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(640px, 100%)',
              maxHeight: '80vh',
              overflow: 'auto',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 18,
              color: 'var(--text)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, color: 'var(--text-strong)' }}>Disponibilidad</div>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 4 }}>{availability.label}</div>
              </div>
              <button
                type="button"
                onClick={() => setAvailability(null)}
                style={{ border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', fontSize: 12 }}
              >
                Cerrar
              </button>
            </div>

            {availabilityLoading ? (
              <div style={{ color: 'var(--text-muted)' }}>Cargando...</div>
            ) : availability.rows.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Sin stock registrado en otras ubicaciones.
              </div>
            ) : (
              <div className="table-wrap">
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-faint)', textAlign: 'left' }}>
                      <th style={{ padding: '6px 4px' }}>Ubicacion</th>
                      <th style={{ padding: '6px 4px' }}>Tipo</th>
                      <th style={{ padding: '6px 4px' }}>Libre</th>
                      <th style={{ padding: '6px 4px' }}>Reservado</th>
                      <th style={{ padding: '6px 4px' }}>Vendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availability.rows.map((row) => {
                      const esPuntoActual = row.punto_venta_id !== null && Number(row.punto_venta_id) === Number(usuario?.punto_venta_id)
                      return (
                        <tr key={row.punto_venta_id ?? 'central'} style={{ borderTop: '1px solid var(--divider)' }}>
                          <td style={{ padding: '6px 4px', color: row.punto_venta_id === null ? 'var(--text-strong)' : 'var(--text)' }}>
                            {row.punto_venta_nombre}
                            {esPuntoActual && <span style={{ color: 'var(--accent)' }}> · (actual)</span>}
                          </td>
                          <td style={{ padding: '6px 4px' }}>{row.punto_venta_tipo === 'CENTRAL' ? 'Almacen' : 'Punto de venta'}</td>
                          <td style={{ padding: '6px 4px' }}>{row.cantidad_libre}</td>
                          <td style={{ padding: '6px 4px' }}>{row.cantidad_reservada}</td>
                          <td style={{ padding: '6px 4px' }}>{row.cantidad_vendida}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
