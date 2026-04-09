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
  const [csvText, setCsvText] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [form, setForm] = useState({})
  const [marcaForm, setMarcaForm] = useState({ nombre: '' })
  const [config, setConfig] = useState({ bsisa: '', placa: '' })

  const isSup = esSupervisor()
  const inventoryParams = isSup
    ? { scope: 'central' }
    : usuario?.punto_venta_id
      ? { scope: 'point', puntoVentaId: usuario.punto_venta_id }
      : null
  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
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
        const selectedPoint = puntos.find((point) => String(point.id) === String(selectedPointId))
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

  const handleTransfer = async (itemId) => {
    const current = transferForm[itemId] || { punto_venta_id: selectedPointId, cantidad: '' }
    if (!current.punto_venta_id) return toast.error('Selecciona un punto de venta')
    if (!current.cantidad || Number(current.cantidad) <= 0) return toast.error('Ingresa una cantidad valida')
    const res = await api.transferirInventario({
      token,
      data: {
        kind: tab,
        product_id: itemId,
        punto_venta_id: Number(current.punto_venta_id),
        cantidad: Number(current.cantidad),
      },
    })
    if (!res.ok) return toast.error(res.error || 'Error')
    toast.success('Stock transferido al punto de venta')
    setTransferForm((state) => ({ ...state, [itemId]: { ...state[itemId], cantidad: '' } }))
    load()
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
      ['marca_id','Marca','marca'],['ano','Año'],['tipo','Tipo'],['color','Color'],['chasis','Chasis'],
      ['cilindrada','Cilindrada'],['motor','Motor'],['costo','Costo'],['precio_venta','Precio de venta'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
    motos_e: [
      ['marca_id','Marca','marca'],['ano','Año'],['tipo','Tipo'],['color','Color'],['chasis','Chasis'],
      ['potencia','Potencia'],['motor','Motor'],['costo','Costo'],['precio_venta','Precio de venta'],
      ['descuento_maximo_pct','Desc. Max %'],['cantidad_libre','Stock']
    ],
    accesorios: [
      ['marca_id','Marca','marca'],['tipo','Tipo'],['color','Color'],['precio','Precio'],['precio_final','Precio Final'],
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
      'marca,tipo,color,precio,precio_final,descuento_maximo_pct,cantidad_libre',
      'Givi,Parabrisas,Transparente,120,150,10,5'
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

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>INVENTARIO</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Productos</h1>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          {isSup
            ? 'Registro y control del almacen central'
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
          <div style={{ marginBottom: 12 }}>
            <input
              style={S.input}
              placeholder={tab === 'marcas' ? 'Buscar marca' : 'Buscar producto'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
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
                      <th style={{ padding: '6px 4px' }}>Producto</th>
                      <th style={{ padding: '6px 4px' }}>Almacen</th>
                      <th style={{ padding: '6px 4px' }}>Stock</th>
                      <th style={{ padding: '6px 4px' }}>{tab === 'motos' || tab === 'motos_e' ? 'Precio venta' : 'Precio'}</th>
                      {isSup && <th style={{ padding: '6px 4px' }}>Asignar a punto</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map(it => (
                      <tr key={it.id} style={{ borderTop: '1px solid var(--divider)' }}>
                        <td style={{ padding: '6px 4px' }}>
                          {(tab === 'motos' || tab === 'motos_e')
                            ? `${it.marca} ${it.ano} (${it.chasis})`
                            : `${it.tipo} ${it.marca ? '· ' + it.marca : ''}`}
                        </td>
                        <td style={{ padding: '6px 4px' }}>{getWarehouseLabel(it)}</td>
                        <td style={{ padding: '6px 4px' }}>{it.cantidad_libre}</td>
                        <td style={{ padding: '6px 4px' }}>{formatBs(it.precio_venta ?? it.precio_final)}</td>
                        {isSup && (
                          <td style={{ padding: '6px 4px', minWidth: 230 }}>
                            <div style={{ display: 'grid', gap: 6 }}>
                              <select
                                style={S.input}
                                value={transferForm[it.id]?.punto_venta_id ?? selectedPointId}
                                onChange={e => setTransferForm(state => ({
                                  ...state,
                                  [it.id]: { ...(state[it.id] || {}), punto_venta_id: e.target.value },
                                }))}
                              >
                                <option value="">Selecciona punto</option>
                                {puntos.filter(point => point.tipo !== 'CENTRAL' && point.activo).map(point => (
                                  <option key={point.id} value={point.id}>{point.nombre}</option>
                                ))}
                              </select>
                              <div className="button-row" style={{ gap: 6 }}>
                                <input
                                  style={S.input}
                                  type="number"
                                  min="1"
                                  max={it.cantidad_libre}
                                  placeholder="Cantidad"
                                  value={transferForm[it.id]?.cantidad ?? ''}
                                  onChange={e => setTransferForm(state => ({
                                    ...state,
                                    [it.id]: { ...(state[it.id] || {}), cantidad: e.target.value },
                                  }))}
                                />
                                <button onClick={() => handleTransfer(it.id)} style={S.btn}>Asignar</button>
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
                            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          >
                            {tab !== 'motos' && tab !== 'motos_e' && <option value="">— Sin marca —</option>}
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
                {!selectedPointId ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Selecciona una ubicacion para revisar el stock.</div>
                ) : pointItems.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin stock asignado en esta categoría.</div>
                ) : (
                  <div className="list-scroll" style={{ maxHeight: 240 }}>
                    {pointItems.map((item) => (
                      <div key={item.id} style={{ padding: '8px 0', borderTop: '1px solid var(--divider)', fontSize: 12 }}>
                        <div style={{ color: 'var(--text-strong)' }}>
                          {(tab === 'motos' || tab === 'motos_e')
                            ? `${item.marca} ${item.ano} (${item.chasis})`
                            : `${item.tipo}${item.marca ? ` · ${item.marca}` : ''}`}
                        </div>
                        <div style={{ color: 'var(--text-soft)' }}>
                          Libre: {item.cantidad_libre} · Reservado: {item.cantidad_reservada} · Vendido: {item.cantidad_vendida}
                        </div>
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
