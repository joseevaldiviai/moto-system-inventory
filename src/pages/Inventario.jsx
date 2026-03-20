import { useEffect, useState } from 'react'
import useAuthStore from '../store/authStore'
import toast from 'react-hot-toast'
import { api } from '../lib/apiClient'

export default function Inventario() {
  const { token, esSupervisor } = useAuthStore()
  const [tab, setTab] = useState('motos')
  const [items, setItems] = useState([])
  const [marcas, setMarcas] = useState([])
  const [loading, setLoading] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [form, setForm] = useState({})
  const [marcaForm, setMarcaForm] = useState({ nombre: '' })
  const [config, setConfig] = useState({ bsisa: '', placa: '' })

  const isSup = esSupervisor()
  const formatBs = (n) => `Bs ${Number(n || 0).toLocaleString('es-BO', { maximumFractionDigits: 2 })}`
  const tabs = [
    { id: 'motos', label: 'Motos' },
    { id: 'accesorios', label: 'Accesorios' },
    { id: 'repuestos', label: 'Repuestos' },
    ...(isSup ? [{ id: 'marcas', label: 'Marcas' }] : []),
  ]

  const load = async () => {
    setLoading(true)
    try {
      let res
      if (tab === 'motos') res = await api.listarMotos({ token })
      if (tab === 'accesorios') res = await api.listarAccesorios({ token })
      if (tab === 'repuestos') res = await api.listarRepuestos({ token })
      if (tab === 'marcas') res = await api.listarMarcas({ token })
      if (res?.ok) {
        setItems(res.data)
        if (tab === 'marcas') setMarcas(res.data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [tab])
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

  const handleCreate = async () => {
    try {
      let res
      if (tab === 'motos') res = await api.crearMoto({ token, data: form })
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

  const S = {
    page: { fontFamily: 'Georgia,serif', color: 'var(--text)' },
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 },
    input: { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-3)', color: 'var(--text)' },
    label: { fontSize: 11, color: 'var(--text-muted)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
    btn: { padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12 },
  }

  const fieldsByTab = {
    motos: [
      ['marca_id','Marca','marca'],['modelo','Modelo'],['tipo','Tipo'],['color','Color'],['chasis','Chasis'],
      ['cilindrada','Cilindrada'],['motor','Motor'],['precio','Precio'],['precio_final','Precio Final'],
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
      'marca,modelo,tipo,color,chasis,cilindrada,motor,precio,precio_final,descuento_maximo_pct,cantidad_libre',
      'Honda,CBR 500R,Deportiva,Rojo,CHS-0001,500,4T,5000,6200,10,3'
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

  return (
    <div className="page-shell" style={S.page}>
      <div className="page-header">
        <div style={{ fontSize: 10, letterSpacing: 4, color: 'var(--accent)', textTransform: 'uppercase', fontFamily: 'monospace' }}>INVENTARIO</div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, color: 'var(--text-strong)' }}>Productos</h1>
      </div>

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
                    {items.map(m => (
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
                      <th style={{ padding: '6px 4px' }}>Stock</th>
                      <th style={{ padding: '6px 4px' }}>Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} style={{ borderTop: '1px solid var(--divider)' }}>
                        <td style={{ padding: '6px 4px' }}>
                          {tab === 'motos' ? `${it.marca} ${it.modelo} (${it.chasis})` : `${it.tipo} ${it.marca ? '· ' + it.marca : ''}`}
                        </td>
                        <td style={{ padding: '6px 4px' }}>{it.cantidad_libre}</td>
                        <td style={{ padding: '6px 4px' }}>{formatBs(it.precio_final)}</td>
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
                            {tab !== 'motos' && <option value="">— Sin marca —</option>}
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
